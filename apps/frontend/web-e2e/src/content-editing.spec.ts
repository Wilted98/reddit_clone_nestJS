import { expect, Page, test } from '@playwright/test';
import { expectHeaderOptions } from './support/content-controls';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const account = {
  id: 'owner',
  username: 'alex',
  email: 'private@example.com',
  bio: null,
  avatarUrl: null,
};
const originalPost = {
  id: 'one',
  title: 'A conversation worth keeping',
  body: 'Original text',
  url: null as string | null,
  authorId: 'owner',
  authorUsername: 'alex',
  authorAvatarUrl: null,
  communityId: 'craft',
  communitySlug: 'craft',
  createdAt: '2026-10-06T00:00:00Z',
  editedAt: null as string | null,
  deletedAt: null as string | null,
  score: 3,
  commentCount: 3,
};
const root = {
  id: 'root',
  postId: 'one',
  parentId: null as string | null,
  authorId: 'owner',
  authorUsername: 'alex',
  body: 'Original comment',
  createdAt: originalPost.createdAt,
  editedAt: null as string | null,
  deletedAt: null as string | null,
  score: 1,
  hasReplies: true,
};
type Operation = {
  operationName: string;
  variables: {
    input?: Record<string, string>;
    id?: string;
    parentId?: string;
    cursor?: string;
    ids?: string[];
  };
};
const failure = (statusCode: number, message: string) => ({
  errors: [
    {
      message,
      extensions: {
        code:
          statusCode === 401
            ? 'UNAUTHENTICATED'
            : statusCode === 403
              ? 'FORBIDDEN'
              : 'BAD_REQUEST',
        originalError: { statusCode, message },
      },
    },
  ],
});

async function mockContent(
  page: Page,
  options: {
    signedIn?: boolean;
    link?: boolean;
    deleted?: boolean;
    owner?: string;
    respond?: (op: Operation) => unknown | Promise<unknown>;
  } = {},
) {
  let signedIn = options.signedIn !== false;
  let post = {
    ...originalPost,
    authorId: options.owner ?? account.id,
    ...(options.link
      ? { body: null, url: 'https://example.com/original' }
      : {}),
    ...(options.deleted
      ? { deletedAt: originalPost.createdAt, body: null }
      : {}),
  };
  let comment = { ...root, authorId: options.owner ?? account.id };
  const ops: Operation[] = [];
  const headers = {
    'Access-Control-Allow-Origin': 'http://localhost:4200',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  await page.route('http://localhost:3000/graphql', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    const op = route.request().postDataJSON();
    if (op.operationName === 'SignOut') signedIn = false;
    await route.fulfill({
      headers,
      json:
        op.operationName === 'SignOut'
          ? { data: { logout: true } }
          : signedIn
            ? { data: { me: account } }
            : failure(401, 'Unauthorized'),
    });
  });
  await page.route('http://localhost:3001/graphql', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    const op: Operation = route.request().postDataJSON();
    ops.push(op);
    const custom = await options.respond?.(op);
    let data: unknown;
    switch (op.operationName) {
      case 'Discussion':
        data = { post };
        break;
      case 'BrowseFeed':
        data = {
          feed: {
            items: post.deletedAt ? [] : [post],
            hasMore: false,
            nextCursor: null,
          },
        };
        break;
      case 'BrowseCommunities':
        data = { communities: { items: [], hasMore: false, nextCursor: null } };
        break;
      case 'SubscribedCommunities':
        data = {
          myCommunities: { items: [], hasMore: false, nextCursor: null },
        };
        break;
      case 'OwnPostVotes':
        data = { myPostVotes: [] };
        break;
      case 'OwnCommentVotes':
        data = { myCommentVotes: [] };
        break;
      case 'ThreadComments':
        data = {
          comments: {
            items: op.variables.parentId
              ? [
                  {
                    ...root,
                    id: 'reply',
                    parentId: 'root',
                    authorId: 'other',
                    authorUsername: 'selene',
                    body: 'A reply stays readable',
                    hasReplies: false,
                  },
                ]
              : op.variables.cursor
                ? [
                    {
                      ...root,
                      id: 'later',
                      authorId: 'other',
                      body: 'Another page',
                    },
                  ]
                : [comment],
            hasMore: !op.variables.parentId && !op.variables.cursor,
            nextCursor:
              !op.variables.parentId && !op.variables.cursor ? 'root' : null,
          },
        };
        break;
      case 'EditPost':
        if (!custom)
          post = {
            ...post,
            ...op.variables.input,
            editedAt: originalPost.createdAt,
          };
        data = { updatePost: post };
        break;
      case 'EditComment':
        if (!custom)
          comment = {
            ...comment,
            ...op.variables.input,
            editedAt: originalPost.createdAt,
          };
        data = { updateComment: comment };
        break;
      case 'RemovePost':
        if (!custom)
          post = {
            ...post,
            body: null,
            url: null,
            deletedAt: originalPost.createdAt,
          };
        data = { deletePost: post };
        break;
      case 'RemoveComment':
        if (!custom) {
          comment = {
            ...comment,
            body: '[deleted]',
            deletedAt: originalPost.createdAt,
          };
        }
        data = { deleteComment: comment };
        break;
      default:
        throw new Error(`Unexpected operation: ${op.operationName}`);
    }
    await route.fulfill({ headers, json: custom ?? { data } });
  });
  return {
    ops,
    expire: () => {
      signedIn = false;
    },
  };
}

test('keeps author commands in compact keyboard-accessible options', async ({
  page,
}, testInfo) => {
  const { ops } = await mockContent(page);
  await page.goto('/posts/one');
  const card = page.getByTestId('post-one');
  const trigger = card.getByRole('button', {
    name: 'Post options',
    exact: true,
  });
  const panel = card.getByRole('group', { name: 'Post options' });
  await expectHeaderOptions(card);
  await expectHeaderOptions(page.getByTestId('comment-root'));
  await expect(
    card.getByRole('button', { name: 'Edit post', exact: true }),
  ).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    card.getByRole('button', { name: 'Edit post', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    card.getByRole('button', { name: 'Delete post', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.screenshot({
    path: testInfo.outputPath('post-options.png'),
    fullPage: true,
  });
  const bounds = await panel.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport)
    throw new Error('Missing options bounds or viewport');
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  await page
    .getByRole('heading', { name: 'Conversation', exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(panel).toHaveCount(0);
  expect(
    ops.filter((op) => /^(Edit|Remove)/.test(op.operationName)),
  ).toHaveLength(0);
});

test('preserves page width when deletion locks a classic desktop scrollbar', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Classic scrollbars are a desktop regression.',
  );
  await mockContent(page);
  await page.goto('/posts/one');
  await page.addStyleTag({
    content:
      ':root { min-height: calc(100vh + 600px); } :root::-webkit-scrollbar { width: 16px; }',
  });
  expect(
    await page.evaluate(
      () => innerWidth - document.documentElement.clientWidth,
    ),
  ).toBeGreaterThan(0);
  const shell = page.locator('.app-shell');
  const before = await shell.boundingBox();
  if (!before) throw new Error('Missing page bounds');
  for (const kind of ['post', 'comment'] as const) {
    const card = page.getByTestId(
      kind === 'post' ? 'post-one' : 'comment-root',
    );
    const trigger = card.getByRole('button', {
      name: kind === 'post' ? 'Post options' : 'Comment options',
      exact: true,
    });
    await trigger.click();
    await card
      .getByRole('button', { name: `Delete ${kind}`, exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: `Delete ${kind}?` });
    await expect(dialog).toBeVisible();
    const opened = await shell.boundingBox();
    expect(opened?.x).toBe(before.x);
    expect(opened?.width).toBe(before.width);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const closed = await shell.boundingBox();
    expect(closed?.x).toBe(before.x);
    expect(closed?.width).toBe(before.width);
  }
});
test('deletion uses a centered focus-trapped modal and leaves the conversation layout unchanged', async ({
  page,
}, testInfo) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { ops } = await mockContent(page, {
    respond: async (op) => {
      if (op.operationName === 'RemovePost') {
        await gate;
        return failure(500, 'Database details');
      }
      return undefined;
    },
  });
  await page.goto('/posts/one');
  const card = page.getByTestId('post-one');
  const trigger = card.getByRole('button', {
    name: 'Post options',
    exact: true,
  });
  await trigger.click();
  const before = await card.boundingBox();
  await card.getByRole('button', { name: 'Delete post', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete post?' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (!before || !box || !viewport) throw new Error('Missing modal bounds');
  const layoutCenter = await page.evaluate(() => {
    const body = document.body.getBoundingClientRect();
    return body.left + body.width / 2;
  });
  expect(Math.abs(box.x + box.width / 2 - layoutCenter)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(box.y + box.height / 2 - viewport.height / 2),
  ).toBeLessThanOrEqual(1);
  expect((await card.boundingBox())?.height).toBe(before.height);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await trigger.evaluate((button) => (button as HTMLButtonElement).focus());
  await expect(
    dialog.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'Confirm delete post', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(ops.filter((op) => op.operationName === 'RemovePost')).toHaveLength(0);
  await trigger.click();
  await card.getByRole('button', { name: 'Delete post', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('delete-modal.png'),
    fullPage: false,
  });
  await dialog
    .getByRole('button', { name: 'Confirm delete post', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole('alert')).toContainText('Something went wrong');
  await expect(card.locator('h1')).toHaveText(originalPost.title);
  expect(ops.filter((op) => op.operationName === 'RemovePost')).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('edits text posts with bounded fields, cancellation and persistent authoritative content', async ({
  page,
}, testInfo) => {
  const { ops } = await mockContent(page);
  await page.goto('/posts/one');
  const card = page.getByTestId('post-one');
  await card.getByRole('button', { name: 'Post options', exact: true }).click();
  await card.getByRole('button', { name: 'Edit post', exact: true }).click();
  await expect(
    card.getByRole('button', { name: 'Save changes' }),
  ).toBeDisabled();
  await card.getByLabel('Title', { exact: true }).fill('ab');
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.getByText('Use at least 3 characters.')).toBeVisible();
  expect(ops.filter((op) => op.operationName === 'EditPost')).toHaveLength(0);
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card.getByRole('heading')).toHaveText(originalPost.title);
  await card.getByRole('button', { name: 'Post options', exact: true }).click();
  await card.getByRole('button', { name: 'Edit post', exact: true }).click();
  await card
    .getByLabel('Title', { exact: true })
    .fill(' A revised conversation ');
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.getByRole('heading')).toHaveText('A revised conversation');
  await expect(card.getByText('Edited', { exact: true })).toBeVisible();
  expect(
    ops.find((op) => op.operationName === 'EditPost')?.variables.input,
  ).toEqual({ id: 'one', title: 'A revised conversation' });
  await card.getByRole('button', { name: 'Post options', exact: true }).click();
  await card.getByRole('button', { name: 'Edit post', exact: true }).click();
  await card.getByLabel('Post body').fill('An edited text post.');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('post-editor.png'),
    fullPage: true,
  });
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    card.getByText('An edited text post.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(card.getByRole('heading')).toHaveText('A revised conversation');
  await expect(
    card.getByText('An edited text post.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(account.email, { exact: true })).toHaveCount(0);
});

test('edits link posts without changing type and shows community hover/focus feedback', async ({
  page,
}, testInfo) => {
  const { ops } = await mockContent(page, { link: true });
  await page.goto('/');
  const community = page
    .getByTestId('post-one')
    .getByRole('link', { name: 'r/craft', exact: true });
  if (testInfo.project.name === 'desktop') {
    await community.hover();
    await expect(community).toHaveCSS('text-decoration-line', 'underline');
  }
  await community.focus();
  await expect(community).toHaveCSS('text-decoration-line', 'underline');
  await page.goto('/posts/one');
  const card = page.getByTestId('post-one');
  await card.getByRole('button', { name: 'Post options', exact: true }).click();
  await card.getByRole('button', { name: 'Edit post', exact: true }).click();
  await expect(card.getByLabel('Post body')).toHaveCount(0);
  await card.getByLabel('URL', { exact: true }).fill('javascript:alert(1)');
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    card.getByText('Enter a public HTTP or HTTPS URL without credentials.'),
  ).toBeVisible();
  expect(ops.filter((op) => op.operationName === 'EditPost')).toHaveLength(0);
  await card
    .getByLabel('URL', { exact: true })
    .fill('https://example.com/revised');
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    card.getByRole('link', { name: 'example.com', exact: true }),
  ).toHaveAttribute('href', 'https://example.com/revised');
  expect(
    ops.find((op) => op.operationName === 'EditPost')?.variables.input,
  ).toEqual({ id: 'one', url: 'https://example.com/revised' });
});

test('keeps comment pages, expanded replies and failed edit drafts through explicit retry', async ({
  page,
}) => {
  let attempts = 0;
  const { ops } = await mockContent(page, {
    respond: (op) =>
      op.operationName === 'EditComment' && ++attempts === 1
        ? failure(500, 'Database details')
        : undefined,
  });
  await page.goto('/posts/one');
  await page.getByRole('button', { name: 'Load more comments' }).click();
  await expect(page.getByTestId('comment-later')).toBeVisible();
  const comment = page.getByTestId('comment-root');
  await comment
    .getByRole('button', { name: 'Show replies', exact: true })
    .click();
  await expect(page.getByTestId('comment-reply')).toBeVisible();
  await comment
    .getByRole('button', { name: 'Comment options', exact: true })
    .click();
  await comment
    .getByRole('button', { name: 'Edit comment', exact: true })
    .click();
  await comment
    .getByLabel('Comment', { exact: true })
    .fill('  Revised comment  ');
  await comment.getByRole('button', { name: 'Save changes' }).click();
  await expect(comment.getByRole('alert')).toContainText(
    'Something went wrong',
  );
  await expect(comment.getByLabel('Comment', { exact: true })).toHaveValue(
    '  Revised comment  ',
  );
  await comment.getByRole('button', { name: 'Save changes' }).click();
  await expect(comment.locator(':scope > .comment-body')).toHaveText(
    'Revised comment',
  );
  await expect(comment.locator(':scope > .comment-meta')).toContainText(
    'Edited',
  );
  await expect(page.getByTestId('comment-later')).toBeVisible();
  await expect(page.getByTestId('comment-reply')).toBeVisible();
  expect(
    ops.filter((op) => op.operationName === 'ThreadComments'),
  ).toHaveLength(3);
  expect(
    ops
      .filter((op) => op.operationName === 'EditComment')
      .map((op) => op.variables.input),
  ).toEqual([
    { id: 'root', body: 'Revised comment' },
    { id: 'root', body: 'Revised comment' },
  ]);
  await page.reload();
  await expect(comment.locator(':scope > .comment-body')).toHaveText(
    'Revised comment',
  );
});

test('confirms deletion, retains tombstones and replies, refreshes totals and removes feed content', async ({
  page,
}, testInfo) => {
  const { ops } = await mockContent(page);
  await page.goto('/posts/one');
  const comment = page.getByTestId('comment-root');
  await comment
    .getByRole('button', { name: 'Show replies', exact: true })
    .click();
  await comment
    .getByRole('button', { name: 'Comment options', exact: true })
    .click();
  await comment
    .getByRole('button', { name: 'Delete comment', exact: true })
    .click();
  expect(ops.filter((op) => op.operationName === 'RemoveComment')).toHaveLength(
    0,
  );
  await comment.getByRole('button', { name: 'Cancel', exact: true }).click();
  await comment
    .getByRole('button', { name: 'Comment options', exact: true })
    .click();
  await comment
    .getByRole('button', { name: 'Delete comment', exact: true })
    .click();
  await comment
    .getByRole('button', { name: 'Confirm delete comment', exact: true })
    .click();
  await expect(comment.locator(':scope > .comment-body')).toHaveText(
    '[deleted]',
  );
  await expect(
    comment.getByRole('button', { name: 'Edit comment', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId('comment-reply')).toBeVisible();
  await expect(
    page.getByTestId('post-one').getByRole('link', { name: '3 comments' }),
  ).toBeVisible();
  const card = page.getByTestId('post-one');
  await card.getByRole('button', { name: 'Post options', exact: true }).click();
  await card.getByRole('button', { name: 'Delete post', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('delete-confirmation.png'),
    fullPage: true,
  });
  await card
    .getByRole('button', { name: 'Confirm delete post', exact: true })
    .click();
  await expect(card.getByRole('heading', { level: 1 })).toHaveText(
    '[Deleted post]',
  );
  await expect(page.getByLabel('Add a comment')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Reply', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId('comment-reply')).toBeVisible();
  await page.reload();
  await expect(card.getByRole('heading', { level: 1 })).toHaveText(
    '[Deleted post]',
  );
  await page.getByRole('button', { name: 'Show replies', exact: true }).click();
  await expect(page.getByTestId('comment-reply')).toBeVisible();
  await page.goto('/');
  await expect(page.getByTestId('post-one')).toHaveCount(0);
  expect(
    ops.filter((op) => op.operationName.startsWith('Remove')),
  ).toHaveLength(2);
});

test('hides author actions for guests and outsiders but permits live comment edits on deleted posts', async ({
  page,
}) => {
  await mockContent(page, { signedIn: false });
  await page.goto('/posts/one');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^(Post|Comment) options$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^(Edit|Delete) (post|comment)$/ }),
  ).toHaveCount(0);
  await page.unroute('http://localhost:3000/graphql');
  await page.unroute('http://localhost:3001/graphql');
  await mockContent(page, { owner: 'someone-else' });
  await page.reload();
  await expect(
    page.getByRole('link', { name: 'Your profile', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^(Post|Comment) options$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^(Edit|Delete) (post|comment)$/ }),
  ).toHaveCount(0);
  await page.unroute('http://localhost:3000/graphql');
  await page.unroute('http://localhost:3001/graphql');
  await mockContent(page, { deleted: true });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Post options', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Edit post', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Comment options', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit comment', exact: true }).click();
  await page
    .getByLabel('Comment', { exact: true })
    .fill('Live comment edited on deleted post');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByText('Live comment edited on deleted post', { exact: true }),
  ).toBeVisible();
});

test('serializes pending edits and deletion failures without optimistic changes or automatic retries', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { ops } = await mockContent(page, {
    respond: async (op) => {
      if (op.operationName === 'EditPost') await gate;
      if (op.operationName === 'RemovePost')
        return failure(500, 'Database details');
      return undefined;
    },
  });
  await page.goto('/posts/one');
  const card = page.getByTestId('post-one');
  await card.getByRole('button', { name: 'Post options', exact: true }).click();
  await card.getByRole('button', { name: 'Edit post', exact: true }).click();
  await card.getByLabel('Title', { exact: true }).fill('Serialized title');
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.getByLabel('Title', { exact: true })).toBeDisabled();
  await expect(
    card.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeDisabled();
  await card.getByRole('form', { name: 'Edit post' }).evaluate((form) => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  expect(ops.filter((op) => op.operationName === 'EditPost')).toHaveLength(1);
  await expect(card.getByRole('heading')).toHaveText(originalPost.title);
  release();
  await expect(card.getByRole('heading')).toHaveText('Serialized title');
  await card.getByRole('button', { name: 'Post options', exact: true }).click();
  await card.getByRole('button', { name: 'Delete post', exact: true }).click();
  await card
    .getByRole('button', { name: 'Confirm delete post', exact: true })
    .click();
  await expect(card.getByRole('alert')).toContainText('Something went wrong');
  await expect(card.locator('h1')).toHaveText('Serialized title');
  expect(ops.filter((op) => op.operationName === 'RemovePost')).toHaveLength(1);
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card.getByRole('alert')).toHaveCount(0);
});

test('rechecks expired sessions and never retries the failed content mutation', async ({
  page,
}) => {
  const mocks = await mockContent(page, {
    respond: (op) => {
      if (op.operationName === 'EditComment') {
        mocks.expire();
        return failure(401, 'Unauthorized');
      }
      return undefined;
    },
  });
  await page.goto('/posts/one');
  const comment = page.getByTestId('comment-root');
  await comment
    .getByRole('button', { name: 'Comment options', exact: true })
    .click();
  await comment
    .getByRole('button', { name: 'Edit comment', exact: true })
    .click();
  await comment.getByLabel('Comment', { exact: true }).fill('Expired draft');
  await comment.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('link', { name: 'Sign in to upvote post' }),
  ).toBeVisible();
  await expect(page.getByRole('form', { name: 'Edit comment' })).toHaveCount(0);
  await expect(comment.locator(':scope > .comment-body')).toHaveText(root.body);
  expect(
    mocks.ops.filter((op) => op.operationName === 'EditComment'),
  ).toHaveLength(1);
});

test('preserves a rejected draft until explicit reload reads a concurrently deleted post', async ({
  page,
}) => {
  let deleted = false;
  const { ops } = await mockContent(page, {
    respond: (op) => {
      if (op.operationName === 'EditPost') {
        deleted = true;
        return failure(400, 'Cannot edit a deleted post.');
      }
      if (op.operationName === 'Discussion' && deleted)
        return {
          data: {
            post: {
              ...originalPost,
              deletedAt: originalPost.createdAt,
              body: null,
              url: null,
            },
          },
        };
      return undefined;
    },
  });
  await page.goto('/posts/one');
  const card = page.getByTestId('post-one');
  await card.getByRole('button', { name: 'Post options', exact: true }).click();
  await card.getByRole('button', { name: 'Edit post', exact: true }).click();
  await card.getByLabel('Title', { exact: true }).fill('A rejected draft');
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.getByRole('alert')).toContainText(
    'Cannot edit a deleted post.',
  );
  await expect(card.getByLabel('Title', { exact: true })).toHaveValue(
    'A rejected draft',
  );
  expect(ops.filter((op) => op.operationName === 'EditPost')).toHaveLength(1);
  await card
    .getByRole('button', { name: 'Reload conversation', exact: true })
    .click();
  await expect(card.getByRole('heading')).toHaveText('[Deleted post]');
  await expect(card.getByRole('form')).toHaveCount(0);
  expect(ops.filter((op) => op.operationName === 'EditPost')).toHaveLength(1);
});

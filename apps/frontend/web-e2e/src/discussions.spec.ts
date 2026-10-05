import { expect, Page, test } from '@playwright/test';

const community = {
  __typename: 'Community',
  id: 'craft',
  slug: 'craft',
  name: 'Makers & curious minds',
  description: 'Small projects, big ideas.',
  memberCount: 42,
  createdAt: '2026-01-01T00:00:00Z',
};
const account = {
  __typename: 'Account',
  id: 'viewer',
  username: 'alex',
  email: 'private@example.com',
  bio: null,
  avatarUrl: null,
};
const originalPost = {
  __typename: 'Post',
  id: 'one',
  title: 'What are you making this week?',
  body: 'A small project, a fresh idea, or something you finally finished. Share it with the community.',
  url: null,
  authorId: 'author',
  authorUsername: 'selene',
  communityId: 'craft',
  communitySlug: 'craft',
  createdAt: '2026-10-05T10:00:00Z',
  editedAt: null,
  deletedAt: null,
  score: 42,
  commentCount: 2,
};
function comment(id: string, overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Comment',
    id,
    postId: 'one',
    parentId: null,
    authorId: 'writer',
    authorUsername: 'corvin',
    body: `Thoughts from ${id}`,
    createdAt: '2026-10-05T11:00:00Z',
    editedAt: null,
    deletedAt: null,
    score: 9,
    hasReplies: false,
    ...overrides,
  };
}
function comments(
  items = [comment('root', { hasReplies: true })],
  hasMore = false,
  nextCursor: string | null = null,
) {
  return { __typename: 'CommentPage', items, hasMore, nextCursor };
}
function failure(statusCode: number, message = 'Internal database details') {
  return {
    errors: [
      {
        message: 'Failure',
        extensions: {
          code:
            statusCode === 404
              ? 'NOT_FOUND'
              : statusCode === 403
                ? 'FORBIDDEN'
                : 'INTERNAL_SERVER_ERROR',
          originalError: { statusCode, message },
        },
      },
    ],
  };
}
type Operation = { operationName: string; variables: Record<string, unknown> };

async function mockDiscussion(
  page: Page,
  respond?: (
    op: Operation,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>,
  signedIn = true,
  options: { expireAfterWrite?: boolean; expireAfterLookup?: boolean } = {},
) {
  const operations: Operation[] = [];
  const ownVotes = new Map<string, number>();
  let post = { ...originalPost };
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
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(
        op.operationName === 'SignOut'
          ? { data: { logout: true } }
          : signedIn
            ? { data: { me: account } }
            : {
                errors: [
                  {
                    message: 'Unauthorized',
                    extensions: { code: 'UNAUTHENTICATED' },
                  },
                ],
              },
      ),
    });
  });
  await page.route('http://localhost:3001/graphql', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    const op: Operation = route.request().postDataJSON();
    operations.push(op);
    if (options.expireAfterWrite && op.operationName === 'SetPostVote')
      signedIn = false;
    if (options.expireAfterLookup && op.operationName === 'OwnPostVotes')
      signedIn = false;
    let result = await respond?.(op);
    if (!result || Object.keys(result).length === 0) {
      const input = op.variables.input as Record<string, unknown>;
      switch (op.operationName) {
        case 'SubscribedCommunities':
          result = {
            data: {
              myCommunities: {
                __typename: 'CommunityPage',
                items: [],
                hasMore: false,
                nextCursor: null,
              },
            },
          };
          break;
        case 'BrowseCommunities':
          result = {
            data: {
              communities: {
                __typename: 'CommunityPage',
                items: [community],
                hasMore: false,
                nextCursor: null,
              },
            },
          };
          break;
        case 'BrowseFeed':
          result = {
            data: {
              feed: {
                __typename: 'PostPage',
                items: [post],
                hasMore: false,
                nextCursor: null,
              },
            },
          };
          break;
        case 'CommunityDetails':
          result = { data: { community } };
          break;
        case 'Discussion':
          result = { data: { post } };
          break;
        case 'ThreadComments':
          result = {
            data: {
              comments: op.variables.parentId
                ? comments([
                    comment('child', {
                      parentId: op.variables.parentId,
                      body: 'A reply worth reading.',
                    }),
                  ])
                : comments(),
            },
          };
          break;
        case 'OwnPostVotes':
          result = {
            data: {
              myPostVotes: (op.variables.ids as string[])
                .filter((id) => ownVotes.has(id))
                .map((targetId) => ({
                  __typename: 'VoteResult',
                  targetId,
                  myVote: ownVotes.get(targetId),
                  score: 0,
                })),
            },
          };
          break;
        case 'OwnCommentVotes':
          result = { data: { myCommentVotes: [] } };
          break;
        case 'SetPostVote': {
          const id = input.targetId as string;
          post = {
            ...post,
            score: post.score + Number(input.value) - (ownVotes.get(id) ?? 0),
          };
          ownVotes.set(id, Number(input.value));
          result = {
            data: {
              votePost: {
                __typename: 'VoteResult',
                targetId: id,
                score: post.score,
                myVote: input.value,
              },
            },
          };
          break;
        }
        case 'SetCommentVote':
          result = {
            data: {
              voteComment: {
                __typename: 'VoteResult',
                targetId: input.targetId,
                score: 10,
                myVote: input.value,
              },
            },
          };
          break;
        case 'JoinForPosting':
          result = { data: { joinCommunity: community } };
          break;
        case 'PublishPost':
          post = {
            ...post,
            ...input,
            id: 'published',
            body: (input.body as string) ?? null,
            url: (input.url as string) ?? null,
          };
          result = { data: { createPost: post } };
          break;
        case 'PublishComment':
          post.commentCount += 1;
          result = {
            data: {
              createComment: comment('written', {
                ...input,
                authorId: account.id,
                authorUsername: account.username,
                score: 0,
              }),
            },
          };
          break;
        default:
          throw new Error(`Unexpected operation: ${op.operationName}`);
      }
    }
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(result),
    });
  });
  return operations;
}

test('votes directly from Home and opens the whole card without hijacking its controls', async ({
  page,
}, testInfo) => {
  await mockDiscussion(page);
  await page.goto('/');
  const card = page.getByTestId('post-one');
  await expect(
    card.getByRole('link', { name: 'r/craft', exact: true }),
  ).toHaveAttribute('href', '/r/craft');
  await card.getByRole('button', { name: 'Upvote post', exact: true }).click();
  await expect(card.getByLabel('43 score')).toBeVisible();
  await expect(page).toHaveURL('/');
  await card
    .getByRole('button', { name: 'Downvote post', exact: true })
    .click();
  await expect(card.getByLabel('41 score')).toBeVisible();
  await page.reload();
  await expect(
    card.getByRole('button', { name: 'Downvote post' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await card
    .getByRole('button', { name: 'Downvote post', exact: true })
    .click();
  await expect(card.getByLabel('42 score')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home-voting.png') });
  const bounds = await card.boundingBox();
  if (!bounds) throw new Error('Missing card');
  await card.click({
    position: { x: bounds.width - 15, y: bounds.height - 44 },
  });
  await expect(page).toHaveURL('/posts/one');
  await page.goto('/');
  await card.getByRole('link', { name: '2 comments', exact: true }).click();
  await expect(page).toHaveURL('/posts/one#comments');
  await page.goto('/');
  await card.getByRole('link', { name: 'r/craft', exact: true }).click();
  await expect(page).toHaveURL('/r/craft');
});

test('keeps the last three distinct community visits across reload and isolates them after logout', async ({
  page,
}, testInfo) => {
  await mockDiscussion(page, ({ operationName, variables }) =>
    operationName === 'CommunityDetails'
      ? {
          data: {
            community: {
              ...community,
              id: variables.slug,
              slug: variables.slug,
              name: `Community ${variables.slug}`,
            },
          },
        }
      : {},
  );
  for (const slug of ['craft', 'romania', 'nightowls', 'makers', 'romania']) {
    await page.goto(`/r/${slug}`);
    await expect(
      page.getByRole('heading', { name: `Community ${slug}`, exact: true }),
    ).toBeVisible();
  }
  await page.goto('/');
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Community shortcuts' }).click();
  const recent = page.getByRole('region', {
    name: 'Recently visited communities',
  });
  await expect(recent.locator('.shortcut-label')).toHaveText([
    'r/romania',
    'r/makers',
    'r/nightowls',
  ]);
  await page.reload();
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Community shortcuts' }).click();
  await expect(recent.locator('.shortcut-label')).toHaveText([
    'r/romania',
    'r/makers',
    'r/nightowls',
  ]);
  await page.screenshot({
    path: testInfo.outputPath('community-shortcuts.png'),
  });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/');
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Community shortcuts' }).click();
  await expect(recent.getByRole('link')).toHaveCount(0);
  await expect(recent).toContainText('No recent visits yet.');
});

test('shows real subscribed communities with independent paging, deduplication and explicit retry', async ({
  page,
}, testInfo) => {
  let attempts = 0;
  const romania = {
    ...community,
    id: 'romania',
    slug: 'romania',
    name: 'Romania',
  };
  const operations = await mockDiscussion(
    page,
    ({ operationName, variables }) => {
      if (operationName !== 'SubscribedCommunities') return {};
      if (variables.cursor && ++attempts === 1) return failure(500);
      return {
        data: {
          myCommunities: {
            items: variables.cursor ? [community, romania] : [community],
            hasMore: !variables.cursor,
            nextCursor: variables.cursor ? null : 'craft',
          },
        },
      };
    },
  );
  await page.goto('/');
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Community shortcuts' }).click();
  const joined = page.getByRole('region', { name: 'Subscribed communities' });
  await expect(joined.locator('.shortcut-label')).toHaveText(['r/craft']);
  await joined
    .getByRole('button', { name: 'More communities', exact: true })
    .click();
  await expect(
    joined.getByRole('button', { name: 'Retry more communities' }),
  ).toBeVisible();
  await expect(joined.locator('.shortcut-label')).toHaveText(['r/craft']);
  await joined.getByRole('button', { name: 'Retry more communities' }).click();
  await expect(joined.locator('.shortcut-label')).toHaveText([
    'r/craft',
    'r/romania',
  ]);
  expect(
    operations
      .filter((op) => op.operationName === 'SubscribedCommunities')
      .map((op) => op.variables),
  ).toEqual([
    { cursor: null, limit: 20 },
    { cursor: 'craft', limit: 20 },
    { cursor: 'craft', limit: 20 },
  ]);
  await joined.getByRole('link', { name: 'r/romania', exact: true }).click();
  await expect(page).toHaveURL('/r/romania');
});

test('keeps the desktop sidebar viewport-height on a long feed and scrolls overflowing shortcuts independently', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop sticky sidebar only');
  await page.setViewportSize({ width: 1440, height: 650 });
  await mockDiscussion(page, ({ operationName }) => {
    if (operationName === 'BrowseFeed')
      return {
        data: {
          feed: {
            items: Array.from({ length: 20 }, (_, i) => ({
              ...originalPost,
              id: `post-${i}`,
            })),
            hasMore: false,
            nextCursor: null,
          },
        },
      };
    if (operationName === 'SubscribedCommunities')
      return {
        data: {
          myCommunities: {
            items: Array.from({ length: 20 }, (_, i) => ({
              ...community,
              id: `group_${i}`,
              slug: `group_${i}`,
            })),
            hasMore: false,
            nextCursor: null,
          },
        },
      };
    return {};
  });
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(20);
  const sidebar = page.locator('.sidebar');
  const original = await sidebar.boundingBox();
  expect(original?.height).toBe(602);
  await page.getByTestId('post-post-19').scrollIntoViewIfNeeded();
  const scrolled = await sidebar.boundingBox();
  expect(scrolled?.y).toBe(24);
  expect(scrolled?.height).toBe(original?.height);
  await sidebar
    .getByRole('link', { name: 'r/group_19', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    sidebar.getByRole('link', { name: 'r/group_19', exact: true }),
  ).toBeInViewport();
  expect(await sidebar.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('fixed-sidebar.png') });
});

test('opens feed discussions, loads only direct replies, and preserves a collapsed reply draft', async ({
  page,
}, testInfo) => {
  const operations = await mockDiscussion(page);
  await page.goto('/');
  await page.getByRole('link', { name: originalPost.title }).click();
  await expect(page).toHaveURL(/\/posts\/one$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    originalPost.title,
  );
  await expect(page.getByTestId('comment-root')).toBeVisible();
  expect(
    operations
      .filter((op) => op.operationName === 'ThreadComments')
      .map((op) => op.variables),
  ).toEqual([
    expect.objectContaining({
      postId: 'one',
      parentId: null,
      cursor: null,
      limit: 20,
    }),
  ]);
  await page.getByRole('button', { name: 'Show replies' }).click();
  await expect(page.getByTestId('comment-child')).toBeVisible();
  expect(
    operations
      .filter((op) => op.operationName === 'ThreadComments')
      .map((op) => op.variables.parentId),
  ).toEqual([null, 'root']);
  await page
    .getByTestId('comment-child')
    .getByRole('button', { name: 'Reply', exact: true })
    .click();
  await page.getByLabel('Your reply').fill('Keep this draft');
  await page.getByRole('button', { name: 'Hide replies' }).click();
  await page.getByRole('button', { name: 'Show replies' }).click();
  await expect(page.getByLabel('Your reply')).toHaveValue('Keep this draft');
  expect(
    operations.filter((op) => op.operationName === 'ThreadComments'),
  ).toHaveLength(2);
  await page.screenshot({
    path: testInfo.outputPath('discussion-thread.png'),
    fullPage: true,
  });
});

test('locks votes while a write is pending and rechecks an expired session', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operations = await mockDiscussion(
    page,
    async ({ operationName }) => {
      if (operationName === 'SetPostVote') {
        await gate;
        return failure(403, 'Forbidden resource');
      }
      return {};
    },
    true,
    { expireAfterWrite: true },
  );
  await page.goto('/posts/one');
  const voting = page.getByRole('group', { name: 'Post voting' });
  await voting.getByRole('button', { name: 'Upvote post' }).dblclick();
  await expect(
    voting.getByRole('button', { name: 'Downvote post' }),
  ).toBeDisabled();
  expect(
    operations.filter((op) => op.operationName === 'SetPostVote'),
  ).toHaveLength(1);
  release();
  await expect(
    page.getByRole('link', { name: 'Sign in to upvote post' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upvote post', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Add a comment')).toHaveCount(0);
});

test('retries failed own-vote restoration before enabling votes without overwriting the public total', async ({
  page,
}) => {
  let attempts = 0;
  await mockDiscussion(page, ({ operationName }) => {
    if (operationName !== 'OwnPostVotes') return {};
    attempts += 1;
    return attempts === 1
      ? failure(500)
      : {
          data: {
            myPostVotes: [
              {
                __typename: 'VoteResult',
                targetId: 'one',
                myVote: 1,
                score: 0,
              },
            ],
          },
        };
  });
  await page.goto('/posts/one');
  const voting = page.getByRole('group', { name: 'Post voting' });
  await expect(
    voting.getByRole('button', { name: 'Upvote post' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    voting.getByRole('button', { name: 'Upvote post' }),
  ).toBeEnabled();
  await expect(
    voting.getByRole('button', { name: 'Upvote post' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(voting.getByLabel('42 score')).toBeVisible();
});

test('rechecks an expired session on private lookup failure without retrying the lookup or losing public content', async ({
  page,
}) => {
  const operations = await mockDiscussion(
    page,
    ({ operationName }) =>
      operationName === 'OwnPostVotes'
        ? failure(403, 'Forbidden resource')
        : {},
    true,
    { expireAfterLookup: true },
  );
  await page.goto('/posts/one');
  await expect(
    page.getByRole('link', { name: 'Sign in to upvote post' }),
  ).toBeVisible();
  await expect(page.getByTestId('comment-root')).toBeVisible();
  await expect(page.getByLabel('Add a comment')).toHaveCount(0);
  expect(
    operations.filter((op) => op.operationName === 'OwnPostVotes'),
  ).toHaveLength(1);
  expect(
    operations.filter((op) => op.operationName === 'SetPostVote'),
  ).toHaveLength(0);
});

test('serializes post and comment publishing while the response is pending', async ({
  page,
}) => {
  let release!: () => void;
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operations = await mockDiscussion(page, async ({ operationName }) => {
    if (operationName === 'PublishPost' || operationName === 'PublishComment')
      await gate;
    return {};
  });
  await page.goto('/submit?community=craft');
  await page.getByLabel('Title', { exact: true }).fill('Only one post');
  await page.getByLabel('Your post').fill('One request at a time.');
  await page.getByRole('button', { name: 'Publish post' }).dblclick();
  await expect(
    page.getByRole('button', { name: 'Publishing...' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Join community', exact: true }),
  ).toBeDisabled();
  expect(
    operations.filter((op) => op.operationName === 'PublishPost'),
  ).toHaveLength(1);
  release();
  await expect(page).toHaveURL(/\/posts\/published$/);
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.getByLabel('Add a comment').fill('Only one comment');
  await page
    .getByRole('button', { name: 'Post comment', exact: true })
    .dblclick();
  await expect(page.getByRole('button', { name: 'Posting...' })).toBeDisabled();
  expect(
    operations.filter((op) => op.operationName === 'PublishComment'),
  ).toHaveLength(1);
  release();
  await expect(
    page.getByText('Comment posted.', { exact: true }),
  ).toBeVisible();
});

test('keeps deep threads bounded and readable without fetching unopened descendants', async ({
  page,
}, testInfo) => {
  const operations = await mockDiscussion(
    page,
    ({ operationName, variables }) => {
      if (operationName !== 'ThreadComments') return {};
      const level = variables.parentId
        ? Number(String(variables.parentId).split('-')[1]) + 1
        : 0;
      return {
        data: {
          comments: comments([
            comment(`deep-${level}`, {
              parentId: variables.parentId,
              body: 'LongWord'.repeat(30),
              hasReplies: true,
            }),
          ]),
        },
      };
    },
  );
  await page.goto('/posts/one');
  await expect(page.getByTestId('comment-deep-0')).toBeVisible();
  for (let level = 0; level < 5; level += 1) {
    await page
      .getByRole('button', { name: 'Show replies', exact: true })
      .last()
      .click();
    await expect(page.getByTestId(`comment-deep-${level + 1}`)).toBeVisible();
  }
  expect(
    operations.filter((op) => op.operationName === 'ThreadComments'),
  ).toHaveLength(6);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('deep-thread.png'),
    fullPage: true,
  });
});

test('pages roots and replies independently, deduplicates overlaps, and retries the same cursor', async ({
  page,
}) => {
  let rootPageAttempts = 0;
  const operations = await mockDiscussion(
    page,
    ({ operationName, variables }) => {
      if (operationName !== 'ThreadComments') return {};
      if (variables.parentId)
        return {
          data: {
            comments: variables.cursor
              ? comments([
                  comment('child', { parentId: 'root' }),
                  comment('child-two', { parentId: 'root' }),
                ])
              : comments(
                  [comment('child', { parentId: 'root' })],
                  true,
                  'reply-cursor',
                ),
          },
        };
      if (!variables.cursor)
        return { data: { comments: comments(undefined, true, 'root-cursor') } };
      rootPageAttempts += 1;
      return rootPageAttempts === 1
        ? failure(500)
        : {
            data: {
              comments: comments([
                comment('root', { hasReplies: true }),
                comment('root-two'),
              ]),
            },
          };
    },
  );
  await page.goto('/posts/one');
  await page.getByRole('button', { name: 'Load more comments' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Something went wrong' }),
  ).toBeVisible();
  await expect(page.getByTestId('comment-root')).toBeAttached();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByTestId('comment-root-two')).toBeVisible();
  await expect(page.getByTestId('comment-root')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show replies' }).click();
  await page.getByRole('button', { name: 'Load more replies' }).click();
  await expect(page.getByTestId('comment-child-two')).toBeVisible();
  await expect(page.getByTestId('comment-child')).toHaveCount(1);
  expect(
    operations
      .filter((op) => op.operationName === 'ThreadComments')
      .map((op) => [op.variables.parentId, op.variables.cursor]),
  ).toEqual([
    [null, null],
    [null, 'root-cursor'],
    [null, 'root-cursor'],
    ['root', null],
    ['root', 'reply-cursor'],
  ]);
});

test('validates comment bodies, preserves a failed draft, and posts once without losing it on a failed count refresh', async ({
  page,
}) => {
  let attempts = 0;
  let reads = 0;
  const operations = await mockDiscussion(page, ({ operationName }) => {
    if (operationName === 'Discussion' && ++reads > 1) return failure(500);
    if (operationName === 'PublishComment' && ++attempts === 1)
      return failure(500);
    return {};
  });
  await page.goto('/posts/one');
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.getByText('Write a comment first.')).toBeVisible();
  expect(attempts).toBe(0);
  await page.getByLabel('Add a comment').fill('A thoughtful comment');
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Something went wrong' }),
  ).toBeVisible();
  await expect(page.getByLabel('Add a comment')).toHaveValue(
    'A thoughtful comment',
  );
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.getByTestId('comment-written')).toBeVisible();
  await expect(page.getByLabel('Add a comment')).toHaveValue('');
  await expect(
    page.getByText('Comment posted.', { exact: true }),
  ).toBeVisible();
  expect(
    operations
      .filter((op) => op.operationName === 'PublishComment')
      .map((op) => op.variables.input),
  ).toEqual([
    { postId: 'one', body: 'A thoughtful comment' },
    { postId: 'one', body: 'A thoughtful comment' },
  ]);
});

test('posts a reply to its real parent and never duplicates the returned comment', async ({
  page,
}) => {
  const reply = comment('written', {
    parentId: 'root',
    authorUsername: 'alex',
    authorId: 'viewer',
    body: 'A new reply',
  });
  let posted = false;
  const operations = await mockDiscussion(
    page,
    ({ operationName, variables }) => {
      if (operationName === 'PublishComment') {
        posted = true;
        return { data: { createComment: reply } };
      }
      if (
        operationName === 'ThreadComments' &&
        variables.parentId === 'root' &&
        posted
      )
        return { data: { comments: comments([reply]) } };
      return {};
    },
  );
  await page.goto('/posts/one');
  await page
    .getByTestId('comment-root')
    .getByRole('button', { name: 'Reply', exact: true })
    .click();
  await page.getByLabel('Your reply').fill('A new reply');
  await page.getByRole('button', { name: 'Post reply', exact: true }).click();
  await expect(page.getByTestId('comment-written')).toHaveCount(1);
  await expect(page.getByTestId('comment-written')).toBeVisible();
  expect(
    operations.find((op) => op.operationName === 'PublishComment')?.variables
      .input,
  ).toEqual({ postId: 'one', parentId: 'root', body: 'A new reply' });
});

test('restores own votes without replacing totals and supports remove, switch, reload and comment voting', async ({
  page,
}) => {
  const operations = await mockDiscussion(page);
  await page.goto('/posts/one');
  const voting = page.getByRole('group', { name: 'Post voting' });
  await expect(voting.getByLabel('42 score')).toBeVisible();
  await voting
    .getByRole('button', { name: 'Upvote post', exact: true })
    .click();
  await expect(voting.getByLabel('43 score')).toBeVisible();
  await expect(
    voting.getByRole('button', { name: 'Upvote post' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(
    voting.getByRole('button', { name: 'Upvote post' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(voting.getByLabel('43 score')).toBeVisible();
  await voting.getByRole('button', { name: 'Downvote post' }).click();
  await expect(voting.getByLabel('41 score')).toBeVisible();
  await voting.getByRole('button', { name: 'Downvote post' }).click();
  await expect(voting.getByLabel('42 score')).toBeVisible();
  const commentVoting = page
    .getByTestId('comment-root')
    .getByRole('group', { name: 'Comment voting' });
  await commentVoting.getByRole('button', { name: 'Upvote comment' }).click();
  await expect(commentVoting.getByLabel('10 score')).toBeVisible();
  expect(
    operations
      .filter((op) => op.operationName === 'SetPostVote')
      .map((op) => op.variables.input),
  ).toEqual([
    { targetId: 'one', value: 1 },
    { targetId: 'one', value: -1 },
    { targetId: 'one', value: 0 },
  ]);
  expect(
    operations
      .filter((op) => op.operationName === 'OwnCommentVotes')
      .map((op) => op.variables.ids),
  ).toEqual([['root'], ['root']]);
});

test('retains authoritative vote state on failure and retries only after another click', async ({
  page,
}) => {
  let attempts = 0;
  await mockDiscussion(page, ({ operationName }) =>
    operationName === 'SetPostVote' && ++attempts === 1 ? failure(500) : {},
  );
  await page.goto('/posts/one');
  const voting = page.getByRole('group', { name: 'Post voting' });
  await voting.getByRole('button', { name: 'Upvote post' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Something went wrong' }),
  ).toBeVisible();
  await expect(voting.getByLabel('42 score')).toBeVisible();
  await expect(
    voting.getByRole('button', { name: 'Upvote post' }),
  ).toHaveAttribute('aria-pressed', 'false');
  expect(attempts).toBe(1);
  await voting.getByRole('button', { name: 'Upvote post' }).click();
  await expect(voting.getByLabel('43 score')).toBeVisible();
});

test('blocks anonymous writes, does not issue private vote lookups, and clears private vote UI after logout', async ({
  page,
}) => {
  const operations = await mockDiscussion(page);
  await page.goto('/posts/one');
  await page.getByRole('button', { name: 'Upvote post' }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Your account' })
    .click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  const previous = operations.filter((op) =>
    op.operationName.startsWith('Own'),
  ).length;
  await page.goto('/posts/one');
  await expect(
    page.getByRole('link', { name: 'Sign in to upvote post' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Post comment', exact: true }),
  ).toHaveCount(0);
  expect(
    operations.filter((op) => op.operationName.startsWith('Own')).length,
  ).toBe(previous);
  await page.goto('/submit');
  await expect(
    page.getByRole('link', { name: 'Sign in to post' }),
  ).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
});

test('handles missing and deleted posts, keeps deleted parents and their replies reachable', async ({
  page,
}) => {
  await mockDiscussion(page, ({ operationName, variables }) => {
    if (operationName === 'Discussion')
      return variables.id === 'missing'
        ? failure(404)
        : {
            data: {
              post: {
                ...originalPost,
                deletedAt: '2026-10-05T12:00:00Z',
                body: null,
              },
            },
          };
    if (operationName === 'ThreadComments' && !variables.parentId)
      return {
        data: {
          comments: comments([
            comment('root', {
              deletedAt: '2026-10-05T12:00:00Z',
              body: '[deleted]',
              hasReplies: true,
            }),
          ]),
        },
      };
    return {};
  });
  await page.goto('/posts/missing');
  await expect(
    page.getByRole('heading', { name: 'Post not found' }),
  ).toBeVisible();
  await page.goto('/posts/one');
  await expect(
    page.getByRole('heading', { name: '[Deleted post]', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Add a comment')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Reply', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Show replies' }).click();
  await expect(page.getByText('A reply worth reading.')).toBeVisible();
});

test('validates posting, joins explicitly after a membership error, preserves drafts, and publishes text once', async ({
  page,
}) => {
  let joined = false;
  const operations = await mockDiscussion(page, ({ operationName }) => {
    if (operationName === 'PublishPost' && !joined)
      return failure(403, 'Join the community before posting in it.');
    if (operationName === 'JoinForPosting') joined = true;
    return {};
  });
  await page.goto('/submit?community=craft');
  await expect(page.getByLabel('Community', { exact: true })).toHaveValue(
    'craft',
  );
  await expect(
    page.getByRole('option', { name: 'r/craft - Makers & curious minds' }),
  ).toBeAttached();
  await expect(page.getByLabel('Community', { exact: true })).toHaveValue(
    'craft',
  );
  await page.getByRole('button', { name: 'Publish post' }).click();
  await expect(page.getByText('Use at least 3 characters.')).toBeVisible();
  expect(
    operations.filter((op) => op.operationName === 'PublishPost'),
  ).toHaveLength(0);
  await page.getByLabel('Title', { exact: true }).fill('A new conversation');
  await page.getByLabel('Your post').fill('A text-only post.');
  await page.getByRole('button', { name: 'Publish post' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Join the community' }),
  ).toBeVisible();
  await expect(page.getByLabel('Your post')).toHaveValue('A text-only post.');
  expect(joined).toBe(false);
  await page
    .getByRole('button', { name: 'Join community', exact: true })
    .click();
  await expect(
    page.getByText('Community joined.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Publish post' }).click();
  await expect(page).toHaveURL(/\/posts\/published$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'A new conversation',
  );
  expect(
    operations
      .filter((op) => op.operationName === 'PublishPost')
      .map((op) => op.variables.input),
  ).toEqual([
    {
      communitySlug: 'craft',
      title: 'A new conversation',
      body: 'A text-only post.',
    },
    {
      communitySlug: 'craft',
      title: 'A new conversation',
      body: 'A text-only post.',
    },
  ]);
});

test('publishes link posts without the retained text draft and rejects executable URLs', async ({
  page,
}) => {
  const operations = await mockDiscussion(page);
  await page.goto('/submit?community=craft');
  await page.getByLabel('Title', { exact: true }).fill('A useful resource');
  await page.getByLabel('Your post').fill('Retained text draft');
  await page.getByRole('radio', { name: 'Link', exact: true }).check();
  await page.getByLabel('URL', { exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Publish post' }).click();
  await expect(
    page.getByText('Enter a public HTTP or HTTPS URL without credentials.'),
  ).toBeVisible();
  expect(
    operations.filter((op) => op.operationName === 'PublishPost'),
  ).toHaveLength(0);
  await page
    .getByLabel('URL', { exact: true })
    .fill('https://example.com/story');
  await page.getByRole('button', { name: 'Publish post' }).click();
  await expect(page).toHaveURL(/\/posts\/published$/);
  await expect(
    page.getByRole('link', { name: 'example.com', exact: true }),
  ).toBeVisible();
  expect(
    operations.find((op) => op.operationName === 'PublishPost')?.variables
      .input,
  ).toEqual({
    communitySlug: 'craft',
    title: 'A useful resource',
    url: 'https://example.com/story',
  });
});

test('fits long discussions, nested replies, and the composer without horizontal overflow or private email', async ({
  page,
}, testInfo) => {
  await mockDiscussion(page, ({ operationName }) => {
    if (operationName === 'Discussion')
      return {
        data: {
          post: {
            ...originalPost,
            title: 'LongWord'.repeat(30),
            body: '<script>alert(1)</script>\n' + 'LongWord'.repeat(100),
          },
        },
      };
    if (operationName === 'ThreadComments')
      return {
        data: {
          comments: comments([
            comment('root', {
              body: 'LongWord'.repeat(100),
              hasReplies: false,
            }),
          ]),
        },
      };
    return {};
  });
  await page.goto('/posts/one');
  await expect(page.getByTestId('comment-root')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByText(account.email, { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('discussion.png'),
    fullPage: true,
  });
  await page.goto('/submit?community=craft');
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('composer.png'),
    fullPage: true,
  });
});

import { expect, Page, test } from '@playwright/test';

const createdAt = '2026-10-01T12:00:00Z';
const privateEmail = 'private-profile@example.com';
const avatarUrl = 'https://images.example/avatar.jpg';
const initialProfile = {
  __typename: 'User',
  id: 'alex-id',
  username: 'alex',
  bio: 'Building small things together.',
  avatarUrl: null as string | null,
  createdAt,
};
type Operation = {
  operationName: string;
  variables: Record<string, unknown>;
  query: string;
  cookie?: string;
};

function post(id: string, username = 'alex') {
  return {
    __typename: 'Post',
    id,
    title: `Post ${id}`,
    body: 'A public conversation.',
    url: null,
    authorId: `${username}-id`,
    authorUsername: username,
    communityId: 'craft-id',
    communitySlug: 'craft',
    createdAt,
    editedAt: null,
    deletedAt: null,
    score: 4,
    commentCount: 2,
  };
}
function comment(id: string) {
  return {
    __typename: 'Comment',
    id,
    postId: 'post-one',
    parentId: id === 'reply' ? 'parent' : null,
    authorId: 'alex-id',
    authorUsername: 'alex',
    body: `Comment ${id}`,
    createdAt,
    editedAt: id === 'reply' ? createdAt : null,
    deletedAt: null,
    score: 2,
    hasReplies: false,
  };
}

async function mockProfiles(
  page: Page,
  options: {
    guest?: boolean;
    saveFailure?: boolean;
    profileFailure?: boolean;
    pageFailure?: boolean;
    invalidCursor?: boolean;
  } = {},
) {
  const state = {
    signedIn: !options.guest,
    profile: { ...initialProfile },
    saveFailure: options.saveFailure ?? false,
    profileFailure: options.profileFailure ?? false,
    pageFailure: options.pageFailure ?? false,
    saveCalls: 0,
    operations: [] as Operation[],
    delaySave: null as Promise<void> | null,
    delayPosts: null as Promise<void> | null,
  };
  const headers = {
    'Access-Control-Allow-Origin': 'http://localhost:4200',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  async function fulfill(
    route: import('@playwright/test').Route,
    data: unknown,
    status = 0,
  ) {
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(
        status
          ? {
              errors: [
                {
                  message: 'Failure',
                  extensions: {
                    code:
                      status === 401
                        ? 'UNAUTHENTICATED'
                        : 'INTERNAL_SERVER_ERROR',
                    originalError: { statusCode: status, message: 'Failure' },
                  },
                },
              ],
            }
          : { data },
      ),
    });
  }
  await page.route(avatarUrl, (route) =>
    route.fulfill({
      path: 'apps/frontend/web/public/community-street.jpg',
      contentType: 'image/jpeg',
    }),
  );
  await page.route('http://localhost:3000/graphql', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    const operation = route.request().postDataJSON() as Operation;
    operation.cookie = route.request().headers().cookie;
    state.operations.push(operation);
    const account = {
      ...state.profile,
      __typename: 'Account',
      email: privateEmail,
    };
    if (operation.operationName === 'Session')
      return fulfill(route, { me: account }, state.signedIn ? 0 : 401);
    if (operation.operationName === 'SignOut') {
      state.signedIn = false;
      return fulfill(route, { logout: true });
    }
    if (operation.operationName === 'PublicProfile') {
      if (operation.variables.username === 'missing')
        return fulfill(route, null, 404);
      if (state.profileFailure) return fulfill(route, null, 500);
      const user =
        operation.variables.username === 'alex'
          ? state.profile
          : {
              ...initialProfile,
              id: 'corvin-id',
              username: 'corvin',
              bio: 'Another public profile.',
            };
      return fulfill(route, { user });
    }
    if (operation.operationName === 'SaveProfile') {
      state.saveCalls++;
      if (state.delaySave) await state.delaySave;
      if (state.saveFailure) {
        state.saveFailure = false;
        return fulfill(route, null, 500);
      }
      if (!state.signedIn) return fulfill(route, null, 401);
      Object.assign(state.profile, operation.variables.input);
      return fulfill(route, {
        updateUser: {
          ...state.profile,
          __typename: 'Account',
          email: privateEmail,
        },
      });
    }
    throw new Error(`Unexpected auth operation ${operation.operationName}`);
  });
  await page.route('http://localhost:3001/graphql', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    const operation = route.request().postDataJSON() as Operation;
    state.operations.push(operation);
    const { operationName, variables } = operation;
    if (operationName === 'SubscribedCommunities')
      return fulfill(route, {
        myCommunities: { items: [], hasMore: false, nextCursor: null },
      });
    if (operationName === 'BrowseCommunities')
      return fulfill(route, {
        communities: { items: [], hasMore: false, nextCursor: null },
      });
    if (operationName === 'OwnPostVotes' || operationName === 'OwnCommentVotes')
      return fulfill(route, {
        [operationName === 'OwnPostVotes' ? 'myPostVotes' : 'myCommentVotes']: (
          variables.ids as string[]
        ).map((targetId) => ({ targetId, myVote: 0 })),
      });
    if (operationName === 'AuthorPosts') {
      if (variables.cursor && state.pageFailure) {
        state.pageFailure = false;
        return fulfill(route, null, 500);
      }
      if (
        variables.authorId === 'alex-id' &&
        !variables.cursor &&
        state.delayPosts
      )
        await state.delayPosts;
      if (variables.authorId === 'corvin-id')
        return fulfill(route, {
          postsByAuthor: {
            items: [post('corvin-post', 'corvin')],
            hasMore: false,
            nextCursor: null,
          },
        });
      return fulfill(route, {
        postsByAuthor: variables.cursor
          ? {
              items: [post('two'), post('three')],
              hasMore: !!options.invalidCursor,
              nextCursor: options.invalidCursor ? 'post-cursor' : null,
            }
          : {
              items: [post('one'), post('two')],
              hasMore: true,
              nextCursor: 'post-cursor',
            },
      });
    }
    if (operationName === 'AuthorComments')
      return fulfill(route, {
        commentsByAuthor: variables.cursor
          ? {
              items: [comment('reply'), comment('three')],
              hasMore: false,
              nextCursor: null,
            }
          : {
              items: [comment('one'), comment('reply')],
              hasMore: true,
              nextCursor: 'comment-cursor',
            },
      });
    if (operationName === 'Discussion')
      return fulfill(route, { post: post('post-one') });
    if (operationName === 'ThreadComments')
      return fulfill(route, {
        comments: { items: [], hasMore: false, nextCursor: null },
      });
    throw new Error(`Unexpected social operation ${operationName}`);
  });
  return state;
}

test('shows a public profile without account email or cookie-bearing public requests', async ({
  page,
  context,
}, testInfo) => {
  await context.addCookies([
    {
      name: 'Authentication',
      value: 'private-cookie',
      domain: 'localhost',
      path: '/',
    },
  ]);
  const state = await mockProfiles(page);
  await page.goto('/u/alex');
  await expect(
    page.getByRole('heading', { level: 1, name: 'u/alex' }),
  ).toBeVisible();
  await expect(page.getByText(initialProfile.bio)).toBeVisible();
  await expect(page.getByText('Joined Oct 1, 2026')).toBeVisible();
  await expect(page.getByText(privateEmail)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit profile' })).toBeVisible();
  const operations = state.operations.filter(
    (op) => op.operationName === 'PublicProfile',
  );
  expect(operations.length).toBeGreaterThan(0);
  for (const operation of operations) {
    expect(operation.query).not.toMatch(/\b(email|me|password)\b/);
    expect(operation.cookie).toBeUndefined();
  }
  const html = await (await page.request.get('/u/alex')).text();
  expect(html).not.toContain(privateEmail);
  expect(html).not.toContain('private-cookie');
  await expect(page.getByRole('heading', { name: 'Post one' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'u/alex', exact: true }).first(),
  ).toHaveAttribute('href', '/u/alex');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('public-profile.png'),
    fullPage: true,
  });
});

test('pages activity independently, deduplicates rows and retains pages when switching tabs', async ({
  page,
}) => {
  const state = await mockProfiles(page);
  await page.goto('/u/alex');
  await expect(page.getByRole('heading', { name: 'Post one' })).toBeVisible();
  expect(
    state.operations.filter((op) => op.operationName === 'AuthorComments'),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByRole('heading', { name: 'Post three' })).toBeVisible();
  await expect(page.locator('.profile-layout .post-card')).toHaveCount(3);
  await page
    .getByRole('navigation', { name: 'Profile activity' })
    .getByRole('link', { name: 'Comments' })
    .click();
  await expect(page).toHaveURL('/u/alex?tab=comments');
  await expect(page.getByTestId('activity-comment-reply')).toContainText(
    'REPLY',
  );
  await expect(page.getByTestId('activity-comment-reply')).toContainText(
    'Edited',
  );
  await page.getByRole('button', { name: 'Load more comments' }).click();
  await expect(page.getByTestId('activity-comment-three')).toBeVisible();
  await page.getByRole('button', { name: 'Refresh activity' }).click();
  await expect(page.getByTestId('activity-comment-three')).toHaveCount(0);
  await expect(page.getByTestId('activity-comment-one')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Profile activity' })
    .getByRole('link', { name: 'Posts' })
    .click();
  await expect(page.getByRole('heading', { name: 'Post three' })).toBeVisible();
  const requests = state.operations.filter((op) =>
    op.operationName.startsWith('Author'),
  );
  expect(
    requests.every(
      (op) => op.variables.authorId === 'alex-id' && op.variables.limit === 20,
    ),
  ).toBe(true);
  expect(
    requests.find(
      (op) => op.operationName === 'AuthorPosts' && op.variables.cursor,
    )?.variables.cursor,
  ).toBe('post-cursor');
  expect(
    requests.find(
      (op) => op.operationName === 'AuthorComments' && op.variables.cursor,
    )?.variables.cursor,
  ).toBe('comment-cursor');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Post one' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Profile activity' })
    .getByRole('link', { name: 'Comments' })
    .click();
  await page
    .getByTestId('activity-comment-one')
    .getByRole('link', { name: 'Open discussion' })
    .click();
  await expect(page).toHaveURL('/posts/post-one#comments');
});

test('retains activity after a page failure, retries the same cursor and stops on a repeated cursor', async ({
  page,
}) => {
  const state = await mockProfiles(page, {
    pageFailure: true,
    invalidCursor: true,
  });
  await page.goto('/u/alex');
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(
    page.locator('.profile-layout').getByRole('alert'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Post one' })).toBeVisible();
  await page
    .locator('.profile-layout')
    .getByRole('button', { name: 'Retry' })
    .click();
  await expect(page.getByRole('heading', { name: 'Post three' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Load more posts' }),
  ).toHaveCount(0);
  expect(
    state.operations
      .filter((op) => op.operationName === 'AuthorPosts' && op.variables.cursor)
      .map((op) => op.variables.cursor),
  ).toEqual(['post-cursor', 'post-cursor']);
});

test('handles missing profiles and retryable auth API outages without querying activity', async ({
  page,
}) => {
  const state = await mockProfiles(page, { profileFailure: true, guest: true });
  await page.goto('/u/missing');
  await expect(
    page.getByRole('heading', { name: 'Profile not found' }),
  ).toBeVisible();
  await page.goto('/u/alex');
  await expect(
    page.locator('.profile-layout').getByRole('alert'),
  ).toBeVisible();
  expect(
    state.operations.filter((op) => op.operationName.startsWith('Author')),
  ).toHaveLength(0);
  state.profileFailure = false;
  await page
    .locator('.profile-layout')
    .getByRole('button', { name: 'Retry' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'u/alex' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit profile' })).toHaveCount(0);
  expect(
    state.operations.some((op) => op.operationName.startsWith('Own')),
  ).toBe(false);
});

test('does not mix late activity responses across authors or show own controls on another profile', async ({
  page,
}) => {
  const state = await mockProfiles(page);
  let release!: () => void;
  state.delayPosts = new Promise((resolve) => {
    release = resolve;
  });
  await page.goto('/u/alex');
  await expect(page.getByText('Loading activity...')).toBeVisible();
  await page.goto('/u/corvin');
  await expect(
    page.getByRole('heading', { name: 'Post corvin-post' }),
  ).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: 'Post one' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit profile' })).toHaveCount(0);
  await expect(page.getByText(privateEmail)).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Your profile', exact: true }),
  ).not.toHaveAttribute('aria-current', 'page');
});

test('validates settings, preserves a failed draft and saves only changed public fields', async ({
  page,
}, testInfo) => {
  const state = await mockProfiles(page, { saveFailure: true });
  await page.goto('/u/alex');
  await page.getByRole('link', { name: 'Edit profile' }).click();
  const form = page.getByRole('form', { name: 'Profile settings' });
  await expect(form).toBeVisible();
  await expect(
    form.getByRole('button', { name: 'Save changes' }),
  ).toBeDisabled();
  await form.getByLabel('Bio').fill('x'.repeat(301));
  await form.getByLabel('Avatar URL').fill('javascript:alert(1)');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toContainText('Use at most 300 characters.');
  expect(state.saveCalls).toBe(0);
  await form.getByLabel('Bio').fill('A new public bio.');
  await form.getByLabel('Avatar URL').fill(avatarUrl);
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.getByLabel('Bio')).toHaveValue('A new public bio.');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toContainText('Profile saved.');
  await expect(
    form.getByRole('button', { name: 'Save changes' }),
  ).toBeDisabled();
  expect(
    state.operations
      .filter((op) => op.operationName === 'SaveProfile')
      .map((op) => op.variables.input),
  ).toEqual([
    { bio: 'A new public bio.', avatarUrl },
    { bio: 'A new public bio.', avatarUrl },
  ]);
  await expect(
    page
      .locator('.account-content')
      .getByRole('img', { name: "alex's avatar" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.account-content')
        .getByRole('img', { name: "alex's avatar" })
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('profile-settings.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'View public profile' }).click();
  await expect(page.getByText('A new public bio.')).toBeVisible();
  await expect(page.getByText(privateEmail)).toHaveCount(0);
  await expect(page.locator('.profile-heading').getByRole('img')).toBeVisible();
});

test('clears fields explicitly, cancels drafts and restores saved settings after reload', async ({
  page,
}) => {
  const state = await mockProfiles(page);
  state.profile.avatarUrl = avatarUrl;
  await page.goto('/account#profile-settings');
  let form = page.getByRole('form', { name: 'Profile settings' });
  await form.getByLabel('Bio').fill('Discard this.');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Edit profile' }).click();
  form = page.getByRole('form', { name: 'Profile settings' });
  await expect(form.getByLabel('Bio')).toHaveValue(initialProfile.bio);
  await form.getByLabel('Bio').fill('');
  await form.getByLabel('Avatar URL').fill('');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toContainText('Profile saved.');
  expect(
    state.operations.find((op) => op.operationName === 'SaveProfile')?.variables
      .input,
  ).toEqual({ bio: '', avatarUrl: null });
  await page.reload();
  await expect(page.getByLabel('Bio')).toHaveValue('');
  await expect(page.getByLabel('Avatar URL')).toHaveValue('');
  await expect(
    page
      .locator('.account-content')
      .getByRole('img', { name: "alex's avatar" }),
  ).toHaveCount(0);
});

test('serializes saving and rechecks an expired session instead of retrying a write', async ({
  page,
}) => {
  const state = await mockProfiles(page);
  let release!: () => void;
  state.delaySave = new Promise((resolve) => {
    release = resolve;
  });
  await page.goto('/account#profile-settings');
  const form = page.getByRole('form', { name: 'Profile settings' });
  await form.getByLabel('Bio').fill('Pending bio.');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  await expect(form.getByLabel('Bio')).toBeDisabled();
  await expect.poll(() => state.saveCalls).toBe(1);
  state.signedIn = false;
  release();
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  expect(state.saveCalls).toBe(1);
  await expect(page.getByText(privateEmail)).toHaveCount(0);
});

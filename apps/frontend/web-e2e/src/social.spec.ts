import { expect, Page, test } from '@playwright/test';

const communities = [
  {
    __typename: 'Community',
    id: 'craft',
    slug: 'craft',
    name: 'Makers & curious minds',
    description: 'Small projects, big ideas. Share what you are working on.',
    memberCount: 1204,
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    __typename: 'Community',
    id: 'romania',
    slug: 'romania',
    name: 'Around Romania',
    description: 'Local discoveries and everyday conversations.',
    memberCount: 230,
    createdAt: '2026-02-20T00:00:00Z',
  },
  {
    __typename: 'Community',
    id: 'nightowls',
    slug: 'nightowls',
    name: 'The late-night crowd',
    description: 'For thoughts that arrive after midnight.',
    memberCount: 0,
    createdAt: '2026-03-01T00:00:00Z',
  },
];

function post(
  id: string,
  title = `Conversation ${id}`,
  overrides: Record<string, unknown> = {},
) {
  return {
    __typename: 'Post',
    id,
    title,
    body: 'What have you been making lately? I finally finished the little project that has been sitting on my desk all week.',
    url: null,
    authorUsername: 'selene',
    communityId: 'craft',
    communitySlug: 'craft',
    createdAt: '2026-10-05T10:00:00Z',
    editedAt: null,
    score: 311,
    commentCount: 42,
    ...overrides,
  };
}
const posts = [
  post('one', 'A weekend project worth sharing'),
  post('two', 'Your favorite corner of the city?', {
    authorUsername: 'corvin',
    score: 88,
    commentCount: 17,
    body: 'A quiet street, a good coffee, and a conversation that lasted longer than planned.',
  }),
  post('three', 'Something new to learn this week', {
    authorUsername: 'alex',
    url: 'https://example.com/story',
    body: null,
    score: 24,
    commentCount: 3,
  }),
];
function feedPage(
  items = posts,
  hasMore = false,
  nextCursor: string | null = null,
) {
  return { __typename: 'PostPage', items, hasMore, nextCursor };
}
function communityPage(
  items = communities,
  hasMore = false,
  nextCursor: string | null = null,
) {
  return { __typename: 'CommunityPage', items, hasMore, nextCursor };
}
function failure(statusCode: number) {
  return {
    errors: [
      {
        message: 'Failure',
        extensions: {
          originalError: { statusCode, message: 'Internal database details' },
          code: statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
        },
      },
    ],
  };
}
type Operation = { operationName: string; variables: Record<string, unknown> };
type Responder = (
  operation: Operation,
) => Record<string, unknown> | Promise<Record<string, unknown>>;
const privateAccount = {
  __typename: 'Account',
  id: 'account',
  username: 'roorin_user',
  email: 'private@example.com',
  bio: null,
  avatarUrl: null,
};

async function mockAPIs(
  page: Page,
  respond?: Responder,
  options: {
    signedIn?: boolean;
    authOffline?: boolean;
    autoLoad?: boolean;
  } = {},
) {
  // Existing pagination cases exercise the manual fallback without observer races.
  if (!options.autoLoad) {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'IntersectionObserver', {
        value: undefined,
      });
    });
  }
  const operations: Operation[] = [];
  const headers = {
    'Access-Control-Allow-Origin': 'http://localhost:4200',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  await page.route('http://localhost:3000/graphql', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(
        options.authOffline
          ? failure(500)
          : options.signedIn
            ? { data: { me: privateAccount } }
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
    const operation: Operation = route.request().postDataJSON();
    operations.push(operation);
    let result;
    if (respond) result = await respond(operation);
    if (!result || Object.keys(result).length === 0) {
      if (operation.operationName === 'BrowseFeed')
        result = { data: { feed: feedPage() } };
      if (operation.operationName === 'OwnPostVotes')
        result = { data: { myPostVotes: [] } };
      if (operation.operationName === 'SubscribedCommunities')
        result = { data: { myCommunities: communityPage([]) } };
      if (operation.operationName === 'BrowseCommunities')
        result = { data: { communities: communityPage() } };
      if (operation.operationName === 'CommunityDetails') {
        const community = communities.find(
          (item) => item.slug === operation.variables.slug,
        );
        result = community ? { data: { community } } : failure(404);
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

const fullFeedPage = Array.from({ length: 20 }, (_, index) =>
  post(`page-${index}`),
);

test('automatically appends near the end without moving the reading position or duplicating requests', async ({
  page,
}, testInfo) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operations = await mockAPIs(
    page,
    async ({ operationName, variables }) => {
      if (operationName !== 'BrowseFeed') return {};
      if (variables.offset === 0)
        return { data: { feed: feedPage(fullFeedPage, true) } };
      await gate;
      return { data: { feed: feedPage([post('next-one'), post('next-two')]) } };
    },
    { autoLoad: true },
  );
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(20);
  expect(
    operations.filter((op) => op.operationName === 'BrowseFeed'),
  ).toHaveLength(1);
  await page.locator('.feed-sentinel').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Loading...' })).toBeDisabled();
  const loader = page
    .getByRole('status')
    .filter({ hasText: 'Loading more posts...' });
  await expect(loader).toBeVisible();
  await expect(page.getByTestId('post-next-one')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('pagination-loader.png') });
  const position = await page.evaluate(() => window.scrollY);
  const anchor = await page.getByTestId('post-page-19').boundingBox();
  if (!anchor) throw new Error('The reading-position anchor is missing.');
  release();
  await expect(page.getByRole('article')).toHaveCount(22);
  await expect(loader).toHaveCount(0);
  await expect(page.getByText('You are all caught up.')).toBeAttached();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(position, 0);
  expect((await page.getByTestId('post-page-19').boundingBox())?.y).toBeCloseTo(
    anchor.y,
    0,
  );
  expect(
    operations
      .filter((op) => op.operationName === 'BrowseFeed')
      .map((op) => op.variables.offset),
  ).toEqual([0, 20]);
  await expect(page.getByTestId('post-next-one')).not.toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath('automatic-pagination.png'),
  });
});

test('keeps the pagination loader visible for fast responses, including the final page', async ({
  page,
}) => {
  await mockAPIs(page, ({ operationName, variables }) => {
    if (operationName !== 'BrowseFeed') return {};
    return {
      data: {
        feed:
          variables.offset === 0
            ? feedPage(fullFeedPage, true)
            : feedPage([post('fast-final')]),
      },
    };
  });
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(20);
  const timing = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let startedAt: number | null = null;
        const observer = new MutationObserver(() => {
          const loading = document.querySelector('.feed-page-loading');
          if (loading && startedAt === null) startedAt = performance.now();
          if (!loading && startedAt !== null) {
            observer.disconnect();
            resolve(performance.now() - startedAt);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }),
  );
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByTestId('post-fast-final')).toBeFocused();
  expect(await timing).toBeGreaterThanOrEqual(600);
  await expect(page.getByText('You are all caught up.')).toBeAttached();
  await expect(page.locator('.feed-page-loading')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Loading...' })).toHaveCount(0);
});

test('keeps pagination feedback visible without animation for reduced motion', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockAPIs(page, async ({ operationName, variables }) => {
    if (operationName !== 'BrowseFeed') return {};
    if (variables.offset === 0)
      return { data: { feed: feedPage(fullFeedPage, true) } };
    await gate;
    return failure(500);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load more posts' }).click();
  const loader = page
    .getByRole('status')
    .filter({ hasText: 'Loading more posts...' });
  await expect(loader).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Refresh feed' }),
  ).toBeDisabled();
  expect(
    await loader
      .locator('svg')
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none');
  await page.screenshot({
    path: testInfo.outputPath('pagination-loader-reduced-motion.png'),
  });
  release();
  await expect(page.getByRole('alert')).toBeAttached();
  await expect(loader).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Retry' })).toBeEnabled();
});

test('manual loading shows and focuses the first new post, not an overlapping row or the button', async ({
  page,
}, testInfo) => {
  await mockAPIs(page, ({ operationName, variables }) => {
    if (operationName !== 'BrowseFeed') return {};
    return {
      data: {
        feed:
          variables.offset === 0
            ? feedPage(fullFeedPage, true)
            : feedPage(
                [fullFeedPage[19], post('next-one'), post('next-two')],
                true,
              ),
      },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load more posts' }).click();
  const firstNewPost = page.getByTestId('post-next-one');
  await expect(page.getByRole('article')).toHaveCount(22);
  await expect(firstNewPost).toBeFocused();
  await expect(firstNewPost).toBeInViewport({ ratio: 1 });
  const bounds = await firstNewPost.boundingBox();
  if (!bounds) throw new Error('The first new post is missing.');
  expect(bounds.y).toBeGreaterThanOrEqual(23);
  expect(bounds.y).toBeLessThan((page.viewportSize()?.height ?? 900) / 2);
  await expect(
    page.getByRole('button', { name: 'Load more posts' }),
  ).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('manual-pagination.png') });
});

test('pauses on an empty page and resumes automatic paging after a successful refresh', async ({
  page,
}) => {
  let pageAttempts = 0;
  const operations = await mockAPIs(
    page,
    ({ operationName, variables }) => {
      if (operationName !== 'BrowseFeed') return {};
      if (variables.offset === 0)
        return { data: { feed: feedPage(fullFeedPage, true) } };
      pageAttempts += 1;
      return {
        data: {
          feed:
            pageAttempts === 1
              ? feedPage([], true)
              : feedPage([post('after-refresh')]),
        },
      };
    },
    { autoLoad: true },
  );
  await page.goto('/');
  await page.locator('.feed-sentinel').scrollIntoViewIfNeeded();
  await expect.poll(() => pageAttempts).toBe(1);
  await expect(
    page.getByRole('button', { name: 'Load more posts' }),
  ).toBeEnabled();
  await expect(page.getByRole('article')).toHaveCount(20);
  await page.getByRole('button', { name: 'Refresh feed' }).click();
  await expect
    .poll(
      () => operations.filter((op) => op.operationName === 'BrowseFeed').length,
    )
    .toBe(3);
  await page.locator('.feed-sentinel').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('post-after-refresh')).toBeAttached();
  expect(
    operations
      .filter((op) => op.operationName === 'BrowseFeed')
      .map((op) => op.variables.offset),
  ).toEqual([0, 20, 0, 20]);
});

test('pauses automatic loading after failure until explicit retry', async ({
  page,
}) => {
  let attempts = 0;
  const operations = await mockAPIs(
    page,
    ({ operationName, variables }) => {
      if (operationName !== 'BrowseFeed') return {};
      if (variables.offset === 0)
        return { data: { feed: feedPage(fullFeedPage, true) } };
      attempts += 1;
      return attempts === 1
        ? failure(500)
        : { data: { feed: feedPage([post('retried')]) } };
    },
    { autoLoad: true },
  );
  await page.goto('/');
  await page.locator('.feed-sentinel').scrollIntoViewIfNeeded();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.feed-sentinel').scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(attempts).toBe(1);
  await expect(page.getByRole('article')).toHaveCount(20);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('post-retried')).toBeFocused();
  expect(
    operations
      .filter((op) => op.operationName === 'BrowseFeed')
      .map((op) => op.variables.offset),
  ).toEqual([0, 20, 20]);
});

test('stops automatic requests when a page contains only existing posts', async ({
  page,
}) => {
  const operations = await mockAPIs(
    page,
    ({ operationName, variables }) => {
      if (operationName !== 'BrowseFeed') return {};
      return {
        data: {
          feed:
            variables.offset === 40
              ? feedPage([post('manual-next')])
              : feedPage(fullFeedPage, true),
        },
      };
    },
    { autoLoad: true },
  );
  await page.goto('/');
  await page.locator('.feed-sentinel').scrollIntoViewIfNeeded();
  await expect
    .poll(
      () => operations.filter((op) => op.operationName === 'BrowseFeed').length,
    )
    .toBe(2);
  await expect(
    page.getByRole('button', { name: 'Load more posts' }),
  ).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.feed-sentinel').scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(
    operations.filter((op) => op.operationName === 'BrowseFeed'),
  ).toHaveLength(2);
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByTestId('post-manual-next')).toBeFocused();
});

test('automatically pages a community New feed by cursor and stops on a repeated cursor', async ({
  page,
}) => {
  const operations = await mockAPIs(
    page,
    ({ operationName, variables }) => {
      if (operationName !== 'BrowseFeed') return {};
      return {
        data: {
          feed:
            variables.cursor == null
              ? feedPage(fullFeedPage, true, 'new-cursor')
              : feedPage([post('community-next')], true, 'new-cursor'),
        },
      };
    },
    { autoLoad: true },
  );
  await page.goto('/r/craft?sort=NEW');
  await expect(page.getByRole('article')).toHaveCount(20);
  await page.locator('.feed-sentinel').scrollIntoViewIfNeeded();
  await expect(page.getByRole('article')).toHaveCount(21);
  await page.locator('.feed-sentinel').scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(
    operations
      .filter((op) => op.operationName === 'BrowseFeed')
      .map((op) => op.variables),
  ).toEqual([
    expect.objectContaining({
      communitySlug: 'craft',
      sort: 'NEW',
      offset: 0,
      cursor: null,
    }),
    expect.objectContaining({
      communitySlug: 'craft',
      sort: 'NEW',
      offset: 0,
      cursor: 'new-cursor',
    }),
  ]);
});

test('pages Hot by offset, deduplicates overlaps, and keeps the next offset independent of visible rows', async ({
  page,
}) => {
  const operations = await mockAPIs(page, ({ operationName, variables }) => {
    if (operationName !== 'BrowseFeed') return {};
    const offset = variables.offset;
    return {
      data: {
        feed:
          offset === 0
            ? feedPage(posts.slice(0, 2), true)
            : offset === 20
              ? feedPage(
                  [post('two', posts[1].title, { score: 99 }), posts[2]],
                  true,
                )
              : feedPage([post('four')]),
      },
    };
  });
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(
    page.getByTestId('post-two').getByLabel('99 score'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByRole('article')).toHaveCount(4);
  expect(
    operations
      .filter((op) => op.operationName === 'BrowseFeed')
      .map((op) => op.variables.offset),
  ).toEqual([0, 20, 40]);
  await expect(
    page.getByRole('button', { name: 'Load more posts' }),
  ).toHaveCount(0);
});

test('preserves the Hot pagination position when refresh fails', async ({
  page,
}) => {
  let firstPageAttempts = 0;
  const operations = await mockAPIs(page, ({ operationName, variables }) => {
    if (operationName !== 'BrowseFeed') return {};
    if (variables.offset === 0)
      return ++firstPageAttempts === 1
        ? { data: { feed: feedPage(posts.slice(0, 2), true) } }
        : failure(500);
    return {
      data: {
        feed:
          variables.offset === 20
            ? feedPage([posts[2]], true)
            : feedPage([post('four')]),
      },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Refresh feed' }).click();
  await expect(
    page.getByRole('region', { name: 'Home feed' }).getByRole('alert'),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByRole('article')).toHaveCount(4);
  expect(
    operations
      .filter((op) => op.operationName === 'BrowseFeed')
      .map((op) => op.variables.offset),
  ).toEqual([0, 20, 0, 40]);
});

test('ignores a late Hot page after switching to New', async ({ page }) => {
  await mockAPIs(page, ({ operationName, variables }) =>
    operationName === 'BrowseFeed'
      ? {
          data: {
            feed:
              variables.sort === 'NEW'
                ? feedPage([post('new', 'A fresh conversation')])
                : feedPage(posts, true),
          },
        }
      : {},
  );
  let release: () => void = () => undefined;
  let started: () => void = () => undefined;
  let finished: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const completed = new Promise<void>((resolve) => {
    finished = resolve;
  });
  await page.route('http://localhost:3001/graphql', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    const { operationName, variables } = route.request().postDataJSON();
    if (operationName !== 'BrowseFeed' || variables.offset !== 20)
      return route.fallback();
    started();
    await blocked;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:4200',
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({
          data: { feed: feedPage([post('late', 'An old Hot page')]) },
        }),
      });
    } catch (failure) {
      if (!route.request().failure()) throw failure;
    } finally {
      finished();
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await requested;
  await page.getByRole('link', { name: 'New', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A fresh conversation' }),
  ).toBeVisible();
  release();
  await completed;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByText('An old Hot page', { exact: true })).toHaveCount(
    0,
  );
});

test('persists sorting and Top ranges in URLs and restores them through browser history', async ({
  page,
}) => {
  const operations = await mockAPIs(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Top', exact: true }).click();
  await page.getByLabel('Time range').selectOption('DAY');
  await expect(page).toHaveURL(/sort=TOP&range=DAY/);
  await expect
    .poll(() =>
      operations.some(
        (op) =>
          op.operationName === 'BrowseFeed' &&
          op.variables.sort === 'TOP' &&
          op.variables.range === 'DAY',
      ),
    )
    .toBe(true);
  await page.getByRole('link', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL('/?sort=NEW');
  await expect(page.getByLabel('Time range')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel('Time range')).toHaveValue('DAY');
  await page.reload();
  await expect(page.getByLabel('Time range')).toHaveValue('DAY');
});

test('uses cursors for New and Top without sending a Hot offset', async ({
  page,
}) => {
  const operations = await mockAPIs(page, ({ operationName, variables }) =>
    operationName === 'BrowseFeed'
      ? {
          data: {
            feed: variables.cursor
              ? feedPage([posts[2]])
              : feedPage(posts.slice(0, 2), true, 'two'),
          },
        }
      : {},
  );
  await page.goto('/?sort=NEW');
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  expect(
    operations.filter((op) => op.operationName === 'BrowseFeed')[1].variables,
  ).toMatchObject({ cursor: 'two', offset: 0, sort: 'NEW' });
  await page.getByRole('link', { name: 'Top', exact: true }).click();
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  expect(
    operations.filter((op) => op.operationName === 'BrowseFeed').at(-1)
      ?.variables,
  ).toMatchObject({ cursor: 'two', offset: 0, sort: 'TOP' });
});

test('retains posts when a page fails and retries the same page', async ({
  page,
}) => {
  let attempts = 0;
  const operations = await mockAPIs(page, ({ operationName, variables }) => {
    if (operationName !== 'BrowseFeed') return {};
    if (variables.offset === 0)
      return { data: { feed: feedPage(posts.slice(0, 2), true) } };
    if (++attempts === 1) return failure(500);
    return { data: { feed: feedPage([posts[2]]) } };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Something went wrong',
  );
  await expect(page.getByRole('article')).toHaveCount(2);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect(page.getByRole('article')).toHaveCount(3);
  expect(
    operations
      .filter((op) => op.operationName === 'BrowseFeed')
      .map((op) => op.variables.offset),
  ).toEqual([0, 20, 20]);
});

test('retries an initial feed failure without exposing server internals', async ({
  page,
}) => {
  let attempts = 0;
  await mockAPIs(page, ({ operationName }) =>
    operationName === 'BrowseFeed' && ++attempts === 1 ? failure(500) : {},
  );
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Something went wrong',
  );
  await expect(page.getByText('Internal database details')).toHaveCount(0);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect(page.getByRole('article')).toHaveCount(3);
});

const fullCommunityPage = Array.from({ length: 20 }, (_, index) => ({
  ...communities[0],
  id: `directory-${index}`,
  slug: `directory-${index}`,
  name: `Community ${index}`,
}));

test('automatically loads communities with the post loader without moving the reading position', async ({
  page,
}, testInfo) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operations = await mockAPIs(
    page,
    async ({ operationName, variables }) => {
      if (operationName !== 'BrowseCommunities' || variables.limit !== 20)
        return {};
      if (!variables.cursor)
        return {
          data: {
            communities: communityPage(fullCommunityPage, true, 'directory-19'),
          },
        };
      await gate;
      return {
        data: {
          communities: communityPage([
            fullCommunityPage[19],
            communities[1],
            communities[2],
          ]),
        },
      };
    },
    { autoLoad: true },
  );
  await page.goto('/communities');
  const cards = page.locator('.community-grid .community-card');
  await expect(cards).toHaveCount(20);
  const requests = () =>
    operations.filter(
      (op) =>
        op.operationName === 'BrowseCommunities' && op.variables.limit === 20,
    );
  expect(requests()).toHaveLength(1);
  await page
    .locator('.directory-column .feed-sentinel')
    .scrollIntoViewIfNeeded();
  const loader = page
    .getByRole('status')
    .filter({ hasText: 'Loading more communities...' });
  await expect(loader).toBeVisible();
  await expect(page.getByRole('button', { name: 'Loading...' })).toBeDisabled();
  await expect(cards).toHaveCount(20);
  const position = await page.evaluate(() => window.scrollY);
  const anchor = await cards.last().boundingBox();
  await page.screenshot({
    path: testInfo.outputPath('community-pagination-loader.png'),
  });
  release();
  await expect(cards).toHaveCount(22);
  await expect(loader).toHaveCount(0);
  await expect(page.getByText('All communities loaded.')).toBeAttached();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(position, 0);
  expect((await cards.nth(19).boundingBox())?.y).toBeCloseTo(
    anchor?.y ?? -1,
    0,
  );
  expect(requests().map((op) => op.variables.cursor ?? null)).toEqual([
    null,
    'directory-19',
  ]);
  await expect(cards.nth(20)).not.toBeFocused();
});

test('keeps the communities loader visible for fast final pages and focuses manual results', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockAPIs(page, ({ operationName, variables }) => {
    if (operationName !== 'BrowseCommunities' || variables.limit !== 20)
      return {};
    return {
      data: {
        communities: variables.cursor
          ? communityPage([communities[1], communities[2]])
          : communityPage(communities.slice(0, 2), true, 'romania'),
      },
    };
  });
  await page.goto('/communities');
  const timing = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let startedAt: number | null = null;
        const observer = new MutationObserver(() => {
          const loader = document.querySelector(
            '.directory-column .feed-page-loading',
          );
          if (loader && startedAt === null) startedAt = performance.now();
          if (!loader && startedAt !== null) {
            observer.disconnect();
            resolve(performance.now() - startedAt);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }),
  );
  await page.getByRole('button', { name: 'Load more communities' }).click();
  const loader = page
    .getByRole('status')
    .filter({ hasText: 'Loading more communities...' });
  await expect(loader).toBeVisible();
  expect(
    await loader
      .locator('svg')
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none');
  await expect(page.locator('.community-grid .community-card')).toHaveCount(2);
  await expect(
    page.locator('.community-card[data-community-id="nightowls"]'),
  ).toBeFocused();
  expect(await timing).toBeGreaterThanOrEqual(600);
  await expect(page.getByText('All communities loaded.')).toBeAttached();
});

test('pauses automatic community loading after a failure and retries the same cursor explicitly', async ({
  page,
}) => {
  let attempts = 0;
  await mockAPIs(
    page,
    ({ operationName, variables }) => {
      if (operationName !== 'BrowseCommunities' || variables.limit !== 20)
        return {};
      if (!variables.cursor)
        return {
          data: {
            communities: communityPage(fullCommunityPage, true, 'directory-19'),
          },
        };
      return ++attempts === 1
        ? failure(500)
        : { data: { communities: communityPage([communities[1]]) } };
    },
    { autoLoad: true },
  );
  await page.goto('/communities');
  await expect(page.locator('.community-grid .community-card')).toHaveCount(20);
  await page
    .locator('.directory-column .feed-sentinel')
    .scrollIntoViewIfNeeded();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.waitForTimeout(900);
  expect(attempts).toBe(1);
  await expect(page.locator('.community-grid .community-card')).toHaveCount(20);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.community-grid .community-card')).toHaveCount(21);
  expect(attempts).toBe(2);
});

for (const progress of ['duplicates', 'repeated cursor'] as const) {
  test(`stops automatic community loading on ${progress}`, async ({ page }) => {
    let attempts = 0;
    await mockAPIs(
      page,
      ({ operationName, variables }) => {
        if (operationName !== 'BrowseCommunities' || variables.limit !== 20)
          return {};
        if (!variables.cursor)
          return {
            data: {
              communities: communityPage(
                communities.slice(0, 1),
                true,
                'craft',
              ),
            },
          };
        attempts++;
        return {
          data: {
            communities: communityPage(
              progress === 'duplicates'
                ? communities.slice(0, 1)
                : communities.slice(1, 2),
              true,
              progress === 'duplicates' ? 'romania' : 'craft',
            ),
          },
        };
      },
      { autoLoad: true },
    );
    await page.goto('/communities');
    await page
      .locator('.directory-column .feed-sentinel')
      .scrollIntoViewIfNeeded();
    await expect.poll(() => attempts).toBe(1);
    await expect(
      page.getByRole('button', { name: 'Load more communities' }),
    ).toBeEnabled();
    await page.waitForTimeout(900);
    expect(attempts).toBe(1);
    await expect(page.locator('.community-grid .community-card')).toHaveCount(
      progress === 'duplicates' ? 1 : 2,
    );
  });
}

test('loads and deduplicates community pages and opens the scoped community feed', async ({
  page,
}) => {
  const operations = await mockAPIs(page, ({ operationName, variables }) =>
    operationName === 'BrowseCommunities' && variables.limit === 20
      ? {
          data: {
            communities: variables.cursor
              ? communityPage(communities.slice(1))
              : communityPage(communities.slice(0, 2), true, 'romania'),
          },
        }
      : {},
  );
  await page.goto('/communities');
  const directory = page.getByRole('region', {
    name: 'Communities',
    exact: true,
  });
  await expect(directory.locator('.community-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Load more communities' }).click();
  await expect(directory.locator('.community-card')).toHaveCount(3);
  expect(
    operations.filter(
      (op) =>
        op.operationName === 'BrowseCommunities' && op.variables.limit === 20,
    )[1].variables.cursor,
  ).toBe('romania');
  await directory.getByRole('link', { name: /r\/craft/ }).click();
  await expect(page).toHaveURL('/r/craft');
  await expect(
    page.getByRole('heading', { name: communities[0].name, exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      operations.some(
        (op) =>
          op.operationName === 'BrowseFeed' &&
          op.variables.communitySlug === 'craft',
      ),
    )
    .toBe(true);
  await page.getByRole('link', { name: 'Top', exact: true }).click();
  await page.getByLabel('Time range').selectOption('WEEK');
  await expect(page).toHaveURL('/r/craft?sort=TOP&range=WEEK');
  await expect
    .poll(() =>
      operations.some(
        (op) =>
          op.operationName === 'BrowseFeed' &&
          op.variables.communitySlug === 'craft' &&
          op.variables.range === 'WEEK',
      ),
    )
    .toBe(true);
});

test('retains communities after a failed next page and retries its cursor', async ({
  page,
}) => {
  let attempts = 0;
  await mockAPIs(page, ({ operationName, variables }) => {
    if (operationName !== 'BrowseCommunities' || variables.limit !== 20)
      return {};
    if (!variables.cursor)
      return {
        data: {
          communities: communityPage(communities.slice(0, 2), true, 'romania'),
        },
      };
    return ++attempts === 1
      ? failure(500)
      : { data: { communities: communityPage(communities.slice(2)) } };
  });
  await page.goto('/communities');
  await page.getByRole('button', { name: 'Load more communities' }).click();
  const directory = page.getByRole('region', {
    name: 'Communities',
    exact: true,
  });
  await expect(directory.getByRole('alert')).toBeVisible();
  await expect(directory.locator('.community-card')).toHaveCount(2);
  await directory.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(directory.locator('.community-card')).toHaveCount(3);
});

test('distinguishes missing communities from retryable outages', async ({
  page,
}) => {
  let attempts = 0;
  await mockAPIs(page, ({ operationName, variables }) =>
    operationName === 'CommunityDetails' &&
    variables.slug === 'craft' &&
    ++attempts === 1
      ? failure(500)
      : {},
  );
  await page.goto('/r/missing');
  await expect(
    page.getByRole('heading', { name: 'Community not found' }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Browse communities', exact: true })
    .click();
  await expect(page).toHaveURL('/communities');
  await page.goto('/r/craft');
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: communities[0].name }),
  ).toBeVisible();
});

test('shows empty feeds and directories without demo posts or membership controls', async ({
  page,
}) => {
  await mockAPIs(page, ({ operationName }) =>
    operationName === 'BrowseFeed'
      ? { data: { feed: feedPage([]) } }
      : operationName === 'BrowseCommunities'
        ? { data: { communities: communityPage([]) } }
        : {},
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'No posts yet' }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('link', { name: 'Communities', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Communities', exact: true })
      .getByRole('heading', { name: 'No communities yet' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /join|leave/i })).toHaveCount(
    0,
  );
});

test('renders safe links and plain user text with expandable long posts', async ({
  page,
}) => {
  const longBody = 'A thoughtful conversation. '.repeat(30);
  await mockAPIs(page, ({ operationName }) =>
    operationName === 'BrowseFeed'
      ? {
          data: {
            feed: feedPage([
              post('unsafe', 'Plain text', {
                body: '<img src=x onerror=alert(1)>',
                url: 'javascript:alert(1)',
              }),
              post('long', 'A longer read', { body: longBody }),
              posts[2],
            ]),
          },
        }
      : {},
  );
  await page.goto('/');
  await expect(page.getByTestId('post-unsafe')).toContainText(
    '<img src=x onerror=alert(1)>',
  );
  await expect(page.getByTestId('post-unsafe').getByRole('img')).toHaveCount(0);
  await expect(
    page.getByTestId('post-unsafe').locator('.post-link'),
  ).toHaveCount(0);
  await expect(
    page.getByTestId('post-unsafe').locator('a[href^="javascript:"]'),
  ).toHaveCount(0);
  await page.getByText('Read full post', { exact: true }).click();
  await expect(
    page.getByTestId('post-long').locator('details'),
  ).toHaveAttribute('open', '');
  await expect(
    page
      .getByTestId('post-three')
      .getByRole('link', { name: 'example.com', exact: true }),
  ).toHaveAttribute('rel', 'noopener noreferrer');
});

test('keeps public browsing available when auth is offline', async ({
  page,
}) => {
  await mockAPIs(page, undefined, { authOffline: true });
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(3);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Sign in' })
    .click();
  await expect(page).toHaveURL('/account');
  await expect(
    page.getByRole('button', { name: 'Retry session' }),
  ).toBeVisible();
});

test('keeps account email out of public views and links to the private account', async ({
  page,
  request,
}) => {
  await mockAPIs(page, undefined, { signedIn: true });
  await page.goto('/');
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Your account' }),
  ).toBeVisible();
  await expect(
    page.getByText(privateAccount.email, { exact: true }),
  ).toHaveCount(0);
  expect(await (await request.get('/')).text()).not.toContain(
    privateAccount.email,
  );
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Your account' })
    .click();
  await expect(
    page.getByText(privateAccount.email, { exact: true }),
  ).toBeVisible();
});

test('fits feed and community layouts and loads the visual asset', async ({
  page,
}, testInfo) => {
  await mockAPIs(page, ({ operationName }) =>
    operationName === 'BrowseFeed'
      ? {
          data: {
            feed: feedPage([
              post('long', 'LongWord'.repeat(20), {
                body: 'LongWord'.repeat(50),
              }),
              ...posts,
            ]),
          },
        }
      : {},
  );
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (testInfo.project.name === 'desktop') {
    const image = page.getByRole('img', {
      name: 'A lively neighborhood street',
      exact: true,
    });
    await expect(image).toBeVisible();
    expect(
      await image.evaluate((node: HTMLImageElement) => node.naturalWidth),
    ).toBeGreaterThan(0);
  }
  await page.screenshot({
    path: testInfo.outputPath('feed.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Communities', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Communities', exact: true })
      .locator('.community-card'),
  ).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('communities.png'),
    fullPage: true,
  });
});

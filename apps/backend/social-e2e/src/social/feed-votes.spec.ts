import {
  expectData,
  gql,
  GqlResponse,
  registerAndLogin,
  Session,
  unique,
} from '../support/gql';

interface VoteResult {
  targetId: string;
  score: number;
  myVote: number;
}
interface FeedPage {
  items: { id: string; score: number }[];
  hasMore: boolean;
  nextCursor: string | null;
}
type Target = 'post' | 'comment';

const feedQuery =
  'query ($communitySlug: String, $sort: FeedSort!, $range: FeedRange, $cursor: String, $offset: Int, $limit: Int!) { feed(communitySlug: $communitySlug, sort: $sort, range: $range, cursor: $cursor, offset: $offset, limit: $limit) { items { id score } hasMore nextCursor } }';

function expectError(response: GqlResponse<unknown>, statusCode: number) {
  expect(response.errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        extensions: expect.objectContaining({
          originalError: expect.objectContaining({ statusCode }),
        }),
      }),
    ]),
  );
}

describe('Feed and votes through auth and social', () => {
  let owner: Session;
  let voter: Session;
  let otherVoter: Session;

  beforeAll(async () => {
    [owner, voter, otherVoter] = await Promise.all([
      registerAndLogin(),
      registerAndLogin(),
      registerAndLogin(),
    ]);
  });

  async function createCommunity(): Promise<string> {
    const slug = unique('c');
    expectData(
      await gql(
        'mutation ($input: CreateCommunityInput!) { createCommunity(createCommunityInput: $input) { id } }',
        { input: { slug, name: 'Feed and Votes' } },
        owner.cookie,
      ),
    );
    return slug;
  }

  async function createPost(communitySlug: string): Promise<string> {
    return expectData(
      await gql<{ createPost: { id: string } }>(
        'mutation ($input: CreatePostInput!) { createPost(createPostInput: $input) { id } }',
        {
          input: {
            communitySlug,
            title: 'Feed test post',
            body: 'A text post',
          },
        },
        owner.cookie,
      ),
    ).createPost.id;
  }

  async function createTargets(): Promise<{ post: string; comment: string }> {
    const post = await createPost(await createCommunity());
    const comment = expectData(
      await gql<{ createComment: { id: string } }>(
        'mutation ($input: CreateCommentInput!) { createComment(createCommentInput: $input) { id } }',
        { input: { postId: post, body: 'Vote test comment' } },
        owner.cookie,
      ),
    ).createComment.id;
    return { post, comment };
  }

  function voteQuery(target: Target) {
    const operation = target === 'post' ? 'votePost' : 'voteComment';
    return `mutation ($input: VoteInput!) { ${operation}(voteInput: $input) { targetId score myVote } }`;
  }

  async function vote(
    target: Target,
    targetId: string,
    value: number,
    session = voter,
  ): Promise<VoteResult> {
    const operation = target === 'post' ? 'votePost' : 'voteComment';
    return expectData(
      await gql<Record<string, VoteResult>>(
        voteQuery(target),
        { input: { targetId, value } },
        session.cookie,
      ),
    )[operation];
  }

  async function myVotes(
    target: Target,
    ids: string[],
    session = voter,
  ): Promise<VoteResult[]> {
    const operation = target === 'post' ? 'myPostVotes' : 'myCommentVotes';
    return expectData(
      await gql<Record<string, VoteResult[]>>(
        `query ($ids: [String!]!) { ${operation}(${target === 'post' ? 'postIds' : 'commentIds'}: $ids) { targetId score myVote } }`,
        { ids },
        session.cookie,
      ),
    )[operation];
  }

  async function feed(
    communitySlug?: string,
    options: Record<string, unknown> = {},
  ): Promise<FeedPage> {
    return expectData(
      await gql<{ feed: FeedPage }>(feedQuery, {
        communitySlug,
        sort: 'HOT',
        limit: 100,
        ...options,
      }),
    ).feed;
  }

  it.each(['post', 'comment'] as const)(
    'applies and removes %s votes without score drift',
    async (target) => {
      const targetId = (await createTargets())[target];
      for (const [value, score] of [
        [1, 1],
        [1, 1],
        [-1, -1],
        [-1, -1],
        [0, 0],
        [0, 0],
      ]) {
        expect(await vote(target, targetId, value)).toEqual({
          targetId,
          myVote: value,
          score,
        });
      }
      expect(await myVotes(target, [targetId])).toEqual([]);
    },
  );

  it.each(['post', 'comment'] as const)(
    "isolates private %s vote lookups and adds different users' deltas",
    async (target) => {
      const targetId = (await createTargets())[target];
      await vote(target, targetId, 1);
      await vote(target, targetId, -1, otherVoter);
      expect(await myVotes(target, [targetId, 'unvoted'])).toEqual([
        { targetId, myVote: 1, score: 0 },
      ]);
      expect(await myVotes(target, [targetId], otherVoter)).toEqual([
        { targetId, myVote: -1, score: 0 },
      ]);
      expect(await myVotes(target, [targetId], owner)).toEqual([]);
      expect(await vote(target, targetId, 0)).toEqual({
        targetId,
        myVote: 0,
        score: -1,
      });
      expect(await myVotes(target, [])).toEqual([]);
    },
  );

  it.each(['post', 'comment'] as const)(
    'serializes concurrent %s vote retries, flips, and removals',
    async (target) => {
      const targetId = (await createTargets())[target];
      for (const value of [1, -1, 0]) {
        const results = await Promise.all(
          Array.from({ length: 8 }, () => vote(target, targetId, value)),
        );
        for (const result of results)
          expect(result).toEqual({ targetId, myVote: value, score: value });
      }
      expect(await myVotes(target, [targetId])).toEqual([]);
    },
  );

  it.each(['post', 'comment'] as const)(
    'handles mixed concurrent %s changes from two users consistently',
    async (target) => {
      const targetId = (await createTargets())[target];
      const sessions = [voter, otherVoter];
      await Promise.all(
        Array.from({ length: 16 }, (_, i) =>
          vote(target, targetId, (i % 3) - 1, sessions[i % 2]),
        ),
      );
      const votes = await Promise.all(
        sessions.map((session) => myVotes(target, [targetId], session)),
      );
      const expectedScore = votes
        .flat()
        .reduce((sum, row) => sum + row.myVote, 0);
      const unchangedValue = votes[0][0]?.myVote ?? 0;
      expect((await vote(target, targetId, unchangedValue)).score).toBe(
        expectedScore,
      );
    },
  );

  it('guards vote mutations and private batch queries', async () => {
    for (const target of ['post', 'comment'] as const) {
      const mutation = await gql(voteQuery(target), {
        input: { targetId: 'missing', value: 1 },
      });
      expect(mutation.errors?.[0].extensions?.code).toBe('FORBIDDEN');
      const operation = target === 'post' ? 'myPostVotes' : 'myCommentVotes';
      const response = await gql(
        `query { ${operation}(${target === 'post' ? 'postIds' : 'commentIds'}: []) { targetId } }`,
      );
      expect(response.errors?.[0].extensions?.code).toBe('FORBIDDEN');
    }
  });

  it.each(['post', 'comment'] as const)(
    'rejects missing %s targets, invalid values, and empty IDs',
    async (target) => {
      const targetId = (await createTargets())[target];
      for (const value of [-1, 0, 1]) {
        expectError(
          await gql(
            voteQuery(target),
            { input: { targetId: 'missing', value } },
            voter.cookie,
          ),
          404,
        );
      }
      for (const input of [
        { targetId, value: 2 },
        { targetId: '', value: 1 },
      ]) {
        expectError(await gql(voteQuery(target), { input }, voter.cookie), 400);
      }
      expect(await myVotes(target, [targetId])).toEqual([]);
    },
  );

  it('scopes NEW pages to live community posts with exclusive cursors', async () => {
    const slug = await createCommunity();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push(await createPost(slug));
    const deleted = await createPost(slug);
    expectData(
      await gql(
        'mutation ($id: String!) { deletePost(id: $id) { id } }',
        { id: deleted },
        owner.cookie,
      ),
    );
    await createPost(await createCommunity());
    const first = await feed(slug, { sort: 'NEW', limit: 2 });
    const second = await feed(slug, {
      sort: 'NEW',
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe(ids[1]);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((row) => row.id)).toEqual(
      [...ids].reverse(),
    );
  });

  it('ranks TOP by score and supports cursor pages and time-range arguments', async () => {
    const slug = await createCommunity();
    const high = await createPost(slug);
    const low = await createPost(slug);
    await vote('post', high, 1);
    await vote('post', high, 1, otherVoter);
    await vote('post', low, 1);
    for (const range of ['DAY', 'WEEK', 'MONTH', 'ALL']) {
      expect((await feed(slug, { sort: 'TOP', range })).items).toEqual([
        { id: high, score: 2 },
        { id: low, score: 1 },
      ]);
    }
    const first = await feed(slug, { sort: 'TOP', limit: 1 });
    const second = await feed(slug, {
      sort: 'TOP',
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(first).toMatchObject({
      items: [{ id: high }],
      hasMore: true,
      nextCursor: high,
    });
    expect(second).toMatchObject({
      items: [{ id: low }],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('breaks equal TOP scores by ID', async () => {
    const slug = await createCommunity();
    const ids = [
      await createPost(slug),
      await createPost(slug),
      await createPost(slug),
    ];
    expect(
      (await feed(slug, { sort: 'TOP' })).items.map((row) => row.id),
    ).toEqual(ids.sort());
  });

  it('uses gravity ranking and offset pagination for HOT without cursor tokens', async () => {
    const slug = await createCommunity();
    const high = await createPost(slug);
    const low = await createPost(slug);
    await vote('post', high, 1);
    await vote('post', high, 1, otherVoter);
    await vote('post', low, 1);
    const first = await feed(slug, { limit: 1 });
    const second = await feed(slug, { limit: 1, offset: 1 });
    expect(first).toMatchObject({
      items: [{ id: high }],
      hasMore: true,
      nextCursor: null,
    });
    expect(second).toMatchObject({
      items: [{ id: low }],
      hasMore: false,
      nextCursor: null,
    });
    expect(await feed(slug, { offset: 500 })).toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('provides a public global feed and empty feeds for empty communities', async () => {
    const slug = await createCommunity();
    const postId = await createPost(slug);
    expect(
      (await feed(undefined, { sort: 'NEW' })).items.map((row) => row.id),
    ).toContain(postId);
    const empty = await createCommunity();
    for (const sort of ['HOT', 'NEW', 'TOP']) {
      expect(await feed(empty, { sort })).toEqual({
        items: [],
        hasMore: false,
        nextCursor: null,
      });
    }
  });

  it.each([
    { limit: 0 },
    { limit: 101 },
    { offset: -1 },
    { offset: 501 },
    { communitySlug: '' },
    { cursor: '' },
  ])('rejects invalid feed arguments %#', async (options) => {
    expectError(
      await gql(feedQuery, { sort: 'HOT', limit: 25, ...options }),
      400,
    );
  });

  it('reports a missing community instead of silently returning the global feed', async () => {
    expectError(
      await gql(feedQuery, {
        sort: 'HOT',
        limit: 25,
        communitySlug: unique('missing'),
      }),
      404,
    );
  });
});

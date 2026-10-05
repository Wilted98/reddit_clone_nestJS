import {
  expectData,
  gql,
  registerAndLogin,
  Session,
  unique,
} from '../support/gql';

interface Community {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  memberCount: number;
}

interface CommunityPage {
  items: Community[];
  hasMore: boolean;
  nextCursor: string | null;
}

const createQuery =
  'mutation ($input: CreateCommunityInput!) { createCommunity(createCommunityInput: $input) { id slug name ownerId memberCount } }';
const memberQuery = (operation: 'joinCommunity' | 'leaveCommunity') =>
  `mutation ($slug: String!) { ${operation}(slug: $slug) { id slug name ownerId memberCount } }`;

describe('Communities through auth and social', () => {
  let owner: Session;
  let member: Session;

  beforeAll(async () => {
    [owner, member] = await Promise.all([
      registerAndLogin(),
      registerAndLogin(),
    ]);
  });

  async function createCommunity(): Promise<Community> {
    return expectData(
      await gql<{ createCommunity: Community }>(
        createQuery,
        { input: { slug: unique('c'), name: 'Test Community' } },
        owner.cookie,
      ),
    ).createCommunity;
  }

  it('accepts an auth cookie over gRPC and creates the owner as the first member', async () => {
    const community = await createCommunity();
    expect(community.ownerId).toBe(owner.userId);
    expect(community.memberCount).toBe(1);
    const joined = expectData(
      await gql<{ joinCommunity: Community }>(
        memberQuery('joinCommunity'),
        { slug: community.slug },
        owner.cookie,
      ),
    );
    expect(joined.joinCommunity.memberCount).toBe(1);
  });

  it('keeps community lookup public', async () => {
    const community = await createCommunity();
    const response = expectData(
      await gql<{ community: Community }>(
        'query ($slug: String!) { community(slug: $slug) { id slug name ownerId memberCount } }',
        { slug: community.slug },
      ),
    );
    expect(response.community).toEqual(community);
  });

  it.each(['createCommunity', 'joinCommunity', 'leaveCommunity'] as const)(
    'rejects anonymous %s',
    async (operation) => {
      const response =
        operation === 'createCommunity'
          ? await gql(createQuery, {
              input: { slug: unique('c'), name: 'Anonymous' },
            })
          : await gql(memberQuery(operation), { slug: unique('missing') });
      expect(response.errors?.[0].extensions?.code).toBe('FORBIDDEN');
    },
  );

  it('rejects a forged authentication cookie', async () => {
    const response = await gql(
      createQuery,
      { input: { slug: unique('c'), name: 'Forged' } },
      'Authentication=not.a.real.jwt',
    );
    expect(response.errors?.[0].extensions?.code).toBe('FORBIDDEN');
  });

  it('reports a missing community', async () => {
    const response = await gql(
      'query ($slug: String!) { community(slug: $slug) { id } }',
      { slug: unique('missing') },
    );
    expect(response.errors?.[0].extensions?.originalError?.statusCode).toBe(
      404,
    );
  });

  it('reports a duplicate slug as a conflict', async () => {
    const community = await createCommunity();
    const response = await gql(
      createQuery,
      { input: { slug: community.slug, name: 'Duplicate' } },
      member.cookie,
    );
    expect(response.errors?.[0].extensions?.originalError?.statusCode).toBe(
      409,
    );
  });

  it('validates DTO input through the real global ValidationPipe', async () => {
    const response = await gql(
      createQuery,
      { input: { slug: 'Bad-Slug', name: 'Test Community' } },
      owner.cookie,
    );
    expect(response.errors?.[0].extensions?.originalError?.statusCode).toBe(
      400,
    );
  });

  it('increments and decrements once across repeated join and leave requests', async () => {
    const community = await createCommunity();
    for (let request = 0; request < 2; request++) {
      const response = expectData(
        await gql<{ joinCommunity: Community }>(
          memberQuery('joinCommunity'),
          { slug: community.slug },
          member.cookie,
        ),
      );
      expect(response.joinCommunity.memberCount).toBe(2);
    }
    for (let request = 0; request < 2; request++) {
      const response = expectData(
        await gql<{ leaveCommunity: Community }>(
          memberQuery('leaveCommunity'),
          { slug: community.slug },
          member.cookie,
        ),
      );
      expect(response.leaveCommunity.memberCount).toBe(1);
    }
  });

  it('keeps concurrent duplicate joins and leaves successful with correct counters', async () => {
    const community = await createCommunity();
    const joins = await Promise.all(
      Array.from({ length: 6 }, () =>
        gql<{ joinCommunity: Community }>(
          memberQuery('joinCommunity'),
          { slug: community.slug },
          member.cookie,
        ),
      ),
    );
    for (const response of joins)
      expect(expectData(response).joinCommunity.memberCount).toBe(2);
    const leaves = await Promise.all(
      Array.from({ length: 6 }, () =>
        gql<{ leaveCommunity: Community }>(
          memberQuery('leaveCommunity'),
          { slug: community.slug },
          member.cookie,
        ),
      ),
    );
    for (const response of leaves)
      expect(expectData(response).leaveCommunity.memberCount).toBe(1);
  });

  it('prevents the owner from leaving and preserves the member count', async () => {
    const community = await createCommunity();
    const response = await gql(
      memberQuery('leaveCommunity'),
      { slug: community.slug },
      owner.cookie,
    );
    expect(response.errors?.[0].extensions?.originalError?.statusCode).toBe(
      403,
    );
    const current = expectData(
      await gql<{ community: { memberCount: number } }>(
        'query ($slug: String!) { community(slug: $slug) { memberCount } }',
        { slug: community.slug },
      ),
    );
    expect(current.community.memberCount).toBe(1);
  });

  it('paginates public results without repeating the cursor row', async () => {
    await Promise.all(Array.from({ length: 3 }, () => createCommunity()));
    const query =
      'query ($cursor: String, $limit: Int!) { communities(cursor: $cursor, limit: $limit) { items { id slug name ownerId memberCount } nextCursor hasMore } }';
    const first = expectData(
      await gql<{ communities: CommunityPage }>(query, { limit: 2 }),
    ).communities;
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe(first.items[1].id);
    const second = expectData(
      await gql<{ communities: CommunityPage }>(query, {
        cursor: first.nextCursor,
        limit: 2,
      }),
    ).communities;
    expect(second.items).toHaveLength(2);
    expect(
      second.items.some((item) =>
        first.items.some((previous) => previous.id === item.id),
      ),
    ).toBe(false);
  });

  it.each([0, 101])('rejects invalid pagination limit %i', async (limit) => {
    const response = await gql(
      'query ($limit: Int!) { communities(limit: $limit) { hasMore } }',
      { limit },
    );
    expect(response.errors?.[0].extensions?.originalError?.statusCode).toBe(
      400,
    );
  });

  it('keeps subscriptions private, pages only caller memberships, and reflects leave', async () => {
    const subscriber = await registerAndLogin();
    const joined = [await createCommunity(), await createCommunity()];
    await createCommunity();
    for (const community of joined) {
      expectData(
        await gql(
          memberQuery('joinCommunity'),
          { slug: community.slug },
          subscriber.cookie,
        ),
      );
    }
    const query =
      'query($cursor: String, $limit: Int!) { myCommunities(cursor: $cursor, limit: $limit) { items { id slug } nextCursor hasMore } }';
    const anonymous = await gql(query, { limit: 1 });
    expect(anonymous.errors?.[0].extensions?.code).toBe('FORBIDDEN');
    const first = expectData(
      await gql<{ myCommunities: CommunityPage }>(
        query,
        { limit: 1 },
        subscriber.cookie,
      ),
    ).myCommunities;
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    const second = expectData(
      await gql<{ myCommunities: CommunityPage }>(
        query,
        { cursor: first.nextCursor, limit: 1 },
        subscriber.cookie,
      ),
    ).myCommunities;
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)),
    ).toEqual(new Set(joined.map((item) => item.id)));
    expectData(
      await gql(
        memberQuery('leaveCommunity'),
        { slug: first.items[0].slug },
        subscriber.cookie,
      ),
    );
    const afterLeave = expectData(
      await gql<{ myCommunities: CommunityPage }>(
        query,
        { limit: 20 },
        subscriber.cookie,
      ),
    ).myCommunities;
    expect(afterLeave.items).toEqual(second.items);
    const invalid = await gql(query, { limit: 0 }, subscriber.cookie);
    expect(invalid.errors?.[0].extensions?.originalError?.statusCode).toBe(400);
  });
});

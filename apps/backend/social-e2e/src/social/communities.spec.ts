import axios from 'axios';
import { randomUUID } from 'crypto';

interface GqlResponse<T> {
  data?: T;
  errors?: {
    message: string;
    extensions?: { code?: string; originalError?: { statusCode?: number } };
  }[];
}

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

interface Session {
  cookie: string;
  userId: string;
}

const unique = (prefix: string) =>
  `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  cookie?: string,
): Promise<GqlResponse<T>> {
  const response = await axios.post<GqlResponse<T>>(
    '/graphql',
    { query, variables },
    { headers: cookie ? { Cookie: cookie } : {} },
  );
  expect(response.status).toBe(200);
  return response.data;
}

function expectData<T>(response: GqlResponse<T>): T {
  expect(response.errors).toBeUndefined();
  expect(response.data).toBeDefined();
  return response.data as T;
}

async function registerAndLogin(): Promise<Session> {
  const username = unique('user');
  const email = `${username}@roorin.dev`;
  const password = 'Str0ng!Passw0rd1';
  const authUrl = `${process.env.AUTH_HTTP_URL ?? 'http://localhost:3000'}/graphql`;
  const registered = await axios.post<
    GqlResponse<{ createUser: { id: string } }>
  >(authUrl, {
    query:
      'mutation ($input: CreateUserInput!) { createUser(createUserInput: $input) { id } }',
    variables: { input: { username, email, password } },
  });
  const { createUser } = expectData(registered.data);
  const loggedIn = await axios.post<GqlResponse<{ login: { id: string } }>>(
    authUrl,
    {
      query:
        'mutation ($input: LoginInput!) { login(loginInput: $input) { id } }',
      variables: { input: { email, password } },
    },
  );
  expect(expectData(loggedIn.data).login.id).toBe(createUser.id);
  const cookies = loggedIn.headers['set-cookie'] ?? [];
  const authentication = cookies.find((cookie) =>
    cookie.startsWith('Authentication='),
  );
  expect(authentication).toBeDefined();
  if (!authentication)
    throw new Error('Login did not set an Authentication cookie');
  return { cookie: authentication.split(';')[0], userId: createUser.id };
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
});

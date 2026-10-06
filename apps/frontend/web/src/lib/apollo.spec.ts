/** @jest-environment node */
import {
  createAuthClient,
  createPublicProfileClient,
  endpoints,
} from './apollo';
import {
  PublicProfileDocument,
  SessionDocument,
  SignOutDocument,
} from '../graphql/generated/auth';

describe('auth transport and cache privacy', () => {
  it('creates isolated, nonpersistent caches', () => {
    const first = createAuthClient();
    const second = createAuthClient();
    expect(first.cache).not.toBe(second.cache);
    expect(first.defaultOptions.query?.fetchPolicy).toBe('no-cache');
    expect(first.defaultOptions.mutate?.fetchPolicy).toBe('no-cache');
  });
  it('uses credentialed requests without caching private accounts', async () => {
    const original = globalThis.fetch;
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              me: {
                __typename: 'Account',
                id: 'one',
                username: 'one',
                email: 'private@example.com',
                bio: null,
                avatarUrl: null,
              },
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { logout: true } }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    globalThis.fetch = fetch;
    try {
      const client = createAuthClient();
      expect(
        (await client.query({ query: SessionDocument })).data?.me.email,
      ).toBe('private@example.com');
      await client.mutate({ mutation: SignOutDocument });
      expect(fetch).toHaveBeenCalledWith(
        endpoints.auth,
        expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
      );
      expect(client.cache.extract()).toEqual({});
      client.stop();
    } finally {
      globalThis.fetch = original;
    }
  });
  it('uses an isolated cookie-free client and only public profile selections', async () => {
    const original = globalThis.fetch;
    const fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user: {
              __typename: 'User',
              id: 'one',
              username: 'alex',
              bio: null,
              avatarUrl: null,
              createdAt: '2026-10-01T00:00:00Z',
            },
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    globalThis.fetch = fetch;
    const client = createPublicProfileClient();
    const privateClient = createAuthClient();
    try {
      await client.query({
        query: PublicProfileDocument,
        variables: { username: 'alex' },
      });
      expect(fetch).toHaveBeenCalledWith(
        endpoints.auth,
        expect.objectContaining({ credentials: 'omit', cache: 'no-store' }),
      );
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).not.toMatch(/\b(email|me|password)\b/);
      expect(client.cache).not.toBe(privateClient.cache);
      expect(client.cache.extract()).toEqual({});
    } finally {
      client.stop();
      privateClient.stop();
      globalThis.fetch = original;
    }
  });
});

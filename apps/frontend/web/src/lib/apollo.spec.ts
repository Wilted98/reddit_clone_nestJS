/** @jest-environment node */
import { createAuthClient, endpoints } from './apollo';
import { SessionDocument, SignOutDocument } from '../graphql/generated/auth';

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
});

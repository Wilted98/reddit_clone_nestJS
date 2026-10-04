import { gql, registerAndLogin } from '../support/gql';

describe('Public profiles and private accounts', () => {
  let owner: Awaited<ReturnType<typeof registerAndLogin>>;
  let viewer: Awaited<ReturnType<typeof registerAndLogin>>;

  beforeAll(async () => {
    [owner, viewer] = await Promise.all([
      registerAndLogin(),
      registerAndLogin(),
    ]);
  });

  it('exposes public profile fields without private account data', async () => {
    const response = await gql<{ user: Record<string, unknown> }>(
      `{ user(username: "${owner.username}") { id username bio avatarUrl createdAt } }`,
    );
    expect(response.data.errors).toBeUndefined();
    expect(response.data.data?.user).toMatchObject({
      id: owner.id,
      username: owner.username,
    });
    expect(response.data.data?.user).not.toHaveProperty('email');
    expect(response.data.data?.user).not.toHaveProperty('password');
  });

  it.each([undefined, 'authenticated'] as const)(
    'rejects email selections for %s viewers',
    async (mode) => {
      const response = await gql(
        `{ user(username: "${owner.username}") { email } }`,
        mode ? viewer.cookie : undefined,
      );
      expect(response.status).toBe(400);
      expect(response.data.errors?.[0].message).toMatch(
        /Cannot query field "email" on type "User"/,
      );
    },
  );

  it('does not allow a private Account fragment on a public User', async () => {
    const response = await gql(
      `{ user(username: "${owner.username}") { ... on Account { email } } }`,
      viewer.cookie,
    );
    expect(response.status).toBe(400);
    expect(response.data.errors?.[0].message).toMatch(/cannot be spread/i);
  });

  it("returns only each caller's own email through me and updateUser", async () => {
    const own = await gql<{ me: { email: string } }>(
      '{ me { email } }',
      owner.cookie,
    );
    const other = await gql<{ me: { email: string } }>(
      '{ me { email } }',
      viewer.cookie,
    );
    expect(own.data.data?.me.email).toBe(owner.email);
    expect(other.data.data?.me.email).toBe(viewer.email);
    const updated = await gql<{ updateUser: { email: string } }>(
      'mutation { updateUser(updateUserInput: { bio: "Private account test" }) { email } }',
      viewer.cookie,
    );
    expect(updated.data.errors).toBeUndefined();
    expect(updated.data.data?.updateUser.email).toBe(viewer.email);
  });
});

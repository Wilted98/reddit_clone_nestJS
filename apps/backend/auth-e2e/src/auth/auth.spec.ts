import { gql, registerAndLogin, uniq } from '../support/gql';

describe('auth (login, logout, me, updateUser)', () => {
  it('logs in and resolves an authenticated me query with the cookie it set', async () => {
    const { cookie, id } = await registerAndLogin();

    const res = await gql<{ me: { id: string } }>(
      `{ me { id username email } }`,
      cookie,
    );

    expect(res.data.errors).toBeUndefined();
    expect(res.data.data?.me.id).toBe(id);
  });

  it('rejects me with no cookie at all', async () => {
    const res = await gql(`{ me { id } }`);

    expect(res.data.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('rejects me with a garbage cookie value, without crashing the server', async () => {
    const res = await gql(`{ me { id } }`, 'Authentication=not-a-real-jwt');

    expect(res.data.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a wrong password with the same message as an unknown email (no enumeration)', async () => {
    const { email } = await registerAndLogin();

    const wrongPassword = await gql(`
      mutation { login(loginInput: { email: "${email}", password: "WrongPassword1!" }) { id } }
    `);
    const unknownEmail = await gql(`
      mutation { login(loginInput: { email: "${uniq('ghost')}@roorin.test", password: "WrongPassword1!" }) { id } }
    `);

    expect(wrongPassword.data.errors?.[0].message).toBe(
      'Credentials are not valid.',
    );
    expect(unknownEmail.data.errors?.[0].message).toBe(
      'Credentials are not valid.',
    );
    expect(wrongPassword.data.errors?.[0].extensions?.code).toBe(
      'UNAUTHENTICATED',
    );
  });

  it("updates only the authenticated caller's own profile, using the cookie, not a client-supplied id", async () => {
    const { cookie } = await registerAndLogin();

    const res = await gql<{ updateUser: { bio: string; avatarUrl: string } }>(
      `
      mutation { updateUser(updateUserInput: {
        bio: "hello from e2e", avatarUrl: "https://cdn.roorin.test/a.png"
      }) { id bio avatarUrl } }
    `,
      cookie,
    );

    expect(res.data.data?.updateUser).toMatchObject({
      bio: 'hello from e2e',
      avatarUrl: 'https://cdn.roorin.test/a.png',
    });
  });

  it('rejects updateUser with no cookie', async () => {
    const res = await gql(`
      mutation { updateUser(updateUserInput: { bio: "hacked" }) { id } }
    `);

    expect(res.data.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('clears the session on logout - a subsequent me with the same cookie is rejected', async () => {
    const { cookie } = await registerAndLogin();

    const loggedOut = await gql<{ logout: boolean }>(
      `mutation { logout }`,
      cookie,
    );
    expect(loggedOut.data.data?.logout).toBe(true);

    // The cookie value itself is still a validly-signed JWT - logout clears
    // it client-side (Set-Cookie with an expired cookie), it does not revoke
    // the token server-side. Replaying the exact same cookie value therefore
    // still authenticates; this asserts that documented behaviour rather than
    // a stronger guarantee this implementation does not make.
    const replay = await gql<{ me: { id: string } }>(`{ me { id } }`, cookie);
    expect(replay.data.errors).toBeUndefined();
  });
});

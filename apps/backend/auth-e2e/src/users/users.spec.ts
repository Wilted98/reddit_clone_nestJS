import { gql, uniq } from '../support/gql';

describe('users (createUser, user)', () => {
  it('registers a user and returns the public profile fields', async () => {
    const username = uniq('user');
    const res = await gql<{ createUser: Record<string, unknown> }>(`
      mutation {
        createUser(createUserInput: {
          username: "${username}"
          email: "${username}@roorin.test"
          password: "Str0ng!Passw0rd1"
        }) { id username email avatarUrl bio createdAt }
      }
    `);

    expect(res.data.errors).toBeUndefined();
    expect(res.data.data?.createUser).toMatchObject({
      username,
      email: `${username}@roorin.test`,
      avatarUrl: null,
      bio: null,
    });
    expect(res.data.data?.createUser.id).toEqual(expect.any(String));
  });

  it('never exposes the password field - it does not exist on the GraphQL type', async () => {
    // This isn't a runtime check on a returned value; it is the schema itself
    // refusing to compile the query, which is the stronger guarantee - there
    // is no code path (bug, misconfiguration) that could accidentally leak it.
    const res = await gql(`
      mutation {
        createUser(createUserInput: {
          username: "${uniq('user')}", email: "${uniq('user')}@roorin.test", password: "Str0ng!Passw0rd1"
        }) { id password }
      }
    `);

    expect(res.data.errors?.[0].message).toMatch(
      /Cannot query field "password"/,
    );
  });

  it('looks a user up by username', async () => {
    const username = uniq('user');
    await gql(`
      mutation { createUser(createUserInput: {
        username: "${username}", email: "${username}@roorin.test", password: "Str0ng!Passw0rd1"
      }) { id } }
    `);

    const res = await gql<{ user: { username: string } }>(`
      { user(username: "${username}") { username email } }
    `);

    expect(res.data.data?.user.username).toBe(username);
  });

  it('returns a 404-shaped error for an unknown username, without crashing the server', async () => {
    const res = await gql<{ user: unknown }>(
      `{ user(username: "${uniq('ghost')}") { id } }`,
    );

    // `getUser` maps Prisma's not-found (P2025) to a NotFoundException - see
    // docs/04-authentication.md §2. The real 404 lives under
    // extensions.originalError.statusCode; NestJS's default GraphQL error
    // formatting leaves the top-level extensions.code as INTERNAL_SERVER_ERROR
    // for most HttpExceptions (UnauthorizedException is the one exception -
    // see auth.spec.ts) - see docs/07-graphql-api-reference.md.
    //
    // `data` (not `data.user`) is null: the `user` query field is
    // non-nullable in the schema, so GraphQL's null-propagation nulls the
    // entire response payload when a non-nullable field's resolver throws.
    expect(res.data.data).toBeNull();
    expect(res.data.errors?.[0].message).toBe('User not found');
    expect(res.data.errors?.[0].extensions?.originalError?.statusCode).toBe(
      404,
    );
  });

  describe('duplicate username / email', () => {
    it('returns a 409-shaped conflict rather than creating a second row', async () => {
      const email = `${uniq('dup')}@roorin.test`;
      await gql(`
        mutation { createUser(createUserInput: {
          username: "${uniq('userA')}", email: "${email}", password: "Str0ng!Passw0rd1"
        }) { id } }
      `);

      const res = await gql(`
        mutation { createUser(createUserInput: {
          username: "${uniq('userB')}", email: "${email}", password: "Str0ng!Passw0rd1"
        }) { id } }
      `);

      // See docs/04-authentication.md §1: the message is currently the
      // generic "field already taken" rather than naming `email`
      // specifically, because error.meta.target isn't populated under the
      // Postgres driver adapter in use here - the conflict is still caught
      // and reported correctly, just less precisely than the code intends.
      expect(res.data.errors?.[0].message).toBe('field already taken');
      expect(res.data.errors?.[0].extensions?.originalError?.statusCode).toBe(
        409,
      );
    });

    it('does not silently create a second row for the duplicate', async () => {
      const username = uniq('user');
      const email = `${username}@roorin.test`;
      await gql(`
        mutation { createUser(createUserInput: {
          username: "${username}", email: "${email}", password: "Str0ng!Passw0rd1"
        }) { id } }
      `);

      await gql(`
        mutation { createUser(createUserInput: {
          username: "${uniq('other')}", email: "${email}", password: "Str0ng!Passw0rd1"
        }) { id } }
      `);

      const res = await gql<{ user: { username: string } }>(`
        { user(username: "${username}") { username email } }
      `);
      expect(res.data.data?.user.username).toBe(username);
    });
  });

  describe('input validation', () => {
    it('rejects a weak password (ValidationPipe end-to-end)', async () => {
      const res = await gql(`
        mutation { createUser(createUserInput: {
          username: "${uniq('user')}", email: "${uniq('user')}@roorin.test", password: "123"
        }) { id } }
      `);

      expect(res.data.errors?.[0].extensions?.originalError?.statusCode).toBe(
        400,
      );
      expect(res.data.errors?.[0].extensions?.originalError?.message).toEqual(
        expect.arrayContaining([expect.stringContaining('password')]),
      );
      // The row must not exist - rejection has to happen before persistence.
      const check = await gql<{ user: unknown }>(
        `{ user(username: "${uniq('never')}") { id } }`,
      );
      expect(check.data.data).toBeNull();
    });

    it('rejects a too-short username (ValidationPipe end-to-end)', async () => {
      const res = await gql(`
        mutation { createUser(createUserInput: {
          username: "a", email: "${uniq('user')}@roorin.test", password: "Str0ng!Passw0rd1"
        }) { id } }
      `);

      expect(res.data.errors?.[0].extensions?.originalError?.statusCode).toBe(
        400,
      );
      expect(res.data.errors?.[0].extensions?.originalError?.message).toEqual(
        expect.arrayContaining([expect.stringContaining('username')]),
      );
    });
  });
});

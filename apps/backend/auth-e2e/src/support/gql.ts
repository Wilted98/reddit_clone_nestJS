import axios from 'axios';

export interface GqlError {
  message: string;
  extensions?: {
    code?: string;
    originalError?: { statusCode?: number; message?: unknown };
  };
}
export interface GqlResponse<T> {
  data?: T;
  errors?: GqlError[];
}

// validateStatus: axios throws on non-2xx by default, but GraphQL returns
// 400 for schema-validation errors (e.g. querying a field that doesn't
// exist) and 200 for resolver-level errors - both need to resolve normally
// so the test can inspect `errors` itself instead of catching an exception.
//
// cookie: pass along the Set-Cookie header captured from a prior login
// response so an authenticated request can be made in a later call - axios
// does not persist cookies across requests by itself the way a browser does.
export const gql = <T>(query: string, cookie?: string) =>
  axios.post<GqlResponse<T>>(
    '/graphql',
    { query },
    {
      validateStatus: () => true,
      ...(cookie && { headers: { Cookie: cookie } }),
    },
  );

/** Unique per test run so re-runs never collide on the DB's unique constraints. */
export const uniq = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Registers a fresh user and returns their session cookie plus id/username/email. */
export async function registerAndLogin(prefix = 'user') {
  const username = uniq(prefix);
  const email = `${username}@roorin.test`;
  const password = 'Str0ng!Passw0rd1';

  const created = await gql<{ createUser: { id: string } }>(`
    mutation { createUser(createUserInput: {
      username: "${username}", email: "${email}", password: "${password}"
    }) { id } }
  `);
  if (!created.data.data) {
    throw new Error(
      `registerAndLogin: createUser failed - ${JSON.stringify(created.data.errors)}`,
    );
  }

  const login = await gql<{ login: { id: string } }>(`
    mutation { login(loginInput: { email: "${email}", password: "${password}" }) { id } }
  `);
  const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
  if (!cookie) {
    throw new Error(
      `registerAndLogin: login did not set a cookie - ${JSON.stringify(login.data.errors)}`,
    );
  }

  return {
    cookie,
    id: created.data.data.createUser.id,
    username,
    email,
    password,
  };
}

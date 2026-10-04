import axios from 'axios';
import { randomUUID } from 'crypto';

export interface GqlResponse<T> {
  data?: T;
  errors?: {
    message: string;
    extensions?: { code?: string; originalError?: { statusCode?: number } };
  }[];
}

export interface Session {
  cookie: string;
  userId: string;
  username: string;
}

export const unique = (prefix: string) =>
  `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

export async function gql<T>(
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

export function expectData<T>(response: GqlResponse<T>): T {
  expect(response.errors).toBeUndefined();
  expect(response.data).toBeDefined();
  return response.data as T;
}

export async function registerAndLogin(): Promise<Session> {
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
  const authentication = (loggedIn.headers['set-cookie'] ?? []).find((cookie) =>
    cookie.startsWith('Authentication='),
  );
  expect(authentication).toBeDefined();
  if (!authentication)
    throw new Error('Login did not set an Authentication cookie');
  return {
    cookie: authentication.split(';')[0],
    userId: createUser.id,
    username,
  };
}

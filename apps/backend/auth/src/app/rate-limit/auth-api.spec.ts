import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma-clients/roorin-auth';
import { init } from '@roorin/nestjs';
import axios, { AxiosInstance } from 'axios';
import { hash } from 'bcryptjs';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

interface ApiResponse {
  data?: Record<string, unknown>;
  errors?: { extensions?: { originalError?: { statusCode?: number } } }[];
}

describe('Auth HTTP privacy and throttling (mocked database)', () => {
  let app: INestApplication;
  let http: AxiosInstance;
  let database: {
    client: {
      user: {
        create: jest.Mock;
        findUniqueOrThrow: jest.Mock;
        update: jest.Mock;
      };
    };
  };
  const password = 'Str0ng!Passw0rd1';
  const registration =
    'mutation ($input: CreateUserInput!) { createUser(createUserInput: $input) { id email } }';
  const login =
    'mutation ($input: LoginInput!) { login(loginInput: $input) { id email } }';

  async function request(
    query: string,
    variables: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) {
    return http.post<ApiResponse>(
      '/graphql',
      { query, variables },
      { headers },
    );
  }

  beforeEach(async () => {
    const user = {
      id: 'user-1',
      username: 'alice',
      email: 'alice@roorin.test',
      password: await hash(password, 4),
      createdAt: new Date(),
      avatarUrl: null,
      bio: null,
    };
    database = {
      client: {
        user: {
          create: jest
            .fn()
            .mockImplementation(({ data }) => ({ ...user, ...data })),
          findUniqueOrThrow: jest
            .fn()
            .mockImplementation(({ where, select }) => {
              if (
                !Object.entries(where).every(
                  ([key, value]) => user[key as keyof typeof user] === value,
                )
              ) {
                throw new Prisma.PrismaClientKnownRequestError(
                  'User not found',
                  { code: 'P2025', clientVersion: '7.2.0' },
                );
              }
              return select
                ? Object.fromEntries(
                    Object.keys(select).map((key) => [
                      key,
                      user[key as keyof typeof user],
                    ]),
                  )
                : user;
            }),
          update: jest
            .fn()
            .mockImplementation(({ data }) => ({ ...user, ...data })),
        },
      },
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(database)
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          PORT: 0,
          JWT_SECRET: 'privacy-rate-test',
          JWT_EXPIRATION_MS: 3600000,
          AUTH_RATE_LIMIT_TTL_MS: 10000,
          AUTH_LOGIN_RATE_LIMIT: 2,
          AUTH_REGISTER_RATE_LIMIT: 1,
        }),
      )
      .compile();
    app = module.createNestApplication({ logger: false });
    await init(app);
    http = axios.create({
      baseURL: await app.getUrl(),
      proxy: false,
      validateStatus: () => true,
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  it('rejects public email selections and private-type fragments before querying the database', async () => {
    for (const query of [
      '{ user(username: "alice") { email } }',
      '{ user(username: "alice") { privateEmail: email } }',
      '{ user(username: "alice") { ... on Account { email } } }',
    ]) {
      const response = await request(query);
      expect(response.status).toBe(400);
      expect(response.data.errors).toBeDefined();
    }
    expect(database.client.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('reads a public profile while keeping me protected', async () => {
    const profile = await request(
      '{ user(username: "alice") { id username bio avatarUrl createdAt } }',
    );
    expect(profile.data.errors).toBeUndefined();
    expect(profile.data.data?.user).toMatchObject({ username: 'alice' });
    expect(profile.data.data?.user).not.toHaveProperty('email');
    const denied = await request('{ me { email } }');
    expect(denied.data.errors?.[0].extensions?.originalError?.statusCode).toBe(
      401,
    );
  });

  it('preserves private account email on successful login and me', async () => {
    const loggedIn = await request(login, {
      input: { email: 'alice@roorin.test', password },
    });
    expect(loggedIn.data.errors).toBeUndefined();
    expect(loggedIn.data.data?.login).toMatchObject({
      email: 'alice@roorin.test',
    });
    const cookie = loggedIn.headers['set-cookie']?.[0].split(';')[0];
    expect(cookie).toBeDefined();
    const me = await request(
      '{ me { id email } }',
      {},
      { Cookie: cookie as string },
    );
    expect(me.data.data?.me).toEqual({
      id: 'user-1',
      email: 'alice@roorin.test',
    });
  });

  it('blocks login before credential lookup and returns retry information', async () => {
    const input = { email: 'missing@roorin.test', password };
    await request(login, { input });
    await request(login, { input });
    expect(database.client.user.findUniqueOrThrow).toHaveBeenCalledTimes(2);
    const blocked = await request(
      login,
      { input },
      { 'X-Forwarded-For': '192.0.2.99' },
    );
    expect(blocked.status).toBe(200);
    expect(blocked.data.errors?.[0].extensions?.originalError?.statusCode).toBe(
      429,
    );
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(database.client.user.findUniqueOrThrow).toHaveBeenCalledTimes(2);
  });

  it('counts aliases in one mutation against the same login budget', async () => {
    const query = `mutation {
      first: login(loginInput: { email: "alice@roorin.test", password: "${password}" }) { id }
      second: login(loginInput: { email: "alice@roorin.test", password: "${password}" }) { id }
      third: login(loginInput: { email: "alice@roorin.test", password: "${password}" }) { id }
    }`;
    const response = await request(query);
    expect(
      response.data.errors?.[0].extensions?.originalError?.statusCode,
    ).toBe(429);
    expect(database.client.user.findUniqueOrThrow).toHaveBeenCalledTimes(2);
  });

  it('keeps login budgets separate behind an explicitly trusted proxy', async () => {
    app.getHttpAdapter().getInstance().set('trust proxy', ['127.0.0.1', '::1']);
    const input = { email: 'missing@roorin.test', password };
    const first = { 'X-Forwarded-For': '192.0.2.10' };
    await request(login, { input }, first);
    await request(login, { input }, first);
    const blocked = await request(login, { input }, first);
    expect(blocked.data.errors?.[0].extensions?.originalError?.statusCode).toBe(
      429,
    );
    const second = await request(
      login,
      { input },
      { 'X-Forwarded-For': '192.0.2.11' },
    );
    expect(second.data.errors?.[0].extensions?.originalError?.statusCode).toBe(
      401,
    );
    expect(database.client.user.findUniqueOrThrow).toHaveBeenCalledTimes(3);
  });

  it('blocks registration before persistence without consuming the login budget', async () => {
    const input = {
      username: 'firstuser',
      email: 'first@roorin.test',
      password,
    };
    const created = await request(registration, { input });
    expect(created.data.errors).toBeUndefined();
    const blocked = await request(registration, {
      input: { ...input, username: 'seconduser' },
    });
    expect(blocked.data.errors?.[0].extensions?.originalError?.statusCode).toBe(
      429,
    );
    expect(database.client.user.create).toHaveBeenCalledTimes(1);
    const loggedIn = await request(login, {
      input: { email: 'alice@roorin.test', password },
    });
    expect(loggedIn.data.errors).toBeUndefined();
    const profile = await request('{ user(username: "alice") { username } }');
    expect(profile.data.errors).toBeUndefined();
  });

  it('charges invalid registration input before validation without persisting it', async () => {
    const rejected = await request(registration, {
      input: { username: 'a', email: 'bad@roorin.test', password: 'weak' },
    });
    expect(
      rejected.data.errors?.[0].extensions?.originalError?.statusCode,
    ).toBe(400);
    const blocked = await request(registration, {
      input: { username: 'validuser', email: 'valid@roorin.test', password },
    });
    expect(blocked.data.errors?.[0].extensions?.originalError?.statusCode).toBe(
      429,
    );
    expect(database.client.user.create).not.toHaveBeenCalled();
  });
});

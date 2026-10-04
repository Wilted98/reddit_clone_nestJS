import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AuthResolver } from '../auth/auth.resolver';
import { UsersResolver } from '../users/users.resolver';
import { GqlThrottlerGuard } from './gql-throttler.guard';
import { RateLimitModule } from './rate-limit.module';

function context(
  operation: 'login' | 'register',
  ip = '192.0.2.1',
  headers: Record<string, string> = {},
) {
  const res = { header: jest.fn(), setHeader: jest.fn() };
  const resolver = operation === 'login' ? AuthResolver : UsersResolver;
  const handler =
    operation === 'login'
      ? AuthResolver.prototype.login
      : UsersResolver.prototype.createUser;
  const ctx = {
    getArgs: () => [undefined, {}, { req: { ip, headers }, res }, {}],
    getType: () => 'graphql',
    getHandler: () => handler,
    getClass: () => resolver,
  } as unknown as ExecutionContext;
  return { ctx, res };
}

describe('RateLimitModule and GraphQL guard', () => {
  let module: TestingModule;
  let guard: GqlThrottlerGuard;

  beforeEach(async () => {
    jest.useFakeTimers();
    module = await Test.createTestingModule({ imports: [RateLimitModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          AUTH_RATE_LIMIT_TTL_MS: 1000,
          AUTH_LOGIN_RATE_LIMIT: 2,
          AUTH_REGISTER_RATE_LIMIT: 1,
        }),
      )
      .compile();
    await module.init();
    guard = module.get(GqlThrottlerGuard);
  });

  afterEach(async () => {
    await module.close();
    jest.useRealTimers();
  });

  it('allows the configured login budget, then returns 429 and Retry-After', async () => {
    const { ctx, res } = context('login');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 429 });
    expect(res.header).toHaveBeenCalledWith('X-RateLimit-Limit-login', 2);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 1);
  });

  it('keeps registration and login budgets independent', async () => {
    const registration = context('register');
    await guard.canActivate(registration.ctx);
    await expect(guard.canActivate(registration.ctx)).rejects.toMatchObject({
      status: 429,
    });
    const login = context('login');
    await expect(guard.canActivate(login.ctx)).resolves.toBe(true);
    await expect(guard.canActivate(login.ctx)).resolves.toBe(true);
  });

  it('keeps clients independent and ignores forged forwarding headers', async () => {
    const first = context('login');
    await guard.canActivate(first.ctx);
    await guard.canActivate(first.ctx);
    const spoofed = context('login', '192.0.2.1', {
      'x-forwarded-for': '192.0.2.99',
    });
    await expect(guard.canActivate(spoofed.ctx)).rejects.toMatchObject({
      status: 429,
    });
    await expect(
      guard.canActivate(context('login', '192.0.2.2').ctx),
    ).resolves.toBe(true);
  });

  it('recovers after the block period expires', async () => {
    const { ctx } = context('login');
    await guard.canActivate(ctx);
    await guard.canActivate(ctx);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 429 });
    jest.advanceTimersByTime(1100);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("does not clear another client's expiry when a blocked client recovers", async () => {
    const first = context('login');
    await guard.canActivate(first.ctx);
    await guard.canActivate(first.ctx);
    await expect(guard.canActivate(first.ctx)).rejects.toMatchObject({
      status: 429,
    });
    jest.advanceTimersByTime(500);
    const second = context('login', '192.0.2.2');
    await guard.canActivate(second.ctx);
    jest.advanceTimersByTime(600);
    await guard.canActivate(first.ctx);
    jest.advanceTimersByTime(500);
    await expect(guard.canActivate(second.ctx)).resolves.toBe(true);
    await expect(guard.canActivate(second.ctx)).resolves.toBe(true);
  });

  it('reclaims expired client records', async () => {
    await guard.canActivate(context('login').ctx);
    const storage = module.get<ThrottlerStorageService>(ThrottlerStorage);
    expect(storage.storage.size).toBe(1);
    jest.advanceTimersByTime(60001);
    expect(storage.storage.size).toBe(0);
  });

  it('shares one budget across concurrent attempts', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => guard.canActivate(context('login').ctx)),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(2);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(6);
  });
});

describe('RateLimitModule configuration', () => {
  it('uses separate 10-login and 5-registration defaults', async () => {
    const module = await Test.createTestingModule({
      imports: [RateLimitModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: () => undefined })
      .compile();
    try {
      await module.init();
      const guard = module.get(GqlThrottlerGuard);
      const login = context('login');
      const registration = context('register');
      await guard.canActivate(login.ctx);
      await guard.canActivate(registration.ctx);
      expect(login.res.header).toHaveBeenCalledWith(
        'X-RateLimit-Limit-login',
        10,
      );
      expect(registration.res.header).toHaveBeenCalledWith(
        'X-RateLimit-Limit-register',
        5,
      );
    } finally {
      await module.close();
    }
  });

  it.each([
    ['AUTH_RATE_LIMIT_TTL_MS', 0],
    ['AUTH_RATE_LIMIT_TTL_MS', 2147483648],
    ['AUTH_LOGIN_RATE_LIMIT', -1],
    ['AUTH_LOGIN_RATE_LIMIT', 'invalid'],
    ['AUTH_REGISTER_RATE_LIMIT', 1.5],
    ['AUTH_REGISTER_RATE_LIMIT', ''],
  ])('rejects invalid %s = %j at startup', async (key, value) => {
    await expect(
      Test.createTestingModule({ imports: [RateLimitModule] })
        .overrideProvider(ConfigService)
        .useValue(new ConfigService({ [key]: value }))
        .compile(),
    ).rejects.toThrow(key);
  });
});

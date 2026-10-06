import { ExecutionContext } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from './auth.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Regression test for a bug that made every guarded operation in this service
 * unreachable: JwtStrategy was defined but never added to any module's
 * `providers`, and had no @Injectable(). Passport's `passport.use(...)` for
 * the 'jwt' strategy only runs when Nest actually instantiates the strategy
 * class - since nothing did, `AuthGuard('jwt')` failed on every call with
 * "Unknown authentication strategy \"jwt\"", regardless of whether the
 * caller's token was valid. `me`, `updateUser`, and the internal gRPC
 * `authenticate` endpoint were all affected.
 *
 * A test that mocks JwtStrategy or the guard away, as every other test in
 * this file's siblings does, cannot catch this class of bug by construction -
 * it has to boot the real module wiring and drive a real token through the
 * real Passport guard, which is what this does. No database is needed: the
 * failure mode lives entirely in whether the strategy is registered, which
 * happens before any user lookup.
 */
describe('AuthModule wiring', () => {
  const buildContext = (cookies: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ cookies, headers: {} }),
        getResponse: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  it('registers a working "jwt" Passport strategy for a validly-signed token', async () => {
    process.env['JWT_SECRET'] = 'test-secret';
    process.env['JWT_EXPIRATION_MS'] = '604800000';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: { user: { findUniqueOrThrow: jest.fn() } } })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const token = app.get(JwtService).sign({ userId: 'user-1' });
    const payload = app
      .get(JwtService)
      .decode<{ iat: number; exp: number }>(token);
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
    const guard = new JwtAuthGuard();

    // Resolves to a request object (truthy) rather than rejecting - proves
    // Passport recognized "jwt" as a registered strategy at all. Whether the
    // *payload* round-trips correctly is JwtStrategy's own unit test's job.
    await expect(
      guard.canActivate(buildContext({ Authentication: token })),
    ).resolves.toBeDefined();

    await app.close();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';

/**
 * Like UsersResolver, this class has no logic of its own - it just extracts
 * the GraphQL context's `res` and forwards it to AuthService. That handoff is
 * exactly what these tests catch: it's easy to swap in the wrong context
 * object (e.g. `req` instead of `res`) and have TypeScript not notice.
 */
describe('AuthResolver', () => {
  let resolver: AuthResolver;
  let authService: { login: jest.Mock; logout: jest.Mock };
  const res = {} as Response;

  beforeEach(async () => {
    authService = { login: jest.fn(), logout: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthResolver,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    resolver = module.get(AuthResolver);
  });

  describe('login', () => {
    it('forwards the input and the response object to AuthService', async () => {
      const input: LoginInput = {
        email: 'vasi@roorin.dev',
        password: 'Str0ng!Passw0rd',
      };
      const loggedInUser = { id: '1', email: input.email };
      authService.login.mockResolvedValue(loggedInUser);

      const result = await resolver.login(input, { req: {} as never, res });

      expect(authService.login).toHaveBeenCalledWith(input, res);
      expect(result).toBe(loggedInUser);
    });
  });

  describe('logout', () => {
    it('forwards the response object to AuthService', async () => {
      authService.logout.mockResolvedValue(true);

      const result = await resolver.logout({ req: {} as never, res });

      expect(authService.logout).toHaveBeenCalledWith(res);
      expect(result).toBe(true);
    });
  });
});

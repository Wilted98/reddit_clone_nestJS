import { Test, TestingModule } from '@nestjs/testing';
import { CreateUserInput } from './dto/create-user.input';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';

/**
 * The resolver has no branching of its own - it is purely a GraphQL-shaped
 * adapter over UsersService. These tests exist to catch the resolver
 * forwarding the wrong argument shape (e.g. the whole input object instead of
 * `{ username }`), which a service-level test alone cannot see.
 */
describe('UsersResolver', () => {
  let resolver: UsersResolver;
  let usersService: { createUser: jest.Mock; getUser: jest.Mock };

  beforeEach(async () => {
    usersService = { createUser: jest.fn(), getUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersResolver,
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    resolver = module.get(UsersResolver);
  });

  describe('createUser', () => {
    it('forwards the input to the service and returns its result', async () => {
      const input: CreateUserInput = {
        username: 'vasi',
        email: 'vasi@roorin.dev',
        password: 'Str0ng!Passw0rd',
      };
      const created = { id: '1', ...input };
      usersService.createUser.mockResolvedValue(created);

      const result = await resolver.createUser(input);

      expect(usersService.createUser).toHaveBeenCalledWith(input);
      expect(result).toBe(created);
    });
  });

  describe('getUser', () => {
    it('looks the user up by username, not by passing the raw resolver args through', async () => {
      const found = { id: '1', username: 'vasi' };
      usersService.getUser.mockResolvedValue(found);

      const result = await resolver.getUser('vasi');

      expect(usersService.getUser).toHaveBeenCalledWith({ username: 'vasi' });
      expect(result).toBe(found);
    });
  });
});

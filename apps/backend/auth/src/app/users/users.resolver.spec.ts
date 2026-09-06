import { Test, TestingModule } from '@nestjs/testing';
import { TokenPayload } from '../auth/token-payload.interface';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
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
  let usersService: {
    createUser: jest.Mock;
    getUser: jest.Mock;
    updateUser: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      createUser: jest.fn(),
      getUser: jest.fn(),
      updateUser: jest.fn(),
    };

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

  describe('getMe', () => {
    it('looks the user up by the id in the token, not by any client-supplied argument', async () => {
      const found = { id: 'user-1', username: 'vasi' };
      usersService.getUser.mockResolvedValue(found);
      const token: TokenPayload = { userId: 'user-1' };

      const result = await resolver.getMe(token);

      // The whole point of @CurrentUser() over a resolver argument: there is
      // no way for a client to ask for someone else's profile through this
      // field, because the id never comes from client input.
      expect(usersService.getUser).toHaveBeenCalledWith({ id: 'user-1' });
      expect(result).toBe(found);
    });
  });

  describe('updateUser', () => {
    it('updates the token owner, using the token id, not a client-supplied one', async () => {
      const updated = { id: 'user-1', bio: 'hello' };
      usersService.updateUser.mockResolvedValue(updated);
      const token: TokenPayload = { userId: 'user-1' };
      const input: UpdateUserInput = { bio: 'hello' };

      const result = await resolver.updateUser(token, input);

      expect(usersService.updateUser).toHaveBeenCalledWith('user-1', input);
      expect(result).toBe(updated);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticateRequest } from '@roorin/proto';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { TokenPayload } from './token-payload.interface';

/**
 * This is the gRPC face of the service - the one other backend services call
 * to turn a token into a user (see libs/backend/nestjs's GqlAuthGuard, which
 * is the intended caller once a second service exists). The request never
 * carries a raw token here: JwtAuthGuard (Passport) already ran and attached
 * the decoded payload to `request.user` before this method runs.
 */
describe('AuthController', () => {
  let controller: AuthController;
  let usersService: { getUser: jest.Mock; getUserAvatars: jest.Mock };

  beforeEach(async () => {
    usersService = { getUser: jest.fn(), getUserAvatars: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get(AuthController);
  });

  it('normalizes omitted empty repeated fields from protobuf', async () => {
    usersService.getUserAvatars.mockResolvedValue([]);
    await expect(
      controller.getUserAvatars(
        {} as Parameters<typeof controller.getUserAvatars>[0],
      ),
    ).resolves.toEqual({ avatars: [] });
    expect(usersService.getUserAvatars).toHaveBeenCalledWith([]);
  });

  it('returns only IDs and avatar URLs from the batch endpoint', async () => {
    usersService.getUserAvatars.mockResolvedValue([
      {
        id: 'one',
        avatarUrl: 'https://example.com/avatar.png',
        email: 'private@example.com',
        password: 'secret',
      },
      { id: 'two', avatarUrl: null },
    ]);
    await expect(
      controller.getUserAvatars({ userIds: ['one', 'two'] }),
    ).resolves.toEqual({
      avatars: [
        { userId: 'one', avatarUrl: 'https://example.com/avatar.png' },
        { userId: 'two', avatarUrl: '' },
      ],
    });
    expect(usersService.getUserAvatars).toHaveBeenCalledWith(['one', 'two']);
  });

  it('looks the user up by the id already verified by JwtAuthGuard', async () => {
    usersService.getUser.mockResolvedValue({
      id: 'user-1',
      email: 'vasi@roorin.dev',
      username: 'vasi',
      avatarUrl: null,
    });

    const request = {
      user: { userId: 'user-1' } as TokenPayload,
    } as AuthenticateRequest & { user: TokenPayload };

    await controller.authenticate(request);

    expect(usersService.getUser).toHaveBeenCalledWith({ id: 'user-1' });
  });

  it('shapes the result to the proto User contract', async () => {
    usersService.getUser.mockResolvedValue({
      id: 'user-1',
      email: 'vasi@roorin.dev',
      username: 'vasi',
      avatarUrl: null,
    });

    const result = await controller.authenticate({
      user: { userId: 'user-1' },
    } as AuthenticateRequest & { user: TokenPayload });

    expect(result).toEqual({
      id: 'user-1',
      email: 'vasi@roorin.dev',
      username: 'vasi',
      avatarUrl: '',
    });
  });

  it('falls back to an empty string when avatarUrl is null - proto has no concept of null', async () => {
    usersService.getUser.mockResolvedValue({
      id: 'user-1',
      email: 'vasi@roorin.dev',
      username: 'vasi',
      avatarUrl: null,
    });

    const result = await controller.authenticate({
      user: { userId: 'user-1' },
    } as AuthenticateRequest & { user: TokenPayload });

    expect(result.avatarUrl).toBe('');
  });

  it('passes a real avatarUrl through unchanged', async () => {
    usersService.getUser.mockResolvedValue({
      id: 'user-1',
      email: 'vasi@roorin.dev',
      username: 'vasi',
      avatarUrl: 'https://cdn.roorin.dev/a.png',
    });

    const result = await controller.authenticate({
      user: { userId: 'user-1' },
    } as AuthenticateRequest & { user: TokenPayload });

    expect(result.avatarUrl).toBe('https://cdn.roorin.dev/a.png');
  });
});

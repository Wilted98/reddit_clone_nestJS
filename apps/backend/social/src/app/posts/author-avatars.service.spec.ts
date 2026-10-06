import { Logger } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { NEVER, of, throwError } from 'rxjs';
import { AuthorAvatarsService } from './author-avatars.service';

describe('author avatar batching', () => {
  let service: AuthorAvatarsService;
  let getUserAvatars: jest.Mock;

  beforeEach(() => {
    getUserAvatars = jest.fn().mockReturnValue(of({ avatars: [] }));
    const client = {
      getService: () => ({ getUserAvatars }),
    } as unknown as ClientGrpc;
    service = new AuthorAvatarsService(client);
    service.onModuleInit();
  });

  it('batches unique authors, restores response order, and caches within one request', async () => {
    getUserAvatars.mockReturnValue(
      of({
        avatars: [
          { userId: 'two', avatarUrl: '' },
          { userId: 'one', avatarUrl: 'https://example.com/one.png' },
        ],
      }),
    );
    const context = {};
    await expect(
      Promise.all([
        service.getAvatar(context, 'one'),
        service.getAvatar(context, 'two'),
        service.getAvatar(context, 'one'),
        service.getAvatar(context, 'missing'),
      ]),
    ).resolves.toEqual([
      'https://example.com/one.png',
      null,
      'https://example.com/one.png',
      null,
    ]);
    expect(getUserAvatars).toHaveBeenCalledTimes(1);
    expect(getUserAvatars).toHaveBeenCalledWith({
      userIds: ['one', 'two', 'missing'],
    });
    await service.getAvatar(context, 'one');
    expect(getUserAvatars).toHaveBeenCalledTimes(1);
  });

  it('treats an omitted empty repeated response as missing users, not an outage', async () => {
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      getUserAvatars.mockReturnValue(of({}));
      await expect(service.getAvatar({}, 'missing')).resolves.toBeNull();
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it('reloads current avatars for a different request instead of keeping stale profile data', async () => {
    await expect(service.getAvatar({}, 'one')).resolves.toBeNull();
    getUserAvatars.mockReturnValue(
      of({
        avatars: [{ userId: 'one', avatarUrl: 'https://example.com/new.png' }],
      }),
    );
    await expect(service.getAvatar({}, 'one')).resolves.toBe(
      'https://example.com/new.png',
    );
    expect(getUserAvatars).toHaveBeenCalledTimes(2);
  });

  it('splits oversized GraphQL selections into bounded RPC batches', async () => {
    const context = {};
    await Promise.all(
      Array.from({ length: 205 }, (_, i) =>
        service.getAvatar(context, `user-${i}`),
      ),
    );
    expect(
      getUserAvatars.mock.calls.map(([request]) => request.userIds.length),
    ).toEqual([100, 100, 5]);
  });

  it('keeps browsing available on auth failures and retries in the next request', async () => {
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      getUserAvatars.mockReturnValue(
        throwError(() => new Error('private backend details')),
      );
      await expect(service.getAvatar({}, 'one')).resolves.toBeNull();
      expect(warning).toHaveBeenCalledWith(
        'Author avatars unavailable; returning initials fallback.',
      );
      getUserAvatars.mockReturnValue(
        of({
          avatars: [
            { userId: 'one', avatarUrl: 'https://example.com/recovered.png' },
          ],
        }),
      );
      await expect(service.getAvatar({}, 'one')).resolves.toBe(
        'https://example.com/recovered.png',
      );
    } finally {
      warning.mockRestore();
    }
  });

  it('bounds a stalled avatar lookup so posts can still render', async () => {
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      getUserAvatars.mockReturnValue(NEVER);
      await expect(service.getAvatar({}, 'one')).resolves.toBeNull();
    } finally {
      warning.mockRestore();
    }
  });
});

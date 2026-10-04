import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma-clients/roorin-auth';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserInput } from './dto/create-user.input';
import { UpdateUserInput } from './dto/update-user.input';
import { UsersService } from './users.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

/**
 * Builds a Prisma P2002 (unique constraint) error the same way the real
 * PrismaClient does, so the service's `instanceof` check exercises the real
 * class rather than a plain object shaped like one.
 */
function uniqueConstraintError(target?: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.2.0',
    meta: target ? { target } : undefined,
  });
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    client: {
      user: {
        create: jest.Mock;
        findUniqueOrThrow: jest.Mock;
        update: jest.Mock;
      };
    };
  };

  const input: CreateUserInput = {
    username: 'vasi',
    email: 'vasi@roorin.dev',
    password: 'Str0ng!Passw0rd',
  };

  beforeEach(async () => {
    prisma = {
      client: {
        user: {
          create: jest.fn(),
          findUniqueOrThrow: jest.fn(),
          update: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('hashes the password before persisting it, never the plaintext', async () => {
      (hash as jest.Mock).mockResolvedValue('$2b$10$hashed-value');
      prisma.client.user.create.mockResolvedValue({ id: '1', ...input });

      await service.createUser(input);

      expect(hash).toHaveBeenCalledWith(input.password, 10);
      const dataArg = prisma.client.user.create.mock.calls[0][0].data;
      expect(dataArg.password).toBe('$2b$10$hashed-value');
      expect(dataArg.password).not.toBe(input.password);
    });

    it('passes the other fields through unchanged alongside the hash', async () => {
      (hash as jest.Mock).mockResolvedValue('hashed');
      prisma.client.user.create.mockResolvedValue({ id: '1' });

      await service.createUser(input);

      expect(prisma.client.user.create).toHaveBeenCalledWith({
        data: {
          username: input.username,
          email: input.email,
          password: 'hashed',
        },
      });
    });

    it('returns whatever Prisma returns for the created row', async () => {
      (hash as jest.Mock).mockResolvedValue('hashed');
      const created = { id: '1', username: 'vasi', email: 'vasi@roorin.dev' };
      prisma.client.user.create.mockResolvedValue(created);

      await expect(service.createUser(input)).resolves.toBe(created);
    });

    it('turns a duplicate-email conflict into a ConflictException naming the field', async () => {
      (hash as jest.Mock).mockResolvedValue('hashed');
      prisma.client.user.create.mockRejectedValue(
        uniqueConstraintError(['email']),
      );

      await expect(service.createUser(input)).rejects.toMatchObject(
        new ConflictException('email already taken'),
      );
    });

    it('joins multiple colliding fields into one message', async () => {
      (hash as jest.Mock).mockResolvedValue('hashed');
      prisma.client.user.create.mockRejectedValue(
        uniqueConstraintError(['username', 'email']),
      );

      await expect(service.createUser(input)).rejects.toMatchObject(
        new ConflictException('username, email already taken'),
      );
    });

    it('falls back to a generic message when Prisma reports no target', async () => {
      (hash as jest.Mock).mockResolvedValue('hashed');
      prisma.client.user.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.createUser(input)).rejects.toMatchObject(
        new ConflictException('field already taken'),
      );
    });

    it('rethrows any error that is not a P2002 unique-constraint violation unchanged', async () => {
      (hash as jest.Mock).mockResolvedValue('hashed');
      const dbDown = new Error('connection refused');
      prisma.client.user.create.mockRejectedValue(dbDown);

      await expect(service.createUser(input)).rejects.toBe(dbDown);
    });

    it('rethrows other Prisma error codes unwrapped (not every known-request-error is P2002)', async () => {
      (hash as jest.Mock).mockResolvedValue('hashed');
      const notFound = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '7.2.0',
        },
      );
      prisma.client.user.create.mockRejectedValue(notFound);

      await expect(service.createUser(input)).rejects.toBe(notFound);
    });
  });

  describe('getPublicUser', () => {
    it('selects only public fields without fetching email or password', async () => {
      const profile = {
        id: '1',
        username: 'vasi',
        createdAt: new Date(),
        bio: null,
        avatarUrl: null,
      };
      prisma.client.user.findUniqueOrThrow.mockResolvedValue(profile);
      await expect(service.getPublicUser('vasi')).resolves.toBe(profile);
      expect(prisma.client.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { username: 'vasi' },
        select: {
          id: true,
          createdAt: true,
          username: true,
          avatarUrl: true,
          bio: true,
        },
      });
    });

    it('maps a missing public profile to a not-found error', async () => {
      prisma.client.user.findUniqueOrThrow.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('User not found', {
          code: 'P2025',
          clientVersion: '7.2.0',
        }),
      );
      await expect(service.getPublicUser('missing')).rejects.toEqual(
        new NotFoundException('User not found'),
      );
    });

    it('propagates unexpected errors from public lookups', async () => {
      const error = new Error('Database unavailable');
      prisma.client.user.findUniqueOrThrow.mockRejectedValue(error);
      await expect(service.getPublicUser('vasi')).rejects.toBe(error);
    });
  });

  describe('getUser', () => {
    it('looks the user up by whatever unique argument it is given', async () => {
      const found = { id: '1', username: 'vasi' };
      prisma.client.user.findUniqueOrThrow.mockResolvedValue(found);

      const result = await service.getUser({ username: 'vasi' });

      expect(prisma.client.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { username: 'vasi' },
      });
      expect(result).toBe(found);
    });

    it('also accepts lookup by id or email, passing the where-clause through as-is', async () => {
      prisma.client.user.findUniqueOrThrow.mockResolvedValue({ id: '1' });

      await service.getUser({ email: 'vasi@roorin.dev' });

      expect(prisma.client.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { email: 'vasi@roorin.dev' },
      });
    });

    it('turns a missing user into a NotFoundException', async () => {
      const notFound = new Prisma.PrismaClientKnownRequestError(
        'No User found',
        {
          code: 'P2025',
          clientVersion: '7.2.0',
        },
      );

      prisma.client.user.findUniqueOrThrow.mockRejectedValue(notFound);

      await expect(
        service.getUser({ username: 'ghost' }),
      ).rejects.toMatchObject(new NotFoundException('User not found'));
    });

    it('rethrows non-P2025 errors unchanged', async () => {
      const dbDown = new Error('connection refused');

      prisma.client.user.findUniqueOrThrow.mockRejectedValue(dbDown);

      await expect(service.getUser({ username: 'vasi' })).rejects.toBe(dbDown);
    });

    it('rethrows other Prisma errors unchanged', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Database error',
        {
          code: 'P2002',
          clientVersion: '7.2.0',
        },
      );

      prisma.client.user.findUniqueOrThrow.mockRejectedValue(prismaError);

      await expect(service.getUser({ username: 'vasi' })).rejects.toBe(
        prismaError,
      );
    });
  });

  describe('updateUser', () => {
    it('updates only the given user, with the given fields, unchanged', async () => {
      const data: UpdateUserInput = { bio: 'hello world' };
      const updated = { id: 'user-1', bio: 'hello world' };
      prisma.client.user.update.mockResolvedValue(updated);

      const result = await service.updateUser('user-1', data);

      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data,
      });
      expect(result).toBe(updated);
    });

    it('propagates a not-found error rather than silently doing nothing', async () => {
      const notFound = new Prisma.PrismaClientKnownRequestError(
        'No User found',
        { code: 'P2025', clientVersion: '7.2.0' },
      );
      prisma.client.user.update.mockRejectedValue(notFound);

      // updateUser has no try/catch, unlike createUser/getUser - this is
      // intentional to record: a not-found here currently surfaces as an
      // unmapped internal error, the same gap createUser/getUser used to
      // have. See docs/04-authentication.md for the history of that pattern.
      await expect(service.updateUser('ghost', { bio: 'x' })).rejects.toBe(
        notFound,
      );
    });
  });
});

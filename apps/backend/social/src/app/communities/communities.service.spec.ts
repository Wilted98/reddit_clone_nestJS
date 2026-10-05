import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MemberRole, Prisma } from '@prisma-clients/roorin-social';
import { GqlAuthGuard } from '@roorin/nestjs';
import { PrismaService } from '../prisma/prisma.service';
import { CommunitiesModule } from './communities.module';
import { CommunitiesService } from './communities.service';

function databaseMock() {
  const tx = {
    community: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  return {
    tx,
    client: {
      ...tx,
      $transaction: jest
        .fn()
        .mockImplementation((work: (client: typeof tx) => Promise<unknown>) =>
          work(tx),
        ),
    },
  };
}

describe('CommunitiesService', () => {
  let service: CommunitiesService;
  let prisma: ReturnType<typeof databaseMock>;
  const input = {
    slug: 'romania',
    name: 'Romania',
    description: 'A community',
  };
  const community = {
    id: 'community-1',
    ...input,
    ownerId: 'owner-1',
    memberCount: 1,
  };

  beforeEach(async () => {
    prisma = databaseMock();
    prisma.client.community.findUnique.mockResolvedValue(community);
    prisma.tx.community.findUniqueOrThrow.mockResolvedValue(community);
    prisma.tx.membership.createMany.mockResolvedValue({ count: 1 });
    prisma.tx.membership.deleteMany.mockResolvedValue({ count: 1 });
    // Import the real module so a missing PrismaModule import breaks this suite.
    const module = await Test.createTestingModule({
      imports: [CommunitiesModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideGuard(GqlAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    service = module.get(CommunitiesService);
  });

  describe('createCommunity', () => {
    it('creates the community and its owner membership together', async () => {
      prisma.client.community.create.mockResolvedValue(community);
      await expect(service.createCommunity(input, 'owner-1')).resolves.toBe(
        community,
      );
      expect(prisma.client.community.create).toHaveBeenCalledWith({
        data: {
          ...input,
          ownerId: 'owner-1',
          memberCount: 1,
          memberships: {
            create: { userId: 'owner-1', role: MemberRole.OWNER },
          },
        },
      });
    });

    it('accepts an omitted description', async () => {
      await service.createCommunity(
        { slug: 'romania', name: 'Romania' },
        'owner-1',
      );
      expect(
        prisma.client.community.create.mock.calls[0][0].data,
      ).not.toHaveProperty('description');
    });

    it('reports a duplicate slug as a conflict', async () => {
      prisma.client.community.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Duplicate', {
          code: 'P2002',
          clientVersion: '7.2.0',
        }),
      );
      await expect(service.createCommunity(input, 'owner-1')).rejects.toEqual(
        new ConflictException('r/romania already exists'),
      );
    });

    it('preserves other database failures', async () => {
      const error = new Error('Database unavailable');
      prisma.client.community.create.mockRejectedValue(error);
      await expect(service.createCommunity(input, 'owner-1')).rejects.toBe(
        error,
      );
    });

    it('does not classify every Prisma error as a duplicate slug', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Missing record', {
        code: 'P2025',
        clientVersion: '7.2.0',
      });
      prisma.client.community.create.mockRejectedValue(error);
      await expect(service.createCommunity(input, 'owner-1')).rejects.toBe(
        error,
      );
    });
  });

  describe('getCommunityBySlug', () => {
    it('returns the matching community', async () => {
      await expect(service.getCommunityBySlug('romania')).resolves.toBe(
        community,
      );
      expect(prisma.client.community.findUnique).toHaveBeenCalledWith({
        where: { slug: 'romania' },
      });
    });

    it('reports an unknown slug', async () => {
      prisma.client.community.findUnique.mockResolvedValue(null);
      await expect(service.getCommunityBySlug('missing')).rejects.toEqual(
        new NotFoundException('r/missing not found'),
      );
    });
  });

  describe('listCommunities', () => {
    it('orders popularity ties deterministically and overfetches one row', async () => {
      const rows = ['a', 'b', 'c'].map((id) => ({ ...community, id }));
      prisma.client.community.findMany.mockResolvedValue(rows);
      await expect(service.listCommunities(undefined, 2)).resolves.toEqual({
        items: rows.slice(0, 2),
        hasMore: true,
        nextCursor: 'b',
      });
      expect(prisma.client.community.findMany).toHaveBeenCalledWith({
        take: 3,
        orderBy: [{ memberCount: 'desc' }, { id: 'asc' }],
      });
    });

    it('excludes the cursor row on subsequent pages', async () => {
      prisma.client.community.findMany.mockResolvedValue([community]);
      await expect(service.listCommunities('previous', 2)).resolves.toEqual({
        items: [community],
        hasMore: false,
        nextCursor: null,
      });
      expect(prisma.client.community.findMany).toHaveBeenCalledWith({
        take: 3,
        skip: 1,
        cursor: { id: 'previous' },
        orderBy: [{ memberCount: 'desc' }, { id: 'asc' }],
      });
    });

    it('marks an exactly full final page as terminal', async () => {
      prisma.client.community.findMany.mockResolvedValue([community]);
      await expect(service.listCommunities(undefined, 1)).resolves.toEqual({
        items: [community],
        hasMore: false,
        nextCursor: null,
      });
    });

    it('returns an empty terminal page', async () => {
      prisma.client.community.findMany.mockResolvedValue([]);
      await expect(service.listCommunities(undefined, 25)).resolves.toEqual({
        items: [],
        hasMore: false,
        nextCursor: null,
      });
    });
  });

  describe('listMine', () => {
    it('filters every page by the authenticated membership and overfetches one', async () => {
      const rows = ['a', 'b', 'c'].map((id) => ({ ...community, id }));
      prisma.client.community.findMany.mockResolvedValue(rows);
      await expect(
        service.listMine('member-1', 'previous', 2),
      ).resolves.toEqual({
        items: rows.slice(0, 2),
        hasMore: true,
        nextCursor: 'b',
      });
      expect(prisma.client.community.findMany).toHaveBeenCalledWith({
        take: 3,
        where: {
          memberships: { some: { userId: 'member-1' } },
          id: { gt: 'previous' },
        },
        orderBy: { id: 'asc' },
      });
    });

    it('returns an empty terminal subscription list', async () => {
      prisma.client.community.findMany.mockResolvedValue([]);
      await expect(
        service.listMine('outsider', undefined, 20),
      ).resolves.toEqual({
        items: [],
        hasMore: false,
        nextCursor: null,
      });
      expect(prisma.client.community.findMany.mock.calls[0][0].where).toEqual({
        memberships: { some: { userId: 'outsider' } },
      });
    });
  });

  describe('join', () => {
    it('increments the counter only when inserting a membership', async () => {
      const updated = { ...community, memberCount: 2 };
      prisma.tx.community.update.mockResolvedValue(updated);
      await expect(service.join('romania', 'member-1')).resolves.toBe(updated);
      expect(prisma.tx.membership.createMany).toHaveBeenCalledWith({
        data: { userId: 'member-1', communityId: community.id },
        skipDuplicates: true,
      });
      expect(prisma.tx.community.update).toHaveBeenCalledWith({
        where: { id: community.id },
        data: { memberCount: { increment: 1 } },
      });
      expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does not increment for an already joined user and returns current data', async () => {
      const current = { ...community, memberCount: 3 };
      prisma.tx.membership.createMany.mockResolvedValue({ count: 0 });
      prisma.tx.community.findUniqueOrThrow.mockResolvedValue(current);
      await expect(service.join('romania', 'member-1')).resolves.toBe(current);
      expect(prisma.tx.community.update).not.toHaveBeenCalled();
    });

    it('rejects joining a missing community before any membership write', async () => {
      prisma.client.community.findUnique.mockResolvedValue(null);
      await expect(service.join('missing', 'member-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.client.$transaction).not.toHaveBeenCalled();
    });

    it('propagates a failed membership write without updating the counter', async () => {
      const error = new Error('Transaction failed');
      prisma.tx.membership.createMany.mockRejectedValue(error);
      await expect(service.join('romania', 'member-1')).rejects.toBe(error);
      expect(prisma.tx.community.update).not.toHaveBeenCalled();
    });
  });

  describe('leave', () => {
    it('forbids the owner from leaving', async () => {
      await expect(service.leave('romania', 'owner-1')).rejects.toEqual(
        new ForbiddenException('The owner cannot leave their own community.'),
      );
      expect(prisma.client.$transaction).not.toHaveBeenCalled();
    });

    it('decrements the counter only when deleting a membership', async () => {
      prisma.tx.community.update.mockResolvedValue(community);
      await expect(service.leave('romania', 'member-1')).resolves.toBe(
        community,
      );
      expect(prisma.tx.membership.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'member-1', communityId: community.id },
      });
      expect(prisma.tx.community.update).toHaveBeenCalledWith({
        where: { id: community.id },
        data: { memberCount: { decrement: 1 } },
      });
    });

    it('does not decrement for a non-member or a repeated leave', async () => {
      prisma.tx.membership.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.leave('romania', 'member-1')).resolves.toBe(
        community,
      );
      expect(prisma.tx.community.update).not.toHaveBeenCalled();
    });

    it('rejects leaving a missing community', async () => {
      prisma.client.community.findUnique.mockResolvedValue(null);
      await expect(service.leave('missing', 'member-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.client.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('assertMember', () => {
    it('returns the membership used by future posting rules', async () => {
      const membership = {
        userId: 'member-1',
        communityId: community.id,
        role: MemberRole.MEMBER,
      };
      prisma.client.membership.findUnique.mockResolvedValue(membership);
      await expect(
        service.assertMember(community.id, 'member-1'),
      ).resolves.toBe(membership);
      expect(prisma.client.membership.findUnique).toHaveBeenCalledWith({
        where: {
          userId_communityId: { userId: 'member-1', communityId: community.id },
        },
      });
    });

    it('rejects a non-member', async () => {
      prisma.client.membership.findUnique.mockResolvedValue(null);
      await expect(
        service.assertMember(community.id, 'outsider'),
      ).rejects.toEqual(
        new ForbiddenException('Join the community before posting in it.'),
      );
    });
  });
});

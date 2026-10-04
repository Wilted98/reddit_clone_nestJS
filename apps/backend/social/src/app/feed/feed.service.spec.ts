import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GqlAuthGuard } from '@roorin/nestjs';
import { CommunitiesService } from '../communities/communities.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeedArgs, FeedRange, FeedSort } from './dto/feed.args';
import { FeedModule } from './feed.module';
import { FeedService } from './feed.service';

describe('FeedService', () => {
  let service: FeedService;
  let client: { post: { findMany: jest.Mock }; $queryRaw: jest.Mock };
  let communities: { getCommunityBySlug: jest.Mock };

  beforeEach(async () => {
    client = {
      post: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    communities = {
      getCommunityBySlug: jest.fn().mockResolvedValue({ id: 'community-1' }),
    };
    const module = await Test.createTestingModule({ imports: [FeedModule] })
      .overrideProvider(PrismaService)
      .useValue({ client })
      .overrideProvider(CommunitiesService)
      .useValue(communities)
      .overrideGuard(GqlAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    service = module.get(FeedService);
  });

  afterEach(() => jest.useRealTimers());

  it('returns an empty global HOT feed with default arguments', async () => {
    await expect(service.getFeed(new FeedArgs())).resolves.toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
    expect(communities.getCommunityBySlug).not.toHaveBeenCalled();
    expect(client.post.findMany).not.toHaveBeenCalled();
    expect(client.$queryRaw.mock.calls[0][0].values).toEqual([1.8, 26, 0]);
  });

  it('scopes HOT by community and overfetches offset pages without a cursor', async () => {
    const rows = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
    client.$queryRaw.mockResolvedValue(rows);
    await expect(
      service.getFeed(
        Object.assign(new FeedArgs(), {
          communitySlug: 'romania',
          limit: 2,
          offset: 4,
        }),
      ),
    ).resolves.toEqual({
      items: rows.slice(0, 2),
      hasMore: true,
      nextCursor: null,
    });
    expect(communities.getCommunityBySlug).toHaveBeenCalledWith('romania');
    expect(client.$queryRaw.mock.calls[0][0].values).toEqual([
      'community-1',
      1.8,
      3,
      4,
    ]);
  });

  it('returns a terminal HOT page when no extra row exists', async () => {
    const rows = [{ id: 'one' }];
    client.$queryRaw.mockResolvedValue(rows);
    await expect(
      service.getFeed(Object.assign(new FeedArgs(), { limit: 1 })),
    ).resolves.toEqual({ items: rows, hasMore: false, nextCursor: null });
  });

  it.each([FeedSort.NEW, FeedSort.TOP])(
    'paginates %s by exclusive cursor with deterministic ties',
    async (sort) => {
      const rows = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
      client.post.findMany.mockResolvedValue(rows);
      await expect(
        service.getFeed(
          Object.assign(new FeedArgs(), {
            sort,
            communitySlug: 'romania',
            cursor: 'previous',
            limit: 2,
            offset: 400,
          }),
        ),
      ).resolves.toEqual({
        items: rows.slice(0, 2),
        hasMore: true,
        nextCursor: 'two',
      });
      expect(client.post.findMany).toHaveBeenCalledWith({
        take: 3,
        skip: 1,
        cursor: { id: 'previous' },
        where: { deletedAt: null, communityId: 'community-1' },
        orderBy: [
          { [sort === FeedSort.NEW ? 'createdAt' : 'score']: 'desc' },
          { id: 'asc' },
        ],
      });
      expect(client.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it.each([
    [FeedRange.DAY, 24],
    [FeedRange.WEEK, 168],
    [FeedRange.MONTH, 720],
  ])('filters TOP to the %s window', async (range, hours) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-04T12:00:00Z'));
    await service.getFeed(
      Object.assign(new FeedArgs(), { sort: FeedSort.TOP, range }),
    );
    expect(client.post.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      createdAt: { gte: new Date(Date.now() - hours * 3600000) },
    });
  });

  it('ignores range on NEW and does not scope a global feed', async () => {
    await service.getFeed(
      Object.assign(new FeedArgs(), {
        sort: FeedSort.NEW,
        range: FeedRange.DAY,
      }),
    );
    expect(client.post.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
    });
    expect(communities.getCommunityBySlug).not.toHaveBeenCalled();
  });

  it('returns a terminal sorted page', async () => {
    const rows = [{ id: 'one' }];
    client.post.findMany.mockResolvedValue(rows);
    await expect(
      service.getFeed(
        Object.assign(new FeedArgs(), { sort: FeedSort.NEW, limit: 1 }),
      ),
    ).resolves.toEqual({ items: rows, hasMore: false, nextCursor: null });
  });

  it('rejects unknown communities before querying either feed path', async () => {
    communities.getCommunityBySlug.mockRejectedValue(new NotFoundException());
    await expect(
      service.getFeed(
        Object.assign(new FeedArgs(), { communitySlug: 'missing' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.post.findMany).not.toHaveBeenCalled();
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });
});

import { Injectable } from '@nestjs/common';
import { Post, Prisma } from '@prisma-clients/roorin-social';
import { cursorArgs, Page, toPage } from '@roorin/nestjs';
import { CommunitiesService } from '../communities/communities.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeedArgs, FeedRange, FeedSort } from './dto/feed.args';
import { hotFeedQuery } from './ranking';

@Injectable()
export class FeedService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly communitiesService: CommunitiesService,
  ) {}

  async getFeed(args: FeedArgs): Promise<Page<Post>> {
    const communityId = args.communitySlug
      ? (await this.communitiesService.getCommunityBySlug(args.communitySlug))
          .id
      : undefined;

    if (args.sort === FeedSort.HOT) {
      return this.hotFeed(communityId, args);
    }
    return this.sortedFeed(communityId, args);
  }

  /**
   * HOT orders by a value computed per row, so there is no stable column to
   * anchor a cursor to - offset is the honest option. It is capped at 500 by
   * FeedArgs to bound skipped rows. The computed sort can still scan all
   * matching posts; a larger dataset will need a materialized ranking.
   */
  private async hotFeed(
    communityId: string | undefined,
    { limit, offset }: FeedArgs,
  ): Promise<Page<Post>> {
    const rows = await this.prismaService.client.$queryRaw<Post[]>(
      hotFeedQuery(communityId, limit + 1, offset),
    );
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, hasMore, nextCursor: null };
  }

  /** NEW and TOP sort by a real column, so both get proper cursor pagination. */
  private async sortedFeed(
    communityId: string | undefined,
    { sort, range, cursor, limit }: FeedArgs,
  ): Promise<Page<Post>> {
    const orderBy: Prisma.PostOrderByWithRelationInput[] =
      sort === FeedSort.NEW
        ? [{ createdAt: 'desc' }, { id: 'asc' }]
        : [{ score: 'desc' }, { id: 'asc' }];

    const rows = await this.prismaService.client.post.findMany({
      ...cursorArgs(cursor, limit),
      where: {
        deletedAt: null,
        ...(communityId && { communityId }),
        ...(sort === FeedSort.TOP && this.rangeFilter(range)),
      },
      orderBy,
    });

    return toPage(rows, limit);
  }

  private rangeFilter(range: FeedRange) {
    if (range === FeedRange.ALL) return {};
    const hours = { DAY: 24, WEEK: 24 * 7, MONTH: 24 * 30 }[range];
    return {
      createdAt: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) },
    };
  }
}

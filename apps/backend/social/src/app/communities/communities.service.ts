import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole, Prisma } from '@prisma-clients/roorin-social';
import { cursorArgs, toPage } from '@roorin/nestjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommunityInput } from './dto/create-community.input';

@Injectable()
export class CommunitiesService {
  constructor(private readonly prismaService: PrismaService) {}

  async createCommunity(input: CreateCommunityInput, ownerId: string) {
    try {
      // The creator is a member from the start, so the community and its first
      // membership are written together - a community with memberCount 1 and
      // no Membership row would be a lie.
      return await this.prismaService.client.community.create({
        data: {
          ...input,
          ownerId,
          memberCount: 1,
          memberships: {
            create: { userId: ownerId, role: MemberRole.OWNER },
          },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(`r/${input.slug} already exists`);
      }
      throw err;
    }
  }

  async getCommunityBySlug(slug: string) {
    const community = await this.prismaService.client.community.findUnique({
      where: { slug },
    });
    if (!community) throw new NotFoundException(`r/${slug} not found`);
    return community;
  }

  async listCommunities(cursor: string | undefined, limit: number) {
    const rows = await this.prismaService.client.community.findMany({
      ...cursorArgs(cursor, limit),
      orderBy: [{ memberCount: 'desc' }, { id: 'asc' }],
    });
    return toPage(rows, limit);
  }

  async listMine(
    userId: string,
    cursor: string | undefined,
    limit: number,
    slug?: string,
  ) {
    const rows = await this.prismaService.client.community.findMany({
      take: limit + 1,
      where: {
        memberships: { some: { userId } },
        ...(slug !== undefined && slug !== null && { slug }),
        ...(cursor && { id: { gt: cursor } }),
      },
      orderBy: { id: 'asc' },
    });
    return toPage(rows, limit);
  }

  async join(slug: string, userId: string) {
    const community = await this.getCommunityBySlug(slug);

    return this.prismaService.client.$transaction(async (tx) => {
      // Only a newly inserted membership changes the counter, including when
      // duplicate requests arrive concurrently.
      const { count } = await tx.membership.createMany({
        data: { userId, communityId: community.id },
        skipDuplicates: true,
      });
      if (count === 0) {
        return tx.community.findUniqueOrThrow({ where: { id: community.id } });
      }

      return tx.community.update({
        where: { id: community.id },
        data: { memberCount: { increment: 1 } },
      });
    });
  }

  async leave(slug: string, userId: string) {
    const community = await this.getCommunityBySlug(slug);

    if (community.ownerId === userId) {
      throw new ForbiddenException(
        'The owner cannot leave their own community.',
      );
    }

    return this.prismaService.client.$transaction(async (tx) => {
      const { count } = await tx.membership.deleteMany({
        where: { userId, communityId: community.id },
      });
      if (count === 0) {
        return tx.community.findUniqueOrThrow({ where: { id: community.id } });
      }

      return tx.community.update({
        where: { id: community.id },
        data: { memberCount: { decrement: 1 } },
      });
    });
  }

  /** Used by PostsService to reject posting into a community you haven't joined. */
  async assertMember(communityId: string, userId: string) {
    const membership = await this.prismaService.client.membership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });
    if (!membership) {
      throw new ForbiddenException('Join the community before posting in it.');
    }
    return membership;
  }
}

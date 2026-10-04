import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toPage } from '@roorin/nestjs';
import { User } from '@roorin/proto';
import { CommunitiesService } from '../communities/communities.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostInput } from './dto/create-post.input';
import { UpdatePostInput } from './dto/update-post.input';

@Injectable()
export class PostsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly communitiesService: CommunitiesService,
  ) {}

  async createPost(input: CreatePostInput, author: User) {
    const { communitySlug, ...postData } = input;

    if (!postData.body && !postData.url) {
      throw new BadRequestException('A post needs either a body or a url.');
    }
    if (postData.body && postData.url) {
      throw new BadRequestException(
        'A post is either a text post or a link post, not both.',
      );
    }

    const community =
      await this.communitiesService.getCommunityBySlug(communitySlug);
    await this.communitiesService.assertMember(community.id, author.id);

    return this.prismaService.client.post.create({
      data: {
        ...postData,
        communityId: community.id,
        authorId: author.id,
        authorUsername: author.username,
      },
    });
  }

  async getPost(id: string) {
    const post = await this.prismaService.client.post.findUnique({
      where: { id },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async listByAuthor(
    authorId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('Post limit must be between 1 and 100.');
    }
    let anchor: { id: string; createdAt: Date } | undefined;
    if (cursor != null) {
      const row = await this.prismaService.client.post.findUnique({
        where: { id: cursor },
        select: { id: true, authorId: true, createdAt: true },
      });
      if (!row || row.authorId !== authorId) {
        throw new BadRequestException('Cursor is not in this author activity.');
      }
      anchor = row;
    }
    const rows = await this.prismaService.client.post.findMany({
      take: limit + 1,
      where: {
        authorId,
        deletedAt: null,
        // Use the anchor's sort keys even when it has since been soft-deleted.
        ...(anchor && {
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            { createdAt: anchor.createdAt, id: { gt: anchor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return toPage(rows, limit);
  }

  async updatePost(input: UpdatePostInput, userId: string) {
    const { id, title, body, url } = input;
    const post = await this.getPost(id);
    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own posts.');
    }
    if (post.deletedAt) {
      throw new BadRequestException('Cannot edit a deleted post.');
    }
    if (title === undefined && body === undefined && url === undefined) {
      throw new BadRequestException('Provide at least one post field to edit.');
    }
    if (title === null || body === null || url === null) {
      throw new BadRequestException('Edited post fields cannot be null.');
    }
    if (
      (body !== undefined && post.body === null) ||
      (url !== undefined && post.url === null)
    ) {
      throw new BadRequestException(
        'Cannot change a post between text and link.',
      );
    }
    // The conditional write prevents a concurrent deletion from resurrecting content.
    const [updated] = await this.prismaService.client.post.updateManyAndReturn({
      where: { id, authorId: userId, deletedAt: null },
      data: {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
        ...(url !== undefined && { url }),
        editedAt: new Date(),
      },
    });
    if (!updated) throw new BadRequestException('Cannot edit a deleted post.');
    return updated;
  }

  /**
   * Soft delete. The row stays so the comment thread underneath it still
   * resolves; the stored body and URL are cleared on deletion.
   */
  async deletePost(id: string, userId: string) {
    const post = await this.getPost(id);
    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own posts.');
    }
    return this.prismaService.client.post.update({
      where: { id },
      data: { deletedAt: new Date(), body: null, url: null },
    });
  }
}

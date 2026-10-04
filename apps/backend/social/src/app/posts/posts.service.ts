import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { cursorArgs, toPage } from '@roorin/nestjs';
import { User } from '@roorin/proto';
import { CommunitiesService } from '../communities/communities.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostInput } from './dto/create-post.input';

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
    const rows = await this.prismaService.client.post.findMany({
      ...cursorArgs(cursor, limit),
      where: { authorId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return toPage(rows, limit);
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

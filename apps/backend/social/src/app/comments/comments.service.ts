import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '@roorin/proto';
import { PostsService } from '../posts/posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildTree } from './build-tree';
import { CreateCommentInput } from './dto/create-comment.input';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly postsService: PostsService,
  ) {}

  async createComment(input: CreateCommentInput, author: User) {
    const post = await this.postsService.getPost(input.postId);
    if (post.deletedAt) {
      throw new BadRequestException('Cannot comment on a deleted post.');
    }

    if (input.parentId) {
      const parent = await this.prismaService.client.comment.findUnique({
        where: { id: input.parentId },
      });
      // Without this check you could graft a reply onto a comment from a
      // different post, and it would render in both threads.
      if (!parent || parent.postId !== input.postId) {
        throw new BadRequestException('Parent comment is not on this post.');
      }
    }

    return this.prismaService.client.$transaction(async (tx) => {
      // Lock and recheck the post while updating its counter so a concurrent
      // deletion cannot admit a comment after the post has been removed.
      const { count } = await tx.post.updateMany({
        where: { id: input.postId, deletedAt: null },
        data: { commentCount: { increment: 1 } },
      });
      if (count === 0) {
        throw new BadRequestException('Cannot comment on a deleted post.');
      }
      const comment = await tx.comment.create({
        data: {
          ...input,
          authorId: author.id,
          authorUsername: author.username,
        },
      });
      return { ...comment, replies: [] };
    });
  }

  /** Fetches every comment on a post flat, then nests it. See build-tree.ts. */
  async getCommentTree(postId: string) {
    const rows = await this.prismaService.client.comment.findMany({
      where: { postId },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return buildTree(rows);
  }

  async deleteComment(id: string, userId: string) {
    const comment = await this.prismaService.client.comment.findUnique({
      where: { id },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own comments.');
    }

    // Soft delete so replies underneath stay reachable.
    const updated = await this.prismaService.client.comment.update({
      where: { id },
      data: { deletedAt: new Date(), body: '[deleted]' },
    });
    return { ...updated, replies: [] };
  }
}

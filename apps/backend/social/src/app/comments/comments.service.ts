import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '@roorin/proto';
import {
  Comment as PrismaComment,
  Prisma,
} from '@prisma-clients/roorin-social';
import { cursorArgs, toPage } from '@roorin/nestjs';
import { PostsService } from '../posts/posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsArgs } from './dto/comments.args';
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
      return { ...comment, hasReplies: false };
    });
  }

  async getComments({ postId, parentId, cursor, limit }: CommentsArgs) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('Comment limit must be between 1 and 100.');
    }
    const parent = parentId ?? null;
    if (parent !== null) {
      const row = await this.prismaService.client.comment.findUnique({
        where: { id: parent },
        select: { postId: true },
      });
      if (!row || row.postId !== postId) {
        throw new BadRequestException('Parent comment is not on this post.');
      }
    }
    if (cursor != null) {
      const row = await this.prismaService.client.comment.findUnique({
        where: { id: cursor },
        select: { postId: true, parentId: true },
      });
      if (!row || row.postId !== postId || row.parentId !== parent) {
        throw new BadRequestException('Cursor is not in this comment thread.');
      }
    }
    const rows = await this.prismaService.client.comment.findMany({
      ...cursorArgs(cursor, limit),
      where: { postId, parentId: parent },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const page = toPage(rows, limit);
    return { ...page, items: await this.withReplyAvailability(page.items) };
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
    return (await this.withReplyAvailability([updated]))[0];
  }

  private async withReplyAvailability(rows: PrismaComment[]) {
    if (rows.length === 0) return [];
    // EXISTS stops at the first child; do not count or load whole reply lists.
    const parents = await this.prismaService.client.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT parent."id"
        FROM "Comment" parent
        WHERE parent."id" IN (${Prisma.join(rows.map((row) => row.id))})
          AND EXISTS (
            SELECT 1 FROM "Comment" reply
            WHERE reply."postId" = parent."postId"
              AND reply."parentId" = parent."id"
          )
      `,
    );
    const ids = new Set(parents.map((row) => row.id));
    return rows.map((row) => ({ ...row, hasReplies: ids.has(row.id) }));
  }
}

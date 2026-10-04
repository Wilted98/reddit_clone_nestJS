import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma-clients/roorin-social';
import { PrismaService } from '../prisma/prisma.service';
import { VoteResult } from './models/vote-result.model';

type VoteTarget = 'post' | 'comment';

@Injectable()
export class VotesService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Applies a vote and moves the target's denormalized score by the delta
   * between the old and new vote - not by the new value.
   */
  async vote(
    target: VoteTarget,
    targetId: string,
    userId: string,
    value: number,
  ): Promise<VoteResult> {
    if (![-1, 0, 1].includes(value)) {
      throw new BadRequestException('A vote must be -1, 0, or 1.');
    }
    return this.prismaService.client.$transaction(async (tx) => {
      // Serialize changes on this target before reading the previous vote.
      // A transaction alone does not prevent two requests reading the same value.
      const rows = await tx.$queryRaw<{ id: string }[]>(
        target === 'post'
          ? Prisma.sql`SELECT "id" FROM "Post" WHERE "id" = ${targetId} FOR UPDATE`
          : Prisma.sql`SELECT "id" FROM "Comment" WHERE "id" = ${targetId} FOR UPDATE`,
      );
      if (rows.length === 0) throw new NotFoundException(`${target} not found`);

      const where =
        target === 'post'
          ? { userId_postId: { userId, postId: targetId } }
          : { userId_commentId: { userId, commentId: targetId } };

      const existing = await tx.vote.findUnique({ where });
      const previous = existing?.value ?? 0;
      const delta = value - previous;

      if (delta !== 0) {
        if (value === 0) {
          await tx.vote.delete({ where });
        } else if (existing) {
          await tx.vote.update({ where, data: { value } });
        } else {
          await tx.vote.create({
            data: {
              userId,
              value,
              ...(target === 'post'
                ? { postId: targetId }
                : { commentId: targetId }),
            },
          });
        }
      }

      const updated =
        target === 'post'
          ? await tx.post.update({
              where: { id: targetId },
              data: { score: { increment: delta } },
              select: { score: true },
            })
          : await tx.comment.update({
              where: { id: targetId },
              data: { score: { increment: delta } },
              select: { score: true },
            });

      return { targetId, score: updated.score, myVote: value };
    });
  }

  async myVotes(
    target: VoteTarget,
    targetIds: string[],
    userId: string,
  ): Promise<VoteResult[]> {
    const rows = await this.prismaService.client.vote.findMany({
      where: {
        userId,
        ...(target === 'post'
          ? { postId: { in: targetIds } }
          : { commentId: { in: targetIds } }),
      },
    });

    return rows.map((row) => ({
      targetId: (target === 'post' ? row.postId : row.commentId) as string,
      myVote: row.value,
      score: 0, // caller already has the score from the feed query
    }));
  }
}

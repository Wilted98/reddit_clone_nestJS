import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GqlAuthGuard } from '@roorin/nestjs';
import { PrismaService } from '../prisma/prisma.service';
import { VotesModule } from './votes.module';
import { VotesService } from './votes.service';

function databaseMock() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'target-1' }]),
    vote: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    post: { update: jest.fn().mockResolvedValue({ score: 10 }) },
    comment: { update: jest.fn().mockResolvedValue({ score: 10 }) },
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

describe.each(['post', 'comment'] as const)('VotesService (%s)', (target) => {
  let service: VotesService;
  let prisma: ReturnType<typeof databaseMock>;
  const targetId = 'target-1';
  const userId = 'user-1';
  const where =
    target === 'post'
      ? { userId_postId: { userId, postId: targetId } }
      : { userId_commentId: { userId, commentId: targetId } };

  beforeEach(async () => {
    prisma = databaseMock();
    const module = await Test.createTestingModule({ imports: [VotesModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideGuard(GqlAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    service = module.get(VotesService);
  });

  it.each([
    [0, 1],
    [0, -1],
    [0, 0],
    [1, 1],
    [1, -1],
    [1, 0],
    [-1, -1],
    [-1, 1],
    [-1, 0],
  ])('applies the delta when changing %i to %i', async (previous, value) => {
    prisma.tx.vote.findUnique.mockResolvedValue(
      previous === 0 ? null : { value: previous },
    );
    const score = 10 + value - previous;
    prisma.tx[target].update.mockResolvedValue({ score });
    await expect(
      service.vote(target, targetId, userId, value),
    ).resolves.toEqual({ targetId, myVote: value, score });
    expect(prisma.tx.vote.findUnique).toHaveBeenCalledWith({ where });
    expect(prisma.tx.$queryRaw.mock.calls[0][0].values).toEqual([targetId]);
    expect(prisma.tx.$queryRaw.mock.calls[0][0].text).toContain(
      target === 'post' ? '"Post"' : '"Comment"',
    );
    expect(prisma.tx.$queryRaw.mock.calls[0][0].text).toContain('FOR UPDATE');
    expect(prisma.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.tx.vote.findUnique.mock.invocationCallOrder[0],
    );
    expect(prisma.tx[target].update).toHaveBeenCalledWith({
      where: { id: targetId },
      data: { score: { increment: value - previous } },
      select: { score: true },
    });
    const vote = prisma.tx.vote;
    if (value === previous) {
      expect(vote.create).not.toHaveBeenCalled();
      expect(vote.update).not.toHaveBeenCalled();
      expect(vote.delete).not.toHaveBeenCalled();
    } else if (value === 0) {
      expect(vote.delete).toHaveBeenCalledWith({ where });
      expect(vote.create).not.toHaveBeenCalled();
      expect(vote.update).not.toHaveBeenCalled();
    } else if (previous === 0) {
      expect(vote.create).toHaveBeenCalledWith({
        data: {
          userId,
          value,
          [target === 'post' ? 'postId' : 'commentId']: targetId,
        },
      });
      expect(vote.update).not.toHaveBeenCalled();
      expect(vote.delete).not.toHaveBeenCalled();
    } else {
      expect(vote.update).toHaveBeenCalledWith({ where, data: { value } });
      expect(vote.create).not.toHaveBeenCalled();
      expect(vote.delete).not.toHaveBeenCalled();
    }
    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects missing targets before writing a vote, including removal', async () => {
    prisma.tx.$queryRaw.mockResolvedValue([]);
    await expect(service.vote(target, 'missing', userId, 0)).rejects.toEqual(
      new NotFoundException(`${target} not found`),
    );
    expect(prisma.tx.vote.findUnique).not.toHaveBeenCalled();
    expect(prisma.tx[target].update).not.toHaveBeenCalled();
  });

  it('rejects invalid values even when called outside the resolver', async () => {
    await expect(
      service.vote(target, targetId, userId, 2),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('propagates a failed score update to roll back the transaction', async () => {
    const error = new Error('Score update failed');
    prisma.tx[target].update.mockRejectedValue(error);
    await expect(service.vote(target, targetId, userId, 1)).rejects.toBe(error);
  });

  it("returns only the caller's stored votes for requested targets", async () => {
    prisma.tx.vote.findMany.mockResolvedValue([
      { postId: targetId, commentId: targetId, value: -1 },
    ]);
    await expect(
      service.myVotes(target, [targetId, 'unvoted'], userId),
    ).resolves.toEqual([{ targetId, myVote: -1, score: 0 }]);
    expect(prisma.tx.vote.findMany).toHaveBeenCalledWith({
      where: {
        userId,
        [target === 'post' ? 'postId' : 'commentId']: {
          in: [targetId, 'unvoted'],
        },
      },
    });
  });

  it('returns an empty list when no votes are stored', async () => {
    prisma.tx.vote.findMany.mockResolvedValue([]);
    await expect(service.myVotes(target, [], userId)).resolves.toEqual([]);
  });
});

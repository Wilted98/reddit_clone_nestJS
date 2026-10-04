import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GqlAuthGuard } from '@roorin/nestjs';
import { PostsService } from '../posts/posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommentsModule } from './comments.module';
import { CommentsService } from './comments.service';
import { CommentsArgs } from './dto/comments.args';

function databaseMock() {
  const tx = {
    post: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    comment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    tx,
    client: {
      ...tx,
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest
        .fn()
        .mockImplementation((work: (client: typeof tx) => Promise<unknown>) =>
          work(tx),
        ),
    },
  };
}

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: ReturnType<typeof databaseMock>;
  let posts: { getPost: jest.Mock };
  const author = {
    id: 'author-1',
    username: 'author',
    email: 'author@roorin.dev',
    avatarUrl: '',
  };
  const input = { postId: 'post-1', body: 'A comment' };
  const comment = {
    id: 'comment-1',
    ...input,
    parentId: null,
    authorId: author.id,
    authorUsername: author.username,
    score: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = databaseMock();
    prisma.tx.comment.create.mockResolvedValue(comment);
    prisma.client.comment.findUnique.mockResolvedValue(comment);
    posts = {
      getPost: jest
        .fn()
        .mockResolvedValue({ id: input.postId, deletedAt: null }),
    };
    const module = await Test.createTestingModule({ imports: [CommentsModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PostsService)
      .useValue(posts)
      .overrideGuard(GqlAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    service = module.get(CommentsService);
  });

  it('creates a comment and increments its live post counter in one transaction', async () => {
    await expect(service.createComment(input, author)).resolves.toEqual({
      ...comment,
      hasReplies: false,
    });
    expect(prisma.tx.post.updateMany).toHaveBeenCalledWith({
      where: { id: input.postId, deletedAt: null },
      data: { commentCount: { increment: 1 } },
    });
    expect(prisma.tx.comment.create).toHaveBeenCalledWith({
      data: { ...input, authorId: author.id, authorUsername: author.username },
    });
    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
  });

  it('accepts a reply to a comment on the same post', async () => {
    await service.createComment({ ...input, parentId: comment.id }, author);
    expect(prisma.tx.comment.create.mock.calls[0][0].data.parentId).toBe(
      comment.id,
    );
  });

  it.each([null, { ...comment, postId: 'other-post' }])(
    'rejects a missing or cross-post parent',
    async (parent) => {
      prisma.client.comment.findUnique.mockResolvedValue(parent);
      await expect(
        service.createComment({ ...input, parentId: 'parent-1' }, author),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.client.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing post', async () => {
    posts.getPost.mockRejectedValue(new NotFoundException('Post not found'));
    await expect(service.createComment(input, author)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an already deleted post', async () => {
    posts.getPost.mockResolvedValue({ deletedAt: new Date() });
    await expect(service.createComment(input, author)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a post deleted after the initial lookup', async () => {
    prisma.tx.post.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.createComment(input, author)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.tx.comment.create).not.toHaveBeenCalled();
  });

  it('propagates failed comment creation out of the transaction', async () => {
    const error = new Error('Insert failed');
    prisma.tx.comment.create.mockRejectedValue(error);
    await expect(service.createComment(input, author)).rejects.toBe(error);
  });

  it('reads only root siblings in bounded deterministic order and probes reply availability', async () => {
    prisma.client.comment.findMany.mockResolvedValue([comment]);
    prisma.client.$queryRaw.mockResolvedValue([{ id: comment.id }]);
    const page = await service.getComments(
      Object.assign(new CommentsArgs(), { postId: input.postId }),
    );
    expect(page).toEqual({
      items: [{ ...comment, hasReplies: true }],
      nextCursor: null,
      hasMore: false,
    });
    expect(prisma.client.comment.findMany).toHaveBeenCalledWith({
      take: 26,
      where: { postId: input.postId, parentId: null },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const sql = prisma.client.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual([comment.id]);
    expect(sql.text).toContain('EXISTS');
    expect(sql.text).toContain('reply."postId" = parent."postId"');
    expect(sql.text).not.toContain(comment.id);
    expect(page.items[0]).not.toHaveProperty('replies');
  });

  it('returns an empty page without checking replies when no rows match', async () => {
    prisma.client.comment.findMany.mockResolvedValue([]);
    await expect(
      service.getComments(
        Object.assign(new CommentsArgs(), { postId: 'missing-post' }),
      ),
    ).resolves.toEqual({ items: [], nextCursor: null, hasMore: false });
    expect(prisma.client.$queryRaw).not.toHaveBeenCalled();
  });

  it('overfetches one sibling and probes only visible rows, not descendants or the lookahead', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      ...comment,
      id: `comment-${index}`,
    }));
    prisma.client.comment.findMany.mockResolvedValue(rows);
    const page = await service.getComments(
      Object.assign(new CommentsArgs(), { postId: input.postId, limit: 100 }),
    );
    expect(page.items).toHaveLength(100);
    expect(page).toMatchObject({ nextCursor: 'comment-99', hasMore: true });
    expect(prisma.client.comment.findMany.mock.calls[0][0].take).toBe(101);
    expect(prisma.client.$queryRaw.mock.calls[0][0].values).toEqual(
      rows.slice(0, 100).map((row) => row.id),
    );
    expect(page.items.every((row) => row.hasReplies === false)).toBe(true);
  });

  it('pages direct replies using an exclusive cursor in the same sibling group', async () => {
    prisma.client.comment.findUnique
      .mockResolvedValueOnce({ postId: input.postId })
      .mockResolvedValueOnce({ postId: input.postId, parentId: comment.id });
    const reply = { ...comment, id: 'reply-2', parentId: comment.id };
    prisma.client.comment.findMany.mockResolvedValue([reply]);
    const page = await service.getComments(
      Object.assign(new CommentsArgs(), {
        postId: input.postId,
        parentId: comment.id,
        cursor: 'reply-1',
        limit: 1,
      }),
    );
    expect(page).toEqual({
      items: [{ ...reply, hasReplies: false }],
      nextCursor: null,
      hasMore: false,
    });
    expect(prisma.client.comment.findMany).toHaveBeenCalledWith({
      take: 2,
      skip: 1,
      cursor: { id: 'reply-1' },
      where: { postId: input.postId, parentId: comment.id },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it.each([null, { postId: 'other-post' }])(
    'rejects a missing or cross-post parent when reading',
    async (parent) => {
      prisma.client.comment.findUnique.mockResolvedValue(parent);
      await expect(
        service.getComments(
          Object.assign(new CommentsArgs(), {
            postId: input.postId,
            parentId: 'invalid-parent',
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.client.comment.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { postId: 'other-post', parentId: null },
    { postId: input.postId, parentId: 'other-root' },
  ])('rejects a missing or out-of-scope cursor', async (cursor) => {
    prisma.client.comment.findUnique.mockResolvedValue(cursor);
    await expect(
      service.getComments(
        Object.assign(new CommentsArgs(), {
          postId: input.postId,
          cursor: 'invalid-cursor',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.comment.findMany).not.toHaveBeenCalled();
  });

  it.each([0, -1, 101, 1.5, NaN])(
    'bounds direct service calls with limit %j',
    async (limit) => {
      await expect(
        service.getComments(
          Object.assign(new CommentsArgs(), { postId: input.postId, limit }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.client.comment.findMany).not.toHaveBeenCalled();
    },
  );

  it('preserves soft-deleted parents and their reply availability', async () => {
    const deleted = { ...comment, body: '[deleted]', deletedAt: new Date() };
    prisma.client.comment.findMany.mockResolvedValue([deleted]);
    prisma.client.$queryRaw.mockResolvedValue([{ id: comment.id }]);
    const page = await service.getComments(
      Object.assign(new CommentsArgs(), { postId: input.postId }),
    );
    expect(page.items[0]).toMatchObject({
      id: comment.id,
      body: '[deleted]',
      hasReplies: true,
    });
  });

  it('propagates failed page reads', async () => {
    const error = new Error('Database unavailable');
    prisma.client.comment.findMany.mockRejectedValue(error);
    await expect(
      service.getComments(
        Object.assign(new CommentsArgs(), { postId: input.postId }),
      ),
    ).rejects.toBe(error);
  });

  it("soft-deletes only the author's comment without decrementing total comment count", async () => {
    const deleted = { ...comment, body: '[deleted]', deletedAt: new Date() };
    prisma.client.comment.update.mockResolvedValue(deleted);
    await expect(service.deleteComment(comment.id, author.id)).resolves.toEqual(
      { ...deleted, hasReplies: false },
    );
    expect(prisma.client.comment.update).toHaveBeenCalledWith({
      where: { id: comment.id },
      data: { body: '[deleted]', deletedAt: expect.any(Date) },
    });
    expect(prisma.tx.post.updateMany).not.toHaveBeenCalled();
  });

  it("forbids deleting another author's comment", async () => {
    await expect(
      service.deleteComment(comment.id, 'outsider'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.comment.update).not.toHaveBeenCalled();
  });

  it('reports a missing comment when deleting', async () => {
    prisma.client.comment.findUnique.mockResolvedValue(null);
    await expect(
      service.deleteComment('missing', author.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.client.comment.update).not.toHaveBeenCalled();
  });
});

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
      replies: [],
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

  it('builds a nested tree from post-scoped rows in deterministic order', async () => {
    const child = { ...comment, id: 'reply-1', parentId: comment.id };
    prisma.client.comment.findMany.mockResolvedValue([child, comment]);
    const tree = await service.getCommentTree(input.postId);
    expect(tree).toHaveLength(1);
    expect(tree[0].replies[0].id).toBe(child.id);
    expect(prisma.client.comment.findMany).toHaveBeenCalledWith({
      where: { postId: input.postId },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('returns an empty tree when there are no comments', async () => {
    prisma.client.comment.findMany.mockResolvedValue([]);
    await expect(service.getCommentTree(input.postId)).resolves.toEqual([]);
  });

  it("soft-deletes only the author's comment without decrementing total comment count", async () => {
    const deleted = { ...comment, body: '[deleted]', deletedAt: new Date() };
    prisma.client.comment.update.mockResolvedValue(deleted);
    await expect(service.deleteComment(comment.id, author.id)).resolves.toEqual(
      { ...deleted, replies: [] },
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

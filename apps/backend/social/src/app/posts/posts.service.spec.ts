import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GqlAuthGuard } from '@roorin/nestjs';
import { CommunitiesService } from '../communities/communities.service';
import { PrismaService } from '../prisma/prisma.service';
import { PostsModule } from './posts.module';
import { PostsService } from './posts.service';

describe('PostsService', () => {
  let service: PostsService;
  let prisma: {
    client: {
      post: {
        create: jest.Mock;
        findUnique: jest.Mock;
        findMany: jest.Mock;
        update: jest.Mock;
        updateManyAndReturn: jest.Mock;
      };
    };
  };
  let communities: { getCommunityBySlug: jest.Mock; assertMember: jest.Mock };
  const author = {
    id: 'author-1',
    username: 'author',
    email: 'author@roorin.dev',
    avatarUrl: '',
  };
  const input = {
    communitySlug: 'romania',
    title: 'First post',
    body: 'Text post',
  };
  const post = {
    id: 'post-1',
    communityId: 'community-1',
    authorId: author.id,
    authorUsername: author.username,
    title: input.title,
    body: input.body,
    url: null,
    createdAt: new Date('2026-10-04T12:00:00.000Z'),
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      client: {
        post: {
          create: jest.fn(),
          findUnique: jest.fn().mockResolvedValue(post),
          findMany: jest.fn(),
          update: jest.fn(),
          updateManyAndReturn: jest.fn(),
        },
      },
    };
    communities = {
      getCommunityBySlug: jest.fn().mockResolvedValue({ id: 'community-1' }),
      assertMember: jest.fn().mockResolvedValue({ role: 'MEMBER' }),
    };
    const module = await Test.createTestingModule({ imports: [PostsModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CommunitiesService)
      .useValue(communities)
      .overrideGuard(GqlAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    service = module.get(PostsService);
  });

  it('creates a member-owned text post with authenticated identity', async () => {
    prisma.client.post.create.mockResolvedValue(post);
    await expect(service.createPost(input, author)).resolves.toBe(post);
    expect(communities.assertMember).toHaveBeenCalledWith(
      'community-1',
      author.id,
    );
    expect(prisma.client.post.create).toHaveBeenCalledWith({
      data: {
        title: input.title,
        body: input.body,
        communityId: 'community-1',
        authorId: author.id,
        authorUsername: author.username,
      },
    });
  });

  it('accepts a link post without a body', async () => {
    await service.createPost(
      {
        communitySlug: 'romania',
        title: 'Link post',
        url: 'https://example.com',
      },
      author,
    );
    expect(prisma.client.post.create.mock.calls[0][0].data).toMatchObject({
      url: 'https://example.com',
      authorId: author.id,
    });
    expect(prisma.client.post.create.mock.calls[0][0].data).not.toHaveProperty(
      'body',
    );
  });

  it.each([
    { communitySlug: 'romania', title: 'Missing content' },
    { ...input, url: 'https://example.com' },
  ])('rejects a post without exactly one content type', async (data) => {
    await expect(service.createPost(data, author)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.client.post.create).not.toHaveBeenCalled();
    expect(communities.assertMember).not.toHaveBeenCalled();
  });

  it('rejects a non-member before persisting a post', async () => {
    communities.assertMember.mockRejectedValue(
      new ForbiddenException('Join first'),
    );
    await expect(service.createPost(input, author)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.client.post.create).not.toHaveBeenCalled();
  });

  it('propagates a missing community', async () => {
    communities.getCommunityBySlug.mockRejectedValue(new NotFoundException());
    await expect(service.createPost(input, author)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.client.post.create).not.toHaveBeenCalled();
  });

  it('returns a post by ID', async () => {
    await expect(service.getPost(post.id)).resolves.toBe(post);
    expect(prisma.client.post.findUnique).toHaveBeenCalledWith({
      where: { id: post.id },
    });
  });

  it('reports a missing post', async () => {
    prisma.client.post.findUnique.mockResolvedValue(null);
    await expect(service.getPost('missing')).rejects.toEqual(
      new NotFoundException('Post not found'),
    );
  });

  it.each([null, new Date()])(
    'pages live posts after an active or deleted anchor (%j)',
    async (deletedAt) => {
      prisma.client.post.findUnique.mockResolvedValue({
        ...post,
        id: 'previous',
        deletedAt,
      });
      const rows = [post, { ...post, id: 'post-2' }, { ...post, id: 'post-3' }];
      prisma.client.post.findMany.mockResolvedValue(rows);
      await expect(
        service.listByAuthor(author.id, 'previous', 2),
      ).resolves.toEqual({
        items: rows.slice(0, 2),
        nextCursor: 'post-2',
        hasMore: true,
      });
      expect(prisma.client.post.findMany).toHaveBeenCalledWith({
        take: 3,
        where: {
          authorId: author.id,
          deletedAt: null,
          OR: [
            { createdAt: { lt: post.createdAt } },
            { createdAt: post.createdAt, id: { gt: 'previous' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
    },
  );

  it('returns an empty terminal author page', async () => {
    prisma.client.post.findMany.mockResolvedValue([]);
    await expect(
      service.listByAuthor(author.id, undefined, 25),
    ).resolves.toEqual({ items: [], nextCursor: null, hasMore: false });
  });

  it.each([null, { authorId: 'other-author' }])(
    'rejects missing or foreign author cursors',
    async (row) => {
      prisma.client.post.findUnique.mockResolvedValue(row);
      await expect(
        service.listByAuthor(author.id, 'cursor', 25),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.client.post.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([0, 101, 1.5, NaN])(
    'bounds direct author-page calls with limit %j',
    async (limit) => {
      await expect(
        service.listByAuthor(author.id, undefined, limit),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.client.post.findMany).not.toHaveBeenCalled();
    },
  );

  it('atomically patches only text content and edit metadata without requiring membership', async () => {
    const updated = {
      ...post,
      title: 'Edited title',
      body: 'Edited body',
      editedAt: new Date(),
    };
    prisma.client.post.updateManyAndReturn.mockResolvedValue([updated]);
    await expect(
      service.updatePost(
        { id: post.id, title: updated.title, body: updated.body },
        author.id,
      ),
    ).resolves.toBe(updated);
    expect(prisma.client.post.updateManyAndReturn).toHaveBeenCalledWith({
      where: { id: post.id, authorId: author.id, deletedAt: null },
      data: {
        title: updated.title,
        body: updated.body,
        editedAt: expect.any(Date),
      },
    });
    expect(communities.assertMember).not.toHaveBeenCalled();
  });

  it('updates a link URL while preserving text/link type', async () => {
    const link = { ...post, body: null, url: 'https://example.com/original' };
    const updated = {
      ...link,
      url: 'https://example.com/edited',
      editedAt: new Date(),
    };
    prisma.client.post.findUnique.mockResolvedValue(link);
    prisma.client.post.updateManyAndReturn.mockResolvedValue([updated]);
    await expect(
      service.updatePost({ id: post.id, url: updated.url }, author.id),
    ).resolves.toBe(updated);
    expect(
      prisma.client.post.updateManyAndReturn.mock.calls[0][0].data,
    ).toEqual({ url: updated.url, editedAt: expect.any(Date) });
  });

  it('ignores undeclared server-owned fields even in a direct service call', async () => {
    prisma.client.post.updateManyAndReturn.mockResolvedValue([
      { ...post, editedAt: new Date() },
    ]);
    await service.updatePost(
      {
        id: post.id,
        title: 'Edited title',
        authorId: 'victim',
        communityId: 'other',
        score: 99,
        commentCount: 99,
        editedAt: 'forged',
      } as unknown as Parameters<PostsService['updatePost']>[0],
      author.id,
    );
    expect(
      prisma.client.post.updateManyAndReturn.mock.calls[0][0].data,
    ).toEqual({ title: 'Edited title', editedAt: expect.any(Date) });
  });

  it.each([{ id: post.id }, { id: post.id, url: 'https://example.com' }])(
    'rejects empty edits and type changes %j',
    async (data) => {
      await expect(service.updatePost(data, author.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.client.post.updateManyAndReturn).not.toHaveBeenCalled();
    },
  );

  it('rejects a body on an existing link post', async () => {
    prisma.client.post.findUnique.mockResolvedValue({
      ...post,
      body: null,
      url: 'https://example.com',
    });
    await expect(
      service.updatePost({ id: post.id, body: 'Text' }, author.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.post.updateManyAndReturn).not.toHaveBeenCalled();
  });

  it.each(['title', 'body', 'url'])(
    'rejects null %s in direct service calls',
    async (field) => {
      const input = { id: post.id, [field]: null } as unknown as Parameters<
        PostsService['updatePost']
      >[0];
      await expect(service.updatePost(input, author.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.client.post.updateManyAndReturn).not.toHaveBeenCalled();
    },
  );

  it("forbids editing another author's post", async () => {
    await expect(
      service.updatePost({ id: post.id, title: 'Edited title' }, 'outsider'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.post.updateManyAndReturn).not.toHaveBeenCalled();
  });

  it('reports a missing edit target', async () => {
    prisma.client.post.findUnique.mockResolvedValue(null);
    await expect(
      service.updatePost({ id: 'missing', title: 'Edited title' }, author.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.client.post.updateManyAndReturn).not.toHaveBeenCalled();
  });

  it('rejects a deleted post before attempting to update it', async () => {
    prisma.client.post.findUnique.mockResolvedValue({
      ...post,
      deletedAt: new Date(),
      body: null,
    });
    await expect(
      service.updatePost({ id: post.id, title: 'Edited title' }, author.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.post.updateManyAndReturn).not.toHaveBeenCalled();
  });

  it('rejects a post deleted between lookup and the conditional write', async () => {
    prisma.client.post.updateManyAndReturn.mockResolvedValue([]);
    await expect(
      service.updatePost({ id: post.id, body: 'Edited body' }, author.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.post.update).not.toHaveBeenCalled();
  });

  it('propagates unexpected edit failures', async () => {
    const error = new Error('Database unavailable');
    prisma.client.post.updateManyAndReturn.mockRejectedValue(error);
    await expect(
      service.updatePost({ id: post.id, title: 'Edited title' }, author.id),
    ).rejects.toBe(error);
  });

  it("soft-deletes the author's post and clears its content", async () => {
    const deleted = { ...post, deletedAt: new Date(), body: null };
    prisma.client.post.update.mockResolvedValue(deleted);
    await expect(service.deletePost(post.id, author.id)).resolves.toBe(deleted);
    expect(prisma.client.post.update).toHaveBeenCalledWith({
      where: { id: post.id },
      data: { deletedAt: expect.any(Date), body: null, url: null },
    });
  });

  it("forbids deleting another author's post", async () => {
    await expect(
      service.deletePost(post.id, 'outsider'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.post.update).not.toHaveBeenCalled();
  });

  it('reports a missing post when deleting', async () => {
    prisma.client.post.findUnique.mockResolvedValue(null);
    await expect(
      service.deletePost('missing', author.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.client.post.update).not.toHaveBeenCalled();
  });
});

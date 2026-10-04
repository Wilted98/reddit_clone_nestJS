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

  it('lists only live posts by the requested author with a deterministic cursor', async () => {
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
      skip: 1,
      cursor: { id: 'previous' },
      where: { authorId: author.id, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  });

  it('returns an empty terminal author page', async () => {
    prisma.client.post.findMany.mockResolvedValue([]);
    await expect(
      service.listByAuthor(author.id, undefined, 25),
    ).resolves.toEqual({ items: [], nextCursor: null, hasMore: false });
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

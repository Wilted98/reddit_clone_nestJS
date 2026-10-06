import { Test, TestingModule } from '@nestjs/testing';
import { GqlAuthGuard } from '@roorin/nestjs';
import { PostsResolver } from './posts.resolver';
import { PostsService } from './posts.service';
import { AuthorAvatarsService } from './author-avatars.service';

describe('PostsResolver', () => {
  let resolver: PostsResolver;
  const avatars = { getAvatar: jest.fn() };
  let service: {
    createPost: jest.Mock;
    getPost: jest.Mock;
    getCommunitySlug: jest.Mock;
    listByAuthor: jest.Mock;
    deletePost: jest.Mock;
    updatePost: jest.Mock;
  };
  const user = {
    id: 'user-1',
    username: 'user',
    email: 'user@roorin.dev',
    avatarUrl: '',
  };

  beforeEach(async () => {
    service = {
      createPost: jest.fn(),
      getPost: jest.fn(),
      getCommunitySlug: jest.fn(),
      listByAuthor: jest.fn(),
      deletePost: jest.fn(),
      updatePost: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsResolver,
        { provide: PostsService, useValue: service },
        { provide: AuthorAvatarsService, useValue: avatars },
      ],
    })
      .overrideGuard(GqlAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    resolver = module.get<PostsResolver>(PostsResolver);
  });

  it('resolves current avatars with the request context and trusted author ID', async () => {
    const context = { req: {} };
    avatars.getAvatar.mockResolvedValue('https://example.com/avatar.png');
    await expect(
      resolver.authorAvatarUrl(
        { authorId: 'author-1' } as Parameters<
          typeof resolver.authorAvatarUrl
        >[0],
        context,
      ),
    ).resolves.toBe('https://example.com/avatar.png');
    expect(avatars.getAvatar).toHaveBeenCalledWith(context, 'author-1');
  });

  it('creates a post using the authenticated author', async () => {
    const input = {
      communitySlug: 'romania',
      title: 'Post title',
      body: 'Text post',
    };
    const created = { id: 'post-1' };
    service.createPost.mockResolvedValue(created);
    await expect(resolver.createPost(input, user)).resolves.toBe(created);
    expect(service.createPost).toHaveBeenCalledWith(input, user);
  });

  it('looks up a public post by ID', async () => {
    const found = { id: 'post-1' };
    service.getPost.mockResolvedValue(found);
    await expect(resolver.getPost('post-1')).resolves.toBe(found);
    expect(service.getPost).toHaveBeenCalledWith('post-1');
  });

  it('resolves the community slug for any public post response', async () => {
    service.getCommunitySlug.mockResolvedValue('craft');
    await expect(
      resolver.communitySlug({ communityId: 'community-1' } as Parameters<
        typeof resolver.communitySlug
      >[0]),
    ).resolves.toBe('craft');
    expect(service.getCommunitySlug).toHaveBeenCalledWith('community-1');
  });

  it('forwards author and pagination arguments', async () => {
    const page = { items: [], hasMore: false, nextCursor: null };
    service.listByAuthor.mockResolvedValue(page);
    await expect(
      resolver.listByAuthor({
        authorId: 'author-1',
        cursor: 'last-id',
        limit: 10,
      }),
    ).resolves.toBe(page);
    expect(service.listByAuthor).toHaveBeenCalledWith(
      'author-1',
      'last-id',
      10,
    );
  });

  it('deletes as the authenticated user', async () => {
    const deleted = { id: 'post-1' };
    service.deletePost.mockResolvedValue(deleted);
    await expect(resolver.deletePost('post-1', user)).resolves.toBe(deleted);
    expect(service.deletePost).toHaveBeenCalledWith('post-1', user.id);
  });

  it('edits with the authenticated author ID, not a client identity', async () => {
    const input = { id: 'post-1', body: 'Edited body' };
    const updated = { id: 'post-1', editedAt: new Date() };
    service.updatePost.mockResolvedValue(updated);
    await expect(resolver.updatePost(input, user)).resolves.toBe(updated);
    expect(service.updatePost).toHaveBeenCalledWith(input, user.id);
  });
});

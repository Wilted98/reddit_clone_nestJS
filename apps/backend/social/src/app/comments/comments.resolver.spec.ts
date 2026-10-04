import { Test, TestingModule } from '@nestjs/testing';
import { GqlAuthGuard } from '@roorin/nestjs';
import { CommentsResolver } from './comments.resolver';
import { CommentsService } from './comments.service';

describe('CommentsResolver', () => {
  let resolver: CommentsResolver;
  let service: {
    createComment: jest.Mock;
    getCommentTree: jest.Mock;
    deleteComment: jest.Mock;
  };
  const user = {
    id: 'user-1',
    username: 'user',
    email: 'user@roorin.dev',
    avatarUrl: '',
  };

  beforeEach(async () => {
    service = {
      createComment: jest.fn(),
      getCommentTree: jest.fn(),
      deleteComment: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsResolver,
        { provide: CommentsService, useValue: service },
      ],
    })
      .overrideGuard(GqlAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    resolver = module.get<CommentsResolver>(CommentsResolver);
  });

  it('creates a reply as the authenticated author', async () => {
    const input = { postId: 'post-1', parentId: 'parent-1', body: 'A reply' };
    const created = { id: 'comment-1' };
    service.createComment.mockResolvedValue(created);
    await expect(resolver.createComment(input, user)).resolves.toBe(created);
    expect(service.createComment).toHaveBeenCalledWith(input, user);
  });

  it('reads a public post-scoped comment tree', async () => {
    const tree = [{ id: 'comment-1', replies: [] }];
    service.getCommentTree.mockResolvedValue(tree);
    await expect(resolver.getComments('post-1')).resolves.toBe(tree);
    expect(service.getCommentTree).toHaveBeenCalledWith('post-1');
  });

  it('deletes as the authenticated user', async () => {
    const deleted = { id: 'comment-1', body: '[deleted]' };
    service.deleteComment.mockResolvedValue(deleted);
    await expect(resolver.deleteComment('comment-1', user)).resolves.toBe(
      deleted,
    );
    expect(service.deleteComment).toHaveBeenCalledWith('comment-1', user.id);
  });
});

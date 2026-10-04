import { Test, TestingModule } from '@nestjs/testing';
import { GqlAuthGuard } from '@roorin/nestjs';
import { CommentsResolver } from './comments.resolver';
import { CommentsService } from './comments.service';
import { CommentsArgs } from './dto/comments.args';

describe('CommentsResolver', () => {
  let resolver: CommentsResolver;
  let service: {
    createComment: jest.Mock;
    getComments: jest.Mock;
    deleteComment: jest.Mock;
    listByAuthor: jest.Mock;
    updateComment: jest.Mock;
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
      getComments: jest.fn(),
      deleteComment: jest.fn(),
      listByAuthor: jest.fn(),
      updateComment: jest.fn(),
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

  it('forwards public root/reply pagination arguments unchanged', async () => {
    const args = Object.assign(new CommentsArgs(), {
      postId: 'post-1',
      parentId: 'root-1',
      cursor: 'reply-1',
      limit: 10,
    });
    const page = {
      items: [{ id: 'comment-1', hasReplies: true }],
      nextCursor: null,
      hasMore: false,
    };
    service.getComments.mockResolvedValue(page);
    await expect(resolver.getComments(args)).resolves.toBe(page);
    expect(service.getComments).toHaveBeenCalledWith(args);
  });

  it('deletes as the authenticated user', async () => {
    const deleted = { id: 'comment-1', body: '[deleted]' };
    service.deleteComment.mockResolvedValue(deleted);
    await expect(resolver.deleteComment('comment-1', user)).resolves.toBe(
      deleted,
    );
    expect(service.deleteComment).toHaveBeenCalledWith('comment-1', user.id);
  });

  it('forwards public author activity and pagination arguments', async () => {
    const args = { authorId: 'author-1', cursor: 'last', limit: 10 };
    const page = { items: [], nextCursor: null, hasMore: false };
    service.listByAuthor.mockResolvedValue(page);
    await expect(resolver.listByAuthor(args)).resolves.toBe(page);
    expect(service.listByAuthor).toHaveBeenCalledWith(args);
  });

  it('edits with the authenticated author ID', async () => {
    const input = { id: 'comment-1', body: 'Edited comment' };
    const updated = { id: 'comment-1', editedAt: new Date() };
    service.updateComment.mockResolvedValue(updated);
    await expect(resolver.updateComment(input, user)).resolves.toBe(updated);
    expect(service.updateComment).toHaveBeenCalledWith(input, user.id);
  });
});

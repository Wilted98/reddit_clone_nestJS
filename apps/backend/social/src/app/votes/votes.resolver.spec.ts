import { Test, TestingModule } from '@nestjs/testing';
import { VotesResolver } from './votes.resolver';
import { GqlAuthGuard } from '@roorin/nestjs';
import { VotesService } from './votes.service';

describe('VotesResolver', () => {
  let resolver: VotesResolver;
  let service: { vote: jest.Mock; myVotes: jest.Mock };
  const user = {
    id: 'user-1',
    username: 'user',
    email: 'user@roorin.dev',
    avatarUrl: '',
  };

  beforeEach(async () => {
    service = { vote: jest.fn(), myVotes: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [VotesResolver, { provide: VotesService, useValue: service }],
    })
      .overrideGuard(GqlAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    resolver = module.get<VotesResolver>(VotesResolver);
  });

  it.each(['post', 'comment'] as const)(
    'votes on a %s using authenticated identity',
    async (target) => {
      const input = { targetId: 'target-1', value: -1 };
      const result = { targetId: input.targetId, score: 3, myVote: -1 };
      service.vote.mockResolvedValue(result);
      const response =
        target === 'post'
          ? resolver.votePost(input, user)
          : resolver.voteComment(input, user);
      await expect(response).resolves.toBe(result);
      expect(service.vote).toHaveBeenCalledWith(
        target,
        input.targetId,
        user.id,
        input.value,
      );
    },
  );

  it.each(['post', 'comment'] as const)(
    "looks up only the authenticated user's %s votes",
    async (target) => {
      const ids = ['target-1', 'target-2'];
      const rows = [{ targetId: ids[0], myVote: 1, score: 0 }];
      service.myVotes.mockResolvedValue(rows);
      const response =
        target === 'post'
          ? resolver.myPostVotes(ids, user)
          : resolver.myCommentVotes(ids, user);
      await expect(response).resolves.toBe(rows);
      expect(service.myVotes).toHaveBeenCalledWith(target, ids, user.id);
    },
  );
});

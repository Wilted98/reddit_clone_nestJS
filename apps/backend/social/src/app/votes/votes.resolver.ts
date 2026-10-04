import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser, GqlAuthGuard } from '@roorin/nestjs';
import { User } from '@roorin/proto';
import { VoteInput } from './dto/vote.input';
import { VoteResult } from './models/vote-result.model';
import { VotesService } from './votes.service';

@Resolver()
@UseGuards(GqlAuthGuard)
export class VotesResolver {
  constructor(private readonly votesService: VotesService) {}

  @Mutation(() => VoteResult)
  async votePost(
    @Args('voteInput') input: VoteInput,
    @CurrentUser() user: User,
  ) {
    return this.votesService.vote('post', input.targetId, user.id, input.value);
  }

  @Mutation(() => VoteResult)
  async voteComment(
    @Args('voteInput') input: VoteInput,
    @CurrentUser() user: User,
  ) {
    return this.votesService.vote(
      'comment',
      input.targetId,
      user.id,
      input.value,
    );
  }

  @Query(() => [VoteResult], { name: 'myPostVotes' })
  async myPostVotes(
    @Args('postIds', { type: () => [String] }) postIds: string[],
    @CurrentUser() user: User,
  ) {
    return this.votesService.myVotes('post', postIds, user.id);
  }

  @Query(() => [VoteResult], { name: 'myCommentVotes' })
  async myCommentVotes(
    @Args('commentIds', { type: () => [String] }) commentIds: string[],
    @CurrentUser() user: User,
  ) {
    return this.votesService.myVotes('comment', commentIds, user.id);
  }
}

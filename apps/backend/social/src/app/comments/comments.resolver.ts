import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser, GqlAuthGuard } from '@roorin/nestjs';
import { User } from '@roorin/proto';
import { CommentsService } from './comments.service';
import { CommentsArgs } from './dto/comments.args';
import { CreateCommentInput } from './dto/create-comment.input';
import { Comment, CommentPage } from './models/comment.model';

@Resolver(() => Comment)
export class CommentsResolver {
  constructor(private readonly commentsService: CommentsService) {}

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Comment)
  async createComment(
    @Args('createCommentInput') input: CreateCommentInput,
    @CurrentUser() user: User,
  ) {
    return this.commentsService.createComment(input, user);
  }

  @Query(() => CommentPage, { name: 'comments' })
  async getComments(@Args() args: CommentsArgs) {
    return this.commentsService.getComments(args);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Comment)
  async deleteComment(@Args('id') id: string, @CurrentUser() user: User) {
    return this.commentsService.deleteComment(id, user.id);
  }
}

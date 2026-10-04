import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser, GqlAuthGuard, PaginationArgs } from '@roorin/nestjs';
import { User } from '@roorin/proto';
import { CreatePostInput } from './dto/create-post.input';
import { Post, PostPage } from './models/post.model';
import { PostsService } from './posts.service';

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Post)
  async createPost(
    @Args('createPostInput') input: CreatePostInput,
    @CurrentUser() user: User,
  ) {
    return this.postsService.createPost(input, user);
  }

  @Query(() => Post, { name: 'post' })
  async getPost(@Args('id') id: string) {
    return this.postsService.getPost(id);
  }

  @Query(() => PostPage, { name: 'postsByAuthor' })
  async listByAuthor(
    @Args('authorId') authorId: string,
    @Args() { cursor, limit }: PaginationArgs,
  ) {
    return this.postsService.listByAuthor(authorId, cursor, limit);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Post)
  async deletePost(@Args('id') id: string, @CurrentUser() user: User) {
    return this.postsService.deletePost(id, user.id);
  }
}

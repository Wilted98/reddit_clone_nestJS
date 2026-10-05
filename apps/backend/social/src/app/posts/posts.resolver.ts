import { UseGuards } from '@nestjs/common';
import {
  Args,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { CurrentUser, GqlAuthGuard } from '@roorin/nestjs';
import { User } from '@roorin/proto';
import { CreatePostInput } from './dto/create-post.input';
import { AuthorActivityArgs } from './dto/author-activity.args';
import { UpdatePostInput } from './dto/update-post.input';
import { Post, PostPage } from './models/post.model';
import { PostsService } from './posts.service';

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @ResolveField(() => String)
  communitySlug(@Parent() post: Post) {
    return this.postsService.getCommunitySlug(post.communityId);
  }

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
  async listByAuthor(@Args() { authorId, cursor, limit }: AuthorActivityArgs) {
    return this.postsService.listByAuthor(authorId, cursor, limit);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Post)
  async updatePost(
    @Args('updatePostInput') input: UpdatePostInput,
    @CurrentUser() user: User,
  ) {
    return this.postsService.updatePost(input, user.id);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Post)
  async deletePost(@Args('id') id: string, @CurrentUser() user: User) {
    return this.postsService.deletePost(id, user.id);
  }
}

import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser, GqlAuthGuard, PaginationArgs } from '@roorin/nestjs';
import { User } from '@roorin/proto';
import { CommunitiesService } from './communities.service';
import { CreateCommunityInput } from './dto/create-community.input';
import { Community } from './models/community.model';
import { CommunityPage } from './models/community-page.model';

@Resolver(() => Community)
export class CommunitiesResolver {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Community)
  async createCommunity(
    @Args('createCommunityInput') input: CreateCommunityInput,
    @CurrentUser() user: User,
  ) {
    return this.communitiesService.createCommunity(input, user.id);
  }

  @Query(() => Community, { name: 'community' })
  async getCommunity(@Args('slug') slug: string) {
    return this.communitiesService.getCommunityBySlug(slug);
  }

  @Query(() => CommunityPage, { name: 'communities' })
  async listCommunities(@Args() { cursor, limit }: PaginationArgs) {
    return this.communitiesService.listCommunities(cursor, limit);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Community)
  async joinCommunity(@Args('slug') slug: string, @CurrentUser() user: User) {
    return this.communitiesService.join(slug, user.id);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Community)
  async leaveCommunity(@Args('slug') slug: string, @CurrentUser() user: User) {
    return this.communitiesService.leave(slug, user.id);
  }
}

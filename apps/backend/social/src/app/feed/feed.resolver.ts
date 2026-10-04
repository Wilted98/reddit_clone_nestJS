import { Args, Query, Resolver } from '@nestjs/graphql';
import { PostPage } from '../posts/models/post.model';
import { FeedArgs } from './dto/feed.args';
import { FeedService } from './feed.service';

@Resolver()
export class FeedResolver {
  constructor(private readonly feedService: FeedService) {}

  @Query(() => PostPage, { name: 'feed' })
  async getFeed(@Args() args: FeedArgs) {
    return this.feedService.getFeed(args);
  }
}

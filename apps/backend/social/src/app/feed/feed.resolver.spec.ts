import { Test, TestingModule } from '@nestjs/testing';
import { FeedResolver } from './feed.resolver';
import { FeedService } from './feed.service';
import { FeedArgs, FeedRange, FeedSort } from './dto/feed.args';

describe('FeedResolver', () => {
  let resolver: FeedResolver;
  let service: { getFeed: jest.Mock };

  beforeEach(async () => {
    service = { getFeed: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeedResolver, { provide: FeedService, useValue: service }],
    }).compile();

    resolver = module.get<FeedResolver>(FeedResolver);
  });

  it('forwards all public feed arguments and the returned page', async () => {
    const args = Object.assign(new FeedArgs(), {
      sort: FeedSort.TOP,
      range: FeedRange.WEEK,
      communitySlug: 'romania',
      cursor: 'post-1',
      limit: 10,
      offset: 20,
    });
    const page = { items: [], hasMore: false, nextCursor: null };
    service.getFeed.mockResolvedValue(page);
    await expect(resolver.getFeed(args)).resolves.toBe(page);
    expect(service.getFeed).toHaveBeenCalledWith(args);
  });
});

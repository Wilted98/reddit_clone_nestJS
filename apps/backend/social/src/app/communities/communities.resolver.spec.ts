import { Test, TestingModule } from '@nestjs/testing';
import { GqlAuthGuard } from '@roorin/nestjs';
import { CommunitiesResolver } from './communities.resolver';
import { CommunitiesService } from './communities.service';

describe('CommunitiesResolver', () => {
  let resolver: CommunitiesResolver;
  let service: {
    createCommunity: jest.Mock;
    getCommunityBySlug: jest.Mock;
    listCommunities: jest.Mock;
    listMine: jest.Mock;
    join: jest.Mock;
    leave: jest.Mock;
  };
  const user = {
    id: 'user-1',
    email: 'user@roorin.dev',
    username: 'user',
    avatarUrl: '',
  };

  beforeEach(async () => {
    service = {
      createCommunity: jest.fn(),
      getCommunityBySlug: jest.fn(),
      listCommunities: jest.fn(),
      listMine: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunitiesResolver,
        {
          provide: CommunitiesService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(GqlAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    resolver = module.get<CommunitiesResolver>(CommunitiesResolver);
  });

  it('creates a community owned by the authenticated user', async () => {
    const input = { slug: 'romania', name: 'Romania' };
    const created = { id: 'community-1', ...input, ownerId: user.id };
    service.createCommunity.mockResolvedValue(created);
    await expect(resolver.createCommunity(input, user)).resolves.toBe(created);
    expect(service.createCommunity).toHaveBeenCalledWith(input, user.id);
  });

  it('looks up a public community by slug', async () => {
    const community = { id: 'community-1' };
    service.getCommunityBySlug.mockResolvedValue(community);
    await expect(resolver.getCommunity('romania')).resolves.toBe(community);
    expect(service.getCommunityBySlug).toHaveBeenCalledWith('romania');
  });

  it('forwards the cursor and page size', async () => {
    const page = { items: [], hasMore: false, nextCursor: null };
    service.listCommunities.mockResolvedValue(page);
    await expect(
      resolver.listCommunities({ cursor: 'last-id', limit: 10 }),
    ).resolves.toBe(page);
    expect(service.listCommunities).toHaveBeenCalledWith('last-id', 10);
  });

  it('joins as the authenticated user', async () => {
    const community = { memberCount: 2 };
    service.join.mockResolvedValue(community);
    await expect(resolver.joinCommunity('romania', user)).resolves.toBe(
      community,
    );
    expect(service.join).toHaveBeenCalledWith('romania', user.id);
  });

  it('lists only the caller memberships with bounded pagination', async () => {
    const page = { items: [], hasMore: false, nextCursor: null };
    service.listMine.mockResolvedValue(page);
    await expect(
      resolver.myCommunities({ cursor: 'last', limit: 20 }, user),
    ).resolves.toBe(page);
    expect(service.listMine).toHaveBeenCalledWith(
      user.id,
      'last',
      20,
      undefined,
    );
    expect(Reflect.getMetadata('__guards__', resolver.myCommunities)).toContain(
      GqlAuthGuard,
    );
  });

  it('scopes an exact community lookup to the authenticated caller', async () => {
    service.listMine.mockResolvedValue({ items: [] });
    await resolver.myCommunities({ limit: 1 }, user, 'craft');
    expect(service.listMine).toHaveBeenCalledWith(
      user.id,
      undefined,
      1,
      'craft',
    );
  });

  it('leaves as the authenticated user', async () => {
    const community = { memberCount: 1 };
    service.leave.mockResolvedValue(community);
    await expect(resolver.leaveCommunity('romania', user)).resolves.toBe(
      community,
    );
    expect(service.leave).toHaveBeenCalledWith('romania', user.id);
  });

  it('propagates service errors', async () => {
    const error = new Error('Community unavailable');
    service.getCommunityBySlug.mockRejectedValue(error);
    await expect(resolver.getCommunity('romania')).rejects.toBe(error);
  });
});

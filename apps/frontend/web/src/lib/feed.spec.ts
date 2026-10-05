import {
  appendUnique,
  FEED_PAGE_SIZE,
  feedHref,
  nextFeedVariables,
  parseFeedFilters,
} from './feed';
import type {
  BrowseFeedQuery,
  BrowseFeedQueryVariables,
} from '../graphql/generated/social';

const page: BrowseFeedQuery['feed'] = {
  __typename: 'PostPage',
  items: [],
  hasMore: true,
  nextCursor: 'anchor',
};
const variables: BrowseFeedQueryVariables = {
  sort: 'HOT',
  range: 'ALL',
  communitySlug: 'craft',
  cursor: null,
  offset: 0,
  limit: FEED_PAGE_SIZE,
};

describe('feed filters and pagination', () => {
  it.each([
    {},
    { sort: 'bad', range: 'DAY' },
    { sort: ['TOP', 'NEW'] },
    { sort: 'HOT', range: 'WEEK' },
  ])('normalizes unsupported or repeated filters %j', (params) => {
    expect(parseFeedFilters(params)).toEqual({ sort: 'HOT', range: 'ALL' });
  });
  it('keeps valid Top ranges and ignores ranges for New', () => {
    expect(parseFeedFilters({ sort: 'TOP', range: 'WEEK' })).toEqual({
      sort: 'TOP',
      range: 'WEEK',
    });
    expect(parseFeedFilters({ sort: 'TOP', range: ['DAY'] })).toEqual({
      sort: 'TOP',
      range: 'ALL',
    });
    expect(parseFeedFilters({ sort: 'NEW', range: 'MONTH' })).toEqual({
      sort: 'NEW',
      range: 'ALL',
    });
  });
  it('makes shareable URLs without irrelevant ranges', () => {
    expect(feedHref('/r/craft', { sort: 'TOP', range: 'DAY' })).toBe(
      '/r/craft?sort=TOP&range=DAY',
    );
    expect(feedHref('/', { sort: 'NEW', range: 'WEEK' })).toBe('/?sort=NEW');
  });
  it('advances Hot by the requested page size, not deduplicated item count', () => {
    expect(nextFeedVariables(page, variables, 20)).toEqual({
      ...variables,
      offset: 40,
      cursor: null,
    });
  });
  it('includes the valid offset 500 page, then stops at the backend cap', () => {
    expect(nextFeedVariables(page, variables, 480)?.offset).toBe(500);
    expect(nextFeedVariables(page, variables, 500)).toBeNull();
  });
  it.each(['NEW', 'TOP'] as const)('uses the server cursor for %s', (sort) => {
    expect(nextFeedVariables(page, { ...variables, sort }, 80)).toEqual({
      ...variables,
      sort,
      offset: 0,
      cursor: 'anchor',
    });
  });
  it('stops when the API signals the end or has no next cursor', () => {
    expect(
      nextFeedVariables({ ...page, hasMore: false }, variables, 0),
    ).toBeNull();
    expect(
      nextFeedVariables(
        { ...page, nextCursor: null },
        { ...variables, sort: 'NEW' },
        0,
      ),
    ).toBeNull();
  });
  it('merges overlaps in server order, replacing updated rows without mutating input', () => {
    const first = [
      { id: 'a', score: 1 },
      { id: 'b', score: 2 },
    ];
    expect(
      appendUnique(first, [
        { id: 'b', score: 3 },
        { id: 'c', score: 4 },
      ]),
    ).toEqual([
      { id: 'a', score: 1 },
      { id: 'b', score: 3 },
      { id: 'c', score: 4 },
    ]);
    expect(first[1].score).toBe(2);
  });
});

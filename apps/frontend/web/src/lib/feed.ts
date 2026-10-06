import type {
  BrowseFeedQuery,
  BrowseFeedQueryVariables,
  FeedRange,
  FeedSort,
} from '../graphql/generated/social';

export const FEED_PAGE_SIZE = 20;
export const COMMUNITY_PAGE_SIZE = 20;
export const PAGE_LOADING_MIN_MS = 700;
export const HOT_MAX_OFFSET = 500;
export type FeedFilters = { sort: FeedSort; range: FeedRange };
export type SearchParams = Record<string, string | string[] | undefined>;

export function parseFeedFilters(params: SearchParams): FeedFilters {
  const sort =
    params.sort === 'NEW' || params.sort === 'TOP' ? params.sort : 'HOT';
  const range =
    sort === 'TOP' &&
    (params.range === 'DAY' ||
      params.range === 'WEEK' ||
      params.range === 'MONTH')
      ? params.range
      : 'ALL';
  return { sort, range };
}

export function feedHref(path: string, { sort, range }: FeedFilters) {
  const params = new URLSearchParams({ sort });
  if (sort === 'TOP') params.set('range', range);
  return `${path}?${params}`;
}

export function nextFeedVariables(
  page: BrowseFeedQuery['feed'],
  variables: BrowseFeedQueryVariables,
  offset: number,
): BrowseFeedQueryVariables | null {
  if (!page.hasMore) return null;
  if (variables.sort === 'HOT') {
    const nextOffset = offset + FEED_PAGE_SIZE;
    return nextOffset <= HOT_MAX_OFFSET
      ? { ...variables, cursor: null, offset: nextOffset }
      : null;
  }
  return page.nextCursor
    ? { ...variables, offset: 0, cursor: page.nextCursor }
    : null;
}

export function appendUnique<T extends { id: string }>(
  previous: T[],
  incoming: T[],
): T[] {
  const rows = new Map(previous.map((item) => [item.id, item]));
  for (const item of incoming) rows.set(item.id, item);
  return [...rows.values()];
}

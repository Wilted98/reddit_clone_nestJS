'use client';

import { useQuery } from '@apollo/client/react';
import {
  ArrowDown,
  Clock3,
  Flame,
  RefreshCw,
  TrendingUp,
  UsersRound,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BrowseFeedDocument,
  BrowseFeedQueryVariables,
  CommunityDetailsDocument,
  CommunitySummaryFragment,
  FeedRange,
} from '../graphql/generated/social';
import { formatCount, formatDate } from '../lib/content';
import {
  appendUnique,
  feedHref,
  FeedFilters,
  FEED_PAGE_SIZE,
  nextFeedVariables,
} from '../lib/feed';
import { isNotFound } from '../lib/errors';
import { AppShell } from './app-shell';
import { CommunityBadge } from './community-badge';
import { PostCard } from './post-card';
import { QueryError, QueryLoading } from './query-feedback';
import { SocialRail } from './social-rail';
import { VoteGroup } from './voting';
import { useSession } from './session-provider';
import { recentKey, visitCommunity } from '../lib/recent-communities';

const PAGE_LOADING_MIN_MS = 700;

export function FeedScreen({
  filters,
  slug,
}: {
  filters: FeedFilters;
  slug?: string;
}) {
  return (
    <AppShell
      active={slug ? 'communities' : 'home'}
      title={slug ? `r/${slug}` : 'Good conversations start here.'}
    >
      <main id="content" className="social-layout">
        <section
          className="feed-column"
          aria-label={slug ? `r/${slug} feed` : 'Home feed'}
        >
          {slug ? (
            <CommunityFeed key={slug} slug={slug} filters={filters} />
          ) : (
            <>
              <div className="page-heading">
                <span className="section-label">YOUR DAILY CONVERSATIONS</span>
                <h1>Home</h1>
              </div>
              <FeedList
                key={`${filters.sort}:${filters.range}`}
                filters={filters}
              />
            </>
          )}
        </section>
        <SocialRail />
      </main>
    </AppShell>
  );
}

function CommunityFeed({
  slug,
  filters,
}: {
  slug: string;
  filters: FeedFilters;
}) {
  const { account, loading: sessionLoading } = useSession();
  const { data, loading, error, refetch } = useQuery(CommunityDetailsDocument, {
    variables: { slug },
    fetchPolicy: 'no-cache',
    ssr: false,
  });
  useEffect(() => {
    if (data?.community && !sessionLoading) {
      visitCommunity(recentKey(account?.id), data.community);
    }
  }, [data?.community, sessionLoading, account?.id]);
  if (loading) return <QueryLoading label="Loading community..." />;
  if (error)
    return isNotFound(error) ? (
      <div className="empty-state">
        <h1>Community not found</h1>
        <Link href="/communities" className="text-button">
          Browse communities
        </Link>
      </div>
    ) : (
      <QueryError
        error={error}
        retry={() => {
          void refetch().catch(() => undefined);
        }}
      />
    );
  if (!data) return null;
  return (
    <>
      <CommunityHeader community={data.community} />
      <FeedList
        key={`${slug}:${filters.sort}:${filters.range}`}
        slug={slug}
        filters={filters}
      />
    </>
  );
}

function CommunityHeader({
  community,
}: {
  community: CommunitySummaryFragment;
}) {
  return (
    <header className="community-heading">
      <div className="community-identity">
        <CommunityBadge value={community.slug} />
        <div>
          <span className="section-label">r/{community.slug}</span>
          <h1>{community.name}</h1>
        </div>
      </div>
      {community.description && (
        <p className="community-description">{community.description}</p>
      )}
      <div className="community-facts">
        <span>
          <UsersRound size={17} />
          {formatCount(community.memberCount)}{' '}
          {community.memberCount === 1 ? 'member' : 'members'}
        </span>
        <span>Created {formatDate(community.createdAt)}</span>
        <Link
          className="text-button"
          href={`/submit?${new URLSearchParams({ community: community.slug })}`}
        >
          <Plus size={17} />
          Create post
        </Link>
      </div>
    </header>
  );
}

function FeedList({ filters, slug }: { filters: FeedFilters; slug?: string }) {
  const router = useRouter();
  const path = slug ? `/r/${slug}` : '/';
  const variables = useMemo<BrowseFeedQueryVariables>(
    () => ({
      sort: filters.sort,
      range: filters.range,
      communitySlug: slug ?? null,
      cursor: null,
      offset: 0,
      limit: FEED_PAGE_SIZE,
    }),
    [filters.sort, filters.range, slug],
  );
  const { data, loading, error, refetch, fetchMore } = useQuery(
    BrowseFeedDocument,
    {
      variables,
      fetchPolicy: 'no-cache',
      ssr: false,
      notifyOnNetworkStatusChange: true,
    },
  );
  const [offset, setOffset] = useState(0);
  const lock = useRef(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const pending = pendingCount !== null;
  const [pageError, setPageError] = useState<unknown>(null);
  const [autoPaused, setAutoPaused] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const scrollTarget = useRef<string | null>(null);
  const next = useMemo(
    () => (data ? nextFeedVariables(data.feed, variables, offset) : null),
    [data, variables, offset],
  );

  const loadMore = useCallback(
    async (automatic = false) => {
      if (!next || lock.current) return;
      lock.current = true;
      const startedAt = performance.now();
      setPendingCount(data?.feed.items.length ?? 0);
      setPageError(null);
      try {
        const previousIds = new Set(data?.feed.items.map((post) => post.id));
        const response = await fetchMore({
          variables: next,
          updateQuery: (previous, { fetchMoreResult }) => ({
            feed: {
              ...fetchMoreResult.feed,
              items: appendUnique(
                previous.feed.items,
                fetchMoreResult.feed.items,
              ),
            },
          }),
        });
        const firstNewPost = response.data?.feed.items.find(
          (post) => !previousIds.has(post.id),
        );
        // Stop automatic paging if the server makes no visible progress.
        setAutoPaused(
          !firstNewPost ||
            (next.cursor != null &&
              response.data?.feed.nextCursor === next.cursor),
        );
        if (!automatic && firstNewPost) scrollTarget.current = firstNewPost.id;
        setOffset(next.offset);
      } catch (failure) {
        setPageError(failure);
      } finally {
        const remaining = PAGE_LOADING_MIN_MS - (performance.now() - startedAt);
        if (remaining > 0) {
          await new Promise<void>((resolve) =>
            window.setTimeout(resolve, remaining),
          );
        }
        lock.current = false;
        setPendingCount(null);
      }
    },
    [next, data, fetchMore],
  );

  useLayoutEffect(() => {
    if (pending || !scrollTarget.current) return;
    const article = document
      .getElementById(`post-${scrollTarget.current}`)
      ?.closest('article');
    if (!article || !results.current?.contains(article)) return;
    scrollTarget.current = null;
    article.focus({ preventScroll: true });
    article.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [data, pending]);

  useEffect(() => {
    const target = sentinel.current;
    if (
      !target ||
      !next ||
      loading ||
      pending ||
      error ||
      pageError !== null ||
      autoPaused ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries.some((entry) => entry.isIntersecting))
          void loadMore(true);
      },
      { rootMargin: '0px 0px 240px 0px' },
    );
    observer.observe(target);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [next, loading, pending, error, pageError, autoPaused, loadMore]);

  function refresh() {
    if (lock.current) return;
    lock.current = true;
    setPageError(null);
    void refetch()
      .then(() => {
        setOffset(0);
        setAutoPaused(false);
      })
      .catch(() => undefined)
      .finally(() => {
        lock.current = false;
      });
  }

  return (
    <>
      <div className="feed-toolbar">
        <nav className="feed-sort" aria-label="Feed sorting">
          {(
            [
              { sort: 'HOT', label: 'Hot', icon: Flame },
              { sort: 'NEW', label: 'New', icon: Clock3 },
              { sort: 'TOP', label: 'Top', icon: TrendingUp },
            ] as const
          ).map(({ sort, label, icon: Icon }) => (
            <Link
              key={sort}
              href={feedHref(path, { sort, range: filters.range })}
              className={filters.sort === sort ? 'selected' : ''}
              aria-current={filters.sort === sort ? 'page' : undefined}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <button
          className="icon-button"
          title="Refresh feed"
          aria-label="Refresh feed"
          disabled={loading || pending}
          onClick={refresh}
        >
          <RefreshCw size={19} />
        </button>
        {filters.sort === 'TOP' && (
          <label className="range-control">
            Time range
            <select
              value={filters.range}
              onChange={(event) =>
                router.push(
                  feedHref(path, {
                    sort: 'TOP',
                    range: event.target.value as FeedRange,
                  }),
                )
              }
            >
              <option value="ALL">All time</option>
              <option value="DAY">Today</option>
              <option value="WEEK">This week</option>
              <option value="MONTH">This month</option>
            </select>
          </label>
        )}
      </div>
      {loading && !data && <QueryLoading label="Loading posts..." />}
      {error && !pending && !pageError && (
        <QueryError error={error} retry={refresh} pending={loading} />
      )}
      {data && (
        <div className="feed-results" ref={results}>
          {!data.feed.items.length ? (
            <div className="empty-state">
              <h2>No posts yet</h2>
              <Link href="/communities" className="text-button">
                Explore communities
              </Link>
            </div>
          ) : (
            <VoteGroup
              kind="post"
              ids={(pendingCount === null
                ? data.feed.items
                : data.feed.items.slice(0, pendingCount)
              ).map((post) => post.id)}
            >
              <div className="post-list" aria-busy={pending}>
                {(pendingCount === null
                  ? data.feed.items
                  : data.feed.items.slice(0, pendingCount)
                ).map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </VoteGroup>
          )}
          {pageError !== null && !pending && (
            <QueryError
              error={pageError}
              retry={() => {
                void loadMore();
              }}
              pending={pending}
            />
          )}
          {(next || pending) && (
            <div>
              <div
                className="feed-sentinel"
                ref={sentinel}
                aria-hidden="true"
              />
              {pending && (
                <div className="feed-page-loading">
                  <QueryLoading label="Loading more posts..." />
                </div>
              )}
              <button
                className="secondary-button load-more"
                onClick={() => {
                  void loadMore();
                }}
                disabled={loading || pending}
              >
                <ArrowDown size={17} />
                {pending ? 'Loading...' : 'Load more posts'}
              </button>
            </div>
          )}
          {data.feed.items.length > 0 && !next && !pending && (
            <p className="end-of-list">
              {data.feed.hasMore && filters.sort === 'HOT'
                ? 'End of this Hot view.'
                : 'You are all caught up.'}
            </p>
          )}
        </div>
      )}
    </>
  );
}

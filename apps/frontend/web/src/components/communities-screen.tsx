'use client';

import { useQuery } from '@apollo/client/react';
import { ArrowDown, ArrowUpRight, Compass, UsersRound } from 'lucide-react';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { BrowseCommunitiesDocument } from '../graphql/generated/social';
import { formatCount } from '../lib/content';
import {
  appendUnique,
  COMMUNITY_PAGE_SIZE,
  PAGE_LOADING_MIN_MS,
} from '../lib/feed';
import { AppShell } from './app-shell';
import { CommunityBadge } from './community-badge';
import { QueryError, QueryLoading } from './query-feedback';
import { SocialRail } from './social-rail';

export function CommunitiesScreen() {
  const { data, loading, error, refetch, fetchMore } = useQuery(
    BrowseCommunitiesDocument,
    {
      variables: { limit: COMMUNITY_PAGE_SIZE },
      fetchPolicy: 'no-cache',
      ssr: false,
      notifyOnNetworkStatusChange: true,
    },
  );
  const lock = useRef(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const pending = pendingCount !== null;
  const [pageError, setPageError] = useState<unknown>(null);
  const [autoPaused, setAutoPaused] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const scrollTarget = useRef<string | null>(null);
  const cursor = data?.communities.hasMore ? data.communities.nextCursor : null;
  const loadMore = useCallback(
    async (automatic = false) => {
      if (!cursor || lock.current) return;
      lock.current = true;
      const startedAt = performance.now();
      setPendingCount(data?.communities.items.length ?? 0);
      setPageError(null);
      try {
        const previousIds = new Set(
          data?.communities.items.map((item) => item.id),
        );
        const response = await fetchMore({
          variables: { cursor },
          updateQuery: (previous, { fetchMoreResult }) => ({
            communities: {
              ...fetchMoreResult.communities,
              items: appendUnique(
                previous.communities.items,
                fetchMoreResult.communities.items,
              ),
            },
          }),
        });
        const firstNewCommunity = response.data?.communities.items.find(
          (item) => !previousIds.has(item.id),
        );
        // Stop automatic paging when the server makes no visible progress.
        setAutoPaused(
          !firstNewCommunity ||
            response.data?.communities.nextCursor === cursor,
        );
        if (!automatic && firstNewCommunity)
          scrollTarget.current = firstNewCommunity.id;
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
    [cursor, data, fetchMore],
  );

  useLayoutEffect(() => {
    if (pending || !scrollTarget.current) return;
    const card = Array.from(
      results.current?.querySelectorAll<HTMLAnchorElement>('.community-card') ??
        [],
    ).find((item) => item.dataset.communityId === scrollTarget.current);
    if (!card) return;
    scrollTarget.current = null;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [data, pending]);

  useEffect(() => {
    const target = sentinel.current;
    if (
      !target ||
      !cursor ||
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
  }, [cursor, loading, pending, error, pageError, autoPaused, loadMore]);
  return (
    <AppShell active="communities" title="Find your people.">
      <main id="content" className="social-layout">
        <section
          className="directory-column"
          aria-labelledby="directory-heading"
        >
          <div className="page-heading">
            <span className="section-label">
              <Compass size={16} />A PLACE FOR EVERY INTEREST
            </span>
            <h1 id="directory-heading">Communities</h1>
          </div>
          {loading && !data && <QueryLoading label="Loading communities..." />}
          {error && !pending && !pageError && (
            <QueryError
              error={error}
              retry={() => {
                void refetch().catch(() => undefined);
              }}
              pending={loading}
            />
          )}
          {data && (
            <>
              <div
                className="community-grid directory-results"
                ref={results}
                aria-busy={pending}
              >
                {data.communities.items
                  .slice(0, pendingCount ?? undefined)
                  .map((community) => (
                    <Link
                      href={`/r/${community.slug}`}
                      key={community.id}
                      className="community-card"
                      data-community-id={community.id}
                    >
                      <div className="community-card-top">
                        <CommunityBadge value={community.slug} />
                        <ArrowUpRight size={20} />
                      </div>
                      <span className="community-slug">r/{community.slug}</span>
                      <h2>{community.name}</h2>
                      {community.description && <p>{community.description}</p>}
                      <span className="community-card-count">
                        <UsersRound size={16} />
                        {formatCount(community.memberCount)}{' '}
                        {community.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </Link>
                  ))}
              </div>
              {!data.communities.items.length && (
                <div className="empty-state">
                  <h2>No communities yet</h2>
                </div>
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
              <div
                className="feed-sentinel"
                ref={sentinel}
                aria-hidden="true"
              />
              {pending && (
                <div className="feed-page-loading">
                  <QueryLoading label="Loading more communities..." />
                </div>
              )}
              {(cursor || pending) && (
                <button
                  className="secondary-button load-more"
                  onClick={() => {
                    void loadMore();
                  }}
                  disabled={loading || pending}
                >
                  <ArrowDown size={17} />
                  {pending ? 'Loading...' : 'Load more communities'}
                </button>
              )}
              {!!data.communities.items.length && !cursor && !pending && (
                <p className="end-of-list">All communities loaded.</p>
              )}
            </>
          )}
        </section>
        <SocialRail />
      </main>
    </AppShell>
  );
}

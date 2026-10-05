'use client';

import { useQuery } from '@apollo/client/react';
import { ArrowDown, ArrowUpRight, Compass, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { BrowseCommunitiesDocument } from '../graphql/generated/social';
import { formatCount } from '../lib/content';
import { appendUnique, COMMUNITY_PAGE_SIZE } from '../lib/feed';
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
  const [pending, setPending] = useState(false);
  const [pageError, setPageError] = useState<unknown>(null);
  const cursor = data?.communities.hasMore ? data.communities.nextCursor : null;
  async function loadMore() {
    if (!cursor || lock.current) return;
    lock.current = true;
    setPending(true);
    setPageError(null);
    try {
      await fetchMore({
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
    } catch (failure) {
      setPageError(failure);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
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
              <div className="community-grid" aria-busy={pending}>
                {data.communities.items.map((community) => (
                  <Link
                    href={`/r/${community.slug}`}
                    key={community.id}
                    className="community-card"
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
              {pageError !== null && (
                <QueryError
                  error={pageError}
                  retry={() => {
                    void loadMore();
                  }}
                  pending={pending}
                />
              )}
              {cursor && (
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
              {!!data.communities.items.length && !cursor && (
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

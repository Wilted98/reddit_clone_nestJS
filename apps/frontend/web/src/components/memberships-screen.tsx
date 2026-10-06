'use client';

import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { ArrowDown, Compass, LogOut, Plus, UsersRound } from 'lucide-react';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  JoinedCommunitiesDocument,
  JoinedCommunityFragment,
  LeaveCommunityDocument,
  SubscribedCommunitiesDocument,
} from '../graphql/generated/social';
import { formatCount } from '../lib/content';
import {
  isForbidden,
  isUnauthenticated,
  socialActionError,
} from '../lib/errors';
import {
  appendUnique,
  COMMUNITY_PAGE_SIZE,
  PAGE_LOADING_MIN_MS,
} from '../lib/feed';
import { AppShell } from './app-shell';
import { CommunityBadge } from './community-badge';
import { ConfirmationDialog } from './confirmation-dialog';
import { QueryError, QueryLoading } from './query-feedback';
import { useSession } from './session-provider';
import { SocialRail } from './social-rail';

export function MembershipsScreen() {
  const { account, loading } = useSession();
  return (
    <AppShell active="communities" title="Your communities">
      <main id="content" className="social-layout">
        <section
          className="directory-column"
          aria-label="Community memberships"
        >
          <div className="page-heading directory-heading">
            <h1>Your communities</h1>
            <Link href="/communities/new" className="primary-button">
              <Plus size={17} /> Create community
            </Link>
          </div>
          <Link href="/communities" className="text-button discussion-back">
            <Compass size={17} /> Browse communities
          </Link>
          {loading && !account ? (
            <QueryLoading label="Restoring session..." />
          ) : account ? (
            <MembershipList key={account.id} accountId={account.id} />
          ) : (
            <div className="empty-state">
              <Link className="primary-button" href="/account">
                <LogOut size={17} /> Sign in to see your communities
              </Link>
            </div>
          )}
        </section>
        <SocialRail />
      </main>
    </AppShell>
  );
}

function MembershipList({ accountId }: { accountId: string }) {
  const session = useSession();
  const social = useApolloClient();
  const { data, loading, error, refetch, fetchMore } = useQuery(
    JoinedCommunitiesDocument,
    {
      variables: { cursor: null, limit: COMMUNITY_PAGE_SIZE },
      fetchPolicy: 'no-cache',
      context: { queryDeduplication: false },
      ssr: false,
      notifyOnNetworkStatusChange: true,
    },
  );
  const [leave] = useMutation(LeaveCommunityDocument, {
    fetchPolicy: 'no-cache',
  });
  const [selected, setSelected] = useState<JoinedCommunityFragment | null>(
    null,
  );
  const [leaving, setLeaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Keep confirmed departures out of overlapping or stale subsequent pages.
  const [left, setLeft] = useState<Set<string>>(() => new Set());
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [pageError, setPageError] = useState<unknown>(null);
  const [autoPaused, setAutoPaused] = useState(false);
  const active = useRef(true);
  const lock = useRef(false);
  const checkedFailure = useRef<unknown>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const fallback = useRef<HTMLHeadingElement>(null);
  const results = useRef<HTMLUListElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const scrollTarget = useRef<string | null>(null);
  const pending = pendingCount !== null;
  const cursor = data?.myCommunities.hasMore
    ? data.myCommunities.nextCursor
    : null;
  const busy = pending || leaving || loading || session.loading;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      error &&
      checkedFailure.current !== error &&
      (isForbidden(error) || isUnauthenticated(error))
    ) {
      checkedFailure.current = error;
      void session.refresh();
    }
  }, [error, session]);

  const more = useCallback(
    async (automatic = false) => {
      if (!cursor || lock.current) return;
      lock.current = true;
      const startedAt = performance.now();
      setPendingCount(data?.myCommunities.items.length ?? 0);
      setPageError(null);
      try {
        const previousIds = new Set(
          data?.myCommunities.items.map((item) => item.id),
        );
        const response = await fetchMore({
          variables: { cursor },
          updateQuery: (previous, { fetchMoreResult }) => ({
            myCommunities: {
              ...fetchMoreResult.myCommunities,
              items: appendUnique(
                previous.myCommunities.items,
                fetchMoreResult.myCommunities.items,
              ),
            },
          }),
        });
        if (!active.current) return;
        const first = response.data?.myCommunities.items.find(
          (item) => !previousIds.has(item.id) && !left.has(item.id),
        );
        setAutoPaused(
          !first || response.data?.myCommunities.nextCursor === cursor,
        );
        if (!automatic && first) scrollTarget.current = first.id;
      } catch (error) {
        if (!active.current) return;
        setPageError(error);
        if (isForbidden(error) || isUnauthenticated(error))
          void session.refresh();
      } finally {
        const remaining = PAGE_LOADING_MIN_MS - (performance.now() - startedAt);
        if (remaining > 0)
          await new Promise<void>((resolve) =>
            window.setTimeout(resolve, remaining),
          );
        lock.current = false;
        if (active.current) setPendingCount(null);
      }
    },
    [cursor, data, fetchMore, left, session],
  );

  useLayoutEffect(() => {
    if (pending || !scrollTarget.current) return;
    const link = Array.from(
      results.current?.querySelectorAll<HTMLAnchorElement>(
        '[data-community-id]',
      ) ?? [],
    ).find((item) => item.dataset.communityId === scrollTarget.current);
    if (!link) return;
    scrollTarget.current = null;
    link.focus({ preventScroll: true });
    link.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [data, pending]);

  useEffect(() => {
    const target = sentinel.current;
    if (
      !target ||
      !cursor ||
      busy ||
      selected ||
      error ||
      pageError !== null ||
      autoPaused ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    let observing = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (observing && entries.some((entry) => entry.isIntersecting))
          void more(true);
      },
      { rootMargin: '0px 0px 240px 0px' },
    );
    observer.observe(target);
    return () => {
      observing = false;
      observer.disconnect();
    };
  }, [cursor, busy, selected, error, pageError, autoPaused, more]);

  async function confirmLeave() {
    if (!selected || selected.ownerId === accountId || busy || lock.current)
      return;
    lock.current = true;
    setLeaving(true);
    setFailure(null);
    try {
      const result = (await leave({ variables: { slug: selected.slug } })).data
        ?.leaveCommunity;
      if (!active.current) return;
      if (
        !result ||
        result.id !== selected.id ||
        result.slug !== selected.slug ||
        result.ownerId === accountId
      )
        throw new Error('Missing community response');
      setLeft((previous) => new Set(previous).add(result.id));
      setSelected(null);
      void social
        .refetchQueries({ include: [SubscribedCommunitiesDocument] })
        .catch(() => undefined);
    } catch (error) {
      if (!active.current) return;
      setFailure(socialActionError(error));
      if (isForbidden(error) || isUnauthenticated(error))
        await session.refresh();
    } finally {
      lock.current = false;
      if (active.current) setLeaving(false);
    }
  }

  const items =
    data?.myCommunities.items
      .slice(0, pendingCount ?? undefined)
      .filter((item) => !left.has(item.id)) ?? [];
  return (
    <>
      <h2 className="membership-list-heading" ref={fallback} tabIndex={-1}>
        Joined communities
      </h2>
      {loading && !data && <QueryLoading label="Loading your communities..." />}
      {error && !data && (
        <QueryError
          error={error}
          pending={loading}
          retry={() => {
            void refetch().catch(() => undefined);
          }}
        />
      )}
      {data && (
        <>
          <ul
            className="membership-list"
            ref={results}
            aria-busy={pending || leaving}
          >
            {items.map((community) => (
              <li className="membership-row" key={community.id}>
                <CommunityBadge value={community.slug} />
                <div className="membership-details">
                  <Link
                    className="membership-link"
                    href={`/r/${encodeURIComponent(community.slug)}`}
                    data-community-id={community.id}
                  >
                    <span className="community-slug">r/{community.slug}</span>
                    <h3>{community.name}</h3>
                  </Link>
                  {community.description && <p>{community.description}</p>}
                  <span className="community-card-count">
                    <UsersRound size={16} />{' '}
                    {formatCount(community.memberCount)}{' '}
                    {community.memberCount === 1 ? 'member' : 'members'}
                  </span>
                </div>
                <div className="membership-actions">
                  <span className="membership-status">
                    {community.ownerId === accountId ? 'Owner' : 'Joined'}
                  </span>
                  {community.ownerId !== accountId && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      aria-label={`Leave r/${community.slug}`}
                      onClick={(event) => {
                        trigger.current = event.currentTarget;
                        setFailure(null);
                        setSelected(community);
                      }}
                    >
                      <LogOut size={17} /> Leave
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!items.length && !pending && (
            <div className="empty-state">
              <h2>
                {cursor
                  ? 'No communities on this page'
                  : 'No joined communities'}
              </h2>
            </div>
          )}
          {pageError !== null && !pending && (
            <QueryError
              error={pageError}
              retry={() => {
                void more();
              }}
            />
          )}
          <div className="feed-sentinel" ref={sentinel} aria-hidden="true" />
          {pending && (
            <div className="feed-page-loading">
              <QueryLoading label="Loading more communities..." />
            </div>
          )}
          {(cursor || pending) && (
            <button
              className="secondary-button load-more"
              disabled={busy || !!selected}
              onClick={() => {
                void more();
              }}
            >
              <ArrowDown size={17} />
              {pending ? 'Loading...' : 'Load more communities'}
            </button>
          )}
          {!!items.length && !cursor && !pending && (
            <p className="end-of-list">All joined communities loaded.</p>
          )}
        </>
      )}
      {selected && (
        <ConfirmationDialog
          title={`Leave r/${selected.slug}?`}
          description="Your posts and comments will stay in the community. You can join again later."
          confirmLabel="Confirm leave community"
          pendingLabel="Leaving..."
          icon={<LogOut size={17} />}
          pending={leaving || session.loading}
          onConfirm={() => {
            void confirmLeave();
          }}
          onCancel={() => {
            setSelected(null);
            setFailure(null);
          }}
          trigger={trigger}
          fallback={fallback}
        >
          {failure && (
            <p className="error-message" role="alert">
              {failure}
            </p>
          )}
        </ConfirmationDialog>
      )}
    </>
  );
}

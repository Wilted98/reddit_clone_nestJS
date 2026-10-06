'use client';

import { useQuery } from '@apollo/client/react';
import { ChevronDown, ChevronUp, RefreshCw, ArrowDown } from 'lucide-react';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { SubscribedCommunitiesDocument } from '../graphql/generated/social';
import { appendUnique } from '../lib/feed';
import { isForbidden, isUnauthenticated } from '../lib/errors';
import {
  parseRecent,
  readRecent,
  recentKey,
  RECENT_COMMUNITIES_EVENT,
  RecentCommunity,
} from '../lib/recent-communities';
import { CommunityBadge } from './community-badge';
import { useSession } from './session-provider';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(RECENT_COMMUNITIES_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(RECENT_COMMUNITIES_EVENT, callback);
  };
}
const serverSnapshot = () => null;

function CommunityLinks({ items }: { items: RecentCommunity[] }) {
  return (
    <ul className="shortcut-list">
      {items.map((item) => (
        <li key={item.slug}>
          <Link
            href={`/r/${encodeURIComponent(item.slug)}`}
            title={`r/${item.slug} - ${item.name}`}
          >
            <CommunityBadge value={item.slug} />
            <span className="shortcut-label">r/{item.slug}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ShortcutSection({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(true);
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <section aria-label={label}>
      <h2>
        <button
          type="button"
          className="shortcut-section-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {title}
          <Chevron size={16} aria-hidden="true" />
        </button>
      </h2>
      <div id={id} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}

export function CommunityShortcuts() {
  const { account, loading } = useSession();
  const key = recentKey(account?.id);
  const snapshot = useSyncExternalStore(
    subscribe,
    useCallback(() => readRecent(key), [key]),
    serverSnapshot,
  );
  const recent = parseRecent(snapshot);
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <button
        type="button"
        className="text-button shortcut-toggle"
        aria-expanded={expanded}
        aria-controls="community-shortcuts"
        onClick={() => setExpanded(!expanded)}
      >
        Community shortcuts <ChevronDown size={17} />
      </button>
      <div
        id="community-shortcuts"
        className={`sidebar-communities ${expanded ? 'expanded' : ''}`}
      >
        <ShortcutSection
          label="Recently visited communities"
          title="Recently visited"
        >
          {!loading && recent.length ? (
            <CommunityLinks items={recent} />
          ) : (
            <p className="shortcut-empty">
              {loading ? 'Loading...' : 'No recent visits yet.'}
            </p>
          )}
        </ShortcutSection>
        <ShortcutSection
          label="Subscribed communities"
          title="Your communities"
        >
          {account ? (
            <Subscriptions key={account.id} />
          ) : (
            <p className="shortcut-empty">
              {loading ? 'Loading...' : <Link href="/account">Sign in</Link>}
            </p>
          )}
        </ShortcutSection>
      </div>
    </>
  );
}

function Subscriptions() {
  const { refresh } = useSession();
  const { data, loading, error, refetch, fetchMore } = useQuery(
    SubscribedCommunitiesDocument,
    {
      variables: { cursor: null, limit: 20 },
      fetchPolicy: 'no-cache',
      ssr: false,
      notifyOnNetworkStatusChange: true,
    },
  );
  const [pending, setPending] = useState(false);
  const [pageFailed, setPageFailed] = useState(false);
  const lock = useRef(false);
  const checkedFailure = useRef<unknown>(null);
  useEffect(() => {
    if (
      error &&
      checkedFailure.current !== error &&
      (isForbidden(error) || isUnauthenticated(error))
    ) {
      checkedFailure.current = error;
      void refresh();
    }
  }, [error, refresh]);
  async function more() {
    if (lock.current || !data?.myCommunities.nextCursor) return;
    lock.current = true;
    setPending(true);
    setPageFailed(false);
    try {
      await fetchMore({
        variables: { cursor: data.myCommunities.nextCursor },
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
    } catch {
      setPageFailed(true);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <>
      {data && <CommunityLinks items={data.myCommunities.items} />}
      {loading && !data && (
        <p className="shortcut-empty" role="status">
          Loading communities...
        </p>
      )}
      {data?.myCommunities.items.length === 0 && (
        <p className="shortcut-empty">No joined communities yet.</p>
      )}
      {error && !pageFailed && (
        <button
          className="text-button shortcut-retry"
          type="button"
          disabled={loading}
          onClick={() => {
            void refetch().catch(() => undefined);
          }}
        >
          <RefreshCw size={14} />
          Retry communities
        </button>
      )}
      {(data?.myCommunities.hasMore || pageFailed) && (
        <button
          className="text-button shortcut-more"
          type="button"
          disabled={pending || (loading && !pageFailed)}
          onClick={() => {
            void more();
          }}
        >
          <ArrowDown size={14} />
          {pending
            ? 'Loading...'
            : pageFailed
              ? 'Retry more communities'
              : 'More communities'}
        </button>
      )}
    </>
  );
}

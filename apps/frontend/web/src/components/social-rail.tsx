'use client';

import { useQuery } from '@apollo/client/react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, MessagesSquare } from 'lucide-react';
import { BrowseCommunitiesDocument } from '../graphql/generated/social';
import { formatCount } from '../lib/content';
import { CommunityBadge } from './community-badge';
import { QueryError, QueryLoading } from './query-feedback';

export function SocialRail() {
  const { data, loading, error, refetch } = useQuery(
    BrowseCommunitiesDocument,
    { variables: { limit: 5 }, fetchPolicy: 'no-cache', ssr: false },
  );
  return (
    <aside
      className="social-rail"
      aria-label="Community discovery"
      tabIndex={0}
    >
      <section className="rail-welcome">
        <div className="rail-photo">
          <Image
            src="/community-plaza.png"
            alt="People chatting in a colorful community plaza"
            fill
            sizes="300px"
            priority
          />
        </div>
        <span className="section-label">
          <MessagesSquare size={15} />
          ROORIN
        </span>
        <h2>A place to belong.</h2>
        <Link href="/communities" className="text-button">
          Explore communities
          <ArrowRight size={17} />
        </Link>
      </section>
      <section
        className="popular-communities"
        aria-labelledby="popular-heading"
      >
        <h2 id="popular-heading">Popular communities</h2>
        {loading && <QueryLoading label="Loading communities..." />}
        {error && (
          <QueryError
            error={error}
            retry={() => {
              void refetch().catch(() => undefined);
            }}
            pending={loading}
          />
        )}
        {data && (
          <ul>
            {data.communities.items.map((community) => (
              <li key={community.id}>
                <Link href={`/r/${community.slug}`}>
                  <CommunityBadge value={community.slug} />
                  <span>
                    <strong>r/{community.slug}</strong>
                    <small>
                      {formatCount(community.memberCount)}{' '}
                      {community.memberCount === 1 ? 'member' : 'members'}
                    </small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data && !data.communities.items.length && (
          <p className="muted">No communities yet.</p>
        )}
      </section>
    </aside>
  );
}

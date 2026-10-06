'use client';

import { useQuery } from '@apollo/client/react';
import { CalendarDays, FileText, MessageCircle, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PublicProfileDocument } from '../graphql/generated/auth';
import { createPublicProfileClient } from '../lib/apollo';
import { formatDate } from '../lib/content';
import { isNotFound } from '../lib/errors';
import { ActivityTab, profileHref } from '../lib/profile';
import { AppShell } from './app-shell';
import { ProfileActivity } from './profile-activity';
import { ProfileAvatar } from './profile-avatar';
import { QueryError, QueryLoading } from './query-feedback';
import { useSession } from './session-provider';

export function ProfileScreen({
  username,
  tab,
}: {
  username: string;
  tab: ActivityTab;
}) {
  const [client] = useState(createPublicProfileClient);
  const { account } = useSession();
  const { data, loading, error, refetch } = useQuery(PublicProfileDocument, {
    client,
    variables: { username },
    fetchPolicy: 'no-cache',
    ssr: false,
  });
  // Unvisited activity tabs do not query; visited tabs retain their own pages.
  const [visited, setVisited] = useState<ActivityTab[]>([tab]);
  if (!visited.includes(tab)) setVisited([...visited, tab]);
  const profile = data?.user;
  return (
    <AppShell
      active={profile && account?.id === profile.id ? 'profile' : null}
      title={`u/${username}`}
    >
      <main id="content" className="profile-layout">
        {loading && !profile ? (
          <QueryLoading label="Loading profile..." />
        ) : error ? (
          isNotFound(error) ? (
            <div className="empty-state">
              <h1>Profile not found</h1>
              <Link className="text-button" href="/">
                Back to Home
              </Link>
            </div>
          ) : (
            <QueryError
              error={error}
              retry={() => {
                void refetch().catch(() => undefined);
              }}
            />
          )
        ) : (
          profile && (
            <>
              <header className="profile-heading">
                <div className="profile-identity">
                  <ProfileAvatar
                    username={profile.username}
                    avatarUrl={profile.avatarUrl}
                  />
                  <div>
                    <span className="section-label">PROFILE</span>
                    <h1>u/{profile.username}</h1>
                  </div>
                </div>
                {profile.bio && <p className="profile-bio">{profile.bio}</p>}
                <div className="profile-facts">
                  <span>
                    <CalendarDays size={17} /> Joined{' '}
                    {formatDate(profile.createdAt)}
                  </span>
                  {account?.id === profile.id && (
                    <Link
                      className="text-button"
                      href="/account#profile-settings"
                    >
                      <Pencil size={16} /> Edit profile
                    </Link>
                  )}
                </div>
              </header>
              <nav
                className="feed-sort profile-tabs"
                aria-label="Profile activity"
              >
                <Link
                  href={profileHref(username)}
                  className={tab === 'posts' ? 'selected' : ''}
                  aria-current={tab === 'posts' ? 'page' : undefined}
                >
                  <FileText size={17} /> Posts
                </Link>
                <Link
                  href={profileHref(username, 'comments')}
                  className={tab === 'comments' ? 'selected' : ''}
                  aria-current={tab === 'comments' ? 'page' : undefined}
                >
                  <MessageCircle size={17} /> Comments
                </Link>
              </nav>
              {(['posts', 'comments'] as const)
                .filter((kind) => visited.includes(kind) || kind === tab)
                .map((kind) => (
                  <section
                    key={`${profile.id}:${kind}`}
                    hidden={kind !== tab}
                    aria-label={`${kind === 'posts' ? 'Posts' : 'Comments'} by ${profile.username}`}
                  >
                    <ProfileActivity authorId={profile.id} kind={kind} />
                  </section>
                ))}
            </>
          )
        )}
      </main>
    </AppShell>
  );
}

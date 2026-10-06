'use client';

import Image from 'next/image';
import { useState } from 'react';
import { safeExternalLink } from '../lib/content';
import { CommunityBadge } from './community-badge';

export function ProfileAvatar({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl?: string | null;
}) {
  const source = safeExternalLink(avatarUrl ?? null)?.href;
  return <AvatarImage key={source} username={username} source={source} />;
}

function AvatarImage({
  username,
  source,
}: {
  username: string;
  source?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="profile-avatar">
      {source && !failed ? (
        <Image
          src={source}
          alt={`${username}'s avatar`}
          fill
          sizes="72px"
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <CommunityBadge value={username} />
      )}
    </span>
  );
}

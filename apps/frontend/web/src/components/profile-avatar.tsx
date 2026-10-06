'use client';

import Image from 'next/image';
import { useState } from 'react';
import { safeExternalLink } from '../lib/content';
import { CommunityBadge } from './community-badge';

export function ProfileAvatar({
  username,
  avatarUrl,
  sizes = '72px',
}: {
  username: string;
  avatarUrl?: string | null;
  sizes?: string;
}) {
  const source = safeExternalLink(avatarUrl ?? null)?.href;
  return (
    <AvatarImage
      key={source}
      username={username}
      source={source}
      sizes={sizes}
    />
  );
}

function AvatarImage({
  username,
  source,
  sizes,
}: {
  username: string;
  source?: string;
  sizes: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="profile-avatar">
      {source && !failed ? (
        <Image
          src={source}
          alt={`${username}'s avatar`}
          fill
          sizes={sizes}
          loading="lazy"
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

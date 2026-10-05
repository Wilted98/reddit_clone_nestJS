import { ExternalLink, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { BrowseFeedQuery } from '../graphql/generated/social';
import { formatCount, formatDate, safeExternalLink } from '../lib/content';
import { CommunityBadge } from './community-badge';
import { VoteControls } from './voting';

export function PostCard({
  post,
  detail = false,
  children,
}: {
  post: BrowseFeedQuery['feed']['items'][number];
  detail?: boolean;
  children?: ReactNode;
}) {
  const link = safeExternalLink(post.url);
  return (
    <article
      className={`post-card ${detail ? '' : 'post-card-linked'}`}
      tabIndex={-1}
      aria-labelledby={`post-${post.id}`}
      data-testid={`post-${post.id}`}
    >
      <div className="post-meta">
        <CommunityBadge value={post.authorUsername} />
        <span>
          <strong>u/{post.authorUsername}</strong>
          <span className="post-origin">
            <Link href={`/r/${encodeURIComponent(post.communitySlug)}`}>
              r/{post.communitySlug}
            </Link>
            <span aria-hidden="true"> · </span>
            <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
          </span>
        </span>
        {post.editedAt && (
          <span
            className="edited-label"
            title={`Edited ${formatDate(post.editedAt)}`}
          >
            Edited
          </span>
        )}
      </div>
      {detail ? (
        <h1 id={`post-${post.id}`}>{post.title}</h1>
      ) : (
        <h2 id={`post-${post.id}`}>
          <Link
            className="post-discussion-link"
            href={`/posts/${encodeURIComponent(post.id)}`}
          >
            {post.title}
          </Link>
        </h2>
      )}
      {post.body &&
        (!detail && post.body.length > 320 ? (
          <>
            <p className="post-body">{post.body.slice(0, 320)}...</p>
            <details className="post-expanded">
              <summary>Read full post</summary>
              <p className="post-body">{post.body}</p>
            </details>
          </>
        ) : (
          <p className="post-body">{post.body}</p>
        ))}
      {link && (
        <a
          className="post-link"
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={17} />
          <span>{link.host}</span>
        </a>
      )}
      <div className="post-stats">
        {children ?? (
          <>
            <VoteControls kind="post" id={post.id} score={post.score} />
            <Link
              className="comment-pill"
              href={`/posts/${encodeURIComponent(post.id)}#comments`}
              aria-label={`${post.commentCount} comments`}
            >
              <MessageCircle size={17} />
              {formatCount(post.commentCount)}
            </Link>
          </>
        )}
      </div>
    </article>
  );
}

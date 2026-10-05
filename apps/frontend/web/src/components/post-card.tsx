import { ArrowUp, ExternalLink, MessageCircle } from 'lucide-react';
import type { BrowseFeedQuery } from '../graphql/generated/social';
import { formatCount, formatDate, safeExternalLink } from '../lib/content';
import { CommunityBadge } from './community-badge';

export function PostCard({
  post,
}: {
  post: BrowseFeedQuery['feed']['items'][number];
}) {
  const link = safeExternalLink(post.url);
  return (
    <article
      className="post-card"
      tabIndex={-1}
      aria-labelledby={`post-${post.id}`}
      data-testid={`post-${post.id}`}
    >
      <div className="post-meta">
        <CommunityBadge value={post.authorUsername} />
        <span>
          <strong>u/{post.authorUsername}</strong>
          <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
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
      <h2 id={`post-${post.id}`}>{post.title}</h2>
      {post.body &&
        (post.body.length > 320 ? (
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
        <span aria-label={`${post.score} score`}>
          <ArrowUp size={17} />
          {formatCount(post.score)}
        </span>
        <span aria-label={`${post.commentCount} comments`}>
          <MessageCircle size={17} />
          {formatCount(post.commentCount)}
        </span>
      </div>
    </article>
  );
}

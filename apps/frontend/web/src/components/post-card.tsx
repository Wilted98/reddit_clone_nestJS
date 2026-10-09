import { ExternalLink, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { BrowseFeedQuery } from '../graphql/generated/social';
import { formatCount, formatDate, safeExternalLink } from '../lib/content';
import { ProfileAvatar } from './profile-avatar';
import { VoteControls } from './voting';
import { profileHref } from '../lib/profile';
import { PostBody } from './post-body';

export function PostCard({
  post,
  detail = false,
  children,
  footer,
}: {
  post: BrowseFeedQuery['feed']['items'][number];
  detail?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
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
        <ProfileAvatar
          username={post.authorUsername}
          avatarUrl={post.authorAvatarUrl}
          sizes="42px"
        />
        <span>
          <Link className="author-link" href={profileHref(post.authorUsername)}>
            <strong>u/{post.authorUsername}</strong>
          </Link>
          <span className="post-origin">
            <Link
              className="community-link"
              href={`/r/${encodeURIComponent(post.communitySlug)}`}
            >
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
      {post.body && (
        <PostBody
          key={post.body}
          body={post.body}
          id={`post-body-${post.id}`}
          expandable={!detail}
        />
      )}
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
      {footer}
    </article>
  );
}

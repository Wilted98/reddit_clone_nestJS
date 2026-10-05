'use client';

import { useQuery } from '@apollo/client/react';
import {
  ArrowDown,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Reply,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  DiscussionCommentFragment,
  DiscussionDocument,
  ThreadCommentsDocument,
} from '../graphql/generated/social';
import { formatDate } from '../lib/content';
import { COMMENT_PAGE_SIZE } from '../lib/discussion';
import { isNotFound } from '../lib/errors';
import { appendUnique } from '../lib/feed';
import { AppShell } from './app-shell';
import { CommentForm } from './comment-form';
import { PostCard } from './post-card';
import { QueryError, QueryLoading } from './query-feedback';
import { SocialRail } from './social-rail';
import { VoteControls, VoteGroup } from './voting';

export function DiscussionScreen({ id }: { id: string }) {
  return (
    <AppShell active="home" title="The conversation">
      <main id="content" className="social-layout">
        <section className="feed-column" aria-label="Discussion">
          <Link className="text-button discussion-back" href="/">
            <ArrowLeft size={17} />
            Back to feed
          </Link>
          <DiscussionContent id={id} />
        </section>
        <SocialRail />
      </main>
    </AppShell>
  );
}

function DiscussionContent({ id }: { id: string }) {
  const { data, loading, error, refetch } = useQuery(DiscussionDocument, {
    variables: { id },
    fetchPolicy: 'no-cache',
    ssr: false,
  });
  if (!data) {
    if (loading) return <QueryLoading label="Loading conversation..." />;
    if (error)
      return isNotFound(error) ? (
        <div className="empty-state">
          <h1>Post not found</h1>
          <Link className="text-button" href="/">
            Back to feed
          </Link>
        </div>
      ) : (
        <QueryError
          error={error}
          retry={() => {
            void refetch().catch(() => undefined);
          }}
        />
      );
    return null;
  }
  const post = data.post;
  function refreshCount() {
    void refetch().catch(() => undefined);
  }
  return (
    <>
      {error && (
        <QueryError error={error} retry={refreshCount} pending={loading} />
      )}
      <VoteGroup kind="post" ids={[id]}>
        <PostCard
          detail
          post={
            post.deletedAt
              ? { ...post, title: '[Deleted post]', body: null, url: null }
              : post
          }
        >
          {!post.deletedAt && (
            <VoteControls kind="post" id={id} score={post.score} />
          )}
          <a
            className="comment-pill"
            href="#comments"
            aria-label={`${post.commentCount} comments`}
          >
            <MessageCircle size={17} />
            {post.commentCount}
          </a>
        </PostCard>
      </VoteGroup>
      <section
        className="discussion-comments"
        id="comments"
        aria-label="Comments"
      >
        <h2>Conversation</h2>
        <CommentList
          key={id}
          postId={id}
          disabled={!!post.deletedAt}
          onCreated={refreshCount}
        />
      </section>
    </>
  );
}

function CommentList({
  postId,
  parentId,
  depth = 0,
  disabled,
  onCreated,
  externalAdded = [],
}: {
  postId: string;
  parentId?: string;
  depth?: number;
  disabled: boolean;
  onCreated: () => void;
  externalAdded?: DiscussionCommentFragment[];
}) {
  const variables = {
    postId,
    parentId: parentId ?? null,
    cursor: null,
    limit: COMMENT_PAGE_SIZE,
  };
  const { data, loading, error, refetch, fetchMore } = useQuery(
    ThreadCommentsDocument,
    {
      variables,
      fetchPolicy: 'no-cache',
      ssr: false,
      notifyOnNetworkStatusChange: true,
    },
  );
  const [added, setAdded] = useState<DiscussionCommentFragment[]>([]);
  const [pending, setPending] = useState(false);
  const [pageError, setPageError] = useState<unknown>(null);
  const lock = useRef(false);
  const items = appendUnique(
    [...externalAdded, ...added],
    data?.comments.items ?? [],
  );
  function created(comment: DiscussionCommentFragment) {
    setAdded((previous) => [comment, ...previous]);
    onCreated();
  }
  async function more() {
    if (lock.current || !data?.comments.hasMore || !data.comments.nextCursor)
      return;
    lock.current = true;
    setPending(true);
    setPageError(null);
    try {
      await fetchMore({
        variables: { ...variables, cursor: data.comments.nextCursor },
        updateQuery: (previous, { fetchMoreResult }) => ({
          comments: {
            ...fetchMoreResult.comments,
            items: appendUnique(
              previous.comments.items,
              fetchMoreResult.comments.items,
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
    <div className="comment-list" aria-busy={pending}>
      {!parentId && !disabled && (
        <CommentForm postId={postId} onCreated={created} />
      )}
      {loading && !data && <QueryLoading label="Loading comments..." />}
      {error && !pending && !pageError && (
        <QueryError
          error={error}
          retry={() => {
            void refetch().catch(() => undefined);
          }}
          pending={loading}
        />
      )}
      {data && items.length === 0 && (
        <p className="no-comments">
          {parentId ? 'No replies yet.' : 'No comments yet.'}
        </p>
      )}
      <VoteGroup
        kind="comment"
        ids={items.filter((item) => !item.deletedAt).map((item) => item.id)}
      >
        {items.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            depth={depth}
            disabled={disabled}
            onCreated={onCreated}
          />
        ))}
      </VoteGroup>
      {pageError !== null && (
        <QueryError
          error={pageError}
          retry={() => {
            void more();
          }}
          pending={pending}
        />
      )}
      {data?.comments.hasMore && data.comments.nextCursor && (
        <button
          className="secondary-button load-more"
          disabled={pending || loading}
          onClick={() => {
            void more();
          }}
        >
          <ArrowDown size={17} />
          {pending
            ? 'Loading...'
            : parentId
              ? 'Load more replies'
              : 'Load more comments'}
        </button>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  depth,
  disabled,
  onCreated,
}: {
  comment: DiscussionCommentFragment;
  depth: number;
  disabled: boolean;
  onCreated: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [opened, setOpened] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [newReplies, setNewReplies] = useState<DiscussionCommentFragment[]>([]);
  function replied(reply: DiscussionCommentFragment) {
    setNewReplies((previous) => [reply, ...previous]);
    setReplying(false);
    setOpened(true);
    setExpanded(true);
    onCreated();
  }
  return (
    <article
      className="comment-item"
      data-testid={`comment-${comment.id}`}
      aria-label={`Comment by ${comment.deletedAt ? 'deleted user' : comment.authorUsername}`}
    >
      <header className="comment-meta">
        <strong>
          {comment.deletedAt ? '[deleted]' : `u/${comment.authorUsername}`}
        </strong>
        <time dateTime={comment.createdAt}>
          {formatDate(comment.createdAt)}
        </time>
        {comment.editedAt && !comment.deletedAt && (
          <span className="edited-label">Edited</span>
        )}
      </header>
      <p className="comment-body">
        {comment.deletedAt ? '[deleted]' : comment.body}
      </p>
      <div className="comment-actions">
        {!comment.deletedAt && (
          <VoteControls kind="comment" id={comment.id} score={comment.score} />
        )}
        {!disabled && (
          <button
            className="text-button"
            type="button"
            onClick={() => setReplying(!replying)}
            aria-expanded={replying}
          >
            <Reply size={16} />
            Reply
          </button>
        )}
        {(comment.hasReplies || newReplies.length > 0) && (
          <button
            className="text-button"
            type="button"
            aria-expanded={expanded}
            aria-controls={`replies-${comment.id}`}
            onClick={() => {
              setOpened(true);
              setExpanded(!expanded);
            }}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {expanded ? 'Hide replies' : 'Show replies'}
          </button>
        )}
      </div>
      {replying && (
        <CommentForm
          postId={comment.postId}
          parentId={comment.id}
          onCreated={replied}
          onCancel={() => setReplying(false)}
        />
      )}
      {opened && (
        <div
          id={`replies-${comment.id}`}
          hidden={!expanded}
          className={
            depth < 3 ? 'comment-replies' : 'comment-replies flat-replies'
          }
        >
          <CommentList
            key={comment.id}
            postId={comment.postId}
            parentId={comment.id}
            depth={depth + 1}
            disabled={disabled}
            onCreated={onCreated}
            externalAdded={newReplies}
          />
        </div>
      )}
    </article>
  );
}

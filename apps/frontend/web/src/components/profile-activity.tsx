'use client';

import { useQuery } from '@apollo/client/react';
import { ArrowDown, ArrowUpRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  AuthorPostsDocument,
  AuthorCommentsDocument,
  DiscussionPostFragment,
  DiscussionCommentFragment,
} from '../graphql/generated/social';
import { formatDate } from '../lib/content';
import { appendUnique } from '../lib/feed';
import { ActivityTab, ACTIVITY_PAGE_SIZE } from '../lib/profile';
import { PostCard } from './post-card';
import { ContentActions } from './content-actions';
import { QueryError, QueryLoading } from './query-feedback';
import { VoteControls, VoteGroup } from './voting';

export function ProfileActivity({
  authorId,
  kind,
}: {
  authorId: string;
  kind: ActivityTab;
}) {
  const variables = { authorId, cursor: null, limit: ACTIVITY_PAGE_SIZE };
  const posts = useQuery(AuthorPostsDocument, {
    variables,
    skip: kind !== 'posts',
    fetchPolicy: 'no-cache',
    ssr: false,
  });
  const comments = useQuery(AuthorCommentsDocument, {
    variables,
    skip: kind !== 'comments',
    fetchPolicy: 'no-cache',
    ssr: false,
  });
  const query = kind === 'posts' ? posts : comments;
  const page =
    kind === 'posts'
      ? posts.data?.postsByAuthor
      : comments.data?.commentsByAuthor;
  const [pending, setPending] = useState(false);
  const [pageError, setPageError] = useState<unknown>(null);
  const [stopped, setStopped] = useState(false);
  const lock = useRef(false);
  const revision = useRef(0);
  const [changedPosts, setChangedPosts] = useState<
    Record<
      string,
      Pick<
        DiscussionPostFragment,
        'title' | 'body' | 'url' | 'editedAt' | 'deletedAt'
      >
    >
  >({});
  const [changedComments, setChangedComments] = useState<
    Record<
      string,
      Pick<DiscussionCommentFragment, 'body' | 'editedAt' | 'deletedAt'>
    >
  >({});
  const postItems = (posts.data?.postsByAuthor.items ?? [])
    .map((post) =>
      post.deletedAt ? post : { ...post, ...changedPosts[post.id] },
    )
    .filter((post) => !post.deletedAt);
  const commentItems = (comments.data?.commentsByAuthor.items ?? [])
    .map((comment) =>
      comment.deletedAt
        ? comment
        : { ...comment, ...changedComments[comment.id] },
    )
    .filter((comment) => !comment.deletedAt);
  const visibleCount =
    kind === 'posts' ? postItems.length : commentItems.length;

  function updated(item: DiscussionPostFragment | DiscussionCommentFragment) {
    ++revision.current;
    if ('title' in item)
      setChangedPosts((previous) => ({
        ...previous,
        [item.id]: {
          title: item.title,
          body: item.body,
          url: item.url,
          editedAt: item.editedAt,
          deletedAt: item.deletedAt,
        },
      }));
    else
      setChangedComments((previous) => ({
        ...previous,
        [item.id]: {
          body: item.body,
          editedAt: item.editedAt,
          deletedAt: item.deletedAt,
        },
      }));
  }

  async function more() {
    const cursor = page?.nextCursor;
    if (!page?.hasMore || !cursor || stopped || lock.current) return;
    lock.current = true;
    setPending(true);
    setPageError(null);
    try {
      if (kind === 'posts') {
        const response = await posts.fetchMore({
          variables: { cursor },
          updateQuery: (previous, { fetchMoreResult }) => ({
            postsByAuthor: {
              ...fetchMoreResult.postsByAuthor,
              items: appendUnique(
                previous.postsByAuthor.items,
                fetchMoreResult.postsByAuthor.items,
              ),
            },
          }),
        });
        setStopped(response.data?.postsByAuthor.nextCursor === cursor);
      } else {
        const response = await comments.fetchMore({
          variables: { cursor },
          updateQuery: (previous, { fetchMoreResult }) => ({
            commentsByAuthor: {
              ...fetchMoreResult.commentsByAuthor,
              items: appendUnique(
                previous.commentsByAuthor.items,
                fetchMoreResult.commentsByAuthor.items,
              ),
            },
          }),
        });
        setStopped(response.data?.commentsByAuthor.nextCursor === cursor);
      }
    } catch (failure) {
      setPageError(failure);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setPageError(null);
    const current = revision.current;
    try {
      await query.refetch();
      // A pending refresh must not erase a mutation confirmed after it started.
      if (current === revision.current) {
        setChangedPosts({});
        setChangedComments({});
      }
      setStopped(false);
    } catch {
      /* The query error renders the retry state. */
    } finally {
      lock.current = false;
    }
  }
  return (
    <>
      <div className="activity-toolbar">
        <h2>{kind === 'posts' ? 'Posts' : 'Comments'}</h2>
        <button
          className="icon-button"
          title="Refresh activity"
          aria-label="Refresh activity"
          disabled={query.loading || pending}
          onClick={() => {
            void refresh();
          }}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {query.loading && !page && <QueryLoading label="Loading activity..." />}
      {query.error && !pending && !pageError && (
        <QueryError
          error={query.error}
          retry={() => {
            void refresh();
          }}
          pending={query.loading}
        />
      )}
      {page && (
        <>
          {!visibleCount && (
            <div className="empty-state">
              <h2>
                {page.hasMore ? `No ${kind} on this page` : `No ${kind} yet`}
              </h2>
            </div>
          )}
          {kind === 'posts' && posts.data && (
            <VoteGroup kind="post" ids={postItems.map((post) => post.id)}>
              <div className="post-list">
                {postItems.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    footer={
                      <ContentActions
                        kind="post"
                        item={post}
                        onChanged={updated}
                        reloadLabel="Reload activity"
                      />
                    }
                  />
                ))}
              </div>
            </VoteGroup>
          )}
          {kind === 'comments' && comments.data && (
            <VoteGroup
              kind="comment"
              ids={commentItems.map((comment) => comment.id)}
            >
              <div className="post-list">
                {commentItems.map((comment) => (
                  <article
                    className="post-card activity-comment"
                    key={comment.id}
                    data-testid={`activity-comment-${comment.id}`}
                  >
                    <header>
                      <span className="section-label">
                        {comment.parentId ? 'REPLY' : 'COMMENT'}
                      </span>
                      <time dateTime={comment.createdAt}>
                        {formatDate(comment.createdAt)}
                      </time>
                      {comment.editedAt && (
                        <span className="edited-label">Edited</span>
                      )}
                    </header>
                    <p className="comment-body">{comment.body}</p>
                    <div className="comment-actions">
                      <VoteControls
                        kind="comment"
                        id={comment.id}
                        score={comment.score}
                      />
                      <Link
                        className="text-button"
                        href={`/posts/${encodeURIComponent(comment.postId)}#comments`}
                      >
                        <ArrowUpRight size={16} /> Open discussion
                      </Link>
                    </div>
                    <ContentActions
                      kind="comment"
                      item={comment}
                      onChanged={updated}
                      reloadLabel="Reload activity"
                    />
                  </article>
                ))}
              </div>
            </VoteGroup>
          )}
          {pending && <QueryLoading label="Loading more activity..." />}
          {pageError !== null && (
            <QueryError
              error={pageError}
              retry={() => {
                void more();
              }}
              pending={pending}
            />
          )}
          {page.hasMore && page.nextCursor && !stopped && (
            <button
              className="secondary-button load-more"
              disabled={pending || query.loading}
              onClick={() => {
                void more();
              }}
            >
              <ArrowDown size={17} />
              {pending ? 'Loading...' : `Load more ${kind}`}
            </button>
          )}
          {!!visibleCount && (!page.hasMore || !page.nextCursor || stopped) && (
            <p className="end-of-list">End of this activity.</p>
          )}
        </>
      )}
    </>
  );
}

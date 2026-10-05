'use client';

import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowDown,
  ArrowLeft,
  FileText,
  Link2,
  LoaderCircle,
  Plus,
  Send,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  BrowseCommunitiesDocument,
  JoinForPostingDocument,
  PublishPostDocument,
  SubscribedCommunitiesDocument,
} from '../graphql/generated/social';
import { PostFields, postInput, postSchema } from '../lib/discussion';
import {
  isForbidden,
  isUnauthenticated,
  socialActionError,
} from '../lib/errors';
import { appendUnique, COMMUNITY_PAGE_SIZE } from '../lib/feed';
import { AppShell } from './app-shell';
import { QueryError, QueryLoading } from './query-feedback';
import { useSession } from './session-provider';
import { SocialRail } from './social-rail';

export function ComposerScreen({ community }: { community: string }) {
  const session = useSession();
  return (
    <AppShell active="home" title="Something worth sharing">
      <main id="content" className="social-layout">
        <section className="feed-column" aria-label="Post composer">
          <Link
            className="text-button discussion-back"
            href={community ? `/r/${encodeURIComponent(community)}` : '/'}
          >
            <ArrowLeft size={17} />
            Back to feed
          </Link>
          <div className="page-heading">
            <span className="section-label">START A CONVERSATION</span>
            <h1>Create a post</h1>
          </div>
          {session.loading && !session.account ? (
            <QueryLoading label="Restoring session..." />
          ) : session.account ? (
            <PostComposer
              key={`${session.account.id}:${community}`}
              community={community}
            />
          ) : (
            <div className="empty-state">
              <Link href="/account" className="primary-button">
                <Plus size={17} />
                Sign in to post
              </Link>
            </div>
          )}
        </section>
        <SocialRail />
      </main>
    </AppShell>
  );
}

function PostComposer({ community }: { community: string }) {
  const social = useApolloClient();
  const session = useSession();
  const router = useRouter();
  const fieldId = useId();
  const lock = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [joinPending, setJoinPending] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const [pageError, setPageError] = useState<unknown>(null);
  const [pagePending, setPagePending] = useState(false);
  const pageLock = useRef(false);
  const { data, loading, error, refetch, fetchMore } = useQuery(
    BrowseCommunitiesDocument,
    {
      variables: { cursor: null, limit: COMMUNITY_PAGE_SIZE },
      fetchPolicy: 'no-cache',
      ssr: false,
      notifyOnNetworkStatusChange: true,
    },
  );
  const [publish] = useMutation(PublishPostDocument, {
    fetchPolicy: 'no-cache',
  });
  const [join] = useMutation(JoinForPostingDocument, {
    fetchPolicy: 'no-cache',
  });
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PostFields>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      communitySlug: community,
      title: '',
      kind: 'text',
      body: '',
      url: '',
    },
  });
  const kind = useWatch({ control, name: 'kind' });
  const slug = useWatch({ control, name: 'communitySlug' });
  const disabled = isSubmitting || joinPending || !!published;

  async function submit(input: PostFields) {
    if (lock.current || published) return;
    lock.current = true;
    setFailure(null);
    try {
      const result = await publish({ variables: { input: postInput(input) } });
      if (!result.data?.createPost) throw new Error('Missing post response');
      const href = `/posts/${encodeURIComponent(result.data.createPost.id)}`;
      setPublished(href);
      router.push(href);
    } catch (failure) {
      setFailure(socialActionError(failure));
      if (isForbidden(failure) || isUnauthenticated(failure))
        await session.refresh();
    } finally {
      lock.current = false;
    }
  }

  async function joinSelected() {
    if (!slug || lock.current) return;
    lock.current = true;
    setJoinPending(true);
    setFailure(null);
    try {
      const { data } = await join({ variables: { slug } });
      if (!data?.joinCommunity) throw new Error('Missing community response');
      setJoined(slug);
      void social
        .refetchQueries({ include: [SubscribedCommunitiesDocument] })
        .catch(() => undefined);
    } catch (failure) {
      setFailure(socialActionError(failure));
      if (isForbidden(failure) || isUnauthenticated(failure))
        await session.refresh();
    } finally {
      lock.current = false;
      setJoinPending(false);
    }
  }

  async function moreCommunities() {
    if (
      pageLock.current ||
      !data?.communities.nextCursor ||
      !data.communities.hasMore
    )
      return;
    pageLock.current = true;
    setPagePending(true);
    setPageError(null);
    try {
      await fetchMore({
        variables: { cursor: data.communities.nextCursor },
        updateQuery: (previous, { fetchMoreResult }) => ({
          communities: {
            ...fetchMoreResult.communities,
            items: appendUnique(
              previous.communities.items,
              fetchMoreResult.communities.items,
            ),
          },
        }),
      });
    } catch (failure) {
      setPageError(failure);
    } finally {
      pageLock.current = false;
      setPagePending(false);
    }
  }

  if (published)
    return (
      <p className="form-notice" role="status">
        Post published.{' '}
        <Link className="text-button" href={published}>
          Open conversation
        </Link>
      </p>
    );
  return (
    <form
      className="post-composer"
      aria-label="Create a post"
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
      noValidate
    >
      <div className="form-field">
        <label htmlFor={`${fieldId}-community`}>Community</label>
        <div className="composer-community">
          <select
            id={`${fieldId}-community`}
            {...register('communitySlug')}
            value={slug}
            disabled={disabled}
            aria-invalid={!!errors.communitySlug}
            aria-describedby={
              errors.communitySlug ? `${fieldId}-community-error` : undefined
            }
          >
            <option value="">Choose a community</option>
            {community &&
              !data?.communities.items.some(
                (item) => item.slug === community,
              ) && <option value={community}>r/{community}</option>}
            {data?.communities.items.map((item) => (
              <option key={item.id} value={item.slug}>
                r/{item.slug} - {item.name}
              </option>
            ))}
          </select>
          <button
            className="text-button"
            type="button"
            disabled={disabled || !slug}
            onClick={() => {
              void joinSelected();
            }}
          >
            {joinPending ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <UsersRound size={17} />
            )}
            Join community
          </button>
        </div>
        {errors.communitySlug && (
          <span id={`${fieldId}-community-error`} className="field-error">
            {errors.communitySlug.message}
          </span>
        )}
        {joined === slug && (
          <p className="form-notice" role="status">
            Community joined.
          </p>
        )}
        {loading && !data && <QueryLoading label="Loading communities..." />}
        {error && !pageError && (
          <QueryError
            error={error}
            retry={() => {
              void refetch().catch(() => undefined);
            }}
            pending={loading}
          />
        )}
        {pageError !== null && (
          <QueryError
            error={pageError}
            retry={() => {
              void moreCommunities();
            }}
            pending={pagePending}
          />
        )}
        {data?.communities.hasMore && data.communities.nextCursor && (
          <button
            className="text-button"
            type="button"
            disabled={pagePending || loading}
            onClick={() => {
              void moreCommunities();
            }}
          >
            <ArrowDown size={16} />
            More communities
          </button>
        )}
      </div>
      <div className="composer-modes" role="radiogroup" aria-label="Post type">
        {(['text', 'link'] as const).map((value) => (
          <label key={value} className={kind === value ? 'selected' : ''}>
            <input
              type="radio"
              value={value}
              {...register('kind')}
              disabled={disabled}
            />
            {value === 'text' ? <FileText size={18} /> : <Link2 size={18} />}
            {value === 'text' ? 'Text' : 'Link'}
          </label>
        ))}
      </div>
      <div className="form-field">
        <label htmlFor={`${fieldId}-title`}>Title</label>
        <input
          id={`${fieldId}-title`}
          maxLength={300}
          {...register('title')}
          disabled={disabled}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? `${fieldId}-title-error` : undefined}
        />
        {errors.title && (
          <span className="field-error" id={`${fieldId}-title-error`}>
            {errors.title.message}
          </span>
        )}
      </div>
      {kind === 'text' ? (
        <div className="form-field">
          <label htmlFor={`${fieldId}-body`}>Your post</label>
          <textarea
            id={`${fieldId}-body`}
            rows={9}
            maxLength={40000}
            {...register('body')}
            disabled={disabled}
            aria-invalid={!!errors.body}
            aria-describedby={errors.body ? `${fieldId}-body-error` : undefined}
          />
          {errors.body && (
            <span className="field-error" id={`${fieldId}-body-error`}>
              {errors.body.message}
            </span>
          )}
        </div>
      ) : (
        <div className="form-field">
          <label htmlFor={`${fieldId}-url`}>URL</label>
          <input
            id={`${fieldId}-url`}
            type="url"
            {...register('url')}
            disabled={disabled}
            aria-invalid={!!errors.url}
            aria-describedby={errors.url ? `${fieldId}-url-error` : undefined}
          />
          {errors.url && (
            <span className="field-error" id={`${fieldId}-url-error`}>
              {errors.url.message}
            </span>
          )}
        </div>
      )}
      {failure && (
        <p className="error-message" role="alert">
          {failure}
        </p>
      )}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={disabled}>
          {isSubmitting ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Send size={17} />
          )}
          {isSubmitting ? 'Publishing...' : 'Publish post'}
        </button>
      </div>
    </form>
  );
}

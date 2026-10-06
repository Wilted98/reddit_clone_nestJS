'use client';

import { useApolloClient, useMutation } from '@apollo/client/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowUpRight, LoaderCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  CreateCommunityDocument,
  SubscribedCommunitiesDocument,
} from '../graphql/generated/social';
import {
  CommunityFields,
  communityInput,
  communitySchema,
} from '../lib/community';
import {
  isForbidden,
  isUnauthenticated,
  socialActionError,
} from '../lib/errors';
import { AppShell } from './app-shell';
import { QueryLoading } from './query-feedback';
import { useSession } from './session-provider';
import { SocialRail } from './social-rail';

export function CommunityCreateScreen() {
  const session = useSession();
  return (
    <AppShell active="communities" title="Create a community">
      <main id="content" className="social-layout">
        <section className="directory-column" aria-label="Community creation">
          <Link className="text-button discussion-back" href="/communities">
            <ArrowLeft size={17} />
            Back to communities
          </Link>
          <div className="page-heading">
            <h1>Create a community</h1>
          </div>
          {session.loading && !session.account ? (
            <QueryLoading label="Restoring session..." />
          ) : session.account ? (
            <CommunityCreateForm key={session.account.id} />
          ) : (
            <div className="empty-state">
              <Link className="primary-button" href="/account">
                <Plus size={17} />
                Sign in to create a community
              </Link>
            </div>
          )}
        </section>
        <SocialRail />
      </main>
    </AppShell>
  );
}

function CommunityCreateForm() {
  const session = useSession();
  const social = useApolloClient();
  const router = useRouter();
  const id = useId();
  const lock = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [failure, setFailure] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [create] = useMutation(CreateCommunityDocument, {
    fetchPolicy: 'no-cache',
  });
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CommunityFields>({
    resolver: zodResolver(communitySchema),
    defaultValues: { slug: '', name: '', description: '' },
  });
  const description = useWatch({ control, name: 'description' });

  async function submit(fields: CommunityFields) {
    if (lock.current || created) return;
    lock.current = true;
    setFailure(null);
    try {
      const { data } = await create({
        variables: { input: communityInput(fields) },
      });
      if (!active.current) return;
      if (!data?.createCommunity) throw new Error('Missing community response');
      const href = `/r/${encodeURIComponent(data.createCommunity.slug)}`;
      setCreated(href);
      void social
        .refetchQueries({ include: [SubscribedCommunitiesDocument] })
        .catch(() => undefined);
      router.push(href);
    } catch (error) {
      if (!active.current) return;
      setFailure(socialActionError(error));
      if (isForbidden(error) || isUnauthenticated(error))
        await session.refresh();
    } finally {
      lock.current = false;
    }
  }

  if (created)
    return (
      <p className="form-notice" role="status">
        Community created.{' '}
        <Link href={created} className="text-button">
          <ArrowUpRight size={17} />
          Open community
        </Link>
      </p>
    );

  return (
    <form
      className="post-composer"
      aria-label="Create a community"
      noValidate
      onSubmit={(event) => {
        if (lock.current) {
          event.preventDefault();
          return;
        }
        void handleSubmit(submit)(event);
      }}
    >
      <div className="form-field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input
          id={`${id}-name`}
          maxLength={60}
          {...register('name')}
          disabled={isSubmitting}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
        />
        {errors.name && (
          <span className="field-error" id={`${id}-name-error`}>
            {errors.name.message}
          </span>
        )}
      </div>
      <div className="form-field">
        <label htmlFor={`${id}-slug`}>Slug</label>
        <div className="community-slug-field">
          <span aria-hidden="true">r/</span>
          <input
            id={`${id}-slug`}
            maxLength={24}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            {...register('slug')}
            disabled={isSubmitting}
            aria-invalid={!!errors.slug}
            aria-describedby={errors.slug ? `${id}-slug-error` : undefined}
          />
        </div>
        {errors.slug && (
          <span className="field-error" id={`${id}-slug-error`}>
            {errors.slug.message}
          </span>
        )}
      </div>
      <div className="form-field">
        <label htmlFor={`${id}-description`}>Description</label>
        <textarea
          id={`${id}-description`}
          rows={5}
          maxLength={500}
          {...register('description')}
          disabled={isSubmitting}
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description
              ? `${id}-description-count ${id}-description-error`
              : `${id}-description-count`
          }
        />
        <span id={`${id}-description-count`} className="field-counter">
          {description.length}/500
        </span>
        {errors.description && (
          <span className="field-error" id={`${id}-description-error`}>
            {errors.description.message}
          </span>
        )}
      </div>
      {failure && (
        <p className="error-message" role="alert">
          {failure}
        </p>
      )}
      <div className="form-actions">
        <button
          type="submit"
          className="primary-button"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Plus size={17} />
          )}
          {isSubmitting ? 'Creating...' : 'Create community'}
        </button>
      </div>
    </form>
  );
}

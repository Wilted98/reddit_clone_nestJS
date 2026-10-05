'use client';

import { useMutation } from '@apollo/client/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  DiscussionCommentFragment,
  PublishCommentDocument,
} from '../graphql/generated/social';
import { CommentFields, commentSchema } from '../lib/discussion';
import {
  isForbidden,
  isUnauthenticated,
  socialActionError,
} from '../lib/errors';
import { useSession } from './session-provider';

export function CommentForm({
  postId,
  parentId,
  onCreated,
  onCancel,
}: {
  postId: string;
  parentId?: string;
  onCreated: (comment: DiscussionCommentFragment) => void;
  onCancel?: () => void;
}) {
  const session = useSession();
  if (!session.account)
    return (
      <p className="discussion-sign-in">
        <Link href="/account">Sign in</Link> to join the conversation.
      </p>
    );
  return (
    <SignedInCommentForm
      key={session.account.id}
      postId={postId}
      parentId={parentId}
      onCreated={onCreated}
      onCancel={onCancel}
    />
  );
}

function SignedInCommentForm({
  postId,
  parentId,
  onCreated,
  onCancel,
}: {
  postId: string;
  parentId?: string;
  onCreated: (comment: DiscussionCommentFragment) => void;
  onCancel?: () => void;
}) {
  const session = useSession();
  const fieldId = useId();
  const lock = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const [publish] = useMutation(PublishCommentDocument, {
    fetchPolicy: 'no-cache',
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CommentFields>({
    resolver: zodResolver(commentSchema),
    defaultValues: { body: '' },
  });
  async function submit({ body }: CommentFields) {
    if (lock.current) return;
    lock.current = true;
    setFailure(null);
    setPosted(false);
    try {
      const { data } = await publish({
        variables: {
          input: { postId, ...(parentId ? { parentId } : {}), body },
        },
      });
      if (!data?.createComment) throw new Error('Missing comment response');
      reset();
      setPosted(true);
      onCreated(data.createComment);
    } catch (error) {
      setFailure(socialActionError(error));
      if (isForbidden(error) || isUnauthenticated(error))
        await session.refresh();
    } finally {
      lock.current = false;
    }
  }
  return (
    <form
      className="comment-form"
      aria-label={parentId ? 'Write a reply' : 'Write a comment'}
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
      noValidate
    >
      <label htmlFor={fieldId}>
        {parentId ? 'Your reply' : 'Add a comment'}
      </label>
      <textarea
        id={fieldId}
        rows={parentId ? 3 : 4}
        maxLength={10000}
        placeholder="What do you think?"
        {...register('body')}
        disabled={isSubmitting}
        aria-invalid={!!errors.body}
        aria-describedby={errors.body ? `${fieldId}-error` : undefined}
      />
      {errors.body && (
        <span className="field-error" id={`${fieldId}-error`}>
          {errors.body.message}
        </span>
      )}
      {failure && (
        <p className="error-message" role="alert">
          {failure}
        </p>
      )}
      {posted && (
        <p className="form-notice" role="status">
          Comment posted.
        </p>
      )}
      <div className="form-actions">
        {onCancel && (
          <button
            type="button"
            className="text-button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            <X size={16} />
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="secondary-button"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Send size={17} />
          )}
          {isSubmitting
            ? 'Posting...'
            : parentId
              ? 'Post reply'
              : 'Post comment'}
        </button>
      </div>
    </form>
  );
}

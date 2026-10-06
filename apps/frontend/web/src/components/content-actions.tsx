'use client';

import { useMutation } from '@apollo/client/react';
import {
  Ellipsis,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import {
  DiscussionCommentFragment,
  DiscussionPostFragment,
  EditCommentDocument,
  EditPostDocument,
  RemoveCommentDocument,
  RemovePostDocument,
} from '../graphql/generated/social';
import {
  ContentEditFields,
  EditableContent,
  postEditPatch,
} from '../lib/content-editing';
import {
  isForbidden,
  isUnauthenticated,
  socialActionError,
} from '../lib/errors';
import { ContentEditForm } from './content-edit-form';
import { useSession } from './session-provider';

type ContentActionsProps = EditableContent & {
  onChanged: (item: DiscussionPostFragment | DiscussionCommentFragment) => void;
  reloadLabel?: string;
};

export function ContentActions(props: ContentActionsProps) {
  const { account } = useSession();
  if (!account || account.id !== props.item.authorId || props.item.deletedAt)
    return null;
  return <OwnContentActions key={account.id} {...props} />;
}

function ContentOptions({
  kind,
  onSelect,
  trigger,
  disabled,
}: {
  kind: 'post' | 'comment';
  onSelect: (mode: 'edit' | 'delete') => void;
  trigger: RefObject<HTMLButtonElement | null>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const label = `${kind === 'post' ? 'Post' : 'Comment'} options`;

  useEffect(() => {
    if (!open) return;
    firstAction.current?.focus();
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, trigger]);

  return (
    <div
      className="content-options"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="icon-button"
        aria-label={label}
        title={label}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <Ellipsis size={20} />
      </button>
      {open && (
        <div
          id={id}
          className="content-options-panel"
          role="group"
          aria-label={label}
        >
          <button
            type="button"
            ref={firstAction}
            onClick={() => {
              setOpen(false);
              onSelect('edit');
            }}
          >
            <Pencil size={16} /> Edit {kind}
          </button>
          <button
            type="button"
            className="danger-text"
            onClick={() => {
              setOpen(false);
              onSelect('delete');
            }}
          >
            <Trash2 size={16} /> Delete {kind}
          </button>
        </div>
      )}
    </div>
  );
}

function DeleteContentDialog({
  kind,
  pending,
  onConfirm,
  onCancel,
  trigger,
  children,
}: {
  kind: 'post' | 'comment';
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = trigger.current;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [trigger]);
  return (
    <dialog
      ref={dialog}
      className="delete-confirmation"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 className="delete-confirmation-title" id={`${id}-title`}>
        Delete {kind}?
      </h2>
      <p id={`${id}-description`}>
        {kind === 'post'
          ? 'The conversation will stay readable.'
          : 'Replies will stay readable.'}{' '}
        This cannot be undone.
      </p>
      {children}
      <div className="content-action-buttons">
        <button
          type="button"
          className="text-button"
          disabled={pending}
          onClick={onCancel}
          autoFocus
        >
          <X size={17} /> Cancel
        </button>
        <button
          type="button"
          className="secondary-button danger-text"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Trash2 size={17} />
          )}
          {pending ? 'Deleting...' : `Confirm delete ${kind}`}
        </button>
      </div>
    </dialog>
  );
}

function OwnContentActions(props: ContentActionsProps) {
  const session = useSession();
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const lock = useRef(false);
  const active = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [editPost] = useMutation(EditPostDocument, { fetchPolicy: 'no-cache' });
  const [removePost] = useMutation(RemovePostDocument, {
    fetchPolicy: 'no-cache',
  });
  const [editComment] = useMutation(EditCommentDocument, {
    fetchPolicy: 'no-cache',
  });
  const [removeComment] = useMutation(RemoveCommentDocument, {
    fetchPolicy: 'no-cache',
  });

  async function write(values?: ContentEditFields) {
    if (lock.current || session.loading) return;
    lock.current = true;
    setPending(true);
    setFailure(null);
    try {
      let result:
        | DiscussionPostFragment
        | DiscussionCommentFragment
        | undefined;
      if (props.kind === 'post') {
        if (values) {
          const input = postEditPatch(values, props.item);
          if (Object.keys(input).length === 1) {
            setMode(null);
            return;
          }
          result = (await editPost({ variables: { input } })).data?.updatePost;
        } else
          result = (await removePost({ variables: { id: props.item.id } })).data
            ?.deletePost;
      } else if (values) {
        const body = values.body.trim();
        if (body === props.item.body) {
          setMode(null);
          return;
        }
        result = (
          await editComment({
            variables: { input: { id: props.item.id, body } },
          })
        ).data?.updateComment;
      } else
        result = (await removeComment({ variables: { id: props.item.id } }))
          .data?.deleteComment;
      if (!active.current) return;
      if (
        !result ||
        result.id !== props.item.id ||
        result.authorId !== props.item.authorId ||
        (!values && !result.deletedAt)
      )
        throw new Error('Missing content response');
      props.onChanged(result);
      setMode(null);
    } catch (error) {
      if (!active.current) return;
      setFailure(socialActionError(error));
      if (isForbidden(error) || isUnauthenticated(error))
        await session.refresh();
    } finally {
      lock.current = false;
      if (active.current) setPending(false);
    }
  }

  function cancel() {
    setMode(null);
    setFailure(null);
  }
  const error = failure && (
    <div className="content-write-error">
      <p className="error-message" role="alert">
        {failure}
      </p>
      <button
        type="button"
        className="text-button"
        disabled={pending}
        onClick={() => window.location.reload()}
      >
        <RotateCcw size={16} /> {props.reloadLabel ?? 'Reload conversation'}
      </button>
    </div>
  );
  return (
    <div
      className={`content-actions${mode === 'edit' ? '' : ' content-actions-idle'}`}
    >
      <ContentOptions
        kind={props.kind}
        onSelect={setMode}
        trigger={trigger}
        disabled={mode !== null}
      />
      {mode === 'edit' && (
        <ContentEditForm
          content={props}
          pending={pending || session.loading}
          onSave={write}
          onCancel={cancel}
        />
      )}
      {mode === 'delete' && (
        <DeleteContentDialog
          kind={props.kind}
          pending={pending || session.loading}
          onCancel={cancel}
          onConfirm={() => void write()}
          trigger={trigger}
        >
          {error}
        </DeleteContentDialog>
      )}
      {mode !== 'delete' && error}
    </div>
  );
}

'use client';

import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { Check, LoaderCircle, LogOut, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  CommunityMembershipDocument,
  JoinedCommunitiesDocument,
  JoinedCommunityFragment,
  JoinForPostingDocument,
  LeaveCommunityDocument,
  SubscribedCommunitiesDocument,
} from '../graphql/generated/social';
import {
  isForbidden,
  isUnauthenticated,
  socialActionError,
} from '../lib/errors';
import { ConfirmationDialog } from './confirmation-dialog';
import { QueryError } from './query-feedback';
import { useSession } from './session-provider';

interface MembershipProps {
  slug: string;
  allowLeave?: boolean;
  disabled?: boolean;
  onChange?: (community: JoinedCommunityFragment) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function CommunityMembershipControl(props: MembershipProps) {
  const { account, loading } = useSession();
  if (!props.slug) return null;
  if (!account)
    return loading ? (
      <button className="text-button" type="button" disabled>
        <LoaderCircle size={17} className="spin" /> Checking membership...
      </button>
    ) : (
      <Link className="text-button" href="/account">
        <UsersRound size={17} /> Join community
      </Link>
    );
  return (
    <MembershipAction
      key={`${account.id}:${props.slug}`}
      {...props}
      accountId={account.id}
    />
  );
}

function MembershipAction({
  slug,
  allowLeave,
  disabled,
  onChange,
  onPendingChange,
  accountId,
}: MembershipProps & { accountId: string }) {
  const session = useSession();
  const social = useApolloClient();
  const { data, loading, error, refetch } = useQuery(
    CommunityMembershipDocument,
    {
      variables: { slug },
      fetchPolicy: 'no-cache',
      context: { queryDeduplication: false },
      ssr: false,
    },
  );
  const [join] = useMutation(JoinForPostingDocument, {
    fetchPolicy: 'no-cache',
  });
  const [leave] = useMutation(LeaveCommunityDocument, {
    fetchPolicy: 'no-cache',
  });
  const [confirmed, setConfirmed] = useState<
    JoinedCommunityFragment | null | undefined
  >(undefined);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const active = useRef(true);
  const lock = useRef(false);
  const checkedFailure = useRef<unknown>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const membership =
    confirmed !== undefined
      ? confirmed
      : (data?.myCommunities.items.find((item) => item.slug === slug) ?? null);
  const owner = membership?.ownerId === accountId;
  const busy = !!disabled || pending || session.loading || loading;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      onPendingChange?.(false);
    };
  }, [onPendingChange]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (
      error &&
      checkedFailure.current !== error &&
      (isForbidden(error) || isUnauthenticated(error))
    ) {
      checkedFailure.current = error;
      void session.refresh();
    }
  }, [error, session]);

  async function change(joining: boolean) {
    if (busy || lock.current || (joining ? !!membership : !membership || owner))
      return;
    lock.current = true;
    setPending(true);
    onPendingChange?.(true);
    setFailure(null);
    setNotice(null);
    try {
      const response = joining
        ? (await join({ variables: { slug } })).data?.joinCommunity
        : (await leave({ variables: { slug } })).data?.leaveCommunity;
      if (!active.current) return;
      if (
        !response ||
        response.slug !== slug ||
        (membership && response.id !== membership.id) ||
        (!joining && response.ownerId === accountId)
      )
        throw new Error('Missing community response');
      setConfirmed(joining ? response : null);
      setConfirming(false);
      setNotice(joining ? 'Community joined.' : 'Community left.');
      onChange?.(response);
      void social
        .refetchQueries({
          include: 'active',
          onQueryUpdated: (query) =>
            query.options.query === SubscribedCommunitiesDocument ||
            query.options.query === JoinedCommunitiesDocument
              ? query.refetch()
              : false,
        })
        .catch(() => undefined);
    } catch (error) {
      if (!active.current) return;
      setFailure(socialActionError(error));
      if (isForbidden(error) || isUnauthenticated(error))
        await session.refresh();
    } finally {
      lock.current = false;
      if (active.current) {
        setPending(false);
        onPendingChange?.(false);
      }
    }
  }

  return (
    <div className="community-membership">
      {error && confirmed === undefined ? (
        <QueryError
          error={error}
          pending={loading}
          retry={() => {
            void refetch().catch(() => undefined);
          }}
        />
      ) : (
        <button
          className="text-button"
          type="button"
          disabled={busy || (membership !== null && (!allowLeave || owner))}
          title={
            owner && allowLeave
              ? 'Owners cannot leave their own community'
              : undefined
          }
          onClick={(event) => {
            if (membership) {
              trigger.current = event.currentTarget;
              setFailure(null);
              setConfirming(true);
            } else void change(true);
          }}
        >
          {pending || (loading && !data) ? (
            <LoaderCircle size={17} className="spin" />
          ) : membership ? (
            allowLeave && !owner ? (
              <LogOut size={17} />
            ) : (
              <Check size={17} />
            )
          ) : (
            <UsersRound size={17} />
          )}
          {pending
            ? confirming
              ? 'Leaving...'
              : 'Joining...'
            : loading && !data
              ? 'Checking membership...'
              : membership
                ? allowLeave
                  ? owner
                    ? 'Owner'
                    : 'Leave community'
                  : 'Joined'
                : 'Join community'}
        </button>
      )}
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {failure && !confirming && (
        <p className="error-message" role="alert">
          {failure}
        </p>
      )}
      {confirming && (
        <ConfirmationDialog
          title={`Leave r/${slug}?`}
          description="Your posts and comments will stay in the community. You can join again later."
          confirmLabel="Confirm leave community"
          pendingLabel="Leaving..."
          icon={<LogOut size={17} />}
          pending={busy}
          onConfirm={() => {
            void change(false);
          }}
          onCancel={() => {
            setConfirming(false);
            setFailure(null);
          }}
          trigger={trigger}
        >
          {failure && (
            <p className="error-message" role="alert">
              {failure}
            </p>
          )}
        </ConfirmationDialog>
      )}
    </div>
  );
}

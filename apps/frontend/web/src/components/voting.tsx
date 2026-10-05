'use client';

import { useMutation, useQuery } from '@apollo/client/react';
import { Triangle, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  OwnCommentVotesDocument,
  OwnPostVotesDocument,
  SetCommentVoteDocument,
  SetPostVoteDocument,
} from '../graphql/generated/social';
import { toggledVote } from '../lib/discussion';
import { formatCount } from '../lib/content';
import {
  isForbidden,
  isUnauthenticated,
  socialActionError,
} from '../lib/errors';
import { QueryError } from './query-feedback';
import { useSession } from './session-provider';

type Vote = { myVote: number; score?: number };
type Voting = {
  ready: boolean;
  votes: Record<string, Vote>;
  pending: Set<string>;
  errors: Record<string, string>;
  vote: (id: string, selected: -1 | 1) => void;
};
const VoteContext = createContext<Voting | null>(null);

export function VoteGroup({
  kind,
  ids,
  children,
}: {
  kind: 'post' | 'comment';
  ids: string[];
  children: ReactNode;
}) {
  const { account } = useSession();
  if (!account)
    return <VoteContext.Provider value={null}>{children}</VoteContext.Provider>;
  return (
    <SignedInVotes key={account.id} kind={kind} ids={ids}>
      {children}
    </SignedInVotes>
  );
}

function SignedInVotes({
  kind,
  ids,
  children,
}: {
  kind: 'post' | 'comment';
  ids: string[];
  children: ReactNode;
}) {
  const { refresh } = useSession();
  const postQuery = useQuery(OwnPostVotesDocument, {
    variables: { ids },
    skip: kind !== 'post' || ids.length === 0,
    fetchPolicy: 'no-cache',
    ssr: false,
  });
  const commentQuery = useQuery(OwnCommentVotesDocument, {
    variables: { ids },
    skip: kind !== 'comment' || ids.length === 0,
    fetchPolicy: 'no-cache',
    ssr: false,
  });
  const lookup = kind === 'post' ? postQuery : commentQuery;
  const stored =
    kind === 'post'
      ? postQuery.data?.myPostVotes
      : commentQuery.data?.myCommentVotes;
  const [setPostVote] = useMutation(SetPostVoteDocument, {
    fetchPolicy: 'no-cache',
  });
  const [setCommentVote] = useMutation(SetCommentVoteDocument, {
    fetchPolicy: 'no-cache',
  });
  const [changed, setChanged] = useState<Record<string, Vote>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const locks = useRef(new Set<string>());
  const checkedFailure = useRef<unknown>(null);
  useEffect(() => {
    if (
      lookup.error &&
      checkedFailure.current !== lookup.error &&
      (isForbidden(lookup.error) || isUnauthenticated(lookup.error))
    ) {
      checkedFailure.current = lookup.error;
      void refresh();
    }
  }, [lookup.error, refresh]);
  const votes: Record<string, Vote> = Object.fromEntries(
    (stored ?? []).map((vote) => [vote.targetId, { myVote: vote.myVote }]),
  );
  Object.assign(votes, changed);

  async function vote(id: string, selected: -1 | 1) {
    if (locks.current.has(id) || lookup.loading || lookup.error || !lookup.data)
      return;
    locks.current.add(id);
    setPending((previous) => new Set(previous).add(id));
    setErrors((previous) => ({ ...previous, [id]: '' }));
    const input = {
      targetId: id,
      value: toggledVote(votes[id]?.myVote ?? 0, selected),
    };
    try {
      const result =
        kind === 'post'
          ? (await setPostVote({ variables: { input } })).data?.votePost
          : (await setCommentVote({ variables: { input } })).data?.voteComment;
      if (!result) throw new Error('Missing vote response');
      setChanged((previous) => ({ ...previous, [id]: result }));
    } catch (failure) {
      setErrors((previous) => ({
        ...previous,
        [id]: socialActionError(failure),
      }));
      if (isForbidden(failure) || isUnauthenticated(failure)) await refresh();
    } finally {
      locks.current.delete(id);
      setPending((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <VoteContext.Provider
      value={{
        ready: !!lookup.data && !lookup.loading && !lookup.error,
        votes,
        pending,
        errors,
        vote,
      }}
    >
      {lookup.error && (
        <QueryError
          error={lookup.error}
          retry={() => {
            void lookup.refetch().catch(() => undefined);
          }}
          pending={lookup.loading}
        />
      )}
      {children}
    </VoteContext.Provider>
  );
}

export function VoteControls({
  id,
  score,
  kind,
}: {
  id: string;
  score: number;
  kind: 'post' | 'comment';
}) {
  const voting = useContext(VoteContext);
  const vote = voting?.votes[id];
  return (
    <div className="vote-area">
      <div
        className="vote-controls"
        role="group"
        aria-label={`${kind === 'post' ? 'Post' : 'Comment'} voting`}
      >
        {voting ? (
          <button
            type="button"
            className={`icon-button vote-up ${vote?.myVote === 1 ? 'voted-up' : ''}`}
            aria-label={`Upvote ${kind}`}
            title={`Upvote ${kind}`}
            aria-pressed={vote?.myVote === 1}
            disabled={!voting.ready || voting.pending.has(id)}
            onClick={() => voting.vote(id, 1)}
          >
            <Triangle size={13} fill="currentColor" />
          </button>
        ) : (
          <Link
            className="icon-button vote-up"
            href="/account"
            aria-label={`Sign in to upvote ${kind}`}
            title="Sign in to vote"
          >
            <Triangle size={13} fill="currentColor" />
          </Link>
        )}
        <span aria-label={`${vote?.score ?? score} score`} aria-live="polite">
          {voting?.pending.has(id) ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            formatCount(vote?.score ?? score)
          )}
        </span>
        {voting ? (
          <button
            type="button"
            className={`icon-button vote-down ${vote?.myVote === -1 ? 'voted-down' : ''}`}
            aria-label={`Downvote ${kind}`}
            title={`Downvote ${kind}`}
            aria-pressed={vote?.myVote === -1}
            disabled={!voting.ready || voting.pending.has(id)}
            onClick={() => voting.vote(id, -1)}
          >
            <Triangle size={13} fill="currentColor" />
          </button>
        ) : (
          <Link
            className="icon-button vote-down"
            href="/account"
            aria-label={`Sign in to downvote ${kind}`}
            title="Sign in to vote"
          >
            <Triangle size={13} fill="currentColor" />
          </Link>
        )}
      </div>
      {voting?.errors[id] && (
        <p className="error-message" role="alert">
          {voting.errors[id]}
        </p>
      )}
    </div>
  );
}

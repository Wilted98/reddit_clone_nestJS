'use client';

import { useApolloClient } from '@apollo/client/react';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  RegisterDocument,
  SessionDocument,
  SessionQuery,
  SignInDocument,
  SignOutDocument,
  SaveProfileDocument,
  UpdateUserInput,
} from '../graphql/generated/auth';
import { createAuthClient } from '../lib/apollo';
import { RegistrationFields, SignInFields } from '../lib/auth-validation';
import { errorMessage, isUnauthenticated } from '../lib/errors';

interface SessionState {
  account: SessionQuery['me'] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: (input: SignInFields) => Promise<void>;
  register: (input: RegistrationFields) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (input: UpdateUserInput) => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [auth] = useState(createAuthClient);
  const social = useApolloClient();
  const [account, setAccount] = useState<SessionQuery['me'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);

  const restore = useCallback(() => {
    const current = ++revision.current;
    return auth
      .query({ query: SessionDocument })
      .then(
        ({ data }) => {
          if (current === revision.current) setAccount(data?.me ?? null);
        },
        (failure) => {
          if (current === revision.current) {
            if (isUnauthenticated(failure)) setAccount(null);
            else setError(errorMessage(failure));
          }
        },
      )
      .finally(() => {
        if (current === revision.current) setLoading(false);
      });
  }, [auth]);

  const invalidate = useCallback(() => {
    ++revision.current;
  }, []);
  useEffect(() => {
    void restore();
    return invalidate;
  }, [restore, invalidate]);

  function refresh() {
    setLoading(true);
    setError(null);
    return restore();
  }

  async function signIn(input: SignInFields) {
    const current = ++revision.current;
    try {
      const { data } = await auth.mutate({
        mutation: SignInDocument,
        variables: { input },
      });
      if (!data?.login) throw new Error('Missing account response');
      await social.clearStore();
      if (current === revision.current) {
        setAccount(data.login);
        setError(null);
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }

  async function register(input: RegistrationFields) {
    await auth.mutate({ mutation: RegisterDocument, variables: { input } });
    // Registration does not set a cookie. Keep login failure separate so retries do not register twice.
  }

  async function signOut() {
    const current = ++revision.current;
    const { data } = await auth.mutate({ mutation: SignOutDocument });
    if (!data?.logout) throw new Error('Logout did not complete');
    await auth.clearStore();
    await social.clearStore();
    if (current === revision.current) {
      setAccount(null);
      setError(null);
      setLoading(false);
    }
  }

  async function updateProfile(input: UpdateUserInput) {
    const accountId = account?.id;
    if (!accountId) throw new Error('No active account');
    const current = ++revision.current;
    try {
      const { data } = await auth.mutate({
        mutation: SaveProfileDocument,
        variables: { input },
      });
      if (current !== revision.current) throw new Error('Session changed');
      if (!data?.updateUser || data.updateUser.id !== accountId)
        throw new Error('Missing account response');
      setAccount(data.updateUser);
      setError(null);
    } catch (failure) {
      if (current === revision.current && isUnauthenticated(failure))
        await refresh();
      throw failure;
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }

  return (
    <SessionContext.Provider
      value={{
        account,
        loading,
        error,
        refresh,
        signIn,
        register,
        signOut,
        updateProfile,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession requires SessionProvider');
  return value;
}

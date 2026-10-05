'use client';

import { HttpLink } from '@apollo/client';
import {
  ApolloClient,
  ApolloNextAppProvider,
  InMemoryCache,
} from '@apollo/client-integration-nextjs';
import { ReactNode } from 'react';
import { endpoints } from '../lib/apollo';
import { SessionProvider } from './session-provider';

function makeClient() {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: endpoints.social,
      credentials: 'include',
      fetchOptions: { cache: 'no-store' },
    }),
  });
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ApolloNextAppProvider makeClient={makeClient}>
      <SessionProvider>{children}</SessionProvider>
    </ApolloNextAppProvider>
  );
}

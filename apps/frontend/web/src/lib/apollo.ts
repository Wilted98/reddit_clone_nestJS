import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';

export const endpoints = {
  auth:
    process.env.NEXT_PUBLIC_AUTH_GRAPHQL_URL ?? 'http://localhost:3000/graphql',
  social:
    process.env.NEXT_PUBLIC_SOCIAL_GRAPHQL_URL ??
    'http://localhost:3001/graphql',
};

export function createAuthClient() {
  return new ApolloClient({
    link: new HttpLink({
      uri: endpoints.auth,
      credentials: 'include',
      fetchOptions: { cache: 'no-store' },
    }),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: { fetchPolicy: 'no-cache' },
      mutate: { fetchPolicy: 'no-cache' },
    },
  });
}

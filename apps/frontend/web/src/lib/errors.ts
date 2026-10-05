import { CombinedGraphQLErrors } from '@apollo/client/errors';

export function isNotFound(error: unknown) {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (item) =>
        item.extensions?.code === 'NOT_FOUND' ||
        (item.extensions?.originalError as { statusCode?: number } | undefined)
          ?.statusCode === 404,
    )
  );
}

export function isUnauthenticated(error: unknown) {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (item) =>
        item.extensions?.code === 'UNAUTHENTICATED' ||
        (item.extensions?.originalError as { statusCode?: number } | undefined)
          ?.statusCode === 401,
    )
  );
}

export function errorMessage(error: unknown): string {
  if (!CombinedGraphQLErrors.is(error)) {
    return 'Could not reach Roorin. Please try again.';
  }
  const item = error.errors[0];
  const details = item.extensions?.originalError as
    | { statusCode?: number; message?: string | string[] }
    | undefined;
  if (details?.statusCode === 429)
    return 'Too many attempts. Please try again shortly.';
  if (isUnauthenticated(error)) return 'Email or password is incorrect.';
  if ((details?.statusCode ?? 500) >= 500)
    return 'Something went wrong. Please try again.';
  const message = details?.message ?? item.message;
  return Array.isArray(message) ? message.join(' ') : message;
}

import { CombinedGraphQLErrors } from '@apollo/client/errors';
import {
  errorMessage,
  isForbidden,
  isNotFound,
  isUnauthenticated,
  socialActionError,
} from './errors';

function failure(
  statusCode: number,
  message: string | string[] = 'Server message',
) {
  return new CombinedGraphQLErrors({
    errors: [
      {
        message: 'Failure',
        extensions: { originalError: { statusCode, message } },
      },
    ],
  });
}

describe('GraphQL error handling', () => {
  it('separates expired write sessions from bad login credentials and membership failures', () => {
    expect(socialActionError(failure(401))).toBe(
      'Your session expired. Sign in to continue.',
    );
    expect(
      socialActionError(
        failure(403, 'Join the community before posting in it.'),
      ),
    ).toContain('Join the community');
    expect(isForbidden(failure(403))).toBe(true);
    expect(
      isForbidden(
        new CombinedGraphQLErrors({
          errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
        }),
      ),
    ).toBe(true);
    expect(isForbidden(failure(404))).toBe(false);
    expect(isForbidden(new Error('Offline'))).toBe(false);
  });
  it('distinguishes a missing community from transport and server failures', () => {
    expect(isNotFound(failure(404))).toBe(true);
    expect(
      isNotFound(
        new CombinedGraphQLErrors({
          errors: [{ message: 'Missing', extensions: { code: 'NOT_FOUND' } }],
        }),
      ),
    ).toBe(true);
    expect(isNotFound(failure(500))).toBe(false);
    expect(isNotFound(new Error('Offline'))).toBe(false);
  });
  it('handles authentication without leaking backend details', () => {
    expect(isUnauthenticated(failure(401))).toBe(true);
    expect(errorMessage(failure(401))).toBe('Email or password is incorrect.');
  });
  it('handles auth codes without a nested status', () => {
    expect(
      isUnauthenticated(
        new CombinedGraphQLErrors({
          errors: [
            {
              message: 'Unauthorized',
              extensions: { code: 'UNAUTHENTICATED' },
            },
          ],
        }),
      ),
    ).toBe(true);
  });
  it('handles throttling without immediate retries', () => {
    expect(errorMessage(failure(429))).toContain('Too many attempts');
  });
  it('joins validation messages', () => {
    expect(
      errorMessage(failure(400, ['Invalid email.', 'Invalid username.'])),
    ).toBe('Invalid email. Invalid username.');
  });
  it('shows actionable conflicts', () => {
    expect(errorMessage(failure(409, 'Username already exists'))).toBe(
      'Username already exists',
    );
  });
  it('hides internal failures', () => {
    expect(errorMessage(failure(500, 'Database secret'))).not.toContain(
      'secret',
    );
  });
  it('handles network failures and unknown shapes', () => {
    expect(errorMessage(new Error('Socket failure'))).toContain(
      'Could not reach',
    );
    expect(isUnauthenticated(undefined)).toBe(false);
  });
});

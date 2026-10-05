import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { errorMessage, isUnauthenticated } from './errors';

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

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginInput } from './login.input';

describe('LoginInput', () => {
  const errorsFor = async (overrides: Partial<LoginInput>) => {
    const instance = plainToInstance(LoginInput, {
      email: 'vasi@roorin.dev',
      password: 'whatever-the-user-typed',
      ...overrides,
    });
    return validate(instance);
  };

  it('accepts a well-formed input', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejects a malformed email', async () => {
    const errors = await errorsFor({ email: 'not-an-email' });
    expect(errors.map((e) => e.property)).toContain('email');
  });

  it('rejects an empty password', async () => {
    const errors = await errorsFor({ password: '' });
    expect(errors.map((e) => e.property)).toContain('password');
  });

  it('does not judge password strength - unlike registration, this is a login, not a policy check', async () => {
    // A user's real password may predate whatever strength rules exist today.
    // Login must accept whatever they actually set it to, or nobody could
    // ever sign in again after a policy change.
    expect(await errorsFor({ password: 'weak' })).toHaveLength(0);
  });
});

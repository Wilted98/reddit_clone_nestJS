import { registrationSchema, signInSchema } from './auth-validation';

const valid = {
  username: 'roorin_user',
  email: 'user@example.com',
  password: 'Strong123!',
};

describe('auth validation', () => {
  it('accepts registration matching backend rules', () => {
    expect(registrationSchema.safeParse(valid).success).toBe(true);
  });
  it.each(['ab', 'a'.repeat(21), 'with spaces', 'punctuation!'])(
    'rejects username %s',
    (username) => {
      expect(registrationSchema.safeParse({ ...valid, username }).success).toBe(
        false,
      );
    },
  );
  it.each([
    'short',
    'alllowercase1!',
    'ALLUPPERCASE1!',
    'NoNumbers!',
    'NoSymbols123',
  ])('rejects weak registration password %s', (password) => {
    expect(registrationSchema.safeParse({ ...valid, password }).success).toBe(
      false,
    );
  });
  it('does not enforce current registration strength on existing passwords', () => {
    expect(
      signInSchema.safeParse({ email: valid.email, password: 'old' }).success,
    ).toBe(true);
  });
  it.each([
    { email: 'bad', password: 'pass' },
    { email: valid.email, password: '' },
  ])('rejects invalid login input', (input) => {
    expect(signInSchema.safeParse(input).success).toBe(false);
  });
});

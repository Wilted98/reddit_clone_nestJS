import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserInput } from './create-user.input';

/**
 * Exercises the validators declared on CreateUserInput directly, independent
 * of whether a ValidationPipe is wired up at the HTTP/GraphQL layer. This is
 * deliberate: it proves the DTO's own rules are correct even before (or
 * regardless of whether) something in front of it actually enforces them.
 *
 * NOTE: as of this writing, `main.ts` does not register a global
 * ValidationPipe, so these rules are not yet enforced on incoming requests -
 * see docs/04-authentication.md "Known gaps".
 */
describe('CreateUserInput', () => {
  const validInput = {
    username: 'vasi_pop',
    email: 'vasi@roorin.dev',
    password: 'Str0ng!Passw0rd1',
  };

  const errorsFor = async (overrides: Partial<typeof validInput>) => {
    const instance = plainToInstance(CreateUserInput, {
      ...validInput,
      ...overrides,
    });
    return validate(instance);
  };

  it('accepts a well-formed input with no errors', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  describe('username', () => {
    it('rejects fewer than 3 characters', async () => {
      const errors = await errorsFor({ username: 'ab' });
      expect(errors.map((e) => e.property)).toContain('username');
    });

    it('rejects more than 20 characters', async () => {
      const errors = await errorsFor({ username: 'a'.repeat(21) });
      expect(errors.map((e) => e.property)).toContain('username');
    });

    it.each(['vasi pop', 'vasi-pop', 'vasi.pop', 'vasi@pop'])(
      'rejects characters outside [a-zA-Z0-9_]: %s',
      async (username) => {
        const errors = await errorsFor({ username });
        expect(errors.map((e) => e.property)).toContain('username');
      },
    );

    it('accepts underscores and mixed case at the length boundaries', async () => {
      expect(await errorsFor({ username: 'abc' })).toHaveLength(0);
      expect(await errorsFor({ username: 'A_b9'.repeat(5) })).toHaveLength(0); // 20 chars
    });
  });

  describe('email', () => {
    it.each(['not-an-email', 'missing-at.dev', 'two@@at.dev', ''])(
      'rejects malformed addresses: %s',
      async (email) => {
        const errors = await errorsFor({ email });
        expect(errors.map((e) => e.property)).toContain('email');
      },
    );
  });

  describe('password', () => {
    it.each([
      'short1!',
      'alllowercase1!',
      'ALLUPPERCASE1!',
      'NoNumbersHere!',
      'NoSymbols1234',
    ])(
      'rejects passwords missing a required character class: %s',
      async (password) => {
        const errors = await errorsFor({ password });
        expect(errors.map((e) => e.property)).toContain('password');
      },
    );
  });

  it('reports one error entry per invalid field, not just the first', async () => {
    const errors = await errorsFor({
      username: 'a',
      email: 'nope',
      password: 'weak',
    });
    const properties = errors.map((e) => e.property).sort();
    expect(properties).toEqual(['email', 'password', 'username']);
  });
});

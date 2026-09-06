import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserInput } from './update-user.input';

describe('UpdateUserInput', () => {
  const errorsFor = async (fields: Partial<UpdateUserInput>) => {
    const instance = plainToInstance(UpdateUserInput, fields);
    return validate(instance);
  };

  it('accepts an empty input - both fields are optional, updating neither is valid', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('accepts a valid bio and avatarUrl together', async () => {
    expect(
      await errorsFor({
        bio: 'building roorin',
        avatarUrl: 'https://cdn.roorin.dev/a.png',
      }),
    ).toHaveLength(0);
  });

  it('rejects a bio over 300 characters', async () => {
    const errors = await errorsFor({ bio: 'a'.repeat(301) });
    expect(errors.map((e) => e.property)).toContain('bio');
  });

  it('accepts a bio at exactly the 300 character limit', async () => {
    expect(await errorsFor({ bio: 'a'.repeat(300) })).toHaveLength(0);
  });

  it('rejects an avatarUrl that is not a URL', async () => {
    const errors = await errorsFor({ avatarUrl: 'not-a-url' });
    expect(errors.map((e) => e.property)).toContain('avatarUrl');
  });
});

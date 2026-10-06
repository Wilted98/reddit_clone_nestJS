import { communityInput, communitySchema } from './community';

const valid = { name: 'Makers', slug: 'makers', description: '' };

describe('community creation validation', () => {
  it('trims submitted text, omits an empty description, and sends no owner identity', () => {
    const fields = communitySchema.parse({
      name: ' Makers ',
      slug: ' makers ',
      description: '  ',
      ownerId: 'untrusted',
    });
    expect(communityInput(fields)).toEqual({ name: 'Makers', slug: 'makers' });
    expect(communityInput({ ...fields, description: 'Projects' })).toEqual({
      name: 'Makers',
      slug: 'makers',
      description: 'Projects',
    });
  });
  it.each([
    'ab',
    'a'.repeat(25),
    'UPPER',
    'with-dash',
    'with space',
    '../account',
    'cafe\u00e9',
  ])('rejects invalid slugs %s', (slug) => {
    expect(communitySchema.safeParse({ ...valid, slug }).success).toBe(false);
  });
  it.each(['  ', 'ab', 'a'.repeat(61)])('rejects invalid names %s', (name) => {
    expect(communitySchema.safeParse({ ...valid, name }).success).toBe(false);
  });
  it('matches the API upper bounds and accepts plain description text', () => {
    expect(
      communitySchema.safeParse({
        slug: 'a'.repeat(24),
        name: 'a'.repeat(60),
        description: 'a'.repeat(500),
      }).success,
    ).toBe(true);
    expect(
      communitySchema.safeParse({ ...valid, description: 'a'.repeat(501) })
        .success,
    ).toBe(false);
    expect(
      communitySchema.parse({
        ...valid,
        description: '<script>plain text</script>',
      }).description,
    ).toBe('<script>plain text</script>');
  });
});

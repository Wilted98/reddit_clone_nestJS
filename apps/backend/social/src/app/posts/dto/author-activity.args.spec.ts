import { ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { AuthorActivityArgs } from './author-activity.args';

describe('AuthorActivityArgs', () => {
  it('defaults to a bounded 25-item public activity page', async () => {
    const args = Object.assign(new AuthorActivityArgs(), {
      authorId: 'author-1',
    });
    expect(args.limit).toBe(25);
    expect(await validate(args)).toEqual([]);
  });

  it.each([
    ['authorId', ''],
    ['authorId', 1],
    ['authorId', 'x'.repeat(129)],
    ['cursor', ''],
    ['cursor', 1],
    ['cursor', 'x'.repeat(129)],
    ['limit', 0],
    ['limit', 101],
    ['limit', 1.5],
  ])('rejects invalid %s = %j', async (field, value) => {
    const args = Object.assign(new AuthorActivityArgs(), {
      authorId: 'author-1',
      [field]: value,
    });
    expect((await validate(args)).map((error) => error.property)).toContain(
      field,
    );
  });

  it.each([1, 100])('accepts limit %i and a null cursor', async (limit) => {
    const args = Object.assign(new AuthorActivityArgs(), {
      authorId: 'author-1',
      cursor: null,
      limit,
    });
    expect(await validate(args)).toEqual([]);
  });

  it('preserves author/pagination arguments and strips undeclared fields', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const args = await pipe.transform(
      {
        authorId: 'author-1',
        cursor: 'last',
        limit: 10,
        email: 'private@example.com',
      },
      { type: 'body', metatype: AuthorActivityArgs },
    );
    expect(args).toMatchObject({
      authorId: 'author-1',
      cursor: 'last',
      limit: 10,
    });
    expect(args).not.toHaveProperty('email');
  });
});

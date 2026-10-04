import { ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { CommentsArgs } from './comments.args';

describe('CommentsArgs', () => {
  it('uses a bounded default root page', async () => {
    const args = Object.assign(new CommentsArgs(), { postId: 'post-1' });
    expect(args.limit).toBe(25);
    expect(await validate(args)).toEqual([]);
  });

  it.each([
    ['postId', ''],
    ['postId', 1],
    ['postId', 'x'.repeat(129)],
    ['parentId', ''],
    ['parentId', 1],
    ['parentId', 'x'.repeat(129)],
    ['cursor', ''],
    ['cursor', 1],
    ['cursor', 'x'.repeat(129)],
    ['limit', 0],
    ['limit', 101],
    ['limit', 1.5],
  ])('rejects invalid %s = %j', async (field, value) => {
    const args = Object.assign(new CommentsArgs(), {
      postId: 'post-1',
      [field]: value,
    });
    expect((await validate(args)).map((error) => error.property)).toContain(
      field,
    );
  });

  it.each([1, 100])('accepts limit %i and optional nulls', async (limit) => {
    const args = Object.assign(new CommentsArgs(), {
      postId: 'post-1',
      parentId: null,
      cursor: null,
      limit,
    });
    expect(await validate(args)).toEqual([]);
  });

  it('preserves pagination and thread arguments under the global whitelist', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const args = await pipe.transform(
      {
        postId: 'post-1',
        parentId: 'root-1',
        cursor: 'reply-1',
        limit: 10,
        depth: 100,
      },
      { type: 'body', metatype: CommentsArgs },
    );
    expect(args).toMatchObject({
      postId: 'post-1',
      parentId: 'root-1',
      cursor: 'reply-1',
      limit: 10,
    });
    expect(args).not.toHaveProperty('depth');
  });
});

import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCommentInput } from './create-comment.input';

describe('CreateCommentInput', () => {
  const input = { postId: 'post-1', body: 'A comment' };

  it('accepts a top-level comment or a reply', async () => {
    expect(await validate(plainToInstance(CreateCommentInput, input))).toEqual(
      [],
    );
    expect(
      await validate(
        plainToInstance(CreateCommentInput, { ...input, parentId: 'parent-1' }),
      ),
    ).toEqual([]);
  });

  it.each([
    { body: '' },
    { body: 'a'.repeat(10001) },
    { postId: '' },
    { postId: 123 },
    { parentId: '' },
    { parentId: 123 },
  ])('rejects invalid input %j', async (invalid) => {
    expect(
      (
        await validate(
          plainToInstance(CreateCommentInput, { ...input, ...invalid }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it('preserves post and parent IDs while stripping supplied authorship', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    expect(
      await pipe.transform(
        {
          ...input,
          parentId: 'parent-1',
          authorId: 'victim',
          authorUsername: 'victim',
          score: 100,
        },
        { type: 'body', metatype: CreateCommentInput },
      ),
    ).toEqual({ ...input, parentId: 'parent-1' });
  });
});

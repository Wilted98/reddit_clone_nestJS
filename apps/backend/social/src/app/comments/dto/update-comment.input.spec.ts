import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCommentInput } from './update-comment.input';

describe('UpdateCommentInput', () => {
  it('accepts only a target ID and replacement body', async () => {
    expect(
      await validate(
        plainToInstance(UpdateCommentInput, {
          id: 'comment-1',
          body: 'Edited comment',
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    { id: '' },
    { id: 1 },
    { id: 'x'.repeat(129) },
    { body: undefined },
    { body: null },
    { body: '' },
    { body: 'x'.repeat(10001) },
  ])('rejects invalid input %j', async (data) => {
    expect(
      (
        await validate(
          plainToInstance(UpdateCommentInput, {
            id: 'comment-1',
            body: 'Edited comment',
            ...data,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it('strips author, post, parent, score, and server-owned metadata', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const data = { id: 'comment-1', body: 'Edited comment' };
    expect(
      await pipe.transform(
        {
          ...data,
          authorId: 'victim',
          postId: 'other',
          parentId: 'other',
          score: 99,
          deletedAt: null,
          editedAt: new Date(),
        },
        { type: 'body', metatype: UpdateCommentInput },
      ),
    ).toEqual(data);
  });
});

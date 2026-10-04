import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePostInput } from './update-post.input';

describe('UpdatePostInput', () => {
  it.each([
    { title: 'Edited title' },
    { body: 'Edited body' },
    { url: 'https://example.com/edited' },
  ])('accepts a partial edit %j', async (data) => {
    expect(
      await validate(
        plainToInstance(UpdatePostInput, { id: 'post-1', ...data }),
      ),
    ).toEqual([]);
  });

  it.each([
    { id: '' },
    { id: 1 },
    { id: 'x'.repeat(129) },
    { title: null },
    { title: 'ab' },
    { title: 'x'.repeat(301) },
    { body: null },
    { body: '' },
    { body: 'x'.repeat(40001) },
    { url: null },
    { url: 'not-a-url' },
  ])('rejects invalid input %j', async (data) => {
    expect(
      (
        await validate(
          plainToInstance(UpdatePostInput, { id: 'post-1', ...data }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it('lets the service enforce the nonempty patch rule', async () => {
    expect(
      await validate(plainToInstance(UpdatePostInput, { id: 'post-1' })),
    ).toEqual([]);
  });

  it('strips identity, location, counters, deletion, and edit timestamps', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const data = { id: 'post-1', title: 'Edited title' };
    expect(
      await pipe.transform(
        {
          ...data,
          authorId: 'victim',
          communityId: 'other',
          score: 99,
          commentCount: 99,
          deletedAt: null,
          editedAt: new Date(),
        },
        { type: 'body', metatype: UpdatePostInput },
      ),
    ).toEqual(data);
  });
});

import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePostInput } from './create-post.input';

describe('CreatePostInput', () => {
  const input = {
    communitySlug: 'romania',
    title: 'Post title',
    body: 'Text post',
  };

  it('accepts a text post or a link post', async () => {
    expect(await validate(plainToInstance(CreatePostInput, input))).toEqual([]);
    expect(
      await validate(
        plainToInstance(CreatePostInput, {
          communitySlug: input.communitySlug,
          title: input.title,
          url: 'https://example.com',
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    { title: 'ab' },
    { title: 'a'.repeat(301) },
    { body: '' },
    { body: 'a'.repeat(40001) },
    { url: 'not-a-url' },
    { communitySlug: '' },
    { communitySlug: 123 },
  ])('rejects invalid input %j', async (invalid) => {
    expect(
      (
        await validate(
          plainToInstance(CreatePostInput, { ...input, ...invalid }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it('preserves content and strips caller-supplied identity and counters', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    expect(
      await pipe.transform(
        {
          ...input,
          authorId: 'victim',
          authorUsername: 'victim',
          score: 100,
          commentCount: 100,
        },
        { type: 'body', metatype: CreatePostInput },
      ),
    ).toEqual(input);
  });
});

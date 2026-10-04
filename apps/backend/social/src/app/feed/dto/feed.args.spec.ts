import { ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { FeedArgs, FeedRange, FeedSort } from './feed.args';

describe('FeedArgs', () => {
  it('uses valid HOT/ALL defaults', async () => {
    const args = new FeedArgs();
    expect(args).toMatchObject({
      sort: FeedSort.HOT,
      range: FeedRange.ALL,
      limit: 25,
      offset: 0,
    });
    expect(await validate(args)).toEqual([]);
  });

  it.each([
    ['sort', 'bad'],
    ['range', 'bad'],
    ['limit', 0],
    ['limit', 101],
    ['limit', 1.5],
    ['offset', -1],
    ['offset', 501],
    ['offset', 0.5],
    ['communitySlug', ''],
    ['communitySlug', 1],
    ['cursor', ''],
    ['cursor', 1],
  ])('rejects invalid %s = %j', async (field, value) => {
    const errors = await validate(
      Object.assign(new FeedArgs(), { [field]: value }),
    );
    expect(errors.map((error) => error.property)).toContain(field);
  });

  it('accepts optional nulls and pagination boundaries', async () => {
    const args = Object.assign(new FeedArgs(), {
      limit: 100,
      offset: 500,
      cursor: null,
      communitySlug: null,
    });
    expect(await validate(args)).toEqual([]);
  });

  it('preserves declared arguments under the global whitelist', async () => {
    const value = {
      sort: FeedSort.TOP,
      range: FeedRange.DAY,
      communitySlug: 'romania',
      cursor: 'post-1',
      limit: 10,
      offset: 5,
      score: 500,
    };
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const transformed = await pipe.transform(value, {
      type: 'body',
      metatype: FeedArgs,
    });
    expect(transformed).toMatchObject({
      sort: FeedSort.TOP,
      range: FeedRange.DAY,
      communitySlug: 'romania',
      cursor: 'post-1',
      limit: 10,
      offset: 5,
    });
    expect(transformed).not.toHaveProperty('score');
  });
});

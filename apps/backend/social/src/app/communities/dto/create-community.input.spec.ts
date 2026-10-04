import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import { PaginationArgs } from '@roorin/nestjs';
import { CreateCommunityInput } from './create-community.input';

describe('CreateCommunityInput', () => {
  const valid = {
    slug: 'romania',
    name: 'Romania',
    description: 'A community',
  };

  it('accepts valid input with an optional description', async () => {
    expect(
      await validate(plainToInstance(CreateCommunityInput, valid)),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(CreateCommunityInput, { slug: 'abc', name: 'ABC' }),
      ),
    ).toEqual([]);
  });

  it.each([
    'ab',
    'a'.repeat(25),
    'Romania',
    'has-dash',
    'has space',
    'has!punctuation',
  ])('rejects invalid slug %s', async (slug) => {
    const errors = await validate(
      plainToInstance(CreateCommunityInput, { ...valid, slug }),
    );
    expect(errors.map((error) => error.property)).toContain('slug');
  });

  it.each(['ab', 'a'.repeat(61)])(
    'rejects an invalid name length',
    async (name) => {
      const errors = await validate(
        plainToInstance(CreateCommunityInput, { ...valid, name }),
      );
      expect(errors.map((error) => error.property)).toContain('name');
    },
  );

  it('rejects a description over 500 characters', async () => {
    const errors = await validate(
      plainToInstance(CreateCommunityInput, {
        ...valid,
        description: 'a'.repeat(501),
      }),
    );
    expect(errors.map((error) => error.property)).toContain('description');
  });

  it('keeps valid fields and strips caller-supplied ownership and counters', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const result = await pipe.transform(
      { ...valid, ownerId: 'victim', memberCount: 999 },
      { type: 'body', metatype: CreateCommunityInput },
    );
    expect(result).toEqual(valid);
  });
});

describe('PaginationArgs', () => {
  it('defaults to a page size of 25', () => {
    expect(new PaginationArgs().limit).toBe(25);
  });

  it.each([1, 100])('accepts page size %i', async (limit) => {
    expect(await validate(plainToInstance(PaginationArgs, { limit }))).toEqual(
      [],
    );
  });

  it.each([0, -1, 101, 1.5])('rejects page size %s', async (limit) => {
    const errors = await validate(plainToInstance(PaginationArgs, { limit }));
    expect(errors.map((error) => error.property)).toContain('limit');
  });

  it('rejects a non-string cursor', async () => {
    const errors = await validate(
      plainToInstance(PaginationArgs, { cursor: 123 }),
    );
    expect(errors.map((error) => error.property)).toContain('cursor');
  });
});

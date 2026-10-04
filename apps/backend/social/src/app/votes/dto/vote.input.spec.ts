import { ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { VoteInput } from './vote.input';

describe('VoteInput', () => {
  it.each([-1, 0, 1])('accepts vote value %i', async (value) => {
    expect(
      await validate(
        Object.assign(new VoteInput(), { targetId: 'target-1', value }),
      ),
    ).toEqual([]);
  });

  it.each([
    ['targetId', ''],
    ['targetId', 123],
    ['targetId', undefined],
    ['value', 2],
    ['value', -2],
    ['value', 0.5],
    ['value', '1'],
    ['value', null],
  ])('rejects invalid %s = %j', async (field, value) => {
    const errors = await validate(
      Object.assign(new VoteInput(), {
        targetId: 'target-1',
        value: 1,
        [field]: value,
      }),
    );
    expect(errors.map((error) => error.property)).toContain(field);
  });

  it('strips forged identity and score but retains vote fields', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const result = await pipe.transform(
      { targetId: 'target-1', value: -1, userId: 'forged', score: 50 },
      { type: 'body', metatype: VoteInput },
    );
    expect(result).toEqual(
      Object.assign(new VoteInput(), { targetId: 'target-1', value: -1 }),
    );
  });
});

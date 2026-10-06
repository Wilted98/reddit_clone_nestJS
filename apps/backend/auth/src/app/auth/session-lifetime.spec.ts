import { sessionLifetimeMs } from './session-lifetime';

describe('session lifetime configuration', () => {
  it('accepts a seven-day lifetime and explicit shorter lifetimes', () => {
    expect(sessionLifetimeMs('604800000')).toBe(604800000);
    expect(sessionLifetimeMs(3600000)).toBe(3600000);
    expect(sessionLifetimeMs('1000')).toBe(1000);
  });

  it.each([
    undefined,
    null,
    '',
    'seven days',
    '1h',
    ' 1000 ',
    0,
    -1000,
    1500,
    Infinity,
    2592001000,
  ])('rejects invalid or excessive lifetimes: %p', (value) => {
    expect(() => sessionLifetimeMs(value)).toThrow('JWT_EXPIRATION_MS');
  });
});

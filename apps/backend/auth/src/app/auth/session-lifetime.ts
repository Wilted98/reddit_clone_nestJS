export function sessionLifetimeMs(value: unknown): number {
  const duration = Number(value);
  if (
    (typeof value !== 'number' &&
      (typeof value !== 'string' || !/^\d+$/.test(value))) ||
    !Number.isSafeInteger(duration) ||
    duration < 1000 ||
    duration > 30 * 24 * 60 * 60 * 1000 ||
    duration % 1000 !== 0
  ) {
    throw new Error(
      'JWT_EXPIRATION_MS must be whole seconds in milliseconds, between 1000 and 2592000000.',
    );
  }
  return duration;
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateLocalDatabase } from './dev-database.mjs';
import { requireResetConfirmation, resetDatabases } from './database.mjs';

test('allows only exact local service databases and refuses production/query overrides', () => {
  assert.equal(
    validateLocalDatabase(
      'postgresql://user:pass@localhost:5432/roorin_auth',
      'auth',
      'development',
    ).pathname,
    '/roorin_auth',
  );
  validateLocalDatabase(
    'postgresql://user:pass@[::1]:5432/roorin_social',
    'social',
    'test',
  );
  for (const url of [
    'postgresql://user:pass@db.example.com/roorin_auth',
    'postgresql://user:pass@localhost/other_app',
    'postgresql://user:pass@localhost/roorin_auth?host=db.example.com',
    'https://localhost/roorin_auth',
    'postgresql://user:pass@localhost/roorin_social',
  ])
    assert.throws(() => validateLocalDatabase(url, 'auth', 'development'));
  assert.throws(() =>
    validateLocalDatabase(
      'postgresql://user:pass@localhost/roorin_auth',
      'auth',
      'production',
    ),
  );
});

test('requires an explicit confirmation to wipe records', () => {
  for (const value of [undefined, false, null, 'yes'])
    assert.throws(() => requireResetConfirmation(value));
  requireResetConfirmation(true);
});

test('clears all social records transactionally before deleting auth users, preserving schemas', async () => {
  const calls = [];
  const social = Object.fromEntries(
    ['vote', 'comment', 'post', 'membership', 'community'].map((name) => [
      name,
      { deleteMany: () => name },
    ]),
  );
  social.$transaction = async (operations) => calls.push(operations);
  const auth = { user: { deleteMany: async () => calls.push('users') } };
  await resetDatabases({ auth, social });
  assert.deepEqual(calls, [
    ['vote', 'comment', 'post', 'membership', 'community'],
    'users',
  ]);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'roorin-production-'));
  for (const directory of ['scripts', 'deploy', 'bin'])
    mkdirSync(path.join(root, directory));
  copyFileSync(
    new URL('./production.sh', import.meta.url),
    path.join(root, 'scripts/production.sh'),
  );
  const run = (...args) =>
    spawnSync('bash', ['scripts/production.sh', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` },
    });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, run, envFile: path.join(root, 'deploy/.env.production') };
}

test('production init creates private random secrets and never rotates an existing configuration', (t) => {
  const { root, run, envFile } = fixture(t);
  const first = run('init');
  assert.equal(first.status, 0, first.stderr);
  const original = readFileSync(envFile, 'utf8');
  assert.match(original, /POSTGRES_PASSWORD=[a-f0-9]{64}\n/);
  assert.match(original, /AUTH_DATABASE_PASSWORD=[a-f0-9]{64}\n/);
  assert.match(original, /SOCIAL_DATABASE_PASSWORD=[a-f0-9]{64}\n/);
  assert.match(original, /JWT_SECRET=[a-f0-9]{128}\n/);
  assert.equal(statSync(envFile).mode & 0o777, 0o600);
  assert.ok(!first.stdout.includes(original.match(/JWT_SECRET=(.*)/)[1]));
  assert.equal(run('init').status, 0);
  assert.equal(readFileSync(envFile, 'utf8'), original);
  assert.ok(
    !readFileSync(path.join(root, 'scripts/production.sh'), 'utf8').includes(
      'migrate reset',
    ),
  );
});

test('production refuses to start without its explicit configuration', (t) => {
  const { run } = fixture(t);
  const result = run('up');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /init first/);
});

test('production start waits for Postgres, backs up both databases, and applies migrations before starting apps', (t) => {
  const { root, run } = fixture(t);
  assert.equal(run('init').status, 0);
  writeFileSync(
    path.join(root, 'bin/docker'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${root}/calls'\n`,
    { mode: 0o755 },
  );
  const result = run('up');
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(path.join(root, 'calls'), 'utf8')
    .split('\n')
    .filter(Boolean);
  assert.match(calls[0], /config --quiet$/);
  assert.match(calls[1], /up -d --no-build --wait postgres$/);
  assert.match(calls[2], /pg_dump -U roorin -Fc roorin_auth$/);
  assert.match(calls[3], /pg_dump -U roorin -Fc roorin_social$/);
  assert.match(calls[4], /run --rm --no-deps migrate$/);
  assert.match(calls[5], /up -d --no-build --wait auth social web proxy$/);
  assert.ok(!calls.some((call) => /seed|reset|down -v/.test(call)));
});

test('a failed migration prevents application startup', (t) => {
  const { root, run } = fixture(t);
  assert.equal(run('init').status, 0);
  writeFileSync(
    path.join(root, 'bin/docker'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${root}/calls'\nif [[ "$*" == *"run --rm --no-deps migrate"* ]]; then exit 1; fi\n`,
    { mode: 0o755 },
  );
  assert.notEqual(run('up').status, 0);
  assert.ok(
    !readFileSync(path.join(root, 'calls'), 'utf8').includes(
      '--wait auth social web proxy',
    ),
  );
});

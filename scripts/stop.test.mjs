import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { once } from 'node:events';
import {
  isProjectPath,
  parseProcesses,
  selectProcesses,
  stopProject,
} from './stop.mjs';

test('project boundaries exclude similarly named siblings and support spaces', () => {
  assert.equal(
    isProjectPath('node /work/roorin/node_modules/nx/index.js', '/work/roorin'),
    true,
  );
  assert.equal(
    isProjectPath(
      'node /work/roorin_completed_claude/server.js',
      '/work/roorin',
    ),
    false,
  );
  assert.equal(isProjectPath('/work/roorin-other', '/work/roorin'), false);
  assert.equal(
    isProjectPath('node "/work/my project/server.js"', '/work/my project'),
    true,
  );
});

test('selects owned runners, daemons and descendants but not stop ancestors, editors or unrelated services', () => {
  const table = parseProcesses(`
    1 0 /sbin/launchd
    10 1 /Applications/Editor /work/roorin
    11 10 /bin/zsh
    12 11 npm run stop
    13 12 node /work/roorin/scripts/stop.mjs
    20 1 node /work/roorin/node_modules/nx/daemon.js
    21 1 npm run dev
    22 21 /bin/sh -c next dev
    23 22 node next dev
    24 23 worker
    30 1 node /work/roorin_completed_claude/server.js
    40 1 node /elsewhere/server.js
  `);
  const selected = selectProcesses(
    table,
    '/work/roorin',
    13,
    new Map([
      [21, '/work/roorin'],
      [23, '/work/roorin/apps/frontend/web'],
    ]),
  );
  assert.deepEqual(
    selected.map((item) => item.pid),
    [20, 21, 22, 23, 24],
  );
});

test('actually stops a fixture process, leaves a similarly named sibling alive, and supports dry runs', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'roorin-stop-'));
  const root = path.join(temporary, 'project');
  const sibling = `${root}-other`;
  await mkdir(root);
  await mkdir(sibling);
  const start = (cwd) =>
    spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      cwd,
      stdio: 'ignore',
    });
  const owned = start(root);
  const unrelated = start(sibling);
  const ownedSpawned = once(owned, 'spawn');
  const unrelatedSpawned = once(unrelated, 'spawn');
  try {
    await ownedSpawned;
    await unrelatedSpawned;
    const targets = await stopProject({
      root,
      dryRun: true,
      log: () => undefined,
    });
    assert(targets.some((item) => item.pid === owned.pid));
    assert(!targets.some((item) => item.pid === unrelated.pid));
    assert.equal(owned.exitCode, null);
    await stopProject({ root, log: () => undefined });
    assert(owned.exitCode !== null || owned.signalCode !== null);
    assert.equal(unrelated.exitCode, null);
    assert.equal(unrelated.signalCode, null);
  } finally {
    for (const child of [owned, unrelated]) {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL');
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse } from 'yaml';

const revision = 'a'.repeat(40);
const releaseId = `${revision}-42-1`;
const imagePrefix = 'sample-site';
const script = (name) => new URL(`./${name}`, import.meta.url);

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'deployment-'));
  const bin = path.join(root, 'bin');
  const incoming = path.join(root, 'incoming', releaseId);
  mkdirSync(bin);
  mkdirSync(incoming, { recursive: true });
  const configuration = path.join(root, '.env.production');
  writeFileSync(
    configuration,
    `DOMAIN=example.com\nIMAGE_PREFIX=${imagePrefix}\nCOMPOSE_PROJECT_NAME=sample-production\nJWT_SECRET=preserved-secret\n`,
    {
      mode: 0o600,
    },
  );
  const executable = (name, content) =>
    writeFileSync(path.join(bin, name), content, { mode: 0o755 });
  executable('sudo', '#!/usr/bin/env bash\nshift\nexec "$@"\n');
  executable(
    'docker',
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$CALLS"
if [[ "$*" == 'image inspect '* ]]; then
  printf '%s\\n' "\${IMAGE_METADATA:-amd64 ${revision}}"
elif [[ "$*" == 'image save '* ]]; then
  printf 'fake image archive'
elif [[ "$*" == *'run --rm --no-deps migrate' && "\${FAIL_MIGRATION:-}" == 1 ]]; then
  exit 1
fi
`,
  );
  executable('flock', '#!/usr/bin/env bash\nexit "${FAIL_LOCK:-0}"\n');
  executable(
    'stat',
    '#!/usr/bin/env node\nconst fs = require("node:fs"); console.log((fs.statSync(process.argv.at(-1)).mode & 0o777).toString(8));\n',
  );
  executable(
    'mv',
    '#!/usr/bin/env node\nrequire("node:fs").renameSync(process.argv[3], process.argv[4]);\n',
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    CALLS: path.join(root, 'calls'),
  };
  const run = (extraEnv = {}, id = releaseId) =>
    spawnSync(
      'bash',
      [script('deploy-release.sh').pathname, root, revision, id],
      {
        cwd: path.join(root, 'incoming', id),
        env: { ...env, ...extraEnv },
        encoding: 'utf8',
      },
    );
  const calls = () =>
    existsSync(env.CALLS) ? readFileSync(env.CALLS, 'utf8') : '';
  return { root, bin, incoming, configuration, executable, env, run, calls };
}

function checksum(directory) {
  const files = [
    'source.tar.gz',
    'images.tar.gz',
    'revision',
    'domain',
    'image-prefix',
  ];
  writeFileSync(
    path.join(directory, 'SHA256SUMS'),
    files
      .map((file) => {
        const digest = createHash('sha256')
          .update(readFileSync(path.join(directory, file)))
          .digest('hex');
        return `${digest}  ${file}\n`;
      })
      .join(''),
  );
}

function bundle(f) {
  const source = path.join(f.root, 'source');
  mkdirSync(path.join(source, 'scripts'), { recursive: true });
  mkdirSync(path.join(source, 'deploy'));
  copyFileSync(
    script('production.sh'),
    path.join(source, 'scripts/production.sh'),
  );
  writeFileSync(
    path.join(source, 'compose.production.yaml'),
    'name: sample-production\n',
  );
  assert.equal(
    spawnSync('tar', [
      '-czf',
      path.join(f.incoming, 'source.tar.gz'),
      '-C',
      source,
      '.',
    ]).status,
    0,
  );
  writeFileSync(path.join(f.incoming, 'images.tar.gz'), 'image bundle');
  writeFileSync(path.join(f.incoming, 'revision'), `${revision}\n`);
  writeFileSync(path.join(f.incoming, 'domain'), 'example.com\n');
  writeFileSync(path.join(f.incoming, 'image-prefix'), `${imagePrefix}\n`);
  checksum(f.incoming);
}

test('workflow deploys only main, tests before builds, pins actions and never cancels migrations', () => {
  const workflow = parse(
    readFileSync(
      new URL('../.github/workflows/deploy-production.yml', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.deploy.needs, 'build');
  assert.equal(workflow.jobs.deploy.environment.name, 'production');
  assert.equal(workflow.env.DOMAIN, '${{ vars.PRODUCTION_DOMAIN }}');
  assert.equal(workflow.env.IMAGE_PREFIX, '${{ vars.IMAGE_PREFIX }}');
  const transfer = workflow.jobs.deploy.steps.find(
    (step) => step.env?.VPS_HOST,
  );
  assert.equal(transfer.env.VPS_USER, '${{ vars.VPS_USER }}');
  assert.equal(transfer.env.VPS_DEPLOY_PATH, '${{ vars.VPS_DEPLOY_PATH }}');
  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job.if, "github.ref == 'refs/heads/main'");
    for (const step of job.steps.filter((item) => item.uses)) {
      assert.match(step.uses, /@[a-f0-9]{40}$/);
    }
  }
  const steps = workflow.jobs.build.steps;
  assert.ok(
    steps.findIndex((step) => step.name?.includes('tests')) <
      steps.findIndex((step) => step.with?.target === 'backend'),
  );
  assert.ok(!JSON.stringify(workflow.jobs.build).includes('secrets.'));
  assert.match(
    JSON.stringify(workflow.jobs.deploy),
    /Skip a superseded main commit/,
  );
});

test('deployment guide uses generic connection placeholders and contains no public VPS address', () => {
  const guide = readFileSync(
    new URL('../docs/20-vps-deployment.md', import.meta.url),
    'utf8',
  );
  assert.match(guide, /export VPS_HOST=YOUR_VPS_HOST/);
  assert.match(guide, /export VPS_USER=YOUR_SSH_USER/);
  const documentedNetworkAddresses = new Set([
    '0.0.0.0',
    '172.30.0.2',
    '172.30.0.128',
    '172.30.0.0',
  ]);
  for (const address of guide.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [])
    assert.ok(
      documentedNetworkAddresses.has(address),
      `Unexpected server address: ${address}`,
    );
});

test('release packaging includes only production files, not configuration or demo data', (t) => {
  const f = fixture(t);
  const source = path.join(f.root, 'checkout');
  mkdirSync(path.join(source, 'scripts'), { recursive: true });
  mkdirSync(path.join(source, 'deploy'));
  for (const file of [
    'package-release.sh',
    'production.sh',
    'deploy-release.sh',
  ])
    copyFileSync(script(file), path.join(source, 'scripts', file));
  for (const file of [
    'Dockerfile',
    'Caddyfile',
    'init-databases.sh',
    'migrate.sh',
  ])
    writeFileSync(path.join(source, 'deploy', file), 'production file');
  writeFileSync(
    path.join(source, 'compose.production.yaml'),
    'name: sample-production\n',
  );
  writeFileSync(path.join(source, 'deploy/.env.production'), 'PRIVATE=secret');
  writeFileSync(path.join(source, 'scripts/seed.mjs'), 'demo script');
  const result = spawnSync(
    'bash',
    ['scripts/package-release.sh', revision, 'example.com', imagePrefix],
    {
      cwd: source,
      env: f.env,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const directory = path.join(source, '.local-backups/ci-release');
  const entries = spawnSync(
    'tar',
    ['-tzf', path.join(directory, 'source.tar.gz')],
    { encoding: 'utf8' },
  ).stdout;
  assert.match(entries, /scripts\/production.sh/);
  assert.ok(!/\.env|seed|node_modules/.test(entries));
  assert.match(
    f.calls(),
    new RegExp(`image save ${imagePrefix}-backend:${revision}`),
  );
  assert.equal(
    spawnSync('sha256sum', ['-c', 'SHA256SUMS'], { cwd: directory }).status,
    0,
  );
});

test('healthy deploy preserves secrets/data, selects commit images and updates current only after startup', (t) => {
  const f = fixture(t);
  bundle(f);
  const original = readFileSync(f.configuration, 'utf8');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(f.configuration, 'utf8'), original);
  const release = path.join(f.root, 'releases', releaseId);
  assert.equal(readlinkSync(path.join(f.root, 'current')), release);
  assert.equal(
    readlinkSync(path.join(release, 'deploy/.env.production')),
    f.configuration,
  );
  assert.equal(
    readlinkSync(path.join(release, '.local-backups')),
    path.join(f.root, 'backups'),
  );
  assert.equal(
    readFileSync(path.join(release, 'deploy/.image-tag'), 'utf8').trim(),
    revision,
  );
  assert.equal(
    readFileSync(path.join(release, 'deploy/.image-prefix'), 'utf8').trim(),
    imagePrefix,
  );
  assert.ok(
    f.calls().indexOf('pg_dump') <
      f.calls().indexOf('run --rm --no-deps migrate'),
  );
  assert.ok(
    f.calls().indexOf('run --rm --no-deps migrate') <
      f.calls().indexOf('--wait auth social web proxy'),
  );
  assert.ok(!/seed|reset|down -v|system prune/.test(f.calls()));
  assert.ok(!existsSync(path.join(f.incoming, 'images.tar.gz')));
});

test('migration failure retains the operator link and never starts replacement apps', (t) => {
  const f = fixture(t);
  bundle(f);
  symlinkSync('/previous-release', path.join(f.root, 'current'));
  const result = f.run({ FAIL_MIGRATION: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(readlinkSync(path.join(f.root, 'current')), '/previous-release');
  assert.ok(!f.calls().includes('--wait auth social web proxy'));
  assert.ok(existsSync(path.join(f.incoming, 'images.tar.gz')));
});

test('mismatched image architecture or commit is rejected before any database operations', (t) => {
  const f = fixture(t);
  bundle(f);
  assert.notEqual(f.run({ IMAGE_METADATA: `arm64 ${revision}` }).status, 0);
  assert.ok(!f.calls().includes('pg_dump'));
  assert.ok(!existsSync(path.join(f.root, 'current')));
});

test('changed archive, domain, prefix, project, private-file permissions or active deployment stop before loading images', (t) => {
  for (const failure of [
    'checksum',
    'domain',
    'prefix',
    'project',
    'permissions',
    'lock',
  ]) {
    const f = fixture(t);
    bundle(f);
    if (failure === 'checksum')
      writeFileSync(path.join(f.incoming, 'images.tar.gz'), 'modified');
    if (failure === 'domain')
      writeFileSync(f.configuration, 'DOMAIN=other.example\n');
    if (failure === 'prefix')
      writeFileSync(
        f.configuration,
        'DOMAIN=example.com\nIMAGE_PREFIX=another-site\nCOMPOSE_PROJECT_NAME=sample-production\n',
      );
    if (failure === 'project')
      writeFileSync(
        f.configuration,
        `DOMAIN=example.com\nIMAGE_PREFIX=${imagePrefix}\n`,
      );
    if (failure === 'permissions') chmodSync(f.configuration, 0o644);
    const result = f.run(failure === 'lock' ? { FAIL_LOCK: '1' } : {});
    assert.notEqual(result.status, 0, failure);
    assert.equal(f.calls(), '', failure);
  }
});

test('successful update retains previous/current tags and removes only older release images', (t) => {
  const f = fixture(t);
  bundle(f);
  const previousTag = 'b'.repeat(40);
  const obsoleteTag = 'c'.repeat(40);
  for (const tag of [previousTag, obsoleteTag]) {
    const release = path.join(f.root, 'releases', `${tag}-1-1`);
    mkdirSync(path.join(release, 'deploy'), { recursive: true });
    writeFileSync(path.join(release, 'deploy/.image-tag'), `${tag}\n`);
    writeFileSync(
      path.join(release, 'deploy/.image-prefix'),
      `${imagePrefix}\n`,
    );
  }
  const previous = path.join(f.root, 'releases', `${previousTag}-1-1`);
  symlinkSync(previous, path.join(f.root, 'current'));
  assert.equal(f.run().status, 0);
  assert.equal(readlinkSync(path.join(f.root, 'previous')), previous);
  const removals = f
    .calls()
    .split('\n')
    .filter((line) => line.startsWith('image rm'));
  assert.equal(removals.length, 1);
  assert.ok(removals[0].includes(`${imagePrefix}-backend:${obsoleteTag}`));
  assert.ok(!removals[0].includes(previousTag));
  assert.ok(!removals[0].includes(revision));
});

test('SSH transfer validates configuration, pins host keys and removes temporary private keys', (t) => {
  const f = fixture(t);
  const checkout = path.join(f.root, 'checkout');
  mkdirSync(path.join(checkout, 'scripts'), { recursive: true });
  mkdirSync(path.join(checkout, '.local-backups/ci-release'), {
    recursive: true,
  });
  copyFileSync(
    script('deploy-over-ssh.sh'),
    path.join(checkout, 'scripts/deploy-over-ssh.sh'),
  );
  const configCopy = path.join(f.root, 'ssh-config');
  f.executable('ssh-keygen', '#!/usr/bin/env bash\nexit 0\n');
  f.executable(
    'ssh',
    `#!/usr/bin/env bash\ncp "$2" '${configCopy}'\nprintf '%s\\n' "$*" >> "$CALLS"\n`,
  );
  f.executable('scp', '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$CALLS"\n');
  const env = {
    ...f.env,
    VPS_HOST: 'vps.example.com',
    VPS_USER: 'deploy',
    VPS_DEPLOY_PATH: '/srv/my-site',
    VPS_SSH_PRIVATE_KEY: 'private-secret',
    VPS_SSH_KNOWN_HOSTS: 'pinned-host-key',
  };
  const run = (extra = {}) =>
    spawnSync('bash', ['scripts/deploy-over-ssh.sh', revision, releaseId], {
      cwd: checkout,
      env: { ...env, ...extra },
      encoding: 'utf8',
    });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const configuration = readFileSync(configCopy, 'utf8');
  assert.match(configuration, /StrictHostKeyChecking yes/);
  assert.match(configuration, /BatchMode yes/);
  assert.ok(!existsSync(configuration.match(/IdentityFile (.*)/)[1]));
  assert.ok(!f.calls().includes('private-secret'));
  assert.match(f.calls(), /sha256sum -c SHA256SUMS/);
  for (const extra of [
    { VPS_HOST: 'host; touch /tmp/no' },
    { VPS_DEPLOY_PATH: '/srv/../other' },
    { VPS_DEPLOY_PATH: '' },
    { VPS_USER: '' },
    { VPS_PORT: '70000' },
    { VPS_SSH_PRIVATE_KEY: '' },
  ])
    assert.notEqual(run(extra).status, 0);
});

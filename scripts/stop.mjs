import { execFile } from 'node:child_process';
import { readlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify, parseArgs } from 'node:util';

const exec = promisify(execFile);
export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export function parseProcesses(output) {
  return output.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    return match
      ? [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }]
      : [];
  });
}

export function isProjectPath(value, root) {
  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s='"])${escaped}(?=$|[/\\s'"])`).test(value);
}

export function isManagedCommand(command) {
  return /^(?:\S*\/)?(?:node|npm|npx|nx|next|jest|webpack(?:-cli)?|ts-node|prisma)(?:\s|$)/.test(
    command,
  );
}

export function selectProcesses(
  processes,
  root,
  protectedPid,
  cwdByPid = new Map(),
) {
  const protectedPids = new Set();
  let pid = protectedPid;
  while (pid && !protectedPids.has(pid)) {
    protectedPids.add(pid);
    pid = processes.find((item) => item.pid === pid)?.ppid;
  }
  const selected = new Set(
    processes
      .filter(
        (item) =>
          !protectedPids.has(item.pid) &&
          isManagedCommand(item.command) &&
          (isProjectPath(item.command, root) ||
            isProjectPath(cwdByPid.get(item.pid) ?? '', root)),
      )
      .map((item) => item.pid),
  );
  // Include owned shells/workers, but never climb into an editor or terminal.
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of processes) {
      if (
        selected.has(item.ppid) &&
        !selected.has(item.pid) &&
        !protectedPids.has(item.pid)
      ) {
        selected.add(item.pid);
        changed = true;
      }
    }
  }
  return processes.filter((item) => selected.has(item.pid));
}

async function processTable() {
  const { stdout } = await exec('ps', ['-axo', 'pid=,ppid=,args='], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return parseProcesses(stdout);
}

async function processCwd(pid) {
  try {
    if (process.platform === 'linux') return await readlink(`/proc/${pid}/cwd`);
    const { stdout } = await exec('lsof', [
      '-a',
      '-p',
      String(pid),
      '-d',
      'cwd',
      '-Fn',
    ]);
    return (
      stdout
        .split('\n')
        .find((line) => line.startsWith('n'))
        ?.slice(1) ?? ''
    );
  } catch {
    return '';
  }
}

export async function findProjectProcesses(root = projectRoot) {
  if (!['darwin', 'linux'].includes(process.platform))
    throw new Error('Project stop currently supports macOS and Linux.');
  root = await realpath(root);
  const processes = await processTable();
  const cwdByPid = new Map();
  for (const item of processes) {
    if (isManagedCommand(item.command) && !isProjectPath(item.command, root)) {
      cwdByPid.set(item.pid, await processCwd(item.pid));
    }
  }
  return selectProcesses(processes, root, process.pid, cwdByPid);
}

export async function stopProject({
  root = projectRoot,
  dryRun = false,
  log = console.log,
} = {}) {
  const targets = await findProjectProcesses(root);
  log(
    `${dryRun ? 'Would stop' : 'Stopping'} ${targets.length} project process(es).`,
  );
  for (const target of targets)
    log(`  PID ${target.pid}: ${path.basename(target.command.split(' ')[0])}`);
  if (dryRun) return targets;
  const byPid = new Map(targets.map((item) => [item.pid, item]));
  const depth = (item) => {
    let count = 0;
    const visited = new Set();
    while (byPid.has(item.ppid) && !visited.has(item.pid)) {
      visited.add(item.pid);
      item = byPid.get(item.ppid);
      count++;
    }
    return count;
  };
  const signal = (item, value) => {
    try {
      process.kill(item.pid, value);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  for (const target of [...targets].sort((a, b) => depth(a) - depth(b)))
    signal(target, 'SIGTERM');
  const deadline = Date.now() + 3000;
  let remaining = targets;
  while (remaining.length && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const current = await processTable();
    remaining = targets.filter((target) =>
      current.some(
        (item) => item.pid === target.pid && item.command === target.command,
      ),
    );
  }
  for (const target of remaining) signal(target, 'SIGKILL');
  log('Project processes stopped.');
  return targets;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: { 'dry-run': { type: 'boolean' }, docker: { type: 'boolean' } },
    });
    await stopProject({ dryRun: values['dry-run'] });
    if (values.docker) {
      if (values['dry-run'])
        console.log(
          'Would stop the Compose postgres service (volume preserved).',
        );
      else
        await exec('docker', ['compose', 'stop', 'postgres'], {
          cwd: projectRoot,
        });
    }
  } catch (error) {
    console.error(`Stop failed: ${error.message}`);
    process.exitCode = 1;
  }
}

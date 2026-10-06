import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { databaseConfig, databaseClients, root } from './dev-database.mjs';

export function requireResetConfirmation(confirmed) {
  if (confirmed !== true)
    throw new Error(
      'This deletes ALL auth/social records. Run npm run db:reset -- --confirm after npm run stop.',
    );
}

export async function resetDatabases({ auth, social }) {
  await social.$transaction([
    social.vote.deleteMany(),
    social.comment.deleteMany(),
    social.post.deleteMany(),
    social.membership.deleteMany(),
    social.community.deleteMany(),
  ]);
  await auth.user.deleteMany();
}

async function migrate(config) {
  for (const service of ['auth', 'social']) {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.join(root, 'node_modules/prisma/build/index.js'),
          'migrate',
          'deploy',
        ],
        {
          cwd: path.join(root, `apps/backend/${service}`),
          env: { ...process.env, DATABASE_URL: config[service] },
          stdio: 'inherit',
        },
      );
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`${service} migration failed (${code}).`)),
      );
    });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let clients;
  try {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: { confirm: { type: 'boolean' } },
    });
    if (
      positionals.length !== 1 ||
      !['migrate', 'reset'].includes(positionals[0])
    )
      throw new Error('Choose migrate or reset.');
    if (positionals[0] === 'reset') requireResetConfirmation(values.confirm);
    const config = await databaseConfig();
    if (positionals[0] === 'migrate') await migrate(config);
    else {
      clients = await databaseClients(config);
      await clients.auth.$connect();
      await clients.social.$connect();
      await clients.auth.user.count();
      await clients.social.community.count();
      await resetDatabases(clients);
      console.log(
        'Cleared roorin_auth and roorin_social. Migration history/schema retained. Run npm run db:seed to repopulate.',
      );
    }
  } catch (error) {
    console.error(`Database command failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (clients) {
      await clients.auth.$disconnect();
      await clients.social.$disconnect();
    }
  }
}

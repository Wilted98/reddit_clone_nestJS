import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export function validateLocalDatabase(
  url,
  service,
  environment = process.env.NODE_ENV,
) {
  if (environment === 'production')
    throw new Error('Demo database commands are disabled in production.');
  const connection = new URL(url);
  if (
    !['postgres:', 'postgresql:'].includes(connection.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname) ||
    connection.pathname !== `/roorin_${service}` ||
    connection.search
  ) {
    throw new Error(
      `Refusing ${service}: expected a local roorin_${service} database without URL query overrides.`,
    );
  }
  return connection;
}

export async function databaseConfig() {
  const config = {};
  if (process.env.DATABASE_URL)
    throw new Error(
      'Unset root DATABASE_URL; this project uses separate service .env files.',
    );
  for (const service of ['auth', 'social']) {
    const env = parse(
      await readFile(path.join(root, `apps/backend/${service}/.env`)),
    );
    validateLocalDatabase(env.DATABASE_URL, service, env.NODE_ENV);
    validateLocalDatabase(env.DATABASE_URL, service, process.env.NODE_ENV);
    config[service] = env.DATABASE_URL;
  }
  return config;
}

export async function databaseClients(config) {
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient: AuthClient } = await import(
    '@prisma-clients/roorin-auth'
  );
  const { PrismaClient: SocialClient } = await import(
    '@prisma-clients/roorin-social'
  );
  return {
    auth: new AuthClient({
      adapter: new PrismaPg({ connectionString: config.auth }),
    }),
    social: new SocialClient({
      adapter: new PrismaPg({ connectionString: config.social }),
    }),
  };
}

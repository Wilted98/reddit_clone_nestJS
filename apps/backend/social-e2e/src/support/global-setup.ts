import { waitForPortOpen } from '@nx/node/utils';

module.exports = async function () {
  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  const authUrl = new URL(process.env.AUTH_HTTP_URL ?? 'http://localhost:3000');
  await Promise.all([
    waitForPortOpen(port, { host }),
    waitForPortOpen(Number(authUrl.port || 80), { host: authUrl.hostname }),
  ]);
};

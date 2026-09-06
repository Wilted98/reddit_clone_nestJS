import { waitForPortOpen } from '@nx/node/utils';

// The default NX e2e scaffold writes to globalThis.__TEARDOWN_MESSAGE__ with
// no declared type, which fails under this workspace's strict:true (had been
// blocking `nx e2e` entirely). Declaring it here satisfies strict mode
// without changing the pattern.
declare global {
  var __TEARDOWN_MESSAGE__: string;
}

module.exports = async function () {
  console.log('\nSetting up...\n');

  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await waitForPortOpen(port, { host });

  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};

const path = require('node:path');
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

module.exports = (phase) => ({
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname, '../../..'),
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  turbopack: { root: path.resolve(__dirname, '../../..') },
});

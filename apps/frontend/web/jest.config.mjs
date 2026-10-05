import nextJest from 'next/jest.js';

export default nextJest({ dir: new URL('.', import.meta.url).pathname })({
  displayName: 'web',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.spec.[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../../coverage/apps/frontend/web',
});

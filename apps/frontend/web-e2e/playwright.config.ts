import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './src',
  outputDir: '../../../test-results/web',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/*.live.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      testIgnore: '**/*.live.spec.ts',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
    ...(process.env.WEB_E2E_LIVE
      ? [
          {
            name: 'live',
            testMatch: '**/*.live.spec.ts',
            use: { ...devices['Desktop Chrome'] },
          },
        ]
      : []),
  ],
  webServer: {
    cwd: path.resolve(__dirname, '../../..'),
    command:
      'node node_modules/next/dist/bin/next dev apps/frontend/web --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_AUTH_GRAPHQL_URL: 'http://localhost:3000/graphql',
      NEXT_PUBLIC_SOCIAL_GRAPHQL_URL: 'http://localhost:3001/graphql',
    },
  },
});

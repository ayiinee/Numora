import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// Opt-in connected development checks. Product data is not intercepted or mocked.
const root = resolve(__dirname, '../..');
export default defineConfig({
  testDir: './e2e-connected',
  testMatch: 'teacher-demo.spec.ts',
  outputDir: '../../.qa-seed/teacher-demo/browser-test-results',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  globalTimeout: 600_000,
  expect: { timeout: 40_000 },
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3700',
    browserName: 'chromium',
    // Traces and storage states can contain the real QA session. Never record them.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: [
    {
      cwd: resolve(root, 'apps/api'),
      command: 'node --env-file=../../.env dist/main.js',
      url: 'http://localhost:3701/api/v1/health',
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      env: {
        NODE_ENV: 'development',
        API_PORT: '3701',
        CORS_ORIGINS: 'http://localhost:3700',
        API_INTERNAL_URL: 'http://localhost:3701/api/v1',
        NODE_OPTIONS: '--max-old-space-size=512',
      },
    },
    {
      cwd: resolve(root, 'apps/web'),
      command: 'node node_modules/next/dist/bin/next dev -p 3700',
      url: 'http://localhost:3700',
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      env: {
        NODE_ENV: 'development',
        NUMORA_WEB_DIST_DIR: '.next-teacher-demo-live',
        NUMORA_LOW_MEMORY: 'true',
        NEXT_PUBLIC_API_URL: 'http://localhost:3701/api/v1',
        API_INTERNAL_URL: 'http://localhost:3701/api/v1',
        NODE_OPTIONS: '--max-old-space-size=512',
      },
    },
  ],
});

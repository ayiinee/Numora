import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  reporter: 'line',
  // Allow the 192-case regression plus server startup and teardown to finish in CI.
  globalTimeout: 900_000,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:3300',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next ${process.env.NUMORA_E2E_PRODUCTION === 'true' ? 'start' : 'dev'} -p 3300${process.env.NUMORA_E2E_WEBPACK === 'true' && process.env.NUMORA_E2E_PRODUCTION !== 'true' ? ' --webpack' : ''}`,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    url: 'http://localhost:3300',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NUMORA_WEB_DIST_DIR: '.next-e2e',
      NEXT_PUBLIC_API_URL: 'http://localhost:3301/api/v1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://numora-e2e.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-only-public-key',
      NODE_ENV: process.env.NUMORA_E2E_PRODUCTION === 'true' ? 'production' : 'development',
    },
  },
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-connected',
  testMatch: 'release-chain.spec.ts',
  outputDir: '../../.tmp/job06-playwright',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  globalTimeout: 900_000,
  timeout: 420_000,
  expect: { timeout: 25_000 },
  use: {
    actionTimeout: 25_000,
    navigationTimeout: 60_000,
    baseURL: 'http://localhost:3400',
    browserName: 'chromium',
    channel: 'chromium',
    // No credential-bearing traces/screenshots/storage states in evidence artifacts.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: [
    {
      command: 'node ../api/scripts/serve-release-chain.mjs',
      url: 'http://localhost:3401/api/v1/health',
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      timeout: 60_000,
    },
    {
      command: 'node node_modules/next/dist/bin/next start -p 3400',
      url: 'http://localhost:3400',
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      timeout: 180_000,
      env: {
        NODE_ENV: 'production',
        NUMORA_WEB_DIST_DIR: '.next-connected',
        NEXT_PUBLIC_API_URL: 'http://localhost:3401/api/v1',
        API_INTERNAL_URL: 'http://localhost:3401/api/v1',
        NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:3402',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'job06-fixture-public-key',
      },
    },
  ],
});

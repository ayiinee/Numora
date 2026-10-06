import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'pretest-tryout.spec.ts',
  workers: 1,
  reporter: 'line',
  timeout: 90000,
  globalTimeout: 600000,
  expect: { timeout: 20000 },
  outputDir: '../../.tmp/pretest-tryout-evidence/playwright',
  use: { baseURL: 'http://localhost:3350', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev -p 3350 --webpack',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    url: 'http://localhost:3350',
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      NUMORA_WEB_DIST_DIR: '.next-lifecycle',
      NEXT_PUBLIC_API_URL: 'http://localhost:3301/api/v1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://numora-e2e.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-only-public-key',
      NODE_ENV: 'development',
    },
  },
});

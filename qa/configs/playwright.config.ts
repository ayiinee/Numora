import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const root = resolve(__dirname, '../..');
const qaConfig = JSON.parse(readFileSync(resolve(root, 'qa/config.json'), 'utf8'));
export default defineConfig({
  testDir: '../scenarios',
  testMatch: '**/*.pw.ts',
  outputDir: '../.local/playwright',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['json', { outputFile: process.env.QA_EVIDENCE_FILE }]],
  use: {
    baseURL: 'http://localhost:3500',
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: [
    {
      command: 'node qa/runtime/serve.mjs',
      cwd: root,
      url: 'http://localhost:3501/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'node node_modules/next/dist/bin/next start -p 3500',
      cwd: resolve(root, 'apps/web'),
      url: 'http://localhost:3500',
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      env: {
        NODE_ENV: 'production',
        NUMORA_LOW_MEMORY: qaConfig.runtime?.lowMemoryBuild === false ? 'false' : 'true',
        NUMORA_WEB_DIST_DIR: '.next-qa',
        NEXT_PUBLIC_API_URL: 'http://localhost:3501/api/v1',
        API_INTERNAL_URL: 'http://localhost:3501/api/v1',
        NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:3502',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'qa-local-fixture-public-key',
      },
    },
  ],
});

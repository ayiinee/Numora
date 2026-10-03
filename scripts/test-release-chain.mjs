import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireIsolatedServices, releaseSha } from '../apps/api/scripts/release-chain-guard.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
requireIsolatedServices();
const sha = releaseSha(root);
const env = {
  ...process.env,
  NODE_ENV: 'test',
  RELEASE_SHA: sha,
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_MIGRATION_URL: process.env.TEST_DATABASE_URL,
};
for (const args of [
  ['--filter', '@tka/database', 'db:migrate'],
  ['--filter', '@tka/database', 'build'],
  ['--filter', '@tka/assessment-engine', 'build'],
  ['--filter', '@tka/api', 'build'],
  ['--filter', '@tka/web', 'build'],
  ['--filter', '@tka/web', 'exec', 'playwright', 'test', '--config=playwright.connected.config.ts'],
]) {
  // All command arguments are constants; credentials travel only through child environment.
  const buildWeb = args[1] === '@tka/web' && args[2] === 'build';
  const windows = process.platform === 'win32';
  const result = spawnSync(
    windows ? 'cmd.exe' : 'pnpm',
    windows ? ['/d', '/s', '/c', `pnpm ${args.join(' ')}`] : args,
    {
      cwd: root,
      env: buildWeb
        ? {
            ...env,
            NODE_ENV: 'production',
            NUMORA_WEB_DIST_DIR: '.next-connected',
            NEXT_PUBLIC_API_URL: 'http://localhost:3401/api/v1',
            API_INTERNAL_URL: 'http://localhost:3401/api/v1',
            NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:3402',
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'job06-fixture-public-key',
          }
        : env,
      stdio: 'inherit',
    },
  );
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
if (releaseSha(root) !== sha) throw new Error('Release SHA changed during testing.');

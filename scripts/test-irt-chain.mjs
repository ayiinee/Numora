import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { releaseSha } from '../apps/api/scripts/release-chain-guard.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const [name, protocols] of [
  ['TEST_DATABASE_URL', ['postgres:', 'postgresql:']],
  ['TEST_REDIS_URL', ['redis:']],
]) {
  const url = new URL(process.env[name] ?? '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !protocols.includes(url.protocol))
    throw new Error(`${name} must use an isolated localhost test service`);
}
const sha = releaseSha(root);
const env = { ...process.env, NODE_ENV: 'test', IRT_CHAIN_EVIDENCE: 'true', RELEASE_SHA: sha };
for (const args of [
  ['--filter', '@tka/database', 'build'],
  ['--filter', '@tka/assessment-engine', 'build'],
  ['--filter', '@tka/irt-orchestration', 'build'],
  ['--filter', '@tka/api', 'build'],
  ['--filter', '@tka/worker', 'build'],
  [
    '--filter',
    '@tka/api',
    'exec',
    'vitest',
    'run',
    'src/modules/irt/irt-requests.integration.spec.ts',
  ],
]) {
  const windows = process.platform === 'win32';
  const result = spawnSync(
    windows ? 'cmd.exe' : 'pnpm',
    windows ? ['/d', '/s', '/c', `pnpm ${args.join(' ')}`] : args,
    { cwd: root, env, stdio: 'inherit' },
  );
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
if (releaseSha(root) !== sha) throw new Error('SHA changed during connected verification');

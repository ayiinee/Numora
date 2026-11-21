// Isolated TEST ONLY fixtures; never seeds the configured shared database.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const service = resolve(
  process.env.NUMORA_AI_SERVICE_PATH ?? resolve(root, '../numora-ai-service'),
);
const venv = resolve(
  service,
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
);
const python = process.env.PYTHON ?? (existsSync(venv) ? venv : 'python');
const installedBin = resolve(root, 'node_modules/@embedded-postgres/windows-x64/native/bin');
const bin = resolve(
  process.env.POSTGRES_BIN ??
    (existsSync(installedBin)
      ? installedBin
      : resolve(root, '.tmp/pg-runtime/node_modules/@embedded-postgres/windows-x64/native/bin')),
);
if (!existsSync(resolve(bin, process.platform === 'win32' ? 'initdb.exe' : 'initdb'))) {
  throw new Error(
    'Install PostgreSQL binaries or set POSTGRES_BIN: docs/development/GENERATOR_HANDOFF.md',
  );
}
const result = spawnSync(python, ['-B', 'scripts/test-generator-local.py'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    NUMORA_AI_SERVICE_PATH: service,
    POSTGRES_BIN: bin,
    GENERATOR_V2_TEST: 'true',
    GENERATOR_DEMO: 'true',
    GENERATOR_DEMO_WEB_PORT: process.env.GENERATOR_DEMO_WEB_PORT ?? '3000',
    NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=768',
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

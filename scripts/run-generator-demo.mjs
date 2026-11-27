// Isolated TEST ONLY fixtures; never seeds the configured shared database.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const variantDemo = process.argv.includes('--variant');
const service = resolve(
  process.env.NUMORA_AI_SERVICE_PATH ??
    resolve(
      root,
      existsSync(resolve(root, '../numora-ai-service/numora_service'))
        ? '../numora-ai-service'
        : '../varian-numora',
    ),
);
const venv = resolve(
  service,
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
);
const localPython = resolve(
  root,
  '.tmp/generator-python',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const python =
  process.env.PYTHON ??
  (existsSync(venv) ? venv : existsSync(localPython) ? localPython : 'python');
const installedBin = resolve(root, 'node_modules/@embedded-postgres/windows-x64/native/bin');
const initdb = process.platform === 'win32' ? 'initdb.exe' : 'initdb';
const bin = resolve(
  process.env.POSTGRES_BIN ??
    [
      installedBin,
      resolve(root, '.tmp/pg-runtime/node_modules/@embedded-postgres/windows-x64/native/bin'),
      resolve(process.env.ProgramFiles ?? 'C:/Program Files', 'PostgreSQL/18/bin'),
    ].find((folder) => existsSync(resolve(folder, initdb))) ??
    installedBin,
);
if (!existsSync(resolve(bin, initdb))) {
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
    ...(variantDemo ? { GENERATOR_DEMO_VARIANT: 'true', GENERATOR_REAL_QA_EMAIL: '' } : {}),
    GENERATOR_DEMO_WEB_PORT: process.env.GENERATOR_DEMO_WEB_PORT ?? (variantDemo ? '3100' : '3000'),
    NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=768',
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

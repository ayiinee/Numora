// Cross-repo entry point; auditor always enforces a read-only transaction.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ai =
  process.env.NUMORA_AI_SERVICE_PATH ||
  fileURLToPath(new URL('../../Numora-ai-service', import.meta.url));
const main = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync(
  process.env.NUMORA_PYTHON || 'python',
  ['-B', '-m', 'numora_service.mapping_audit', ...process.argv.slice(2)],
  {
    cwd: ai,
    env: { ...process.env, NUMORA_REPO_PATH: main, PYTHONIOENCODING: 'utf-8' },
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

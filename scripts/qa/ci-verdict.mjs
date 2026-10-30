import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScenario, resultPath, summarize } from './core.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  const output = JSON.parse(readFileSync(resolve(root, 'qa/.local/ci-output.json'), 'utf8'));
  const scenario = loadScenario(root, output.scenario);
  const result = JSON.parse(readFileSync(resultPath(root, scenario, output.run), 'utf8'));
  const automatic = result.checks.filter((c) => c.adapter !== 'manual');
  const verdict = summarize(automatic, result.profile);
  console.log(
    JSON.stringify({
      automated: verdict,
      fullAcceptance: summarize(result.checks, 'full'),
      report: dirname(output.report),
    }),
  );
  if (verdict !== 'PASS') process.exitCode = 1;
} catch {
  console.error('QA automated evidence is missing or invalid.');
  process.exitCode = 1;
}

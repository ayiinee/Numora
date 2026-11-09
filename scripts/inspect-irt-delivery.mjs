// Explicit local disposable connection only; no dotenv, freeze, dispatch or fitting.
import { readFileSync } from 'node:fs';
import postgres from '../packages/database/node_modules/postgres/src/index.js';
import { inspectCalibrationDelivery } from '../packages/irt-orchestration/src/calibration-research.mjs';

const url = new URL(process.env.IRT_RESEARCH_MAIN_DATABASE_URL ?? 'invalid:');
if (
  !['postgres:', 'postgresql:'].includes(url.protocol) ||
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  !/^\/irt_research_test_[a-zA-Z0-9_]+$/.test(url.pathname)
)
  throw new Error('DISPOSABLE_LOCAL_DATABASE_REQUIRED');
const bundle = JSON.parse(readFileSync(process.argv[2] ?? 0, 'utf8'));
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
try {
  const report = await inspectCalibrationDelivery(
    sql,
    bundle.value,
    bundle.resources,
    bundle.runtime,
    {
      secret: process.env.IRT_PSEUDONYM_SECRET ?? '',
      keyVersion: process.env.IRT_PSEUDONYM_KEY_VERSION ?? '',
    },
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.blockers.length) process.exitCode = 1;
} finally {
  await sql.end();
}

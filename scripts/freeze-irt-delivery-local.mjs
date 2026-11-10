// Local synthetic harness only. No shared database or canonical result adoption.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import postgres from '../packages/database/node_modules/postgres/src/index.js';
import {
  freezeCalibrationResearch,
  dispatchCalibrationResearch,
} from '../packages/irt-orchestration/src/calibration-research.mjs';
const url = new URL(process.env.IRT_RESEARCH_LOCAL_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.pathname, /^\/irt_research_test_[a-zA-Z0-9_]+$/);
const { value, resources, runtime, actor } = JSON.parse(readFileSync(0, 'utf8'));
const db = postgres(url.toString(), { max: 1, onnotice: () => {} });
try {
  await db`UPDATE assessment_attempts SET status='GRADED'
    WHERE tryout_batch_id=${value.context.batchId} AND status='SUBMITTED'`;
  const options = { secret: 'SYNTHETIC_PRIVATE_KEY_ONLY_1234567890', keyVersion: 'test-v1' };
  const frozen = await freezeCalibrationResearch(db, value, resources, runtime, options);
  const replay = await freezeCalibrationResearch(db, value, resources, runtime, options);
  assert.equal(frozen.inputDigest, replay.inputDigest);
  const notification = await dispatchCalibrationResearch(db, frozen.requestId, actor);
  const [snapshot] = await db`SELECT body,input_digest FROM irt_calibration_requests_v1
    WHERE id=${frozen.requestId}`;
  console.log(JSON.stringify({ notification, input: { ...snapshot.body, inputDigest: snapshot.input_digest } }));
} finally {
  await db.end();
}

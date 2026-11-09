import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postgres from '../packages/database/node_modules/postgres/src/index.js';
import {
  freezeCalibrationResearch,
  inspectCalibrationDelivery,
} from '../packages/irt-orchestration/src/calibration-research.mjs';

const { value, resources, runtime } = JSON.parse(readFileSync(0, 'utf8'));
const url = new URL(process.env.IRT_RESEARCH_LOCAL_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.pathname, /^\/irt_research_test_/);
const db = postgres(url.toString(), { max: 1, onnotice: () => {} });
const options = { secret: 'SYNTHETIC_PRIVATE_KEY_ONLY_1234567890', keyVersion: 'test-v1' };
const inspect = (input = value, policies = resources) =>
  inspectCalibrationDelivery(db, input, policies, runtime, options);
let cases = 0;
async function rejects(change, code) {
  const copy = structuredClone(value);
  change(copy);
  const report = await inspect(copy);
  assert.deepEqual(report.blockers, [code]);
  await assert.rejects(
    freezeCalibrationResearch(db, copy, resources, runtime, options),
    new RegExp(code),
  );
  cases++;
}
try {
  assert.deepEqual((await inspect()).blockers, ['IRT_CANONICAL_GRADE_NOT_FINAL']);
  cases++;
  await db`UPDATE assessment_attempts SET status='GRADED' WHERE tryout_batch_id=${value.context.batchId} AND status='SUBMITTED'`;
  const before =
    await db`SELECT (SELECT count(*) FROM irt_calibration_requests_v1)::int AS requests,
    (SELECT count(*) FROM analytics_outbox)::int AS outbox`;
  const report = await inspect();
  assert.deepEqual(report.blockers, []);
  assert.equal(report.sourceComplete, true);
  assert.equal(report.scientificGate, 'NOT_EVALUATED');
  assert.equal(report.arms.length, value.packages.length);
  assert.ok(report.arms.every((a) => a.sampleCheck === 'BELOW_POLICY_MINIMUM'));
  assert.deepEqual(
    await db`SELECT (SELECT count(*) FROM irt_calibration_requests_v1)::int AS requests,
    (SELECT count(*) FROM analytics_outbox)::int AS outbox`,
    before,
  );
  cases++;
  await rejects((v) => {
    v.respondents.pop();
  }, 'IRT_CANONICAL_COVERAGE_MISMATCH');
  await rejects((v) => {
    v.respondents.push(v.respondents[0]);
  }, 'IRT_CANONICAL_COVERAGE_MISMATCH');
  await rejects((v) => {
    v.anchorQuestionVersionIds[0] = v.packages[0].questionVersionIds[7];
  }, 'IRT_CANONICAL_MANIFEST_MISMATCH');
  await rejects((v) => {
    v.packages[0].packageVersion++;
  }, 'IRT_CANONICAL_MANIFEST_MISMATCH');
  await rejects((v) => {
    v.items[0].rubricVersionId = v.items[1].questionVersionId;
  }, 'IRT_CANONICAL_ITEM_MISMATCH');
  await rejects((v) => {
    v.items[0].maxPoints = '99.00';
  }, 'IRT_CANONICAL_GRADE_MISMATCH');
  await rejects((v) => {
    v.responses.pop();
  }, 'IRT_COVERAGE_INVALID');
  const bad = structuredClone(resources);
  bad.model.definition = { changed: true };
  assert.deepEqual((await inspect(value, bad)).blockers, ['IRT_POLICY_NOT_APPROVED']);
  cases++;
  const first = value.responses[0];
  const invalid = value.responses[1];
  assert.deepEqual((await inspect()).blockers, []);
  cases++;
  const saved = await freezeCalibrationResearch(db, value, resources, runtime, options);
  assert.deepEqual(await freezeCalibrationResearch(db, value, resources, runtime, options), saved);
  cases++;
  const [snapshot] =
    await db`SELECT body,input_digest FROM irt_calibration_requests_v1 WHERE id=${saved.requestId}`;
  assert.match(snapshot.input_digest, /^[0-9a-f]{64}$/);
  const omitted = snapshot.body.responses.find((r) => r.attemptItemId === first.attemptItemId);
  assert.equal(omitted.scoreCategory, 0);
  assert.equal(omitted.awardedPoints, '0.00');
  assert.equal(omitted.includedInCalibration, true);
  const technical = snapshot.body.responses.find((r) => r.attemptItemId === invalid.attemptItemId);
  assert.equal(technical.scoreCategory, null);
  assert.equal(technical.includedInCalibration, false);
  assert.deepEqual(technical.eligibilityReasons, ['NOT_PRESENTED']);
  const invalidResponse = snapshot.body.responses.find(
    (r) => r.attemptItemId === value.responses[5].attemptItemId,
  );
  assert.equal(invalidResponse.responseState, 'INVALID');
  assert.equal(invalidResponse.awardedPoints, null);
  assert.deepEqual(invalidResponse.eligibilityReasons, ['TECHNICAL_INVALID']);
  assert.equal(invalidResponse.includedInCalibration, false);
  assert.ok(snapshot.body.respondents.every((r) => !('studentId' in r) && !('email' in r)));
  assert.ok(snapshot.body.responses.every((r) => !('answer' in r) && !('answerKey' in r)));
  const changed = structuredClone(value);
  changed.calibrationId = changed.requestId;
  await assert.rejects(
    freezeCalibrationResearch(db, changed, resources, runtime, options),
    /IRT_IDEMPOTENCY_CONFLICT/,
  );
  cases++;
  const person = value.respondents[0];
  await assert.rejects(
    db`UPDATE assessment_packages SET name='changed' WHERE id=${person.packageId}`,
  );
  cases++;
  assert.deepEqual(
    (await db`SELECT body FROM irt_calibration_requests_v1 WHERE id=${saved.requestId}`)[0].body,
    snapshot.body,
  );
  await db`UPDATE configuration_approvals SET revoked_at=now() WHERE id=${resources.model.ref.approvalId}`;
  assert.deepEqual((await inspect()).blockers, ['IRT_POLICY_NOT_APPROVED']);
  cases++;
  console.log(
    JSON.stringify({
      arms: value.packages.length,
      cases,
      preflight: 'PASS',
      freeze: 'PASS',
      dispatch: false,
      scientificGate: 'NOT_EVALUATED',
    }),
  );
} finally {
  await db.end();
}

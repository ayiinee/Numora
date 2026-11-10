import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { closeDatabaseConnection } from '../packages/database/dist/index.js';
import {
  inspectBoundCalibrationDelivery,
  freezeBoundCalibrationDelivery,
} from '../packages/irt-orchestration/src/calibration-research.mjs';
import {
  getIrtResearchDatabaseV1,
  closeIrtResearchDatabaseV1,
  adoptTryoutArtifactV1,
  prepareTryoutReleaseV1,
  publishTryoutReleaseV1,
  reconcileTryoutDeliveryV1,
} from '../packages/irt-orchestration/dist/index.js';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Test } = require('@nestjs/testing');
const { ForbiddenException } = require('@nestjs/common');
const { TryoutController } = require('./dist/modules/learning/tryout.controller.js');
const { TryoutService } = require('./dist/modules/learning/tryout.service.js');
const { TryoutReleaseService } = require('./dist/modules/learning/tryout-release.service.js');
const input = JSON.parse(readFileSync(0, 'utf8'));
const db = getIrtResearchDatabaseV1();
let app;
try {
  const integrity = async () => ({
    attempts:
      await db`SELECT to_jsonb(a) AS row FROM assessment_attempts a WHERE a.tryout_batch_id=${input.batchId} ORDER BY id`,
    answers:
      await db`SELECT to_jsonb(ans) AS row FROM attempt_answers ans JOIN attempt_items i ON i.id=ans.attempt_item_id WHERE i.attempt_id=ANY(${input.attemptIds}::uuid[]) ORDER BY ans.attempt_item_id`,
    items:
      await db`SELECT to_jsonb(i) AS row FROM attempt_items i WHERE attempt_id=ANY(${input.attemptIds}::uuid[]) ORDER BY id`,
    exposure:
      await db`SELECT to_jsonb(e) AS row FROM student_item_exposures e WHERE student_id=ANY(${input.people}::uuid[]) ORDER BY id`,
    xp: await db`SELECT to_jsonb(x) AS row FROM xp_ledger x WHERE attempt_id=ANY(${input.attemptIds}::uuid[]) ORDER BY id`,
  });
  const before = await integrity();
  await reconcileTryoutDeliveryV1(db);
  const adopted = await adoptTryoutArtifactV1(db, input.requestId);
  assert.equal(adopted.adopted, true);
  const replay = await adoptTryoutArtifactV1(db, input.requestId);
  assert.equal(adopted.receiptId, replay.receiptId);
  const prepared = await prepareTryoutReleaseV1(
    db,
    input.batchId,
    input.requestId,
    input.approvalId,
  );
  const identity = {
    me: async (authorization) => {
      const id = authorization?.replace('Bearer ', '');
      if (!input.people.includes(id)) throw new ForbiddenException();
      return { id, role: 'STUDENT' };
    },
  };
  const service = new TryoutService(identity, new TryoutReleaseService());
  const module = await Test.createTestingModule({
    controllers: [TryoutController],
    providers: [{ provide: TryoutService, useValue: service }],
  }).compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const get = (person, attempt) =>
    fetch(url + '/api/v1/tryout/attempts/' + attempt + '/result', {
      headers: { Authorization: 'Bearer ' + person },
    });
  for (const [i, person] of input.people.entries())
    assert.equal((await get(person, input.attemptIds[i])).status, 409);
  await publishTryoutReleaseV1(db, prepared.finalizationId);
  await publishTryoutReleaseV1(db, prepared.finalizationId);
  const options = {
    secret: process.env.NUMORA_IRT_PSEUDONYM_SECRET,
    keyVersion: process.env.NUMORA_IRT_PSEUDONYM_KEY_VERSION,
  };
  assert.equal(
    (await inspectBoundCalibrationDelivery(db, input.batchId, options)).resultState,
    'PUBLISHED',
  );
  assert.deepEqual(await integrity(), before, 'Compute/adoption/publication changed history');
  for (const [i, person] of input.people.entries()) {
    const response = await get(person, input.attemptIds[i]);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.explanation.length, 30);
    assert.equal(result.score, 0);
    assert.equal(result.mode, 'FALLBACK');
    assert.equal(result.resultMethod, 'STANDARD');
    assert.ok(result.resultMethodReason);
    assert.equal((await get(person, input.attemptIds[1 - i])).status, 404);
  }
  const afterReading = await integrity();
  const previousIds = new Set(before.exposure.map((e) => e.row.id));
  assert.deepEqual(
    afterReading.exposure.filter((e) => previousIds.has(e.row.id)),
    [...before.exposure],
  );
  const explanationEvents = afterReading.exposure.filter((e) => !previousIds.has(e.row.id));
  assert.equal(explanationEvents.length, input.people.length * 30);
  assert.ok(
    explanationEvents.every(
      (e) => e.row.kind === 'EXPLANATION_PAYLOAD_ISSUED' && e.row.module === 'TRYOUT',
    ),
  );
  const [matched] = await db`SELECT count(*)::int AS n FROM student_item_exposures e
    JOIN content_delivery_items di ON di.id=e.delivery_item_id
    JOIN attempt_items i ON i.id=di.attempt_item_id
    WHERE e.student_id=ANY(${input.people}::uuid[]) AND e.kind='EXPLANATION_PAYLOAD_ISSUED'
      AND i.attempt_id=ANY(${input.attemptIds}::uuid[]) AND i.question_version_id=e.question_version_id`;
  assert.equal(matched.n, explanationEvents.length);
  assert.deepEqual({ ...afterReading, exposure: before.exposure }, before);
  await db`UPDATE configuration_approvals SET revoked_at=clock_timestamp() WHERE id=(SELECT (resources#>>'{model,ref,approvalId}')::uuid FROM irt_calibration_requests_v1 WHERE id=${input.requestId})`;
  await assert.rejects(
    freezeBoundCalibrationDelivery(db, input.batchId, options),
    /IRT_DELIVERY_AUTHORIZATION_STALE/,
  );
  assert.deepEqual(await integrity(), afterReading);
  console.log(
    JSON.stringify({
      HTTP: 'PASS',
      R: 'NOT_INVOKED_BELOW_SAMPLE_MINIMUM',
      adoptionReplay: 'PASS',
      publicationReplay: 'PASS',
      readers: 'PASS',
      historyAndXP: 'UNCHANGED',
      priorExposureRows: 'UNCHANGED',
      authorizedExplanationEvents: explanationEvents.length,
      attempts: 2,
      productionApproved: false,
    }),
  );
} finally {
  await app?.close();
  await closeIrtResearchDatabaseV1();
  await closeDatabaseConnection();
}

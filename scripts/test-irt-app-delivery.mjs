// Identity-provider stub only. Real HTTP controller, start transaction, grading and frozen adapter.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { getDatabase, closeDatabaseConnection } from '../packages/database/dist/index.js';
import postgres from '../packages/database/node_modules/postgres/src/index.js';
import { reconcileTryoutDeliveryV1 } from '../packages/irt-orchestration/dist/index.js';
import {
  saveCalibrationDeliveryBinding,
  inspectBoundCalibrationDelivery,
  freezeBoundCalibrationDelivery,
} from '../packages/irt-orchestration/src/calibration-research.mjs';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Test } = require('@nestjs/testing');
const { TryoutController } = require('./dist/modules/learning/tryout.controller.js');
const { TryoutService } = require('./dist/modules/learning/tryout.service.js');
const { TryoutReleaseService } = require('./dist/modules/learning/tryout-release.service.js');
const input = JSON.parse(readFileSync(0, 'utf8'));
assert.equal(new URL(process.env.DATABASE_URL).hostname, '127.0.0.1');
assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/irt_research_test_/);
getDatabase(); // Instantiate Drizzle too: regression covers its JSON/date codec mutation.
const db = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });
const options = { secret: 'SYNTHETIC_PRIVATE_KEY_ONLY_1234567890', keyVersion: 'test-v1' };
process.env.NUMORA_IRT_DELIVERY_RECONCILER_ENABLED = 'true';
process.env.NUMORA_IRT_PSEUDONYM_SECRET = options.secret;
process.env.NUMORA_IRT_PSEUDONYM_KEY_VERSION = options.keyVersion;
let app;
try {
  const people = [];
  for (let i = 0; i < 2; i++) {
    const [person] =
      await db`INSERT INTO users(auth_user_id,role,display_name,email) VALUES(${randomUUID()},'STUDENT','SYNTHETIC',${randomUUID() + '@example.test'}) RETURNING id`;
    people.push(person.id);
  }
  const [school] =
    await db`INSERT INTO schools(code,name) VALUES(${randomUUID()},'SYNTHETIC') RETURNING id`;
  const [klass] =
    await db`INSERT INTO classes(school_id,name,join_code) VALUES(${school.id},'SYNTHETIC',${randomUUID()}) RETURNING id`;
  await db`INSERT INTO class_memberships(class_id,student_user_id) VALUES(${klass.id},${people[1]})`;
  await db`INSERT INTO tryout_school_delegations(batch_id,school_id,package_id) VALUES(${input.batchId},${school.id},${input.configuration.packages[1].packageId})`;
  await db`UPDATE tryout_batches SET admin_title='SYNTHETIC',admin_published_at=statement_timestamp(),mandiri_package_id=${input.configuration.packages[0].packageId},starts_at=statement_timestamp()+interval '3 seconds',closes_at=statement_timestamp()+interval '20 seconds',cutoff_at=statement_timestamp()+interval '20 seconds',result_due_at=statement_timestamp()+interval '3 days 20 seconds' WHERE id=${input.batchId}`;
  const pin = {
    expectedRevision: 1,
    contextId: input.contextId,
    armSetId: input.armSetId,
    batchRevision: 1,
    configuration: input.configuration,
  };
  await saveCalibrationDeliveryBinding(db, input.batchId, input.actorId, pin);
  await assert.rejects(
    saveCalibrationDeliveryBinding(db, input.batchId, input.actorId, pin),
    /IRT_BINDING_REVISION_CONFLICT/,
  );
  assert.equal(
    (await inspectBoundCalibrationDelivery(db, input.batchId, options)).dispatchReady,
    false,
  );
  await reconcileTryoutDeliveryV1(db);
  assert.equal((await db`SELECT count(*)::int AS n FROM irt_calibration_dispatches_v1`)[0].n, 0);
  const identity = {
    me: async (authorization) => {
      const id = authorization?.replace('Bearer ', '');
      if (!people.includes(id)) throw new Error('UNAUTHORIZED');
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
  await setTimeout(3100);
  const url = await app.getUrl();
  async function request(path, person, method = 'GET', body) {
    const response = await fetch(url + '/api/v1/tryout/' + path, {
      method,
      headers: { Authorization: 'Bearer ' + person, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json();
    assert.ok(response.ok, JSON.stringify({ path, status: response.status, value }));
    return value;
  }
  const attempts = [];
  for (const [index, person] of people.entries()) {
    const body = index ? { schoolId: school.id } : {};
    const parallel = await Promise.all([
      request(`batches/${input.batchId}/attempts`, person, 'POST', body),
      request(`batches/${input.batchId}/attempts`, person, 'POST', body),
    ]);
    assert.equal(parallel[0].id, parallel[1].id);
    const attempt = parallel[0];
    attempts.push(attempt.id);
    assert.equal(attempt.questions.length, 30);
    const [pin] =
      await db`SELECT a.first_valid_evidence,r.arm_id FROM assessment_attempt_arm_deliveries d JOIN assessment_arm_assignments a ON a.id=d.assignment_id JOIN assessment_arm_revisions r ON r.id=d.delivered_revision_id WHERE d.attempt_id=${attempt.id}`;
    assert.equal(pin.first_valid_evidence, true);
    assert.equal(pin.arm_id, input.configuration.packages[index].armId);
    await request(`attempts/${attempt.id}/submit`, person, 'POST');
  }
  const grades =
    await db`SELECT status FROM assessment_attempts WHERE tryout_batch_id=${input.batchId}`;
  assert.ok(
    grades.every((g) => g.status === 'GRADED'),
    'Existing grader must finalize all attempts',
  );
  assert.equal(
    (await inspectBoundCalibrationDelivery(db, input.batchId, options)).dispatchReady,
    false,
  );
  const [clock] =
    await db`SELECT greatest(0,extract(epoch FROM cutoff_at-statement_timestamp())) AS seconds FROM tryout_batches WHERE id=${input.batchId}`;
  await setTimeout(Number(clock.seconds) * 1000 + 100);
  await Promise.all([reconcileTryoutDeliveryV1(db), reconcileTryoutDeliveryV1(db)]);
  await reconcileTryoutDeliveryV1(db);
  const first = await freezeBoundCalibrationDelivery(db, input.batchId, options);
  const replay = await freezeBoundCalibrationDelivery(db, input.batchId, options);
  assert.equal(first.requestId, replay.requestId);
  assert.equal(replay.replayed, true);
  const [counts] =
    await db`SELECT (SELECT count(*) FROM irt_calibration_dispatches_v1 WHERE request_id=${first.requestId})::int AS dispatches,(SELECT count(*) FROM irt_calibration_requests_v1 WHERE id=${first.requestId})::int AS snapshots`;
  assert.deepEqual(counts, { dispatches: 1, snapshots: 1 });
  const [snapshot] =
    await db`SELECT body FROM irt_calibration_requests_v1 WHERE id=${first.requestId}`;
  assert.equal(snapshot.body.respondents.length, 2);
  assert.equal(snapshot.body.responses.length, 60);
  assert.ok(snapshot.body.respondents.every((r) => !people.includes(r.respondentId)));
  assert.ok(!JSON.stringify(snapshot.body).includes('example.test'));
  console.log(
    JSON.stringify({
      HTTP: 'PASS',
      parallelStart: 'PASS',
      grading: 'REAL',
      freeze: 'PASS',
      dispatches: 1,
      attempts: 2,
      R: 'NOT_RUN',
      requestId: first.requestId,
      inputDigest: first.inputDigest,
      people,
      attemptIds: attempts,
    }),
  );
} finally {
  await app?.close();
  await db.end();
  await closeDatabaseConnection();
}

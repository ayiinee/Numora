import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { closeDatabaseConnection } from '../packages/database/dist/index.js';
import {
  getIrtResearchDatabaseV1,
  closeIrtResearchDatabaseV1,
  adoptTryoutArtifactV1,
  prepareTryoutReleaseV1,
  publishTryoutReleaseV1,
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
    xp: await db`SELECT to_jsonb(x) AS row FROM xp_ledger x WHERE attempt_id=ANY(${input.attemptIds}::uuid[]) ORDER BY id`,
  });
  const before = await integrity();
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
  assert.deepEqual(await integrity(), before);
  console.log(
    JSON.stringify({
      HTTP: 'PASS',
      R: 'REAL',
      adoptionReplay: 'PASS',
      publicationReplay: 'PASS',
      readers: 'PASS',
      historyAndXP: 'UNCHANGED',
      attempts: 2,
      productionApproved: false,
    }),
  );
} finally {
  await app?.close();
  await closeIrtResearchDatabaseV1();
  await closeDatabaseConnection();
}

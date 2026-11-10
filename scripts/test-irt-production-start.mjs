// Synthetic disposable DB only; real HTTP start transaction with separate API/IRT logins.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getDatabase, closeDatabaseConnection } from '../packages/database/dist/index.js';
import postgres from '../packages/database/node_modules/postgres/src/index.js';
const input = JSON.parse(readFileSync(0, 'utf8'));
for (const name of ['DATABASE_URL', 'NUMORA_IRT_DATABASE_URL']) {
  const url = new URL(process.env[name]);
  assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.pathname, /^\/irt_research_test_/);
}
assert.notEqual(
  new URL(process.env.DATABASE_URL).username,
  new URL(process.env.NUMORA_IRT_DATABASE_URL).username,
);
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Test } = require('@nestjs/testing');
const { TryoutController } = require('./dist/modules/learning/tryout.controller.js');
const { TryoutService } = require('./dist/modules/learning/tryout.service.js');
const { TryoutReleaseService } = require('./dist/modules/learning/tryout-release.service.js');
const api = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });
const irt = postgres(process.env.NUMORA_IRT_DATABASE_URL, { max: 1, onnotice: () => {} });
let app;
try {
  const [{ login }] = await api`SELECT current_user AS login`;
  assert.equal(login, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
  const [{ login: privateLogin }] = await irt`SELECT current_user AS login`;
  assert.notEqual(login, privateLogin);
  getDatabase();
  const identity = {
    me: async (authorization) => {
      const id = authorization?.replace('Bearer ', '');
      assert.ok(input.students.includes(id));
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
  for (const student of input.students) {
    const start = async () => {
      const response = await fetch(
        `${await app.getUrl()}/api/v1/tryout/batches/${input.batchId}/attempts`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${student}`, 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      const value = await response.json();
      assert.ok(response.ok, JSON.stringify({ status: response.status, value }));
      return value;
    };
    const [first, parallel] = await Promise.all([start(), start()]);
    assert.equal(first.id, parallel.id);
    assert.equal((await start()).id, first.id);
    assert.equal(first.questions.length, 30);
    const rows =
      await api`SELECT d.delivered_revision_id,a.assigned_arm_id FROM assessment_attempt_arm_deliveries d
      JOIN assessment_arm_assignments a ON a.id=d.assignment_id WHERE d.attempt_id=${first.id}`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].delivered_revision_id, input.revisionId);
    assert.equal(rows[0].assigned_arm_id, input.armId);
  }
  assert.equal((await api`SELECT count(*)::int AS n FROM irt_calibration_inputs_v1`)[0].n, 0);
  assert.ok((await irt`SELECT count(*)::int AS n FROM irt_calibration_inputs_v1`)[0].n > 0);
  console.log(
    JSON.stringify({
      productionStart: 'PASS',
      separateLogins: true,
      parallelResume: 'PASS',
      deliveryPins: 'PASS',
      apiComputeVisibility: false,
    }),
  );
} finally {
  if (app) await app.close();
  await api.end();
  await irt.end();
  await closeDatabaseConnection();
}

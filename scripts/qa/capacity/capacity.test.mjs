import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  authorizeRemote,
  countsFor,
  phaseActors,
  prepare,
  refreshPhaseActors,
  targetOrigin,
  workload,
} from './config.mjs';
import { reconcile, validateEvidenceUrl } from './reconcile.mjs';
import { summarize, validateCohorts } from './run.mjs';

const contracts = JSON.parse(
  readFileSync(new URL('../../../packages/contracts/openapi/openapi.json', import.meta.url)),
);
const sha = 'a'.repeat(40);
const live = {
  web: 'https://hellonumora.com',
  api: 'https://api.hellonumora.com',
  deployment: { web: sha, api: sha, worker: sha },
};
const dev = { ...live, web: 'http://127.0.0.1:3500', api: 'http://127.0.0.1:3501' };

test('profiles pin separate workloads and pass real route contracts', () => {
  assert.equal(workload('staging', 'load').at(-1).students, 1000);
  assert.equal(workload('staging', 'load').at(-1).seconds, 1800);
  assert.equal(workload('staging', 'soak')[0].seconds, 7200);
  assert.equal(workload('staging', 'stress').at(-1).students, 1500);
  assert.throws(() => workload('prod', 'stress'), /limited/);
  const plan = prepare(
    { ...dev, assessmentWrites: ['drill', 'tryout', 'pretest'] },
    {},
    'dev',
    'smoke',
    contracts,
  );
  assert.ok(plan.operations.includes('POST /api/v1/tryout/batches/{batchId}/attempts'));
  assert.ok(plan.operations.includes('PATCH /api/v1/assessment-attempts/{attemptId}/drill-clock'));
  assert.ok(prepare(live, {}, 'prod', 'load', contracts).phases.length >= 6);
});

test('mixed staging accounts include PvP plus the additional teacher and admin load', () => {
  const plan = prepare(
    {
      ...live,
      web: 'https://web.example.test',
      api: 'https://api.example.test',
      assessmentWrites: ['drill', 'pretest', 'tryout'],
      pvp: true,
    },
    {},
    'staging',
    'load',
    contracts,
  );
  assert.deepEqual(
    plan.phases.map(({ students, seconds }) => [students, seconds]),
    [
      [100, 600],
      [500, 600],
      [1000, 1800],
    ],
  );
  assert.deepEqual(countsFor(plan.phases.at(-1), plan), {
    drill: 350,
    tryout: 300,
    pretest: 100,
    pvp: 150,
    teacher: 20,
    admin: 6,
    browse: 100,
  });
});

test('mixed local rehearsal uses fixture Tryout only on loopback', () => {
  const config = { ...dev, assessmentWrites: ['drill', 'tryout', 'pretest'], pvp: true };
  const plan = prepare(config, {}, 'dev', 'mixed-local', contracts);
  assert.deepEqual(
    plan.phases.map(({ students }) => students),
    [20, 100, 500, 1000],
  );
  assert.ok(plan.operations.includes('POST /api/v1/tryout/attempts'));
  assert.ok(!plan.operations.includes('POST /api/v1/tryout/batches/{batchId}/attempts'));
  assert.throws(
    () => prepare({ ...config, pvp: false }, {}, 'dev', 'mixed-local', contracts),
    /PvP/,
  );
  assert.throws(() => workload('prod', 'mixed-local'), /limited/);
  assert.throws(() => workload('staging', 'mixed-local'), /Unknown staging/);
});

test('cohort validation rejects a one-time assessment reused at another plateau', () => {
  const plan = prepare(dev, {}, 'dev', 'smoke', contracts);
  const phase = { name: 'first', students: 1, seconds: 60 };
  plan.phases = [phase, { ...phase, name: 'second' }];
  plan.assessmentWrites = ['pretest'];
  const id = '00000000-0000-4000-8000-000000000120';
  const accounts = {
    pretest: [
      { id, token: 'pretest', affiliation: 'mandiri', vars: { chapterId: id, subchapterId: id } },
    ],
    teacher: [
      { id: id.replace(/20$/, '21'), token: 'teacher', vars: { classId: id, studentId: id } },
    ],
    admin: [{ id: id.replace(/20$/, '22'), token: 'admin', vars: {} }],
  };
  assert.throws(
    () => validateCohorts(plan, { phases: { first: accounts, second: accounts } }),
    /reused/,
  );
});

test('Drill capacity ladder accepts only local Drill traffic and pins the plateaus', () => {
  const plan = prepare(
    { ...dev, assessmentWrites: ['drill'] },
    {},
    'dev',
    'drill-scale',
    contracts,
  );
  assert.deepEqual(plan.phases, [
    { name: 'users-250', students: 250, seconds: 300 },
    { name: 'users-500', students: 500, seconds: 300 },
    { name: 'users-1000', students: 1000, seconds: 300 },
  ]);
  assert.deepEqual(plan.assessmentWrites, ['drill']);
  assert.throws(() => workload('staging', 'drill-scale'), /Unknown staging suite/);
  assert.throws(() => workload('prod', 'drill-scale'), /limited/);
  const steady = prepare(
    { ...dev, assessmentWrites: ['drill'] },
    {},
    'dev',
    'drill-steady',
    contracts,
  );
  assert.deepEqual(steady.phases, [{ name: 'users-1000', students: 1000, seconds: 360 }]);
  assert.deepEqual(steady.operations, plan.operations);
  assert.throws(() => workload('staging', 'drill-steady'), /Unknown staging suite/);
  assert.throws(() => workload('prod', 'drill-steady'), /limited/);
});

test('rejects remote redirects and operations outside a contract profile', () => {
  assert.throws(() => targetOrigin(live.api, 'dev'), /loopback/);
  assert.throws(() => targetOrigin(live.web, 'staging'), /environment/);
  assert.throws(() => targetOrigin('https://staging.example.com/path', 'staging'), /bare/);
  assert.throws(
    () =>
      prepare(
        {
          ...dev,
          extraJourneys: {
            browse: [{ operation: 'POST /api/v1/students/me/dashboard', status: 201 }],
          },
        },
        {},
        'dev',
        'smoke',
        contracts,
      ),
    /OpenAPI/,
  );
});

test('production approval is SHA/window/operation-specific and mutations require complete isolation', () => {
  const operation = 'POST /api/v1/assessment-attempts/{attemptId}/submit';
  const phase = workload('prod', 'smoke');
  const authorization = {
    reference: 'ticket',
    operator: 'devops',
    monitored: true,
    suites: ['smoke'],
    startsAt: '2026-11-15T00:00:00Z',
    endsAt: '2026-11-15T01:00:00Z',
    sha,
    maxStudents: 5,
    stagingPass: 'run',
    greenCi: 'action',
    stopOwner: 'devops',
    operations: [operation],
  };
  const now = Date.parse('2026-11-15T00:15:00Z');
  assert.throws(
    () => authorizeRemote({ ...live, authorization }, 'prod', 'smoke', phase, [operation], now),
    /isolation/,
  );
  const resultWithDelivery = 'GET /api/v1/assessment-attempts/{attemptId}/result';
  const withResult = { ...authorization, operations: [resultWithDelivery] };
  assert.throws(
    () =>
      authorizeRemote(
        { ...live, authorization: withResult },
        'prod',
        'smoke',
        phase,
        [resultWithDelivery],
        now,
      ),
    /isolation/,
  );
  authorization.isolation = {
    evidence: 'readback',
    operations: [operation],
    leaderboards: true,
    irt: true,
    analytics: true,
    notifications: true,
    publicContent: true,
  };
  assert.doesNotThrow(() =>
    authorizeRemote({ ...live, authorization }, 'prod', 'smoke', phase, [operation], now),
  );
  assert.throws(
    () =>
      authorizeRemote(
        { ...live, authorization: { ...authorization, sha: 'b'.repeat(40) } },
        'prod',
        'smoke',
        phase,
        [operation],
        now,
      ),
    /SHA/,
  );
  assert.throws(
    () =>
      authorizeRemote(
        { ...live, authorization },
        'prod',
        'smoke',
        phase,
        [operation],
        now + 60 * 60 * 1000,
      ),
    /window/,
  );
});

test('fixture preflight rejects account reuse, missing resource IDs and incorrect cohort size', () => {
  const plan = prepare(dev, {}, 'dev', 'smoke', contracts);
  const phase = plan.phases[0];
  const uuid = (i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
  const student = (i) => ({
    id: uuid(i),
    token: 'token-' + i,
    affiliation: 'mandiri',
    vars: { chapterId: uuid(20), subchapterId: uuid(21), classId: uuid(22), studentId: uuid(23) },
  });
  const cohort = {
    browse: [student(1), student(2)],
    drill: [student(3)],
    pretest: [student(4)],
    tryout: [student(5)],
    teacher: [student(6)],
    admin: [student(7)],
  };
  const file = { phases: { [phase.name]: cohort } };
  assert.equal(Object.values(phaseActors(file, phase, plan)).flat().length, 7);
  assert.throws(
    () =>
      phaseActors({ phases: { [phase.name]: { ...cohort, admin: [student(1)] } } }, phase, plan),
    /unique/,
  );
  assert.throws(
    () => phaseActors({ phases: { [phase.name]: { ...cohort, browse: [] } } }, phase, plan),
    /exactly/,
  );
});

test('reconciliation catches lost answers, duplicate XP and commits without an acknowledgment', () => {
  const entry = { actor: 's1', attemptId: 'a1', kind: 'tryout' };
  const receipts = [
    { ...entry, event: 'save', questionInstanceId: 'q1', answer: { optionIds: ['B', 'A'] } },
    { ...entry, event: 'submit', status: 201, score: null, xp: 60 },
  ];
  const snapshot = {
    id: 'a1',
    student_id: 's1',
    assessment_type: 'TRYOUT',
    status: 'SUBMITTED',
    xp: '60',
    ledger_count: '1',
    outbox_count: '1',
    answers: { q1: { optionIds: ['A', 'B'] } },
  };
  assert.equal(reconcile(receipts, [snapshot]).pass, true);
  assert.equal(
    reconcile(receipts, [{ ...snapshot, ledger_count: '2', answers: {} }]).issueCount,
    2,
  );
  assert.equal(
    reconcile(receipts.slice(0, 1), [snapshot]).issues[0].reason,
    'commit-without-acknowledged-submit',
  );
  assert.throws(
    () =>
      validateEvidenceUrl(
        'postgres://qa@database.external/test',
        { evidenceDatabaseHost: 'database.external' },
        'dev',
      ),
    /environment/,
  );
});

test('empty, partial, dropped and over-budget results cannot advance a stage', () => {
  const plan = { operations: ['GET /'], budgets: { read: 750 } };
  const metric = (values) => ({ values });
  const metrics = {
    'http_reqs{op:0}': metric({ count: 100 }),
    'numora_unexpected{op:0}': metric({ rate: 0 }),
    'numora_duration_ms{op:0}': metric({ 'p(95)': 500, 'p(99)': 800 }),
    numora_participants: metric({ count: 5 }),
    numora_journey_success: metric({ rate: 1 }),
  };
  assert.equal(summarize({ metrics }, 0, plan, 5, 0).pass, true);
  assert.equal(summarize(null, 0, plan, 5, 0).pass, false);
  assert.equal(summarize({ metrics }, 0, plan, 6, 0).pass, false);
  assert.equal(summarize({ metrics }, 0, plan, 5, 5).pass, false);
  metrics.dropped_iterations = metric({ count: 1 });
  assert.equal(summarize({ metrics }, 0, plan, 5, 0).pass, false);
});

test('remote phases can rotate expiring tokens while pinning identity and fixtures', () => {
  const plan = prepare(
    { ...dev, assessmentWrites: ['drill'] },
    {},
    'dev',
    'drill-smoke',
    contracts,
  );
  plan.environment = 'staging';
  const phase = { name: 'cohort', students: 1, seconds: 60 };
  const id = '00000000-0000-4000-8000-000000000120';
  const jwt = (exp) =>
    'eyJhbGciOiJIUzI1NiJ9.' +
    Buffer.from(JSON.stringify({ exp })).toString('base64url') +
    '.signature';
  const actor = {
    id,
    token: jwt(1000),
    affiliation: 'mandiri',
    vars: { subchapterId: id, levelId: id },
  };
  const fixtures = (candidate) => ({ phases: { cohort: { drill: [candidate] } } });
  const initial = phaseActors(fixtures(actor), phase, plan);
  assert.throws(() => refreshPhaseActors(fixtures(actor), phase, plan, initial, 960000), /expire/);
  assert.doesNotThrow(() =>
    refreshPhaseActors(fixtures({ ...actor, token: jwt(1500) }), phase, plan, initial, 960000),
  );
  assert.throws(
    () =>
      refreshPhaseActors(
        fixtures({
          ...actor,
          token: jwt(1500),
          vars: { ...actor.vars, levelId: '00000000-0000-4000-8000-000000000122' },
        }),
        phase,
        plan,
        initial,
        960000,
      ),
    /Only token rotation/,
  );
});

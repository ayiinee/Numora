// Opt-in fault diagnostic; not a full-profile or capacity pass. Uses only a fresh run-owned localhost database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  createRunDatabase,
  testEnvironment,
  requireFrom,
  runProcess,
  trackOwnedProcess,
  terminate,
} from '../../../../../scripts/qa/process.mjs';
import { identity, loadScenario, writeJson } from '../../../../../scripts/qa/core.mjs';
const root = process.cwd(),
  id = randomUUID(),
  dir = resolve('qa/.local/submit-oom-diagnostics', id);
const source = identity(root, loadScenario(root, 'SIS-001'));
const { environment, problems } = testEnvironment(root);
assert.deepEqual(problems, []);
const state = {
  id,
  parentRunId: '838c1952-e8f9-4681-8396-ea74365157a1',
  identity: source,
  startedAt: new Date().toISOString(),
  mode: 'CONTROLLED_FAULT_DIAGNOSTIC_NOT_CAPACITY_OR_FULL',
  cases: [],
};
writeJson(resolve(dir, 'state.json'), state);
writeJson('qa/.local/submit-oom-diagnostics/latest.json', { id, dir });
const isolated = await createRunDatabase(root, id, environment);
state.database = isolated.name;
state.redisPrefix = isolated.environment.QA_REDIS_PREFIX;
const observerFile = resolve(dir, 'http-server.jsonl');
const env = { ...isolated.environment, QA_HTTP_EVIDENCE_FILE: observerFile };
for (const [label, args] of [
  ['build-api', ['--filter', '@tka/api', 'build']],
  ['migrate', ['--filter', '@tka/database', 'db:migrate']],
]) {
  const r = await runProcess(root, 'pnpm', args, {
    env,
    timeoutMs: 180000,
    log: resolve(dir, label + '.log'),
  });
  assert.equal(r.code, 0, label + ' failed');
}
const child = spawn(process.execPath, ['qa/runtime/serve.mjs'], {
  cwd: root,
  env,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
trackOwnedProcess(root, child, env, 'owned submit fault diagnostic API');
let privateLog = '';
const capture = (x) => {
  privateLog = (privateLog + x.toString()).slice(-200000);
};
child.stdout.on('data', capture);
child.stderr.on('data', capture);
const sql = requireFrom(root, 'packages/database')('postgres')(env.TEST_DATABASE_URL, {
  max: 1,
  onnotice: () => {},
});
const api = 'http://localhost:3501/api/v1';
let fixtures;
const request = async (method, path, actor, body, op, timeout = 15000) => {
  const sentAt = new Date().toISOString();
  try {
    const res = await fetch(api + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + actor.session.access_token,
        'Content-Type': 'application/json',
        'x-qa-operation-id': op,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeout),
    });
    const data = await res.json();
    return { status: res.status, data, sentAt, receivedAt: new Date().toISOString() };
  } catch (e) {
    return { status: 0, error: e.name, sentAt, receivedAt: new Date().toISOString() };
  }
};
const snapshot = async (attemptId) => {
  const [r] = await sql`select a.id,a.status,a.score_0_100 as score,
 (select count(*)::int from xp_ledger x where x.attempt_id=a.id) as ledger_count,
 (select max(xp_amount) from xp_ledger x where x.attempt_id=a.id) as xp,
 (select count(*)::int from analytics_outbox o where o.entity_id=a.id and o.event_name='drill_completed') as completion_events,
 (select count(*)::int from content_delivery_manifests m where m.idempotency_key=a.id::text||':EXPLANATION_PAYLOAD_ISSUED') as explanation_manifests
 from assessment_attempts a where a.id=${attemptId}::uuid`;
  return r;
};
const prepared = async (alias) => {
  const actor = await (await fetch('http://localhost:3502/actors', { method: 'POST' })).json();
  const start = await request(
    'POST',
    '/assessments/drill/attempts',
    actor,
    { levelId: fixtures.ids.levelOne },
    alias + '.start',
  );
  assert.equal(start.status, 201);
  assert.equal(start.data.questions.length, 10);
  for (let i = 0; i < 10; i++) {
    const a = await request(
      'PATCH',
      '/assessment-attempts/' +
        start.data.id +
        '/answers/' +
        start.data.questions[i].questionInstanceId,
      actor,
      { optionId: i < 8 ? 'B' : 'A' },
      alias + '.answer' + i,
    );
    assert.equal(a.status, 200);
  }
  return { actor, id: start.data.id };
};
try {
  for (let i = 0; i < 240; i++) {
    try {
      const r = await fetch('http://localhost:3502/fixtures', {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        const f = await r.json();
        assert.equal(f.runId, id);
        fixtures = f;
        break;
      }
    } catch {}
    if (child.exitCode !== null) throw Error('API_EXITED');
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(fixtures, 'OWNED_API_NOT_READY');
  state.databaseSettings =
    await sql`select name,setting,unit from pg_settings where name in ('max_connections','shared_buffers','work_mem','hash_mem_multiplier','maintenance_work_mem','statement_timeout','lock_timeout','max_parallel_workers_per_gather') order by name`;
  await sql.unsafe(`create table qa_diag_faults(attempt_id uuid primary key,mode text not null check(mode in ('ERROR','SLOW')));
create function qa_diag_delivery_fault() returns trigger language plpgsql as $$ declare mode_value text; begin
 if NEW.kind='EXPLANATION_PAYLOAD_ISSUED' then
 select mode into mode_value from qa_diag_faults where attempt_id=split_part(NEW.idempotency_key,':',1)::uuid;
 if mode_value='ERROR' then raise exception 'TEST ONLY injected allocation failure' using errcode='53200'; end if;
 if mode_value='SLOW' then perform pg_sleep(16); end if;
 end if; return NEW; end $$;
create trigger qa_diag_delivery before insert on content_delivery_manifests for each row execute function qa_diag_delivery_fault();`);
  for (const mode of ['ERROR', 'SLOW']) {
    const name = mode === 'ERROR' ? 'postcommit-sqlstate53200' : 'postcommit-http15s',
      a = await prepared(name);
    await sql`insert into qa_diag_faults values(${a.id}::uuid,${mode})`;
    const before = await snapshot(a.id),
      pending = request(
        'POST',
        '/assessment-attempts/' + a.id + '/submit',
        a.actor,
        undefined,
        name + '.submit',
      );
    let during;
    for (let i = 0; i < 40; i++) {
      const row = await snapshot(a.id);
      if (row.status === 'GRADED') {
        during = row;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(during);
    const submitted = await pending;
    assert.equal(submitted.status, mode === 'ERROR' ? 500 : 0);
    if (mode === 'SLOW') assert.equal(submitted.error, 'TimeoutError');
    assert.equal(during.ledger_count, 1);
    assert.equal(during.completion_events, 1);
    // The original in-flight delivery is allowed to complete; no business retry is hidden.
    if (mode === 'SLOW')
      for (let i = 0; i < 100; i++) {
        const row = await snapshot(a.id);
        if (row.explanation_manifests === 1) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    await sql`delete from qa_diag_faults where attempt_id=${a.id}::uuid`;
    const got = await request(
      'GET',
      '/assessment-attempts/' + a.id + '/result',
      a.actor,
      undefined,
      name + '.get',
    );
    assert.equal(got.status, 200);
    assert.equal(got.data.score, 80);
    const retries = await Promise.all(
      [1, 2].map((n) =>
        request(
          'POST',
          '/assessment-attempts/' + a.id + '/submit',
          a.actor,
          undefined,
          name + '.retry' + n,
        ),
      ),
    );
    for (const retry of retries) {
      assert.equal(retry.status, 201);
      assert.deepEqual(retry.data, got.data);
    }
    const after = await snapshot(a.id);
    assert.equal(after.ledger_count, 1);
    assert.equal(after.completion_events, 1);
    assert.equal(after.explanation_manifests, 1);
    assert.equal(Number(after.xp), got.data.reward.totalXp);
    const result = {
      name,
      status: 'PASS',
      attemptId: a.id,
      operation: name + '.submit',
      injectedFault:
        mode === 'ERROR'
          ? 'SQLSTATE53200_AT_POSTCOMMIT_EXPLANATION_DELIVERY'
          : '16S_DELIVERY_DELAY_WITH_ORIGINAL_HTTP15S',
      before,
      committedWhileResponsePending: during,
      client: {
        status: submitted.status,
        error: submitted.error || null,
        sentAt: submitted.sentAt,
        receivedAt: submitted.receivedAt,
      },
      getStatus: got.status,
      retryStatuses: retries.map((x) => x.status),
      result: { score: got.data.score, reward: got.data.reward },
      after,
    };
    state.cases.push(result);
    writeJson(resolve(dir, 'state.json'), state);
    console.log(JSON.stringify({ name, status: 'PASS', client: result.client, after }));
  }
  await sql.unsafe(
    'drop trigger qa_diag_delivery on content_delivery_manifests; drop function qa_diag_delivery_fault(); drop table qa_diag_faults',
  );
  state.faultsRemoved = true;
  state.finishedAt = new Date().toISOString();
  state.status = 'CASES_COMPLETED_OBSERVATIONS_PENDING';
} catch (e) {
  state.finishedAt = new Date().toISOString();
  state.status = 'FAIL';
  state.error = e.message;
  throw e;
} finally {
  writeJson(resolve(dir, 'state.json'), state);
  await sql.end();
  terminate(child);
  await new Promise((r) => (child.exitCode !== null ? r() : child.once('close', r)));
  writeFileSync(resolve(dir, 'api-private.log'), privateLog, { mode: 0o600 });
  writeJson(resolve(dir, 'process-cleanup.json'), {
    pid: child.pid,
    exitCode: child.exitCode,
    ownedOnly: true,
  });
}
// Observer logs are raw/local; never include headers/bodies/auth fixtures in shared evidence.
const events = readFileSync(observerFile, 'utf8')
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((x) => JSON.parse(x));
const selected = events.filter((x) => state.cases.some((c) => c.operation === x.operationId));
writeJson(resolve(dir, 'http-observation-summary.json'), selected);
assert.ok(
  selected.some(
    (x) =>
      x.operationId === 'postcommit-sqlstate53200.submit' &&
      x.event === 'handler_error' &&
      x.sqlStates.includes('53200'),
  ),
  'SQLSTATE_EVIDENCE_MISSING',
);
assert.ok(
  selected.some(
    (x) =>
      x.operationId === 'postcommit-http15s.submit' &&
      x.event === 'response_closed' &&
      x.writableFinished === false,
  ),
  'DISCONNECTED_CLIENT_EVIDENCE_MISSING',
);
assert.ok(
  selected.some(
    (x) =>
      x.operationId === 'postcommit-http15s.submit' &&
      x.event === 'response_prepared' &&
      x.httpStatus === 201,
  ),
  'POST_DISCONNECT_SUCCESS_PREPARED_MISSING',
);
state.status = 'DIAGNOSTIC_COMPLETE';
state.observationsVerifiedAt = new Date().toISOString();
writeJson(resolve(dir, 'state.json'), state);
console.log(JSON.stringify({ id, status: state.status, dir, cases: state.cases.length }));

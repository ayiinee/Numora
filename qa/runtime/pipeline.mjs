import assert from 'node:assert/strict';
import { createFaultProxy as proxy } from '../../scripts/qa/fault-proxy.mjs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readJson, writeJson, sanitize } from '../../scripts/qa/core.mjs';
import {
  requireFrom,
  testEnvironment,
  runProcess,
  terminate,
  trackOwnedProcess,
} from '../../scripts/qa/process.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2],
  output = process.env.QA_EVIDENCE_FILE;
const { environment, problems } = testEnvironment(root);
if (
  !output ||
  problems.length ||
  !/^\/numora_test_qa_[a-f0-9]{32}_(?:volume|velocity|variety|recovery)$/.test(
    new URL(environment.TEST_DATABASE_URL).pathname,
  )
)
  throw new Error('QA_OWNED_DATABASE_AND_EVIDENCE_REQUIRED');
const config = readJson(resolve(root, 'qa/config.json')).performance;
const require = requireFrom(root, 'apps/worker');
const postgres = requireFrom(root, 'packages/database')('postgres');
const sql = postgres(environment.TEST_DATABASE_URL, {
  max: 2,
  connect_timeout: 3,
  onnotice: () => {},
});
Object.assign(process.env, environment, { DATABASE_URL: environment.TEST_DATABASE_URL });
const { drainOutboxBatch } = await import(
  pathToFileURL(resolve(root, 'apps/worker/dist/outbox.js')).href
);
const { closeDatabaseConnection } = await import(
  pathToFileURL(require.resolve('@tka/database')).href
);
const type = 'qa_' + randomUUID().replaceAll('-', '');
const checks = [],
  metrics = { mode, source: 'direct-outbox-not-http', samples: [] };
const wait = (ms) => new Promise((ready) => setTimeout(ready, ms));
async function verify(name, fn) {
  try {
    await fn();
    checks.push({ name, status: 'PASS' });
  } catch (error) {
    checks.push({
      name,
      status: error.code === 'EXPERIMENT_INCOMPLETE' ? 'BLOCKED' : 'FAIL',
      reason: sanitize(error.message).slice(0, 1200),
    });
  }
}
async function insert(count, payloadFactory = (index) => ({ fixture: true, index })) {
  for (let offset = 0; offset < count; offset += 1000) {
    const rows = Array.from({ length: Math.min(1000, count - offset) }, (_, i) => ({
      id: randomUUID(),
      event_name: 'drill_completed',
      event_version: 1,
      occurred_at: new Date().toISOString(),
      entity_id: randomUUID(),
      payload: payloadFactory(offset + i),
    }));
    await sql.unsafe(
      'insert into analytics_outbox(id,event_name,event_version,occurred_at,entity_type,entity_id,payload) select id,event_name,event_version,occurred_at,$2,entity_id,payload from jsonb_to_recordset($1::text::jsonb) as x(id uuid,event_name text,event_version integer,occurred_at timestamptz,entity_id uuid,payload jsonb)',
      [JSON.stringify(rows), type],
    );
  }
}
async function snapshot() {
  const [row] = await sql.unsafe(
    'select count(*)::integer as total, count(*) filter(where processed_at is null)::integer as pending, coalesce(extract(epoch from now()-min(occurred_at) filter(where processed_at is null)),0)::float as oldest_seconds from analytics_outbox where entity_type=$1',
    [type],
  );
  return row;
}
async function reconcile(expected) {
  const [row] = await sql.unsafe(
    'select count(*)::integer as source, count(e.event_id)::integer as delivered, count(*) filter(where e.event_id is null or e.payload<>o.payload or e.event_name<>o.event_name or e.event_version<>o.event_version or e.entity_id<>o.entity_id)::integer as mismatch from analytics_outbox o left join analytics_events e on e.event_id=o.id where o.entity_type=$1',
    [type],
  );
  assert.equal(row.source, expected);
  assert.equal(row.delivered, expected);
  assert.equal(row.mismatch, 0);
  const [latency] = await sql.unsafe(
    'select percentile_cont(0.50) within group(order by extract(epoch from processed_at-occurred_at)*1000) as p50_ms, percentile_cont(0.95) within group(order by extract(epoch from processed_at-occurred_at)*1000) as p95_ms, percentile_cont(0.99) within group(order by extract(epoch from processed_at-occurred_at)*1000) as p99_ms from analytics_outbox where entity_type=$1',
    [type],
  );
  return { ...row, ...latency };
}
async function drain() {
  const end = Date.now() + config.drainTimeoutSeconds * 1000;
  while ((await snapshot()).pending > 0 && Date.now() < end) await drainOutboxBatch(10);
  const remaining = await snapshot();
  if (remaining.pending > 0) {
    metrics.remainingBacklog = remaining;
    throw Object.assign(
      new Error(
        'Backlog did not drain within experiment bound; capacity conclusion remains incomplete',
      ),
      { code: 'EXPERIMENT_INCOMPLETE' },
    );
  }
}
let worker;
try {
  if (mode === 'volume') {
    let cumulative = 0;
    for (const count of config.volume)
      await verify('volume-' + count + '-event-identity-and-payload', async () => {
        const start = performance.now();
        await insert(count);
        cumulative += count;
        const insertedMs = performance.now() - start;
        await drain();
        metrics.samples.push({
          count,
          insertedMs,
          elapsedMs: performance.now() - start,
          ...(await reconcile(cumulative)),
          memoryBytes: process.memoryUsage().rss,
          cpu: process.cpuUsage(),
        });
      });
  } else if (mode === 'velocity') {
    worker = spawn(process.execPath, [resolve(root, 'qa/runtime/consume.mjs')], {
      cwd: root,
      env: environment,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    });
    trackOwnedProcess(root, worker, environment, 'velocity outbox consumer');
    let count = 0;
    for (const rate of config.rates)
      await verify('velocity-' + rate + '-events-per-second', async () => {
        const start = performance.now(),
          iterations = rate * config.rateStageSeconds;
        for (let i = 0; i < iterations; i++) {
          await insert(1);
          count++;
          await wait(Math.max(0, ((i + 1) * 1000) / rate - (performance.now() - start)));
          if (i % rate === 0)
            metrics.samples.push({
              rate,
              elapsedMs: performance.now() - start,
              ...(await snapshot()),
            });
          if (worker.exitCode !== null)
            throw new Error('Consumer exited during velocity experiment');
        }
      });
    await verify('velocity-drain-and-reconcile', async () => {
      const start = performance.now();
      while (
        (await snapshot()).pending &&
        performance.now() - start < config.drainTimeoutSeconds * 1000
      )
        await wait(100);
      metrics.drainMs = performance.now() - start;
      if ((await snapshot()).pending > 0)
        throw Object.assign(new Error('Velocity backlog drain bound reached'), {
          code: 'EXPERIMENT_INCOMPLETE',
        });
      metrics.reconciliation = await reconcile(count);
    });
  } else if (mode === 'variety') {
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const valid = ajv.compile(
      readJson(resolve(root, 'packages/contracts/events/analytics-event.schema.json')),
    );
    const envelope = {
      eventId: randomUUID(),
      eventName: 'drill_completed',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      entityType: 'assessmentAttempt',
      entityId: randomUUID(),
      payload: {},
    };
    for (const [name, payload] of [
      ['simple', {}],
      ['unicode', { text: 'Matematika ∑ π — siswa 😊' }],
      ['nested', { answers: [{ value: null }], optional: true }],
      ['boundary', { value: Number.MAX_SAFE_INTEGER }],
    ]) {
      await verify('supported-envelope-' + name, async () => {
        assert.equal(valid({ ...envelope, payload }), true);
        await insert(1, () => payload);
      });
    }
    for (const [name, mutation] of [
      ['missing-required', { eventId: undefined }],
      ['wrong-type', { eventVersion: 'one' }],
      ['invalid-name', { eventName: 'INVALID NAME' }],
      ['invalid-payload', { payload: [] }],
    ]) {
      await verify('generator-contract-rejects-' + name, async () =>
        assert.equal(valid({ ...envelope, ...mutation }), false),
      );
    }
    await verify('real-worker-preserves-supported-payloads', async () => {
      await drain();
      metrics.reconciliation = await reconcile(4);
    });
    metrics.limitation =
      'Invalid envelopes are checked at the generator contract boundary; this does not prove worker-side rejection of malformed internal database rows. API input rejection is covered by connected HTTP tests.';
  } else if (mode === 'recovery') {
    await insert(3);
    await verify('worker-stopped-leaves-durable-backlog', async () =>
      assert.equal((await snapshot()).pending, 3),
    );
    await verify('worker-process-restart-drains-without-loss', async () => {
      const result = await runProcess(
        root,
        process.execPath,
        ['qa/runtime/consume.mjs', '--once'],
        { env: environment, timeoutMs: 60000 },
      );
      assert.equal(result.code, 0);
      await reconcile(3);
    });
    await verify('redelivery-does-not-duplicate-analytics', async () => {
      await sql.unsafe('update analytics_outbox set processed_at=null where entity_type=$1', [
        type,
      ]);
      await drain();
      await reconcile(3);
    });
    await verify('database-connection-outage-retains-events-and-recovers', async () => {
      await insert(1);
      const transport = await proxy(environment.TEST_DATABASE_URL);
      try {
        transport.block();
        const failed = await runProcess(
          root,
          process.execPath,
          ['qa/runtime/consume.mjs', '--once'],
          {
            env: {
              ...environment,
              TEST_DATABASE_URL: transport.url,
              DATABASE_MIGRATION_URL: transport.url,
            },
            timeoutMs: 5000,
          },
        );
        assert.notEqual(failed.code, 0);
        assert.ok(
          transport.rejectedConnections() > 0,
          'The worker must actually attempt a connection through the blocked proxy',
        );
        assert.equal((await snapshot()).pending, 1);
        transport.restore();
        const recovered = await runProcess(
          root,
          process.execPath,
          ['qa/runtime/consume.mjs', '--once'],
          {
            env: {
              ...environment,
              TEST_DATABASE_URL: transport.url,
              DATABASE_MIGRATION_URL: transport.url,
            },
            timeoutMs: 60000,
          },
        );
        assert.equal(recovered.code, 0);
        await reconcile(4);
      } finally {
        await transport.close();
      }
    });
    await verify('redis-connection-outage-and-reconnect-preserve-postgres-results', async () => {
      const Redis = require('ioredis'),
        transport = await proxy(environment.TEST_REDIS_URL);
      const connection = () => {
        const redis = new Redis(transport.url, {
          lazyConnect: true,
          connectTimeout: 1000,
          retryStrategy: () => null,
          maxRetriesPerRequest: 0,
        });
        redis.on('error', () => {});
        return redis;
      };
      let redis = connection();
      try {
        await redis.connect();
        assert.equal(await redis.ping(), 'PONG');
        redis.disconnect();
        transport.block();
        redis = connection();
        await assert.rejects(redis.connect());
        redis.disconnect();
        transport.restore();
        redis = connection();
        await redis.connect();
        assert.equal(await redis.ping(), 'PONG');
        await reconcile(4);
      } finally {
        redis.disconnect();
        await transport.close();
      }
    });
    await verify('postgres-backup-restores-attempts-ledger-and-event-content', async () => {
      const url = new URL(environment.TEST_DATABASE_URL),
        name = url.pathname.slice(1) + '_restore';
      assert.match(name, /^numora_test_qa_[a-f0-9]{32}_recovery_restore$/);
      const binary = (tool) =>
        environment.QA_PG_BIN
          ? resolve(environment.QA_PG_BIN, tool + (process.platform === 'win32' ? '.exe' : ''))
          : tool;
      const pgEnv = {
        ...environment,
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: url.pathname.slice(1),
        PGSSLMODE: 'disable',
      };
      const dump = resolve(root, 'qa/.local/artifacts/' + process.env.QA_RUN_ID + '/recovery.dump');
      mkdirSync(resolve(root, 'qa/.local/artifacts/' + process.env.QA_RUN_ID), { recursive: true });
      const backup = await runProcess(
        root,
        binary('pg_dump'),
        ['--format=custom', '--no-owner', '--file', dump],
        { env: pgEnv, timeoutMs: 120000 },
      );
      assert.equal(backup.code, 0, 'pg_dump failed');
      await sql.unsafe('CREATE DATABASE "' + name + '"');
      const restored = await runProcess(
        root,
        binary('pg_restore'),
        ['--no-owner', '--exit-on-error', '--dbname', name, dump],
        { env: pgEnv, timeoutMs: 120000 },
      );
      assert.equal(restored.code, 0, 'pg_restore failed');
      const restoreUrl = new URL(url);
      restoreUrl.pathname = '/' + name;
      const restoredSql = postgres(restoreUrl.href, { max: 1, onnotice: () => {} });
      try {
        for (const table of [
          'assessment_attempts',
          'attempt_items',
          'attempt_answers',
          'xp_ledger',
          'analytics_outbox',
          'analytics_events',
        ]) {
          const query =
            "select count(*)::integer as count, md5(coalesce(string_agg(to_jsonb(t)::text, chr(10) order by to_jsonb(t)::text),'')) as digest from " +
            table +
            ' t';
          const source = await sql.unsafe(query),
            destination = await restoredSql.unsafe(query);
          assert.deepEqual(destination, source);
        }
      } finally {
        await restoredSql.end();
      }
      metrics.restoreDatabase = name;
    });
    metrics.limitation =
      'Local worker/transport/database rehearsal only. Does not prove Google login, cloud failover, R2 restore, deployment rollback or production RTO/RPO.';
  } else throw new Error('UNKNOWN_PIPELINE_MODE');
} catch (error) {
  checks.push({ name: mode, status: 'FAIL', reason: sanitize(error.message) });
} finally {
  if (worker) terminate(worker);
  await sql.end({ timeout: 2 });
  await closeDatabaseConnection();
  const failed = checks.filter((c) => c.status === 'FAIL').length;
  const blocked = checks.filter((c) => c.status === 'BLOCKED').length;
  writeJson(output, {
    passed: checks.length - failed - blocked,
    blocked,
    failed,
    skipped: 0,
    total: checks.length,
    checks,
    metrics,
  });
  if (failed || blocked) process.exitCode = failed ? 1 : 2;
}

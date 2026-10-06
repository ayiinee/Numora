import { AdminAnalyticsService } from '../admin/analytics.service';
import { TryoutReleaseService } from '../learning/tryout-release.service';
import {
  discoverNotificationReleases,
  drainNotificationBatch,
} from '../../../../worker/src/notifications';
import { advanceTryoutBatches } from '../../../../worker/src/tryout-recovery';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  claimComputeExecution,
  closeDatabaseConnection,
  finishComputeExecution,
  heartbeatComputeExecution,
  writeComputeArtifact,
  type CalibrationArtifactPayloadV3,
} from '@tka/database';
import {
  adoptTryoutArtifact,
  analysisRequestDetail,
  pendingComputeNotifications,
  recordNotificationDelivery,
  validateComputeNotification,
} from '@tka/irt-orchestration';
import { pollIrtV3 } from '../../../../worker/src/irt-v3';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from '../identity/identity.service';
import { LearningModule } from '../learning/learning.module';
import { IrtModule } from './irt.module';
import { tryoutMeasurementFixture } from './irt-v3.test-fixture';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const builtMode = process.env.IRT_CHAIN_EVIDENCE === 'true';
const loadBuilt = createRequire(resolve('package.json'));
const poll = builtMode
  ? (loadBuilt(resolve('../worker/dist/irt-v3.js')).pollIrtV3 as typeof pollIrtV3)
  : pollIrtV3;
type Fixture = Awaited<ReturnType<typeof tryoutMeasurementFixture>>;
type Detail = Awaited<ReturnType<typeof analysisRequestDetail>>;
describe.skipIf(!databaseUrl)(
  'JOB-10 v3 foundation, TEST ONLY scientific consumer',
  { timeout: 60000 },
  () => {
    let admin: postgres.Sql, owner: postgres.Sql, main: postgres.Sql, compute: postgres.Sql;
    let app: INestApplication, base: string;
    let redis: Redis | undefined, queue: Queue | undefined, consumer: Worker | undefined;
    const suffix = randomUUID().replaceAll('-', ''),
      database = `numora_test_irt_${suffix}`;
    const mainLogin = `irt_main_${suffix}`,
      computeLogin = `irt_compute_${suffix}`;
    const original = {
      DATABASE_URL: process.env.DATABASE_URL,
      IRT_V3_ENABLED: process.env.IRT_V3_ENABLED,
      IRT_PSEUDONYM_KEY: process.env.IRT_PSEUDONYM_KEY,
      IRT_PSEUDONYM_KEY_VERSION: process.env.IRT_PSEUDONYM_KEY_VERSION,
    };
    const passed: string[] = [];
    beforeAll(async () => {
      const url = new URL(databaseUrl!);
      if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname))
        throw new Error('Isolated local PostgreSQL required');
      if (redisUrl && !['localhost', '127.0.0.1'].includes(new URL(redisUrl).hostname))
        throw new Error('Isolated local Redis required');
      admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      url.pathname = '/' + database;
      owner = postgres(url.toString(), { onnotice: () => {} });
      await migrate(drizzle(owner), {
        migrationsFolder: resolve('../../packages/database/drizzle'),
      });
      const password = randomUUID();
      for (const [login, group] of [
        [mainLogin, 'numora_main_runtime'],
        [computeLogin, 'numora_irt_runtime'],
      ]) {
        await admin.unsafe(
          `CREATE ROLE "${login}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
        );
        await admin.unsafe(`GRANT ${group} TO "${login}"`);
      }
      url.username = mainLogin;
      url.password = password;
      main = postgres(url.toString(), { onnotice: () => {} });
      await closeDatabaseConnection();
      process.env.DATABASE_URL = url.toString();
      url.username = computeLogin;
      compute = postgres(url.toString(), { onnotice: () => {} });
      process.env.IRT_V3_ENABLED = 'true';
      process.env.IRT_PSEUDONYM_KEY = 'TEST-ONLY-32-byte-pseudonym-secret-v3';
      process.env.IRT_PSEUDONYM_KEY_VERSION = 'TEST-v1';
      const irtModule = builtMode
        ? loadBuilt(resolve('dist/modules/irt/irt.module.js')).IrtModule
        : IrtModule;
      const learningModule = builtMode
        ? loadBuilt(resolve('dist/modules/learning/learning.module.js')).LearningModule
        : LearningModule;
      const identityService = builtMode
        ? loadBuilt(resolve('dist/modules/identity/identity.service.js')).IdentityService
        : IdentityService;
      const bootstrap = builtMode
        ? loadBuilt(resolve('dist/bootstrap.js')).configureApplication
        : configureApplication;
      const module = await Test.createTestingModule({ imports: [irtModule, learningModule] })
        .overrideProvider(identityService)
        .useValue({
          me: async (auth?: string) => {
            const id = auth?.replace(/^Bearer /, '');
            if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new UnauthorizedException();
            const [user] =
              await owner`SELECT id,role,status,admin_role AS "adminRole" FROM users WHERE id=${id}`;
            if (!user) throw new UnauthorizedException();
            return user;
          },
        })
        .compile();
      app = module.createNestApplication();
      bootstrap(app);
      await app.listen(0, '127.0.0.1');
      base = await app.getUrl();
      if (redisUrl) {
        redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
        queue = new Queue('irt-compute', {
          connection: redis,
          prefix: `numora:test:irt-${suffix}`,
        });
        await queue.waitUntilReady();
      }
    }, 60000);
    afterAll(async () => {
      await consumer?.close();
      await queue?.obliterate({ force: true });
      await queue?.close();
      redis?.disconnect();
      await app?.close();
      await closeDatabaseConnection();
      await Promise.all([main?.end(), compute?.end(), owner?.end()]);
      if (admin) {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
        await admin.unsafe(`DROP ROLE IF EXISTS "${mainLogin}"`);
        await admin.unsafe(`DROP ROLE IF EXISTS "${computeLogin}"`);
        await admin.end();
      }
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      if (process.env.IRT_CHAIN_EVIDENCE === 'true') {
        if (passed.length !== 14 || !redisUrl)
          throw new Error('Connected suite did not complete all fourteen scenarios');
        const root = resolve('../..');
        const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
        }).trim();
        if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
          throw new Error('Connected evidence requires committed SHA');
        await mkdir(resolve(root, '.tmp/job10-evidence'), { recursive: true });
        await writeFile(
          resolve(root, '.tmp/job10-evidence/connected.json'),
          JSON.stringify(
            {
              sha,
              productionBuilds: builtMode,
              scientificConsumer: 'TEST ONLY',
              databaseRoles: ['non-owner main', 'non-owner compute'],
              redis: !!redisUrl,
              passed,
              at: new Date().toISOString(),
            },
            null,
            2,
          ) + '\n',
        );
      }
    }, 60000);
    const fixture = (options: Parameters<typeof tryoutMeasurementFixture>[3] = {}) =>
      tryoutMeasurementFixture(owner, main, compute, options);
    const call = (path: string, method = 'GET', body?: object, token?: string, key?: string) =>
      fetch(`${base}/api/v1/${path}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    async function prepare(f: Fixture, key = randomUUID()) {
      const response = await call(
        'admin/irt/requests',
        'POST',
        { contextId: f.contextId, configurationPins: f.pins },
        f.actor,
        key,
      );
      expect(response.status, await response.clone().text()).toBe(201);
      return (await response.json()) as Detail;
    }
    async function artifact(
      f: Fixture,
      r: Detail,
      options: {
        invalid?: boolean;
        insufficient?: boolean;
        foreign?: boolean;
        duplicate?: boolean;
        calibrationFailed?: boolean;
        selectionPolicyId?: string;
      } = {},
    ) {
      const e = await claimComputeExecution(compute, r.id, f.principal, 60, r.dispatchGeneration);
      expect(e).not.toBeNull();
      const [dataset] = await compute<
        { id: string }[]
      >`INSERT INTO irt_compute.analysis_datasets(execution_id,snapshot_id,selection_policy_id) VALUES(${e!.id},${r.snapshotId},${options.selectionPolicyId ?? f.quality}) RETURNING id`;
      await compute`INSERT INTO irt_compute.analysis_response_selections(dataset_id,snapshot_id,snapshot_item_id,decision,reasons)
      SELECT ${dataset!.id},snapshot_id,id,CASE WHEN operational_eligible THEN 'INCLUDE' ELSE 'EXCLUDE' END,CASE WHEN operational_eligible THEN '[]'::jsonb ELSE '["UNSCORED"]'::jsonb END FROM irt_input_responses_v3 WHERE snapshot_id=${r.snapshotId}`;
      await compute`UPDATE irt_compute.analysis_datasets SET status='SEALED' WHERE id=${dataset!.id}`;
      const payload: CalibrationArtifactPayloadV3 = {
        items: [
          {
            questionVersionId: options.foreign ? randomUUID() : f.versionId,
            rubricVersionId: f.rubricId,
            modelFamily: f.partial ? 'GPCM' : '2PL',
            sampleSize: 1,
            eligibleRespondentCount: options.insufficient ? 0 : 1,
            measurementState: options.insufficient
              ? 'INSUFFICIENT'
              : options.calibrationFailed
                ? 'CALIBRATION_FAILED'
                : 'CALIBRATED',
            discriminationA:
              options.insufficient || options.calibrationFailed
                ? null
                : options.invalid
                  ? null
                  : 1.23456789,
            difficultyB: options.insufficient || options.calibrationFailed ? null : 0.2,
            steps:
              f.partial && !options.insufficient && !options.calibrationFailed
                ? [1, 2, 3].map((step) => ({ step, value: step / 10, standardError: 0.01 }))
                : [],
            qualityEvidence: { fixture: true },
          },
        ],
      };
      if (options.duplicate) payload.items.push({ ...payload.items[0]! });
      const output = await writeComputeArtifact(compute, {
        executionId: e!.id,
        datasetId: dataset!.id,
        inputDigest: r.inputDigest,
        kind: 'CALIBRATE_TRYOUT',
        scientificDecision: options.insufficient
          ? 'INSUFFICIENT'
          : options.calibrationFailed
            ? 'CALIBRATION_FAILED'
            : 'PASS',
        payload: { ...payload },
      });
      await finishComputeExecution(compute, e!.id, e!.fencingToken);
      return { execution: e!, output };
    }
    it('protects all operations and validates body/header/default-off without exposing dependencies', async () => {
      const f = await fixture();
      for (const endpoint of [
        ['admin/irt/requests', 'GET'],
        [`admin/irt/requests/${randomUUID()}`, 'GET'],
        ['admin/irt/requests', 'POST'],
        [`admin/irt/requests/${randomUUID()}/retry`, 'POST'],
      ]) {
        expect((await call(endpoint[0]!, endpoint[1])).status).toBe(401);
        for (const user of [f.student, f.teacher])
          expect((await call(endpoint[0]!, endpoint[1], undefined, user)).status).toBe(403);
      }
      expect(
        (
          await call(
            'admin/irt/requests',
            'POST',
            { contextId: f.contextId, configurationPins: f.pins },
            f.actor,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await call(
            'admin/irt/requests',
            'POST',
            { contextId: f.contextId, configurationPins: f.pins, cutoffAt: '2026-01-01' },
            f.actor,
            randomUUID(),
          )
        ).status,
      ).toBe(400);
      process.env.IRT_V3_ENABLED = 'false';
      const disabled = await call(
        'admin/irt/requests',
        'POST',
        { contextId: f.contextId, configurationPins: f.pins },
        f.actor,
        randomUUID(),
      );
      expect(disabled.status).toBe(503);
      expect(disabled.headers.get('content-type')).toContain('application/problem+json');
      process.env.IRT_V3_ENABLED = 'true';
      passed.push('API authorization, validation and opt-in');
    });
    it('deduplicates concurrent prepare and preserves empty answers/privacy/frozen input', async () => {
      const f = await fixture({ unanswered: true }),
        key = randomUUID();
      const requests = await Promise.all([prepare(f, key), prepare(f, key), prepare(f, key)]);
      expect(new Set(requests.map((r) => r.id)).size).toBe(1);
      const r = requests[0]!;
      expect(r.rowCount).toBe(1);
      const [row] =
        await main`SELECT * FROM response_snapshot_items WHERE snapshot_id=${r.snapshotId}`;
      expect(row!.raw_answer).toBeNull();
      expect(row!.score_category).toBeNull();
      expect(row!.operational_eligible).toBe(false);
      expect(row!.operational_exclusion_reasons).toEqual(['UNSCORED']);
      expect(row!.respondent_id).not.toBe(f.student);
      expect(JSON.stringify(r)).not.toContain(f.student);
      const [count] =
        await main`SELECT count(*)::int AS n FROM analytics_outbox WHERE entity_id=${r.id} AND event_name='analysis.requested'`;
      expect(count!.n).toBe(1);
      expect(
        await main`SELECT id FROM response_snapshots WHERE context_id=${f.contextId}`,
      ).toHaveLength(1);
      expect(
        await main`SELECT id FROM analysis_requests WHERE context_id=${f.contextId}`,
      ).toHaveLength(1);
      expect(
        await main`SELECT id FROM analysis_request_dispatches WHERE request_id=${r.id}`,
      ).toHaveLength(1);
      await expect(
        main`UPDATE response_snapshot_items SET raw_answer='{}' WHERE snapshot_id=${r.snapshotId}`,
      ).rejects.toMatchObject({ code: '23514' });
      const conflict = await call(
        'admin/irt/requests',
        'POST',
        { contextId: randomUUID(), configurationPins: f.pins },
        f.actor,
        key,
      );
      expect(conflict.status).toBe(409);
      const listed = await call('admin/irt/requests?limit=1&offset=0', 'GET', undefined, f.actor);
      expect(listed.status).toBe(200);
      expect(JSON.stringify(await listed.json())).not.toContain('rawAnswer');
      passed.push('Concurrent prepare, frozen unanswered input and privacy');
    });
    it('rejects empty/unapproved data atomically and enforces main/compute roles', async () => {
      const empty = await fixture({ empty: true });
      const response = await call(
        'admin/irt/requests',
        'POST',
        { contextId: empty.contextId, configurationPins: empty.pins },
        empty.actor,
        randomUUID(),
      );
      expect(response.status).toBe(409);
      expect(
        await main`SELECT id FROM response_snapshots WHERE context_id=${empty.contextId}`,
      ).toHaveLength(0);
      const f = await fixture();
      await main`UPDATE configuration_approvals SET revoked_at=now() WHERE id=${f.pins[0]!.approvalId}`;
      expect(
        (
          await call(
            'admin/irt/requests',
            'POST',
            { contextId: f.contextId, configurationPins: f.pins },
            f.actor,
            randomUUID(),
          )
        ).status,
      ).toBe(409);
      expect(
        await main`SELECT id FROM analysis_requests WHERE context_id=${f.contextId}`,
      ).toHaveLength(0);
      const scoped = await fixture(),
        other = await fixture();
      expect(
        (
          await call(
            'admin/irt/requests',
            'POST',
            { contextId: scoped.contextId, configurationPins: other.pins },
            scoped.actor,
            randomUUID(),
          )
        ).status,
      ).toBe(409);
      await owner`CREATE FUNCTION public.test_only_job10_prepare_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY failure after freeze/request/outbox' USING ERRCODE='23514'; END $$`;
      await owner`CREATE TRIGGER test_only_job10_prepare_failure BEFORE INSERT ON analysis_request_dispatches FOR EACH ROW EXECUTE FUNCTION public.test_only_job10_prepare_failure()`;
      try {
        const before =
          await main`SELECT id FROM analytics_outbox WHERE event_name='analysis.requested'`;
        expect(
          (
            await call(
              'admin/irt/requests',
              'POST',
              { contextId: scoped.contextId, configurationPins: scoped.pins },
              scoped.actor,
              randomUUID(),
            )
          ).status,
        ).toBe(409);
        expect(
          await main`SELECT id FROM response_snapshots WHERE context_id=${scoped.contextId}`,
        ).toHaveLength(0);
        expect(
          await main`SELECT id FROM analysis_requests WHERE context_id=${scoped.contextId}`,
        ).toHaveLength(0);
        expect(
          await main`SELECT id FROM analytics_outbox WHERE event_name='analysis.requested'`,
        ).toHaveLength(before.length);
      } finally {
        await owner`DROP TRIGGER test_only_job10_prepare_failure ON analysis_request_dispatches`;
        await owner`DROP FUNCTION public.test_only_job10_prepare_failure()`;
      }
      await expect(compute`SELECT * FROM public.assessment_attempts`).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        main`INSERT INTO irt_compute.compute_outputs(execution_id,kind,input_digest,digest,payload,scientific_decision) VALUES(${randomUUID()},'CALIBRATE_TRYOUT','','','{}','PASS')`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        compute`SELECT operation_key FROM public.analysis_request_dispatches`,
      ).rejects.toMatchObject({ code: '42501' });
      passed.push('Atomic failures and restricted runtime roles');
    });
    it('authorizes manual retry only once, fences expired workers and retains identical input', async () => {
      const f = await fixture(),
        r = await prepare(f);
      expect(await claimComputeExecution(compute, r.id, f.principal, 60)).toBeNull();
      const first = await claimComputeExecution(compute, r.id, f.principal, 1, 1);
      expect(first).not.toBeNull();
      const path = `admin/irt/requests/${r.id}/retry`;
      expect((await call(path, 'POST', undefined, f.actor, randomUUID())).status).toBe(409);
      await owner`SELECT pg_sleep(1.1)`;
      const key = randomUUID();
      const retries = await Promise.all([
        call(path, 'POST', undefined, f.actor, key),
        call(path, 'POST', undefined, f.actor, key),
      ]);
      for (const response of retries) {
        expect(response.status, await response.clone().text()).toBe(201);
        const retried = (await response.json()) as Detail;
        expect(retried.dispatchGeneration).toBe(2);
        expect(retried.inputDigest).toBe(r.inputDigest);
        expect(retried.snapshotId).toBe(r.snapshotId);
      }
      // A new operation cannot skip an unclaimed generation using an older failure.
      expect((await call(path, 'POST', undefined, f.actor, randomUUID())).status).toBe(409);
      expect(await claimComputeExecution(compute, r.id, f.principal, 60, 1)).toBeNull();
      const replacement = await claimComputeExecution(compute, r.id, f.principal, 60, 2);
      expect(replacement).not.toBeNull();
      await expect(
        heartbeatComputeExecution(compute, first!.id, first!.fencingToken),
      ).rejects.toThrow('COMPUTE_STALE_EXECUTION');
      expect(await claimComputeExecution(compute, r.id, f.principal, 60, 2)).toBeNull();
      await finishComputeExecution(
        compute,
        replacement!.id,
        replacement!.fencingToken,
        'TEST_COMPUTE_FAILED',
      );
      expect(await claimComputeExecution(compute, r.id, f.principal, 60, 2)).toBeNull();
      passed.push('Manual retry, expired lease fencing and duplicate generation');
    });
    it('rolls back invalid adoption, permits explicit retry, and copies evidence idempotently without release', async () => {
      const f = await fixture(),
        r = await prepare(f);
      await artifact(f, r, { invalid: true });
      await expect(adoptTryoutArtifact(main, r.id)).rejects.toThrow('IRT_ARTIFACT_INVALID');
      expect(await main`SELECT id FROM irt_batches WHERE analysis_request_id=${r.id}`).toHaveLength(
        0,
      );
      expect((await analysisRequestDetail(main, r.id)).status).toBe('FAILED');
      const retry = await call(
        `admin/irt/requests/${r.id}/retry`,
        'POST',
        undefined,
        f.actor,
        randomUUID(),
      );
      expect(retry.status).toBe(201);
      const retried = (await retry.json()) as Detail;
      await artifact(f, retried);
      const adopted = await Promise.all([
        adoptTryoutArtifact(main, r.id),
        adoptTryoutArtifact(main, r.id),
      ]);
      expect(adopted.filter((a) => a.adopted)).toHaveLength(1);
      const [batch] = await main`SELECT * FROM irt_batches WHERE analysis_request_id=${r.id}`;
      expect(batch!.result_released_at).toBeNull();
      const [item] = await main`SELECT * FROM irt_item_results WHERE batch_id=${batch!.id}`;
      expect(item!.discrimination_a).toBe('1.234568');
      expect(item!.guessing_c).toBeNull();
      expect(item!.sample_size).toBe(1);
      expect(await main`SELECT id FROM active_parameter_bindings`).toHaveLength(0);
      expect(await main`SELECT id FROM tryout_result_finalizations`).toHaveLength(0);
      expect(await main`SELECT id FROM xp_ledger`).toHaveLength(0);
      const result = await call(
        `tryout/attempts/${f.attemptId}/result`,
        'GET',
        undefined,
        f.student,
      );
      expect(result.status).toBe(409);
      const body = await result.json();
      expect(body.code).toBe('TRYOUT_RESULT_PENDING');
      expect(JSON.stringify(body)).not.toContain('PRIVATE explanation');
      expect(JSON.stringify(body)).not.toContain('correctOptionId');
      expect(
        (await call(`admin/irt/requests/${r.id}/retry`, 'POST', undefined, f.actor, randomUUID()))
          .status,
      ).toBe(409);
      passed.push('Atomic/idempotent adoption and Student release gate');
    });
    it('preserves insufficient decisions and copies GPCM steps without inventing parameters', async () => {
      const f = await fixture({ partial: true }),
        r = await prepare(f);
      await artifact(f, r);
      await adoptTryoutArtifact(main, r.id);
      const steps =
        await main`SELECT s.* FROM irt_item_step_parameters s JOIN irt_item_results i ON i.id=s.item_result_id JOIN irt_batches b ON b.id=i.batch_id WHERE b.analysis_request_id=${r.id} ORDER BY step`;
      expect(steps).toHaveLength(3);
      expect(steps[0]!.value).toBe('0.1');
      const low = await fixture({ unanswered: true }),
        lr = await prepare(low);
      await artifact(low, lr, { insufficient: true });
      await adoptTryoutArtifact(main, lr.id);
      const [item] =
        await main`SELECT i.* FROM irt_item_results i JOIN irt_batches b ON b.id=i.batch_id WHERE b.analysis_request_id=${lr.id}`;
      expect(item!.measurement_state).toBe('INSUFFICIENT');
      expect(item!.discrimination_a).toBeNull();
      const foreign = await fixture(),
        fr = await prepare(foreign);
      await artifact(foreign, fr, { foreign: true });
      await expect(adoptTryoutArtifact(main, fr.id)).rejects.toThrow('IRT_ARTIFACT_ITEM_MISMATCH');
      const failed = await fixture(),
        failedRequest = await prepare(failed);
      await artifact(failed, failedRequest, { calibrationFailed: true });
      await adoptTryoutArtifact(main, failedRequest.id);
      const [failedItem] =
        await main`SELECT i.* FROM irt_item_results i JOIN irt_batches b ON b.id=i.batch_id WHERE b.analysis_request_id=${failedRequest.id}`;
      expect(failedItem!.measurement_state).toBe('CALIBRATION_FAILED');
      expect(failedItem!.data_status).toBe('CALIBRATION_FAILED');
      expect(failedItem!.discrimination_a).toBeNull();
      expect(
        (await analysisRequestDetail(main, failedRequest.id)).artifacts[0]!.scientificDecision,
      ).toBe('CALIBRATION_FAILED');
      passed.push('GPCM evidence, insufficient decision and foreign-item rejection');
    });
    it('rejects incomplete manifests, incorrect provenance and duplicate output items', async () => {
      const f = await fixture(),
        r = await prepare(f);
      const e = await claimComputeExecution(compute, r.id, f.principal, 60, 1);
      const [dataset] =
        await compute`INSERT INTO irt_compute.analysis_datasets(execution_id,snapshot_id,selection_policy_id) VALUES(${e!.id},${r.snapshotId},${f.quality}) RETURNING id`;
      await expect(
        compute`UPDATE irt_compute.analysis_datasets SET status='SEALED' WHERE id=${dataset!.id}`,
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        writeComputeArtifact(compute, {
          executionId: e!.id,
          datasetId: dataset!.id,
          inputDigest: r.inputDigest,
          kind: 'CALIBRATE_TRYOUT',
          scientificDecision: 'PASS',
          payload: { items: [] },
        }),
      ).rejects.toMatchObject({ code: '23514' });
      await compute`INSERT INTO irt_compute.analysis_response_selections(dataset_id,snapshot_id,snapshot_item_id,decision,reasons) SELECT ${dataset!.id},snapshot_id,id,'INCLUDE','[]' FROM irt_input_responses_v3 WHERE snapshot_id=${r.snapshotId}`;
      await compute`UPDATE irt_compute.analysis_datasets SET status='SEALED' WHERE id=${dataset!.id}`;
      await expect(
        writeComputeArtifact(compute, {
          executionId: e!.id,
          datasetId: dataset!.id,
          inputDigest: '0'.repeat(64),
          kind: 'CALIBRATE_TRYOUT',
          scientificDecision: 'PASS',
          payload: { items: [] },
        }),
      ).rejects.toMatchObject({ code: '23514' });
      await finishComputeExecution(compute, e!.id, e!.fencingToken, 'TEST_PROVENANCE_REJECTED');
      const wrongPolicy = await fixture(),
        wr = await prepare(wrongPolicy);
      const [model] =
        await main`SELECT technical_policy_version_id AS id FROM configuration_approvals WHERE id=${wrongPolicy.pins[0]!.approvalId}`;
      await artifact(wrongPolicy, wr, { selectionPolicyId: model!.id });
      await expect(adoptTryoutArtifact(main, wr.id)).rejects.toThrow(
        'IRT_ARTIFACT_PROVENANCE_INVALID',
      );
      const duplicate = await fixture(),
        dr = await prepare(duplicate);
      await artifact(duplicate, dr, { duplicate: true });
      await expect(adoptTryoutArtifact(main, dr.id)).rejects.toThrow('IRT_ARTIFACT_INVALID');
      passed.push('Incomplete manifests, provenance and duplicate items');
    });
    it('rolls back acceptance and every canonical write when a later GPCM step fails', async () => {
      const f = await fixture({ partial: true }),
        r = await prepare(f);
      await artifact(f, r);
      await owner`CREATE FUNCTION public.test_only_job10_step_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.step=2 THEN RAISE EXCEPTION 'TEST ONLY injected second-step failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`;
      await owner`CREATE TRIGGER test_only_job10_step_failure BEFORE INSERT ON irt_item_step_parameters FOR EACH ROW EXECUTE FUNCTION public.test_only_job10_step_failure()`;
      try {
        await expect(adoptTryoutArtifact(main, r.id)).rejects.toMatchObject({ code: '23514' });
        expect(
          await main`SELECT id FROM irt_batches WHERE analysis_request_id=${r.id}`,
        ).toHaveLength(0);
        expect(
          await main`SELECT id FROM irt_item_results WHERE question_version_id=${f.versionId}`,
        ).toHaveLength(0);
        const detail = await analysisRequestDetail(main, r.id);
        expect(detail.acceptedExecutionId).toBeNull();
        expect(detail.status).toBe('FAILED');
        expect(detail.failureCode).toBe('IRT_ARTIFACT_INVALID');
      } finally {
        await owner`DROP TRIGGER test_only_job10_step_failure ON irt_item_step_parameters`;
        await owner`DROP FUNCTION public.test_only_job10_step_failure()`;
      }
      passed.push('Partial canonical write rollback');
    });
    it.skipIf(!redisUrl)(
      'connects real Admin API → PostgreSQL → Redis → TEST ONLY consumer → canonical, recovering lost queue state',
      async () => {
        const f = await fixture(),
          r = await prepare(f);
        const notification = (await pendingComputeNotifications(main)).find(
          (n) => n.requestId === r.id,
        )!;
        validateComputeNotification(notification);
        await queue!.add('analysis-requested', notification, {
          jobId: `irt-${r.id}-1`,
          removeOnComplete: true,
        });
        // Simulate producer crash after enqueue and before delivery acknowledgment.
        await poll(queue!);
        expect(await queue!.getJob(`irt-${r.id}-1`)).not.toBeNull();
        await queue!.obliterate({ force: true });
        await main`UPDATE outbox_deliveries SET delivered_at=clock_timestamp()-interval '61 seconds' WHERE outbox_id IN (SELECT id FROM analytics_outbox WHERE entity_id=${r.id})`;
        // Analytics consumption must not affect the compute delivery stream.
        await main`UPDATE analytics_outbox SET processed_at=clock_timestamp() WHERE entity_id=${r.id}`;
        await poll(queue!);
        expect(await queue!.getJob(`irt-${r.id}-1`)).not.toBeNull();
        const errors: unknown[] = [];
        consumer = new Worker(
          'irt-compute',
          async (job) => {
            validateComputeNotification(job.data);
            if (job.data.requestId !== r.id) return;
            expect(job.data.inputDigest).toBe(r.inputDigest);
            await artifact(f, r);
          },
          { connection: redis!, prefix: `numora:test:irt-${suffix}` },
        );
        consumer.on('failed', (_job, error) => errors.push(error));
        const deadline = Date.now() + 15000;
        while (
          (await analysisRequestDetail(main, r.id)).execution?.status !== 'SUCCEEDED' &&
          Date.now() < deadline
        )
          await new Promise((resolve) => setTimeout(resolve, 50));
        expect(errors).toEqual([]);
        expect((await analysisRequestDetail(main, r.id)).execution?.status).toBe('SUCCEEDED');
        await poll(queue!);
        expect((await analysisRequestDetail(main, r.id)).status).toBe('COMPLETED');
        await consumer.close();
        consumer = undefined;
        const [count] =
          await main`SELECT count(*)::int AS n FROM irt_compute.compute_executions WHERE request_id=${r.id}`;
        expect(count!.n).toBe(1);
        passed.push(
          'Real API/PostgreSQL/Redis connected chain with TEST ONLY consumer and queue loss recovery',
        );
      },
    );
    it('records bounded transport cooldown without consuming the compute retry authorization', async () => {
      const f = await fixture(),
        r = await prepare(f);
      const notification = (await pendingComputeNotifications(main)).find(
        (n) => n.requestId === r.id,
      )!;
      await recordNotificationDelivery(main, notification, true);
      expect((await pendingComputeNotifications(main)).some((n) => n.requestId === r.id)).toBe(
        false,
      );
      expect((await analysisRequestDetail(main, r.id)).dispatchGeneration).toBe(1);
      passed.push('Transport cooldown separated from compute retry');
    });
    it.skipIf(!redisUrl)(
      'persists cooldown after an actual failed Redis connection without authorizing execution',
      async () => {
        const f = await fixture(),
          r = await prepare(f);
        // A refused localhost endpoint simulates transport outage without stopping another suite's Redis.
        const disconnected = new Redis({
          host: '127.0.0.1',
          port: 1,
          lazyConnect: true,
          enableOfflineQueue: false,
          retryStrategy: () => null,
          maxRetriesPerRequest: 1,
          connectTimeout: 1000,
        });
        disconnected.on('error', () => {});
        await disconnected.connect().catch(() => {});
        const unavailable = new Queue('irt-compute', {
          connection: disconnected,
          prefix: `numora:test:irt-outage-${suffix}`,
          skipVersionCheck: true,
        });
        unavailable.on('error', () => {});
        try {
          await expect(poll(unavailable)).rejects.toThrow();
          expect((await pendingComputeNotifications(main)).some((n) => n.requestId === r.id)).toBe(
            false,
          );
          expect((await analysisRequestDetail(main, r.id)).dispatchGeneration).toBe(1);
          expect(
            await main`SELECT id FROM irt_compute.compute_executions WHERE request_id=${r.id}`,
          ).toHaveLength(0);
        } finally {
          await unavailable.close();
          disconnected.disconnect();
        }
        passed.push('Real Redis connection outage and durable cooldown');
      },
    );
    it('exposes approved pins, durable health and scoped aggregates without publishing compute success', async () => {
      const f = await fixture(),
        actorKey = randomUUID(),
        r = await prepare(f, actorKey);
      const other = await fixture();
      expect(
        (
          await call(
            'admin/irt/requests',
            'POST',
            { contextId: f.contextId, configurationPins: f.pins },
            other.actor,
            actorKey,
          )
        ).status,
      ).toBe(409);
      const optionsResponse = await call('admin/irt/options', 'GET', undefined, f.actor);
      const options = await optionsResponse.json();
      expect(optionsResponse.status, JSON.stringify(options)).toBe(200);
      expect(
        options.configurations.filter((c: { contextId: string }) => c.contextId === f.contextId),
      ).toHaveLength(2);
      expect(JSON.stringify(options)).not.toMatch(/definition|Private fixture|rawAnswer/);
      const detail = await analysisRequestDetail(main, r.id);
      expect(detail.configurationPins).toEqual(expect.arrayContaining(f.pins));
      await artifact(f, r);
      await adoptTryoutArtifact(main, r.id, f.actor);
      const release = new TryoutReleaseService();
      expect((await release.releasedPackageIds([f.packageId])).has(f.packageId)).toBe(false);
      await discoverNotificationReleases();
      await drainNotificationBatch(100);
      expect(
        await main`SELECT id FROM notifications WHERE source_key=${'TRYOUT_RESULT_READY:' + f.attemptId}`,
      ).toHaveLength(0);
      const health = await (
        await fetch(base + '/api/v1/admin/irt/batch-health?limit=100', {
          headers: { Authorization: 'Bearer ' + f.actor },
        })
      ).json();
      expect(health.items.find((b: { id: string }) => b.id === f.batchId)).toMatchObject({
        publicationMode: null,
        publicationBlockers: ['RESPONDENT_CONTRACT_NOT_APPROVED'],
      });
      const content = await new AdminAnalyticsService().summary('CONTENT_DATA_MODERATION');
      const ops = await new AdminAnalyticsService().summary('OPERATIONS');
      expect(content.metrics.some((m) => m.domain === 'OPERATIONS')).toBe(false);
      expect(ops.metrics.some((m) => m.domain === 'CONTENT')).toBe(false);
      expect(content.metrics.every((m) => m.value !== null && m.unavailableReason === null)).toBe(
        true,
      );
      expect(ops.metrics.every((m) => m.value !== null && m.unavailableReason === null)).toBe(true);
      expect(JSON.stringify(content)).not.toMatch(/Private fixture|answer|example.test/);
      passed.push(
        'Approved configuration and immutable pins, operational SLA and scoped aggregate readers',
      );
    });
    it('reads immutable published participant results and preserves value/mode/version on replay', async () => {
      const f = await fixture();
      const [policy] = await main<
        { scoring_policy_version_id: string }[]
      >`SELECT scoring_policy_version_id FROM assessment_packages WHERE id=${f.packageId}`;
      const [finalization] = await main<
        { id: string }[]
      >`INSERT INTO tryout_result_finalizations(batch_id,version,mode,scoring_policy_version_id,policy_snapshot,digest) VALUES(${f.batchId},1,'FALLBACK',${policy!.scoring_policy_version_id},'{"fixture":"TEST ONLY approved fallback"}','TEST-finalization') RETURNING id`;
      await main`INSERT INTO tryout_finalization_items(finalization_id,question_version_id,included,max_points,reason) VALUES(${finalization!.id},${f.versionId},true,1,'TEST ONLY')`;
      await main`INSERT INTO tryout_attempt_results(finalization_id,attempt_id,score,coverage) VALUES(${finalization!.id},${f.attemptId!},73.25,'{"fixture":true}')`;
      await main`UPDATE tryout_result_finalizations SET published_at=now() WHERE id=${finalization!.id}`;
      const release = new TryoutReleaseService();
      expect((await release.releasedPackageIds([f.packageId])).has(f.packageId)).toBe(true);
      await discoverNotificationReleases();
      await drainNotificationBatch(100);
      expect(
        await main`SELECT id FROM notifications WHERE source_key=${'TRYOUT_RESULT_READY:' + f.attemptId}`,
      ).toHaveLength(1);
      await discoverNotificationReleases();
      await drainNotificationBatch(100);
      expect(
        await main`SELECT id FROM notifications WHERE source_key=${'TRYOUT_RESULT_READY:' + f.attemptId}`,
      ).toHaveLength(1);
      expect((await release.publishedResults([f.attemptId!])).get(f.attemptId!)).toEqual({
        score: 73.25,
        mode: 'FALLBACK',
        version: 1,
      });
      const response = await call(
        `tryout/attempts/${f.attemptId}/result`,
        'GET',
        undefined,
        f.student,
      );
      const result = await response.json();
      expect(response.status, JSON.stringify(result)).toBe(200);
      expect(result).toMatchObject({ score: 73.25, mode: 'FALLBACK', publicationVersion: 1 });
      expect(result.explanation[0].explanation).toBe('PRIVATE explanation');
      const history = await (
        await call('students/me/assessment-results', 'GET', undefined, f.student)
      ).json();
      expect(
        history.records.find((row: { attemptId: string }) => row.attemptId === f.attemptId),
      ).toMatchObject({ score: 73.25, resultState: 'ready' });
      await expect(
        main`UPDATE tryout_attempt_results SET score=99 WHERE finalization_id=${finalization!.id}`,
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        main`UPDATE tryout_result_finalizations SET mode='UNSCORABLE' WHERE id=${finalization!.id}`,
      ).rejects.toMatchObject({ code: '23514' });
      expect((await release.publishedResults([f.attemptId!])).get(f.attemptId!)?.score).toBe(73.25);
      const unscorable = await fixture();
      const [unscorablePolicy] = await main<
        { scoring_policy_version_id: string }[]
      >`SELECT scoring_policy_version_id FROM assessment_packages WHERE id=${unscorable.packageId}`;
      const [unscorableFinalization] = await main<
        { id: string }[]
      >`INSERT INTO tryout_result_finalizations(batch_id,version,mode,scoring_policy_version_id,policy_snapshot,digest) VALUES(${unscorable.batchId},1,'UNSCORABLE',${unscorablePolicy!.scoring_policy_version_id},'{"fixture":"TEST ONLY unscorable approval"}','TEST-unscorable-finalization') RETURNING id`;
      await main`INSERT INTO tryout_finalization_items(finalization_id,question_version_id,included,max_points,reason) VALUES(${unscorableFinalization!.id},${unscorable.versionId},false,1,'TEST ONLY insufficient scientific evidence')`;
      await main`INSERT INTO tryout_attempt_results(finalization_id,attempt_id,coverage) VALUES(${unscorableFinalization!.id},${unscorable.attemptId!},'{"fixture":true}')`;
      await main`UPDATE tryout_result_finalizations SET published_at=now() WHERE id=${unscorableFinalization!.id}`;
      const unscorableResponse = await call(
        `tryout/attempts/${unscorable.attemptId}/result`,
        'GET',
        undefined,
        unscorable.student,
      );
      const unscorableResult = await unscorableResponse.json();
      expect(unscorableResponse.status, JSON.stringify(unscorableResult)).toBe(409);
      expect(unscorableResult).toMatchObject({ code: 'TRYOUT_RESULT_PENDING' });
      const unscorableHistory = await (
        await call('students/me/assessment-results', 'GET', undefined, unscorable.student)
      ).json();
      expect(
        unscorableHistory.records.find(
          (row: { attemptId: string }) => row.attemptId === unscorable.attemptId,
        ),
      ).toMatchObject({ score: null, resultState: 'waitingIrt' });
      passed.push(
        'Immutable participant publication reader with atomic explanations, mapped score and withholding unscorable publication',
      );
    });
    it('closes batches once and includes late worker grading while excluding late saved answers', async () => {
      const f = await fixture({ lateGrading: true });
      await main`UPDATE tryout_batches SET status='OPEN' WHERE id=${f.batchId}`;
      await Promise.all([advanceTryoutBatches(), advanceTryoutBatches()]);
      const [events] = await main<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM analytics_outbox WHERE entity_id=${f.batchId} AND event_name='tryout.batch_closed'`;
      expect(events!.n).toBe(1);
      const r = await prepare(f);
      const [response] = await main<
        { operational_eligible: boolean }[]
      >`SELECT operational_eligible FROM response_snapshot_items WHERE snapshot_id=${r.snapshotId}`;
      expect(response!.operational_eligible).toBe(true);
      const late = await fixture({ lateSaved: true });
      const lr = await prepare(late);
      const [excluded] = await main<
        { operational_eligible: boolean }[]
      >`SELECT operational_eligible FROM response_snapshot_items WHERE snapshot_id=${lr.snapshotId}`;
      expect(excluded!.operational_eligible).toBe(false);
      passed.push(
        'Concurrent batch close outbox and late worker grading with cutoff-protected answers',
      );
    });
  },
);

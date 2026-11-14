import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { connect, createServer, type Socket } from 'node:net';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acceptComputeExecution,
  claimComputeExecution,
  createAnalysisRequest,
  finishComputeExecution,
  writeComputeArtifact,
} from '@tka/database';
import { tryoutMeasurementFixture } from '../../../apps/api/src/modules/irt/irt-v3.test-fixture.js';
import { generationDetail, listGenerations } from './generator.js';
import {
  analysisRequestDetail,
  listAnalysisRequests,
  prepareTryoutAnalysis,
} from './orchestration.js';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)(
  'batched IRT and Generator list reads on isolated runtime PostgreSQL',
  { timeout: 60000 },
  () => {
    const suffix = randomUUID().replaceAll('-', ''),
      database = `numora_test_list_${suffix}`;
    const mainLogin = `list_main_${suffix}`,
      computeLogin = `list_compute_${suffix}`;
    let admin: postgres.Sql,
      owner: postgres.Sql,
      main: postgres.Sql,
      compute: postgres.Sql,
      mainUrl: string;
    const prior = {
      NUMORA_GENERATOR_ENABLED: process.env.NUMORA_GENERATOR_ENABLED,
      IRT_V3_ENABLED: process.env.IRT_V3_ENABLED,
      IRT_PSEUDONYM_KEY: process.env.IRT_PSEUDONYM_KEY,
      IRT_PSEUDONYM_KEY_VERSION: process.env.IRT_PSEUDONYM_KEY_VERSION,
    };
    let fixture: Awaited<ReturnType<typeof tryoutMeasurementFixture>>;
    const irtIds: string[] = [],
      generatorIds: string[] = [];
    let staleIrt = '',
      staleGenerator = '',
      acceptedIrt = '',
      acceptedGenerator = '',
      expiredIrt = '',
      expiredGenerator = '';

    async function measure<T>(run: (client: postgres.Sql) => Promise<T>) {
      const sockets = new Set<Socket>();
      let counting = false,
        bytes = 0,
        queries = 0,
        buffer: Buffer = Buffer.alloc(0);
      const remote = new URL(mainUrl);
      const host = remote.hostname,
        port = Number(remote.port || 5432);
      const server = createServer((downstream) => {
        const upstream = connect(port, host);
        for (const socket of [upstream, downstream]) {
          sockets.add(socket);
          socket.on('close', () => sockets.delete(socket));
          socket.on('error', () => {
            upstream.destroy();
            downstream.destroy();
          });
        }
        upstream.on('data', (chunk) => {
          if (counting) bytes += chunk.length;
        });
        downstream.on('data', (chunk) => {
          if (!counting) return;
          buffer = Buffer.concat([buffer, chunk]);
          while (buffer.length >= 5) {
            const length = buffer.readInt32BE(1) + 1;
            if (buffer.length < length) break;
            if (buffer[0] === 69 || buffer[0] === 81) queries++;
            buffer = buffer.subarray(length);
          }
        });
        upstream.pipe(downstream);
        downstream.pipe(upstream);
      });
      let client: postgres.Sql | undefined;
      try {
        await new Promise<void>((done, fail) =>
          server.once('error', fail).listen(0, '127.0.0.1', done),
        );
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('TEST proxy missing');
        remote.hostname = '127.0.0.1';
        remote.port = String(address.port);
        client = postgres(remote.toString(), { max: 1, onnotice: () => {} });
        await client`select 1`;
        counting = true;
        const value = await run(client);
        return { value, bytes, queries };
      } finally {
        counting = false;
        await client?.end();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((done) => server.close(() => done()));
      }
    }
    beforeAll(async () => {
      const url = new URL(testUrl!);
      if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname))
        throw new Error('Dedicated localhost PostgreSQL required');
      admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      url.pathname = '/' + database;
      owner = postgres(url.toString(), { max: 1, onnotice: () => {} });
      // Use the database package's migration runner rather than adding an ORM dependency here.
      const load = createRequire(resolve('../database/package.json'));
      execFileSync(process.execPath, [load.resolve('tsx/cli'), 'src/migrate.ts'], {
        cwd: resolve('../database'),
        env: { ...process.env, DATABASE_MIGRATION_URL: url.toString() },
        stdio: 'pipe',
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
      mainUrl = url.toString();
      main = postgres(mainUrl, { max: 1, onnotice: () => {} });
      url.username = computeLogin;
      compute = postgres(url.toString(), { max: 1, onnotice: () => {} });
      process.env.NUMORA_GENERATOR_ENABLED = 'true';
      process.env.IRT_V3_ENABLED = 'true';
      process.env.IRT_PSEUDONYM_KEY = 'TEST-ONLY-32-byte-pseudonym-secret-v3';
      process.env.IRT_PSEUDONYM_KEY_VERSION = 'TEST-v1';
      fixture = await tryoutMeasurementFixture(owner, main, compute);
      const prepared = await prepareTryoutAnalysis(main, fixture.actor, randomUUID(), {
        contextId: fixture.contextId,
        configurationPins: fixture.pins,
      });
      irtIds.push(prepared.id);
      const [config] =
        await compute`INSERT INTO irt_compute.generator_configs(template_or_competency_id,config_version,parameters,curriculum_limits,context_id,digest,status)
      VALUES(${suffix},1,'{"questionExternalId":"TEST label"}','{}',${fixture.contextId},'TEST-config','SEALED') RETURNING id,digest`;
      const [approval] =
        await main`INSERT INTO configuration_approvals(generator_config_id,approved_digest,scope,approved_by_user_id,approved_at)
      VALUES(${config!.id},${config!.digest},${JSON.stringify({ ecosystem: 'TRYOUT', contextId: fixture.contextId })}::text::jsonb,${fixture.actor},now()) RETURNING id`;
      const [wave] =
        await main`INSERT INTO generation_waves(code,status,created_by_user_id,approved_at,constraints) VALUES(${suffix},'APPROVED',${fixture.actor},now(),'{}') RETURNING id`;
      const [item] =
        await main`INSERT INTO generation_wave_items(wave_id,original_question_version_id,context_id,generator_config_id,configuration_approval_id,target_count,max_regenerate_attempts,constraints)
      VALUES(${wave!.id},${fixture.versionId},${fixture.contextId},${config!.id},${approval!.id},1,0,'{}') RETURNING id`;
      await main.begin(async (tx) => {
        for (let i = 0; i < 23; i++) {
          if (i < 22) {
            const request = await createAnalysisRequest(tx, {
              idempotencyKey: randomUUID(),
              requestType: 'CALIBRATE_TRYOUT',
              contextId: fixture.contextId,
              snapshotId: prepared.snapshotId,
              packageId: fixture.packageId,
              configurationPins: fixture.pins,
              dueAt: new Date(Date.now() - 86400000),
            });
            irtIds.push(request.id);
            await tx`INSERT INTO analysis_request_dispatches(request_id,generation,operation_key,operation_fingerprint,actor_user_id) VALUES(${request.id},1,${randomUUID()},'TEST',${fixture.actor})`;
          }
          const generated = await createAnalysisRequest(tx, {
            idempotencyKey: randomUUID(),
            requestType: 'GENERATE_VARIANTS',
            contextId: fixture.contextId,
            waveItemId: item!.id,
            configurationPins: [{ approvalId: approval!.id, digest: config!.digest }],
          });
          generatorIds.push(generated.id);
          await tx`INSERT INTO analysis_request_dispatches(request_id,generation,operation_key,operation_fingerprint,actor_user_id) VALUES(${generated.id},1,${randomUUID()},'TEST',${fixture.actor})`;
        }
        // Unmanaged requests and other request types must stay out of these lists.
        await createAnalysisRequest(tx, {
          idempotencyKey: randomUUID(),
          requestType: 'GENERATE_VARIANTS',
          contextId: fixture.contextId,
          waveItemId: item!.id,
          configurationPins: [{ approvalId: approval!.id, digest: config!.digest }],
        });
        await createAnalysisRequest(tx, {
          idempotencyKey: randomUUID(),
          requestType: 'MONITOR_PRODUCTION',
          contextId: fixture.contextId,
          snapshotId: prepared.snapshotId,
          configurationPins: fixture.pins,
        });
      });
      for (const ids of [irtIds, generatorIds]) {
        // Put all stateful cases in the measured page despite random UUID tie ordering.
        const ordered = await main<
          { id: string }[]
        >`SELECT id FROM analysis_requests WHERE id=ANY(${ids}::uuid[]) ORDER BY created_at DESC,id DESC`;
        ids.splice(0, ids.length, ...ordered.map((row) => row.id));
        const stale = ids[0]!,
          accepted = ids[1]!,
          expired = ids[2]!,
          failed = ids[3]!;
        for (const id of [stale, accepted, expired, failed]) {
          const [request] =
            await main`SELECT snapshot_id,input_digest,request_type FROM analysis_requests WHERE id=${id}`;
          const execution = await claimComputeExecution(compute, id, fixture.principal, 3600, 1);
          if (!execution) throw new Error('TEST claim missing');
          if (id === accepted) {
            let datasetId: string | undefined;
            if (request!.snapshot_id) {
              const [dataset] =
                await compute`INSERT INTO irt_compute.analysis_datasets(execution_id,snapshot_id,selection_policy_id) VALUES(${execution.id},${request!.snapshot_id},${fixture.quality}) RETURNING id`;
              datasetId = String(dataset!.id);
              await compute`INSERT INTO irt_compute.analysis_response_selections(dataset_id,snapshot_id,snapshot_item_id,decision,reasons) SELECT ${datasetId},snapshot_id,id,'EXCLUDE','["TEST_ONLY"]' FROM irt_input_responses_v3 WHERE snapshot_id=${request!.snapshot_id}`;
              await compute`UPDATE irt_compute.analysis_datasets SET status='SEALED' WHERE id=${datasetId}`;
            }
            for (const sequenceNumber of [2, 1])
              await writeComputeArtifact(compute, {
                executionId: execution.id,
                ...(datasetId ? { datasetId } : {}),
                inputDigest: request!.input_digest,
                kind: request!.request_type,
                sequenceNumber,
                scientificDecision: 'INSUFFICIENT',
                payload: { testOnly: true, privatePayload: 'X'.repeat(4096) },
              });
            await finishComputeExecution(compute, execution.id, execution.fencingToken);
            await acceptComputeExecution(main, id, execution.id, request!.input_digest);
          } else if (id === expired) {
            await owner`UPDATE irt_compute.compute_executions SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=${execution.id}`;
          } else {
            await finishComputeExecution(
              compute,
              execution.id,
              execution.fencingToken,
              id === failed ? 'private unsafe detail' : 'TEST_FAILED',
            );
            if (id === stale) {
              await main`INSERT INTO analysis_request_dispatches(request_id,generation,operation_key,operation_fingerprint,actor_user_id) VALUES(${id},2,${randomUUID()},'TEST',${fixture.actor})`;
              await main`UPDATE analysis_requests SET status='PENDING' WHERE id=${id}`;
            }
          }
        }
        await main`UPDATE outbox_deliveries SET failure_code='private delivery detail' WHERE consumer='irt_compute' AND outbox_id IN (SELECT id FROM analytics_outbox WHERE entity_id=${failed})`;
      }
      [staleIrt, acceptedIrt, expiredIrt] = irtIds as [string, string, string];
      [staleGenerator, acceptedGenerator, expiredGenerator] = generatorIds as [
        string,
        string,
        string,
      ];
    }, 120000);
    afterAll(async () => {
      await Promise.all([main?.end(), compute?.end(), owner?.end()]);
      if (admin) {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH(FORCE)`);
        for (const login of [mainLogin, computeLogin])
          await admin.unsafe(`DROP ROLE IF EXISTS "${login}"`);
        await admin.end();
      }
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }, 60000);
    it('preserves list order, tied timestamps, offset and detail parity without private payloads', async () => {
      for (const [ids, list, detail] of [
        [irtIds, listAnalysisRequests, analysisRequestDetail],
        [generatorIds, listGenerations, generationDetail],
      ] as const) {
        const ordered = await main<
          { id: string }[]
        >`SELECT id FROM analysis_requests WHERE id=ANY(${ids}::uuid[]) ORDER BY created_at DESC,id DESC`;
        const page = await list(main, 20, 0),
          next = await list(main, 20, 20);
        expect([...page.items, ...next.items].map((row) => row.id)).toEqual(
          ordered.map((row) => row.id),
        );
        expect(page.items).toHaveLength(20);
        expect(next.items).toHaveLength(3);
        expect((await list(main, 20, 23)).items).toEqual([]);
        for (const row of [...page.items, ...next.items])
          expect(row).toEqual(await detail(main, row.id));
        expect(JSON.stringify(page)).not.toMatch(
          /privatePayload|private delivery detail|private unsafe detail|PRIVATE explanation|respondent/,
        );
      }
      await expect(analysisRequestDetail(main, randomUUID())).rejects.toMatchObject({
        code: 'IRT_REQUEST_NOT_FOUND',
        status: 404,
      });
      await expect(generationDetail(main, randomUUID())).rejects.toMatchObject({
        code: 'GENERATOR_REQUEST_NOT_FOUND',
        status: 404,
      });
      await expect(generationDetail(main, irtIds[0]!)).rejects.toMatchObject({
        code: 'GENERATOR_REQUEST_NOT_FOUND',
      });
      await expect(analysisRequestDetail(main, generatorIds[0]!)).rejects.toMatchObject({
        code: 'IRT_REQUEST_NOT_FOUND',
      });
    });
    it('retains latest dispatch versus latest execution, acceptance, artifact ordering, failure sanitization and leases', async () => {
      expect(await analysisRequestDetail(main, staleIrt)).toMatchObject({
        dispatchGeneration: 2,
        overdue: true,
        execution: { status: 'FAILED', attemptNumber: 1, failureCode: 'TEST_FAILED' },
      });
      expect(await generationDetail(main, staleGenerator)).toMatchObject({
        dispatchGeneration: 2,
        executionStatus: null,
        accepted: false,
        leaseExpired: false,
      });
      const accepted = await analysisRequestDetail(main, acceptedIrt);
      expect(accepted.acceptedExecutionId).toBe(accepted.execution!.id);
      expect(accepted.artifacts).toHaveLength(2);
      const outputs =
        await main`SELECT id FROM irt_compute.compute_outputs WHERE execution_id=${accepted.execution!.id} ORDER BY sequence_number`;
      expect(accepted.artifacts.map((a) => a.id)).toEqual(outputs.map((a) => a.id));
      expect(await generationDetail(main, acceptedGenerator)).toMatchObject({
        status: 'COMPLETED',
        accepted: true,
        executionStatus: 'SUCCEEDED',
      });
      expect(await analysisRequestDetail(main, expiredIrt)).toMatchObject({
        execution: { status: 'RUNNING', leaseExpired: true },
      });
      expect(await generationDetail(main, expiredGenerator)).toMatchObject({
        executionStatus: 'RUNNING',
        leaseExpired: true,
      });
      expect(await analysisRequestDetail(main, irtIds[3]!)).toMatchObject({
        failureCode: 'IRT_COMPUTE_FAILED',
        execution: { failureCode: 'IRT_COMPUTE_FAILED' },
      });
      expect(await generationDetail(main, generatorIds[3]!)).toMatchObject({ failureCode: null });
      const pending = await analysisRequestDetail(main, irtIds[5]!);
      expect(pending.execution).toBeNull();
      expect(pending.artifacts).toEqual([]);
      expect((await analysisRequestDetail(main, irtIds[1]!)).overdue).toBe(false);
    });
    it('bounds queries for one and twenty rows while keeping list/detail output equal', async () => {
      const report = [];
      for (const [name, list] of [
        ['IRT', listAnalysisRequests],
        ['Generator', listGenerations],
      ] as const) {
        for (const limit of [1, 20]) {
          const run = await measure<{ items: { id: string }[] }>((client) =>
            list(client, limit, 0),
          );
          expect(run.value.items).toHaveLength(limit);
          report.push({ name, limit, bytes: run.bytes, queries: run.queries });
        }
      }
      console.info(JSON.stringify({ measurement: 'irt_generator_list_reads', results: report }));
      for (const row of report) {
        expect(row.queries).toBeLessThanOrEqual(row.name === 'IRT' ? 5 : 3);
        if (row.limit === 20) expect(row.bytes).toBeLessThan(row.name === 'IRT' ? 28000 : 6500);
      }
    });
    it('checks generator enablement and non-owner main role on every operation, including empty pages', async () => {
      process.env.NUMORA_GENERATOR_ENABLED = 'false';
      try {
        await expect(listGenerations(main, 20, 0)).rejects.toMatchObject({
          code: 'GENERATOR_DISABLED',
        });
        await expect(generationDetail(main, generatorIds[0]!)).rejects.toMatchObject({
          code: 'GENERATOR_DISABLED',
        });
      } finally {
        process.env.NUMORA_GENERATOR_ENABLED = 'true';
      }
      for (const client of [owner, compute]) {
        await expect(listGenerations(client, 20, 999)).rejects.toMatchObject({
          code: 'GENERATOR_UNSAFE_MAIN_ROLE',
        });
        await expect(generationDetail(client, generatorIds[0]!)).rejects.toMatchObject({
          code: 'GENERATOR_UNSAFE_MAIN_ROLE',
        });
      }
      await expect(
        main`UPDATE irt_compute.generator_configs SET parameters='{}'`,
      ).rejects.toMatchObject({ code: '42501' });
    });
  },
);

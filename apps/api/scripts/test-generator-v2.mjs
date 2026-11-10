// TEST ONLY loopback PostgreSQL, Python service and S3 transport. No shared writes.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { ConfigService } from '@nestjs/config';
import { getDatabase, closeDatabaseConnection, claimComputeExecution } from '@tka/database';
import { pollGenerator, generatorHttp } from '@tka/irt-orchestration';
import { GeneratorService } from '../dist/modules/content/generator.service.js';
import { ContentPackagesService } from '../dist/modules/content/content-packages.service.js';
import { ContentImportService } from '../dist/modules/content/content-import.service.js';
import { GeneratorPackagesService } from '../dist/modules/content/generator-packages.service.js';
import { MediaUploadsRepository } from '../dist/modules/content/media-uploads.repository.js';
import { MediaUploadsService } from '../dist/modules/content/media-uploads.service.js';
import { R2MediaStorage } from '../dist/modules/content/r2-media.storage.js';
import { registerGeneratorStockInventory } from '../../../scripts/register-generator-stock.mjs';

for (const name of ['TEST_COMPUTE_OWNER_URL', 'DATABASE_URL', 'COMPUTE_DATABASE_URL']) {
  const u = new URL(process.env[name]);
  assert.equal(u.hostname, '127.0.0.1');
  assert(u.pathname.startsWith('/generator_test_'));
}
const fixture = JSON.parse(await readFile(process.env.GENERATOR_FIXTURE_FILE, 'utf8'));
const owner = postgres(process.env.TEST_COMPUTE_OWNER_URL, { max: 2, onnotice: () => {} });
const computeRole = postgres(process.env.COMPUTE_DATABASE_URL, { max: 2, onnotice: () => {} });
const { client } = getDatabase();
const objects = new Map();
let failUploads = false;
const s3 = createServer(async (req, res) => {
  const key = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'PUT') {
    if (failUploads) {
      res.writeHead(503);
      res.end();
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    objects.set(key, Buffer.concat(chunks));
    res.writeHead(200, { ETag: '"TEST"' });
    res.end();
  } else if (objects.has(key)) {
    const bytes = objects.get(key);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => s3.listen(0, '127.0.0.1', r));
const config = new ConfigService({
  CONTENT_IMPORT_PREVIEW_ENABLED: 'true',
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_ACCESS_KEY_ID: 'TEST',
  R2_SECRET_ACCESS_KEY: 'TEST',
  R2_BUCKET: 'test-numora',
  R2_MEDIA_PREFIX: 'question-media',
  R2_UPLOAD_TTL_SECONDS: 900,
  R2_MEDIA_UPLOADS_ENABLED: 'true',
  R2_TEST_ENDPOINT: `http://127.0.0.1:${s3.address().port}`,
});
const service = new GeneratorService(
  new MediaUploadsService(new MediaUploadsRepository(), new R2MediaStorage(config)),
);
const packages = new GeneratorPackagesService(service);
async function historyState() {
  const state = {};
  for (const table of [
    'assessment_attempts',
    'attempt_items',
    'attempt_answers',
    'xp_ledger',
    'tryout_attempt_results',
    'student_item_exposures',
  ])
    state[table] = await owner.unsafe(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`);
  return state;
}
let baseline;
const results = [];
async function notification(id) {
  const [n] =
    await client`select r.input_digest,d.generation from analysis_requests r join analysis_request_dispatches d on d.request_id=r.id where r.id=${id} order by d.generation desc limit 1`;
  return {
    contractVersion: 3,
    requestId: id,
    inputDigest: n.input_digest,
    dispatchGeneration: n.generation,
  };
}
async function compute(id) {
  let response;
  try {
    response = await generatorHttp('/api/v2/compute/execute', await notification(id));
  } catch (error) {
    const diagnostic = await fetch(
      new URL('/api/v2/compute/execute', process.env.NUMORA_GENERATOR_URL),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NUMORA_GENERATOR_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(await notification(id)),
      },
    );
    const problem = await diagnostic.json();
    console.error(
      'Local v2 rejected',
      id,
      diagnostic.status,
      problem.code ?? problem.failureCode ?? problem.status,
    );
    throw error;
  }
  assert.equal(response.serviceContract, 'generator-service-v2');
  assert.equal(response.status, 'SUCCEEDED');
  return response;
}
async function parallel(items, fn, concurrency = 6) {
  let next = 0,
    finished = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
        finished++;
        if (finished % 100 === 0) console.log(`V2 ${finished}/${items.length} completed`);
      }
    }),
  );
}
try {
  // Nonempty unrelated history makes content-integrity assertions meaningful.
  const [source] =
    await owner`SELECT v.id FROM question_versions v JOIN questions q ON q.id=(SELECT question_id FROM question_variants WHERE id=v.variant_id) WHERE q.usage_type='TRYOUT' AND v.question_type='SINGLE_CHOICE' LIMIT 1`;
  assert.ok(source, 'Selected fixture must include a Tryout PG history source');
  const [person] =
    await owner`INSERT INTO users(auth_user_id,role,display_name,email) VALUES(${randomUUID()},'STUDENT','TEST HISTORY',${randomUUID() + '@example.test'}) RETURNING id`;
  const [pack] =
    await owner`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type) VALUES(${randomUUID()},1,'TEST HISTORY','TRYOUT') RETURNING id`;
  const [placed] =
    await owner`INSERT INTO package_items(package_id,question_version_id,display_order,max_points) VALUES(${pack.id},${source.id},1,1) RETURNING id`;
  const [attempt] =
    await owner`INSERT INTO assessment_attempts(student_id,package_id,assessment_type) VALUES(${person.id},${pack.id},'TRYOUT') RETURNING id`;
  const [item] =
    await owner`INSERT INTO attempt_items(attempt_id,package_id,package_item_id,question_version_id,display_order,max_points) VALUES(${attempt.id},${pack.id},${placed.id},${source.id},1,1) RETURNING id`;
  await owner`INSERT INTO attempt_answers(attempt_item_id,answer,awarded_points,graded_at) VALUES(${item.id},'{"optionId":"A"}',1,now())`;
  await owner`UPDATE assessment_attempts SET status='GRADED',finished_at=now(),raw_points=1,score_0_100=100 WHERE id=${attempt.id}`;
  await owner`INSERT INTO xp_ledger(student_id,attempt_id,source_type,xp_amount) VALUES(${person.id},${attempt.id},'TRYOUT',10)`;
  baseline = await historyState();
  const inventory = await owner`select * from generator_stock_sets order by id`;
  if (inventory.length) {
    const manifest = {
      serviceContract: 'generator-service-v2',
      items: inventory.map((s) => ({
        familyId: s.family_id,
        parentQuestionVersionId: s.original_question_version_id,
        version: s.version,
        definition: s.definition,
      })),
    };
    const dry = await registerGeneratorStockInventory(client, manifest);
    const applied = await registerGeneratorStockInventory(client, manifest, true);
    assert.deepEqual(applied.items, dry.items);
    assert.deepEqual(await registerGeneratorStockInventory(client, manifest, true), applied);
    const conflict = structuredClone(manifest);
    conflict.items[0].definition.items[0].contentHash = 'f'.repeat(64);
    await assert.rejects(
      () => registerGeneratorStockInventory(client, conflict, true),
      /STOCK_REGISTRATION_CONFLICT/,
    );
  }
  const catalog = await service.catalog();
  assert.equal(catalog.items.length, fixture.items.length);
  const parallelKey = randomUUID();
  const first = await Promise.all(
    Array.from({ length: 3 }, () =>
      service.prepare(fixture.actor, parallelKey, catalog.items[0].id),
    ),
  );
  assert.equal(new Set(first.map((r) => r.id)).size, 1);
  const requests = [first[0]];
  for (const m of catalog.items.slice(1))
    requests.push(await service.prepare(fixture.actor, randomUUID(), m.id));
  console.log(
    `V2 registered and prepared ${requests.length} requests; computing with real Python subprocesses`,
  );
  await pollGenerator(client); // Real worker path chooses v2 using the request pin.
  await parallel(requests, async (r) => {
    await compute(r.id);
  });
  for (let i = 0; i < requests.length; i++) {
    const r = requests[i],
      preview = await service.preview(r.id);
    assert.equal(preview.scoringStatus, 'NOT_SCORED');
    assert.equal(preview.score, null);
    if (preview.media.length) {
      const before = (await owner`select count(*)::int as n from candidate_imports`)[0].n;
      failUploads = true;
      await assert.rejects(() => service.save(fixture.actor, r.id));
      failUploads = false;
      assert.equal((await owner`select count(*)::int as n from candidate_imports`)[0].n, before);
      assert(preview.media.every((m) => m.url.startsWith('data:image/png;base64,')));
    }
    const saved = await service.save(fixture.actor, r.id);
    assert.deepEqual(await service.save(fixture.actor, r.id), saved);
    const [q] =
      await owner`select q.content_status,q.validation_state,q.parent_original_question_version_id,v.kind from question_versions q join question_variants v on v.id=q.variant_id where q.id=${saved.id}`;
    assert.equal(q.kind, 'VARIANT');
    assert.equal(q.content_status, 'DRAFT');
    assert.equal(q.validation_state, 'DRAFT');
    assert(q.parent_original_question_version_id);
    results.push({
      requestId: r.id,
      candidateId: preview.id,
      versionId: saved.id,
      media: preview.media.length,
    });
    if ((i + 1) % 100 === 0) console.log(`V2 preview + DRAFT ${i + 1}/${requests.length}`);
  }
  // Stock reservations rotate atomically and reuse only after a complete cycle.
  const conceptual =
    catalog.items.find(
      (m) => fixture.items.find((i) => i.approval === m.id)?.qid === 'pg-16-4-2',
    ) ||
    catalog.items.find(
      (m) => fixture.items.find((i) => i.approval === m.id)?.qid === 'tryout-1-b1-q07',
    );
  if (conceptual) {
    const group = await Promise.all(
      Array.from({ length: 6 }, () => service.prepare(fixture.actor, randomUUID(), conceptual.id)),
    );
    const rows =
      await owner`select s.* from generator_stock_reservations s join generation_wave_items w on w.id=s.wave_item_id where w.configuration_approval_id=${conceptual.id} order by s.ordinal`;
    assert(rows.length >= 7);
    assert.equal(new Set(rows.map((r) => String(r.ordinal))).size, rows.length);
    assert(rows.some((r) => r.reused));
    for (const r of group) await compute(r.id);
    const replay = await compute(group[0].id);
    assert.deepEqual(await compute(group[0].id), replay);
    assert.equal(
      (
        await owner`select count(*)::int as n from generator_stock_reservations s join generation_wave_items w on w.id=s.wave_item_id where w.configuration_approval_id=${conceptual.id}`
      )[0].n,
      rows.length,
    );
    const failed = await service.prepare(fixture.actor, randomUUID(), conceptual.id);
    await claimComputeExecution(
      computeRole,
      failed.id,
      process.env.COMPUTE_SERVICE_PRINCIPAL_ID,
      1,
      1,
    );
    await assert.rejects(() => service.retry(fixture.actor, randomUUID(), failed.id));
    await new Promise((r) => setTimeout(r, 1100));
    const expired = await generatorHttp('/api/v2/compute/execute', await notification(failed.id));
    assert.equal(expired.status, 'EXPIRED');
    const [oldReservation] =
      await owner`select s.id from generator_stock_reservations s join analysis_requests r on r.wave_item_id=s.wave_item_id where r.id=${failed.id}`;
    await service.retry(fixture.actor, randomUUID(), failed.id);
    await compute(failed.id);
    const latestNotification = await notification(failed.id);
    await assert.rejects(() =>
      generatorHttp('/api/v2/compute/execute', { ...latestNotification, dispatchGeneration: 1 }),
    );
    const cancelled = await service.prepare(fixture.actor, randomUUID(), conceptual.id);
    await client`update analysis_requests set status='CANCELLED' where id=${cancelled.id}`;
    const events =
      await owner`select e.state from generator_stock_reservation_events e join generator_stock_reservations s on s.id=e.reservation_id join analysis_requests r on r.wave_item_id=s.wave_item_id where r.id in (${failed.id},${cancelled.id})`;
    for (const state of ['RESERVED', 'FAILED', 'SUCCEEDED', 'CANCELLED'])
      assert(events.some((e) => e.state === state));
    assert.equal(
      (await owner`select id from generator_stock_reservations where id=${oldReservation.id}`)
        .length,
      1,
    );
    await assert.rejects(
      () =>
        client`insert into generator_stock_reservation_events(reservation_id,state,reason,event_key) values(${oldReservation.id},'SUCCEEDED','forged','forged')`,
    );
  }
  // Complete representative ten-item Drill and thirty-item Tryout packages.
  const levels = new Set(
    fixture.items.filter((i) => ['16-4', '16-5'].includes(i.scope)).map((i) => i.level),
  );
  const options = (await packages.catalog()).options.filter(
    (o) => o.canGenerate && (o.assessmentType === 'TRYOUT' || levels.has(o.scopeId)),
  );
  if (process.env.GENERATOR_EXPECTED_PACKAGE_COUNT)
    assert.equal(options.length, Number(process.env.GENERATOR_EXPECTED_PACKAGE_COUNT));
  for (const option of options) {
    const group = await packages.prepare(fixture.actor, randomUUID(), {
      assessmentType: option.assessmentType,
      scopeId: option.scopeId,
      title: 'TEST ONLY v2 package',
    });
    await parallel(group.requests, (r) => compute(r.id));
    const file = await packages.export(group.id);
    assert.equal((await packages.validate(group.id, file)).report.canImportDraft, true);
    const draft = await packages.import(fixture.actor, group.id, file);
    assert.deepEqual(await packages.import(fixture.actor, group.id, file), draft);
    const [p] =
      await owner`select status,(select count(*)::int from package_items where package_id=p.id) as n from assessment_packages p where id=${draft.id}`;
    assert.equal(p.status, 'DRAFT');
    assert.equal(p.n, option.requiredCount);
  }
  if (process.env.GENERATOR_V2_BROWSER === 'true') {
    const { verifyV2Browser } = await import('./test-generator-v2-browser.mjs');
    await verifyV2Browser({
      owner,
      client,
      fixture,
      service,
      packages,
      contentPackages: new ContentPackagesService(
        new ContentImportService(config),
        new R2MediaStorage(config),
      ),
    });
  }
  // Approval revocation between compute and adoption must block a new save.
  const revoked = await service.prepare(fixture.actor, randomUUID(), catalog.items[0].id);
  await compute(revoked.id);
  await client`update configuration_approvals set revoked_at=clock_timestamp() where id=${catalog.items[0].id}`;
  await assert.rejects(() => service.save(fixture.actor, revoked.id));
  assert.deepEqual(await historyState(), baseline);
  console.log(
    JSON.stringify({
      passed: true,
      originals: results.length,
      mediaCandidates: results.filter((r) => r.media).length,
      packages: options.length,
      historyAndXpUnchanged: true,
      historyContentCompared: true,
      historicalAttempts: baseline.assessment_attempts.length,
    }),
  );
} finally {
  await closeDatabaseConnection();
  await owner.end();
  await computeRole.end();
  await new Promise((r) => s3.close(r));
}

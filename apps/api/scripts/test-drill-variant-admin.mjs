// TEST ONLY. Runs against the disposable Main DB, Python service and local media transport.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDatabase, closeDatabaseConnection, claimComputeExecution } from '@tka/database';
import { generatorHttp, pollGenerator } from '@tka/irt-orchestration';
import { GeneratorPackagesService } from '../dist/modules/content/generator-packages.service.js';
import { GeneratorPackagesController } from '../dist/modules/content/generator-packages.controller.js';
import { IdentityService } from '../dist/modules/identity/identity.service.js';
import { GeneratorService } from '../dist/modules/content/generator.service.js';
import { ContentPackagesService } from '../dist/modules/content/content-packages.service.js';
import { ContentImportService } from '../dist/modules/content/content-import.service.js';
import { MediaUploadsRepository } from '../dist/modules/content/media-uploads.repository.js';
import { MediaUploadsService } from '../dist/modules/content/media-uploads.service.js';
import { R2MediaStorage } from '../dist/modules/content/r2-media.storage.js';

for (const key of ['TEST_COMPUTE_OWNER_URL', 'DATABASE_URL', 'COMPUTE_DATABASE_URL']) {
  const url = new URL(process.env[key]);
  assert.equal(url.hostname, '127.0.0.1');
  assert(url.pathname.startsWith('/generator_test_'));
}
const { actor, drillVariant } = JSON.parse(
  await readFile(process.env.GENERATOR_FIXTURE_FILE, 'utf8'),
);
const owner = postgres(process.env.TEST_COMPUTE_OWNER_URL, { max: 3, onnotice: () => {} });
const computeRole = postgres(process.env.COMPUTE_DATABASE_URL, { max: 1, onnotice: () => {} });
const { client } = getDatabase();
const objects = new Map();
let mediaAvailable = true;
const storageServer = createServer(async (req, res) => {
  const key = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'PUT') {
    if (!mediaAvailable) {
      req.resume();
      res.writeHead(503).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    objects.set(key, Buffer.concat(chunks));
    res.writeHead(200, { ETag: '"test-only"' }).end();
  } else if (objects.has(key)) {
    const bytes = objects.get(key);
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } else res.writeHead(404).end();
});
await new Promise((resolve) => storageServer.listen(0, '127.0.0.1', resolve));
const config = new ConfigService({
  CONTENT_IMPORT_PREVIEW_ENABLED: 'true',
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_ACCESS_KEY_ID: 'TEST',
  R2_SECRET_ACCESS_KEY: 'TEST',
  R2_BUCKET: 'test-numora',
  R2_MEDIA_PREFIX: 'question-media',
  R2_UPLOAD_TTL_SECONDS: 900,
  R2_MEDIA_UPLOADS_ENABLED: 'true',
  R2_TEST_ENDPOINT: `http://127.0.0.1:${storageServer.address().port}`,
});
const storage = new R2MediaStorage(config);
const generator = new GeneratorService(
  new MediaUploadsService(new MediaUploadsRepository(), storage),
);
const packages = new GeneratorPackagesService(generator);
const content = new ContentPackagesService(new ContentImportService(config), storage);
const hasCode = (code) => (error) => error.getResponse?.().code === code;
async function snapshot() {
  return owner`SELECT p.id,p.status,p.curriculum_approval,
    jsonb_agg(jsonb_build_object('item',to_jsonb(i),'version',to_jsonb(v)) ORDER BY i.display_order) AS roster
    FROM assessment_packages p JOIN package_items i ON i.package_id=p.id
    JOIN question_versions v ON v.id=i.question_version_id WHERE p.id=${drillVariant.source} GROUP BY p.id`;
}
async function notification(id) {
  const [row] = await client`SELECT r.input_digest,d.generation FROM analysis_requests r
    JOIN analysis_request_dispatches d ON d.request_id=r.id WHERE r.id=${id} ORDER BY generation DESC LIMIT 1`;
  return {
    contractVersion: 3,
    requestId: id,
    inputDigest: row.input_digest,
    dispatchGeneration: row.generation,
  };
}
async function execute(notification) {
  try {
    return await generatorHttp('/api/v2/compute/execute', notification);
  } catch (error) {
    const response = await fetch(
      new URL('/api/v2/compute/execute', process.env.NUMORA_GENERATOR_URL),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NUMORA_GENERATOR_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notification),
      },
    );
    throw new Error(`Compute ${response.status} ${(await response.json()).code}`, { cause: error });
  }
}
try {
  const before = await snapshot();
  const catalog = await packages.drillCatalog();
  assert.deepEqual(catalog.blockers, []);
  assert.equal(catalog.runtime.runtimeProfile, 'test-only-loopback');
  const source = catalog.items.find((item) => item.id === drillVariant.source);
  assert.deepEqual(source.blockers, []);
  assert.equal(source.items.length, 10);
  assert.deepEqual(
    source.items.flatMap((item) => item.blockers),
    [],
  );
  const body = {
    assessmentType: 'DRILL',
    title: 'TEST ONLY variant',
    sourcePackageId: source.id,
    sourceDigest: source.sourceDigest,
    anchorQuestionVersionIds: drillVariant.anchors,
    focalQuestionVersionIds: source.items
      .map((item) => item.questionVersionId)
      .filter((id) => !drillVariant.anchors.includes(id)),
  };
  await assert.rejects(
    packages.prepare(actor, randomUUID(), { ...body, sourceDigest: 'e'.repeat(64) }),
    hasCode('DRILL_SOURCE_CHANGED'),
  );
  await assert.rejects(
    packages.prepare(actor, randomUUID(), {
      ...body,
      anchorQuestionVersionIds: [body.focalQuestionVersionIds[0], ...drillVariant.anchors.slice(1)],
    }),
    hasCode('DRILL_VARIANT_ROSTER_MISMATCH'),
  );
  process.env.NUMORA_DRILL_VARIANT_GENERATION_ENABLED = 'false';
  await assert.rejects(
    packages.prepare(actor, randomUUID(), body),
    hasCode('DRILL_VARIANT_GENERATION_DISABLED'),
  );
  process.env.NUMORA_DRILL_VARIANT_GENERATION_ENABLED = 'true';
  process.env.NODE_ENV = 'production';
  await assert.rejects(
    packages.prepare(actor, randomUUID(), body),
    hasCode('DRILL_VARIANT_GENERATION_DISABLED'),
  );
  process.env.NODE_ENV = 'test';

  const key = randomUUID();
  const [group, replay] = await Promise.all([
    packages.prepare(actor, key, body),
    packages.prepare(actor, key, body),
  ]);
  assert.equal(group.id, replay.id);
  assert.equal(group.expectedCount, 7);
  assert.equal(group.requests.length, 7);
  assert.equal(group.drillVariant.items.filter((item) => item.role === 'ANCHOR').length, 3);
  await assert.rejects(
    packages.prepare(actor, key, { ...body, title: 'Changed' }),
    hasCode('IDEMPOTENCY_CONFLICT'),
  );
  const requests = group.requests.map((r) => r.id);
  const pins = await owner`SELECT r.id,w.wave_id,w.constraints FROM analysis_requests r
    JOIN generation_wave_items w ON w.id=r.wave_item_id WHERE r.id=ANY(${requests}::uuid[])`;
  assert.equal(new Set(pins.map((pin) => pin.wave_id)).size, 1);
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validateManifest = ajv.compile(
    JSON.parse(
      await readFile(
        new URL(
          '../../../packages/contracts/generator-service-v2/drill-variant-manifest.schema.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  assert(
    validateManifest(pins[0].constraints.drillVariantManifest),
    JSON.stringify(validateManifest.errors),
  );
  assert(
    pins.every(
      (pin) =>
        pin.constraints.drillVariantManifest.manifestDigest === group.drillVariant.manifestDigest,
    ),
  );
  await assert.rejects(
    owner`UPDATE generation_wave_items SET constraints='{}' WHERE wave_id=${pins[0].wave_id}`,
    (error) => error.code === '23514',
  );
  await assert.rejects(
    owner`UPDATE generator_packages SET title='tampered' WHERE id=${group.id}`,
    (error) => error.code === '23514',
  );
  process.env.NUMORA_DRILL_VARIANT_GENERATION_ENABLED = 'false';
  assert.deepEqual(await pollGenerator(client), { notified: 0, failed: 0 });
  process.env.NUMORA_DRILL_VARIANT_GENERATION_ENABLED = 'true';

  const stale = await notification(requests[0]);
  await client`UPDATE outbox_deliveries SET failure_code='TEST_TRANSPORT_INTERRUPTED' WHERE outbox_id IN
    (SELECT id FROM analytics_outbox WHERE entity_id=${requests[0]})`;
  const retransmitted = await packages.retry(actor, randomUUID(), group.id);
  assert.equal(retransmitted.requests[0].dispatchGeneration, 1);
  assert.equal(retransmitted.requests[0].failureCode, null);
  const abandoned = await claimComputeExecution(
    computeRole,
    requests[0],
    process.env.COMPUTE_SERVICE_PRINCIPAL_ID,
    1,
    1,
  );
  assert(abandoned);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const retried = await packages.retry(actor, randomUUID(), group.id);
  assert.equal(retried.requests[0].dispatchGeneration, 2);
  assert.equal((await notification(requests[0])).inputDigest, stale.inputDigest);
  await assert.rejects(execute(stale), /Compute 409/);
  for (const request of requests) {
    const notice = await notification(request);
    const result = await execute(notice);
    assert.equal(result.status, 'SUCCEEDED');
    assert.deepEqual(await execute(notice), result);
  }
  assert.equal((await packages.detail(group.id)).completedCount, 7);
  const file = await packages.export(group.id);
  assert.equal(file.items.length, 7);
  assert.equal(file.anchors.length, 3);
  const order = [...file.items, ...file.anchors].sort(
    (a, b) => a.lineage.displayOrder - b.lineage.displayOrder,
  );
  assert.deepEqual(
    order.map((item) => item.lineage.parentQuestionVersionId),
    source.items.map((item) => item.questionVersionId),
  );
  assert(file.items.every((item) => /^[a-f0-9]{64}$/.test(item.lineage.artifactDigest)));
  assert(file.items.some((item) => item.question.metadata.assetManifest.length > 0));
  assert.equal((await packages.validate(group.id, file)).report.canImportDraft, true);
  await assert.rejects(
    packages.validate(group.id, { ...file, anchors: [] }),
    hasCode('GENERATOR_JSON_CHANGED'),
  );
  await assert.rejects(
    generator.save(actor, file.items[0].requestId),
    hasCode('DRILL_VARIANT_PACKAGE_IMPORT_REQUIRED'),
  );
  mediaAvailable = false;
  await assert.rejects(packages.import(actor, group.id, file));
  const [unmaterialized] = await owner`SELECT canonical_package_id,
    (SELECT count(*)::integer FROM candidate_imports) AS imports
    FROM generator_packages WHERE id=${group.id}`;
  assert.deepEqual(unmaterialized, { canonical_package_id: null, imports: 0 });
  mediaAvailable = true;
  const [result, concurrent] = await Promise.all([
    packages.import(actor, group.id, file),
    packages.import(actor, group.id, file),
  ]);
  assert.equal(result.id, concurrent.id);
  const imported = await packages.detail(group.id);
  assert.equal(imported.status, 'IMPORTED');
  assert(imported.drillVariant.items.some((item) => item.mediaReceiptIds.length > 0));
  const draft = await content.detail(result.id);
  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.items.length, 10);
  assert.equal(draft.scoringPolicyVersionId, drillVariant.scoringPolicy);
  assert.equal(draft.readiness.canPublish, false);
  const publish = { expectedRevision: draft.contentRevision, confirmed: true };
  await assert.rejects(content.publish(actor, draft.id, publish), hasCode('PACKAGE_NOT_READY'));
  for (const version of draft.items.filter((item) => !item.reviewedAt))
    await content.review(actor, version.questionVersionId, {
      packageId: draft.id,
      confirmed: true,
    });
  await assert.rejects(content.publish(actor, draft.id, publish), hasCode('PACKAGE_NOT_READY'));
  await content.approve(actor, draft.id, { ...publish, reference: 'TEST ONLY Curriculum' });
  assert.equal((await content.detail(draft.id)).readiness.canPublish, true);
  await content.publish(actor, draft.id, publish);
  const [published] = await owner`SELECT p.status,p.distribution_arm_id,a.current_revision_id,
    public.package_can_distribute(p.id) AS distributable,r.anchor_question_version_ids
    FROM assessment_packages p JOIN assessment_arms a ON a.id=p.distribution_arm_id
    JOIN assessment_arm_revisions r ON r.package_id=p.id WHERE p.id=${draft.id}`;
  assert.equal(published.status, 'PUBLISHED');
  assert.equal(published.distribution_arm_id, drillVariant.variantArm);
  assert.equal(published.current_revision_id, null);
  assert.equal(published.distributable, false);
  assert.deepEqual(
    [...published.anchor_question_version_ids].sort(),
    [...drillVariant.anchors].sort(),
  );

  const next = await packages.prepare(actor, randomUUID(), body);
  const late = await notification(next.requests[0].id);
  assert.equal((await packages.cancel(actor, next.id)).status, 'CANCELLED');
  await assert.rejects(execute(late), /Compute 409/);
  await assert.rejects(
    packages.import(actor, next.id, file),
    hasCode('GENERATOR_REQUEST_CANCELLED'),
  );
  await assert.rejects(
    packages.import(actor, group.id, { ...file, title: 'tampered' }),
    hasCode('GENERATOR_JSON_CHANGED'),
  );
  const revoked = await packages.prepare(actor, randomUUID(), body);
  const [revokedItem] = revoked.drillVariant.items.filter((item) => item.role === 'FOCAL');
  await owner`UPDATE configuration_approvals SET revoked_at=now() WHERE id=${revokedItem.mapping.approvalId}`;
  const blockedSource = (await packages.drillCatalog()).items.find((item) => item.id === source.id);
  assert(
    blockedSource.items.some((item) =>
      item.blockers.includes('DRILL_FOCAL_CONFIG_APPROVAL_REVOKED'),
    ),
  );
  await assert.rejects(
    execute(await notification(revokedItem.requestId)),
    /CONFIG_APPROVAL_MISMATCH/,
  );
  await assert.rejects(packages.export(revoked.id), hasCode('DRILL_SOURCE_CHANGED'));

  const module = await Test.createTestingModule({
    controllers: [GeneratorPackagesController],
    providers: [
      { provide: GeneratorPackagesService, useValue: packages },
      { provide: ContentPackagesService, useValue: content },
      {
        provide: IdentityService,
        useValue: {
          me: async (authorization) => {
            if (!authorization) throw new UnauthorizedException();
            return {
              id: actor,
              role: authorization === 'TEST_STUDENT' ? 'STUDENT' : 'ADMIN',
              status: 'ACTIVE',
              adminRole: authorization === 'TEST_OPS' ? 'OPERATIONS' : 'CONTENT_DATA_MODERATION',
            };
          },
        },
      },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const endpoint = `${await app.getUrl()}/admin/content/generator/packages/drill-catalog`;
    for (const [authorization, status] of [
      [null, 401],
      ['TEST_STUDENT', 403],
      ['TEST_OPS', 403],
      ['TEST_CONTENT', 200],
    ])
      assert.equal(
        (await fetch(endpoint, { headers: authorization ? { Authorization: authorization } : {} }))
          .status,
        status,
      );
  } finally {
    await app.close();
  }
  const [stock] = await owner`SELECT count(*)::integer AS n FROM generator_stock_reservations
    WHERE wave_item_id IN (SELECT wave_item_id FROM analysis_requests WHERE id=ANY(${requests}::uuid[]))`;
  assert.equal(stock.n, pins.filter((pin) => pin.constraints.stockReservationId).length);
  assert.deepEqual(await snapshot(), before);
  console.log(
    JSON.stringify({
      result: 'PASS',
      sourcePackageId: source.id,
      sourceVersion: source.packageVersion,
      contextId: source.contextId,
      contextRevision: source.contextRevision,
      samples: group.drillVariant,
      groupId: group.id,
      canonicalPackageId: draft.id,
      lineage: (await packages.detail(group.id)).drillVariant,
    }),
  );
} finally {
  await new Promise((resolve) => storageServer.close(resolve));
  await owner.end();
  await computeRole.end();
  await closeDatabaseConnection();
}

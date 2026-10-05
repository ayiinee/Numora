// Test-only process. No fixtures/endpoints from this file are registered by production main.ts.
import 'reflect-metadata';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requireIsolatedServices, releaseSha } from './release-chain-guard.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
requireIsolatedServices();
const sha = releaseSha(root);
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_MIGRATION_URL: process.env.TEST_DATABASE_URL,
  REDIS_URL: process.env.TEST_REDIS_URL,
  BULLMQ_PREFIX: `job06-${randomUUID()}`,
  SUPABASE_URL: 'http://localhost:3402',
  SUPABASE_PUBLISHABLE_KEY: 'job06-fixture-public-key',
  TEACHER_TOKEN_PEPPER: 'job06-fixture-only-pepper-not-for-deployment',
  CORS_ORIGINS: 'http://localhost:3400',
  IRT_ENABLED: 'false',
  CONTENT_IMPORT_PREVIEW_ENABLED: 'true',
  R2_MEDIA_UPLOADS_ENABLED: 'true',
  R2_ACCOUNT_ID: '0'.repeat(32),
  R2_ACCESS_KEY_ID: 'TEST_ONLY_ACCESS_KEY',
  R2_SECRET_ACCESS_KEY: 'TEST_ONLY_STORAGE_SECRET',
  R2_BUCKET: 'numora-bucket',
  R2_TEST_ENDPOINT: 'http://localhost:3402/r2',
});
const {
  getDatabase,
  closeDatabaseConnection,
  users,
  assessmentPackages,
  packageItems,
  irtBatches,
  irtItemResults,
  questions,
  questionVariants,
  questionVersions,
} = await import('@tka/database');
const { seedDemoLearning } = await import('../../../packages/database/dist/demo-learning.js');
const { db, client } = getDatabase();
await seedDemoLearning(db);

// Explicit TEST-ONLY DEMO continuation; not a Curriculum approval or shared seed mutation.
const levelTwo = '00000000-0000-4000-8000-000000000103';
const continuationId = randomUUID();
await db.insert(assessmentPackages).values({
  id: continuationId,
  familyCode: `JOB06-TEST-${continuationId}`,
  packageVersion: 1,
  name: 'JOB06 TEST ONLY DEMO Level 2',
  assessmentType: 'DRILL',
  levelId: levelTwo,
  chapterId: '00000000-0000-4000-8000-000000000100',
  variantIndex: 1,
  isDemo: true,
  scoringPolicyVersionId: '00000000-0000-4000-8000-000000000901',
  releaseAt: new Date(),
  status: 'PUBLISHED',
});
await db.insert(packageItems).values(
  Array.from({ length: 10 }, (_, i) => ({
    packageId: continuationId,
    questionVersionId: `00000000-0000-4000-8000-${String(301 + i * 2).padStart(12, '0')}`,
    displayOrder: i + 1,
    maxPoints: '1',
  })),
);

const actors = {};
for (const [alias, role] of [
  ['admin', 'ADMIN'],
  ['teacher', 'TEACHER'],
  ['foreignTeacher', 'TEACHER'],
  ['unverified', 'TEACHER'],
  ['raceTeacher', 'TEACHER'],
  ['student', 'STUDENT'],
  ['otherStudent', 'STUDENT'],
  ['raceStudent', 'STUDENT'],
  ['disabled', 'STUDENT'],
]) {
  const id = randomUUID();
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${id}@example.test`,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: `JOB06 ${alias}` },
    created_at: new Date().toISOString(),
  };
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }),
    ).toString('base64url'),
    randomUUID(),
  ].join('.');
  const [profile] = await db
    .insert(users)
    .values({
      authUserId: id,
      role,
      adminRole: role === 'ADMIN' ? 'CONTENT_DATA_MODERATION' : null,
      displayName: user.user_metadata.name,
      email: user.email,
      status: alias === 'disabled' ? 'DISABLED' : 'ACTIVE',
    })
    .returning({ id: users.id });
  actors[alias] = {
    profileId: profile.id,
    session: {
      access_token: jwt,
      refresh_token: 'fixture-only-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user,
    },
  };
}

// TEST ONLY access/release fixture: two PG items, not an approved 35-item package or IRT model.
// Archive only prior fixtures created by this guarded harness so reruns cannot select stale packages.
await client`update assessment_packages set status = 'ARCHIVED'
  where family_code like 'JOB06-TRYOUT-TEST-%' and is_demo = true and status = 'PUBLISHED'`;
const tryoutId = randomUUID();
const local = new Date(Date.now() + 7 * 3600_000);
local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
local.setUTCHours(0, 0, 0, 0);
await db.insert(assessmentPackages).values({
  id: tryoutId,
  familyCode: `JOB06-TRYOUT-TEST-${tryoutId}`,
  packageVersion: 1,
  name: 'JOB06 TEST ONLY DEMO TryOut',
  assessmentType: 'TRYOUT',
  isDemo: true,
  chapterId: '00000000-0000-4000-8000-000000000100',
  scoringPolicyVersionId: '00000000-0000-4000-8000-000000000901',
  releaseAt: new Date(local.getTime() - 7 * 3600_000),
  closeAt: new Date(Date.now() + 24 * 3600_000),
  durationSeconds: 3600,
  status: 'DRAFT',
});
// Dedicated READY test versions; do not mutate the existing DRAFT demo versions or historical pins.
const tryoutVersions = [];
for (let i = 0; i < 2; i++) {
  const questionId = randomUUID();
  const variantId = randomUUID();
  const versionId = randomUUID();
  await db.insert(questions).values({
    id: questionId,
    primaryCompetencyId: '00000000-0000-4000-8000-000000000104',
    sourceRef: `JOB06-TRYOUT-TEST-${versionId}`,
    status: 'READY',
  });
  await db.insert(questionVariants).values({
    id: variantId,
    questionId,
    variantCode: `JOB06-TRYOUT-TEST-${versionId}`,
    kind: 'ORIGINAL',
    origin: 'DEMO',
  });
  await db.insert(questionVersions).values({
    id: versionId,
    variantId,
    versionNumber: 1,
    questionType: 'SINGLE_CHOICE',
    stem: { text: `TEST ONLY: ${i + 2} + 3 = ?` },
    optionsOrStatements: [i + 4, i + 5, i + 6, i + 7].map((n, index) => ({
      id: 'ABCD'[index],
      content: { text: String(n) },
    })),
    answerKey: { optionId: 'B' },
    explanation: { text: `TEST ONLY: ${i + 2} + 3 = ${i + 5}.` },
    difficulty: 'EASY',
    contentStatus: 'READY',
    reviewedByUserId: actors.admin.profileId,
    reviewedAt: new Date(),
  });
  tryoutVersions.push(versionId);
}
await db.insert(packageItems).values(
  tryoutVersions.map((questionVersionId, i) => ({
    packageId: tryoutId,
    questionVersionId,
    displayOrder: i + 1,
    maxPoints: '1',
  })),
);

const testStorage = new Map();
const authServer = createServer(async (req, res) => {
  // SDK auth boundary only. Every product request uses real Nest services/guards/transactions.
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3400');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization,apikey,content-type,x-client-info,x-supabase-api-version',
  );
  res.setHeader('Content-Type', 'application/json');
  const send = (status, value) => {
    res.writeHead(status);
    res.end(JSON.stringify(value));
  };
  if (req.method === 'OPTIONS') return send(200, {});
  // TEST ONLY S3 transport: real SDK presigning, bounded verification and final publish run in API.
  if (req.url?.startsWith('/r2/')) {
    const key = decodeURIComponent(req.url.split('?')[0]);
    if (req.method === 'PUT') {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 5242880) return send(413, {});
        chunks.push(chunk);
      }
      testStorage.set(key, {
        bytes: Buffer.concat(chunks),
        contentType: req.headers['content-type'],
      });
      res.writeHead(200);
      return res.end();
    }
    const object = testStorage.get(key);
    if (!object) {
      res.writeHead(404, { 'Content-Type': 'application/xml' });
      return res.end('<Error><Code>NoSuchKey</Code></Error>');
    }
    res.writeHead(200, {
      'Content-Type': object.contentType,
      'Content-Length': object.bytes.length,
    });
    return res.end(object.bytes);
  }
  if (req.url === '/auth/v1/user') {
    const actor = Object.values(actors).find(
      (a) => `Bearer ${a.session.access_token}` === req.headers.authorization,
    );
    return actor ? send(200, actor.session.user) : send(401, { message: 'Invalid fixture token' });
  }
  if (req.url?.startsWith('/auth/v1/logout')) return send(200, {});
  if (req.url === '/fixtures' && req.method === 'GET') return send(200, { sha, actors });
  if (req.url === '/expire-token' && req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      const { id } = JSON.parse(Buffer.concat(chunks).toString());
      const changed = await client`update teacher_verification_tokens
        set created_at = now() - interval '73 hours', expires_at = now() - interval '1 hour'
        where id = ${id} and created_by_user_id = ${actors.admin.profileId} and used_at is null and revoked_at is null returning id`;
      return send(changed.length === 1 ? 200 : 400, { changed: changed.length });
    } catch {
      return send(400, { message: 'Invalid test fixture request' });
    }
  }
  if (req.url === '/tryout-fixture' && req.method === 'GET')
    return send(200, { packageId: tryoutId, content: 'TEST_ONLY_DEMO' });
  if (req.url === '/tryout-fixture/publish' && req.method === 'POST') {
    await client`update assessment_packages set status = 'PUBLISHED' where id = ${tryoutId}`;
    return send(200, { published: true });
  }
  if (req.url === '/tryout-fixture/release' && req.method === 'POST') {
    // Synthetic Data boundary only: no model execution or approved low-response policy is claimed.
    const [batch] = await db
      .insert(irtBatches)
      .values({
        packageId: tryoutId,
        batchKind: 'TEST_ONLY',
        modelVersion: 'TEST_ONLY_SYNTHETIC_RELEASE',
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        resultReleasedAt: new Date(),
        inputSnapshot: { fixture: true },
      })
      .returning();
    await db.insert(irtItemResults).values(
      tryoutVersions.map((questionVersionId) => ({
        batchId: batch.id,
        questionVersionId,
        sampleSize: 30,
        dataStatus: 'SUFFICIENT',
      })),
    );
    return send(200, { released: true, source: 'TEST_ONLY_SYNTHETIC_RELEASE' });
  }
  if (req.url === '/tryout-fixture/persistence' && req.method === 'GET') {
    const attempts =
      await client`select id, student_id, class_id_at_start, scoring_policy_version_id, score_0_100, tryout_xp_policy_version
      from assessment_attempts where package_id = ${tryoutId}`;
    const events = await client`select o.entity_id, o.event_name from analytics_outbox o
      join assessment_attempts a on a.id = o.entity_id where a.package_id = ${tryoutId}
      and o.event_name in ('tryout_started', 'tryout_completed')`;
    const pins = await client`select ai.attempt_id, ai.question_version_id from attempt_items ai
      join assessment_attempts a on a.id = ai.attempt_id where a.package_id = ${tryoutId}`;
    const rewards = await client`select x.attempt_id, x.xp_amount, x.policy_code, x.policy_version
      from xp_ledger x join assessment_attempts a on a.id=x.attempt_id where a.package_id=${tryoutId}`;
    return send(200, { attempts, events, pins, rewards });
  }
  if (req.url === '/persistence') {
    const attempts =
      await client`select id, package_id, class_id_at_start, scoring_policy_version_id, score_0_100, drill_policy_version, stars
      from assessment_attempts where student_id = ${actors.student.profileId} order by started_at, id`;
    const events = await client`select entity_id, event_name from analytics_outbox
      where actor_user_id = ${actors.student.profileId} and event_name = 'drill_completed'`;
    const pins = await client`select ai.attempt_id, ai.question_version_id from attempt_items ai
      join assessment_attempts a on a.id = ai.attempt_id where a.student_id = ${actors.student.profileId}`;
    const rewards = await client`select attempt_id, xp_amount, base_xp, bonus_xp, duration_seconds, policy_version
      from xp_ledger where student_id = ${actors.student.profileId} order by occurred_at, attempt_id`;
    return send(200, { attempts, events, pins, rewards });
  }
  send(404, { message: 'Unknown fixture request' });
});
await new Promise((resolve) => authServer.listen(3402, 'localhost', resolve));
const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../dist/app.module.js');
const { configureApplication } = await import('../dist/bootstrap.js');
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
configureApplication(app);
await app.listen(3401, 'localhost');
console.log(`JOB-06 connected fixture API ready at release ${sha}`);
async function shutdown() {
  await app.close();
  authServer.closeAllConnections();
  await new Promise((resolve) => authServer.close(resolve));
  await closeDatabaseConnection();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

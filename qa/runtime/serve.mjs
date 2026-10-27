// Test-only harness. Production entrypoints never import this file.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { requireFrom, testEnvironment } from '../../scripts/qa/process.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { environment, problems } = testEnvironment(root);
if (
  problems.length ||
  !/^\/numora_test_qa_[a-f0-9]{32}$/.test(new URL(environment.TEST_DATABASE_URL).pathname)
)
  throw new Error('QA_OWNED_DATABASE_REQUIRED');
if (
  !/^[a-f0-9-]{36}$/.test(process.env.QA_RUN_ID || '') ||
  new URL(environment.TEST_DATABASE_URL).pathname !==
    '/numora_test_qa_' + process.env.QA_RUN_ID.replaceAll('-', '')
)
  throw new Error('QA_RUN_ID_DATABASE_MISMATCH');
const require = requireFrom(root, 'apps/api');
require('reflect-metadata');
Object.assign(process.env, environment, {
  NODE_ENV: 'test',
  DATABASE_URL: environment.TEST_DATABASE_URL,
  REDIS_URL: environment.TEST_REDIS_URL,
  ALLOW_SYNTHETIC_CONTENT: 'true',
  SUPABASE_URL: 'http://localhost:3502',
  SUPABASE_PUBLISHABLE_KEY: 'qa-local-fixture-public-key',
  TEACHER_TOKEN_PEPPER: 'qa-local-fixture-only-pepper',
  CORS_ORIGINS: 'http://localhost:3500',
  IRT_ENABLED: 'false',
});
const { getDatabase, closeDatabaseConnection } = await import(
  pathToFileURL(require.resolve('@tka/database')).href
);
const { seedDemoLearning } = await import(
  pathToFileURL(resolve(root, 'packages/database/dist/demo-learning.js')).href
);
const { db, client } = getDatabase();
await seedDemoLearning(db);
const ids = {
  chapter: '00000000-0000-4000-8000-000000000100',
  subchapter: '00000000-0000-4000-8000-000000000101',
  levelOne: '00000000-0000-4000-8000-000000000102',
  levelTwo: '00000000-0000-4000-8000-000000000103',
};
const actors = {};
async function actor(alias, role = 'STUDENT') {
  const authId = randomUUID();
  const [profile] = await client.unsafe(
    'insert into users(auth_user_id,role,display_name,email,status,admin_role) values($1,$2,$3,$4,$5,$6) returning id',
    [
      authId,
      role,
      'TEST ONLY QA',
      authId + '@example.test',
      'ACTIVE',
      role === 'ADMIN' ? 'SUPER_ADMIN' : null,
    ],
  );
  const user = {
    id: authId,
    aud: 'authenticated',
    role: 'authenticated',
    email: authId + '@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: 'TEST ONLY QA' },
    created_at: new Date().toISOString(),
  };
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: authId,
        exp: Math.floor(Date.now() / 1000) + 7200,
        role: 'authenticated',
      }),
    ).toString('base64url'),
    randomUUID(),
  ].join('.');
  actors[alias] = {
    profileId: profile.id,
    session: {
      access_token: jwt,
      refresh_token: 'qa-fixture-refresh',
      token_type: 'bearer',
      expires_in: 7200,
      expires_at: Math.floor(Date.now() / 1000) + 7200,
      user,
    },
  };
  return actors[alias];
}
for (const [name, role] of [
  ['student', 'STUDENT'],
  ['otherStudent', 'STUDENT'],
  ['teacher', 'TEACHER'],
  ['admin', 'ADMIN'],
])
  await actor(name, role);
const [policy] = await client.unsafe(
  "select id from scoring_policy_versions where policy_code='DRILL_PRD_V06' and version=1 and status='PUBLISHED'",
);
if (!policy) throw new Error('DRILL_POLICY_FIXTURE_MISSING');
const versions = [];
for (let i = 0; i < 10; i++) {
  const sourceId = '00000000-0000-4000-8000-' + String(301 + i * 2).padStart(12, '0');
  const [source] = await client.unsafe('select * from question_versions where id=$1', [sourceId]);
  if (!source) throw new Error('DEMO_QUESTION_FIXTURE_MISSING');
  const [latest] = await client.unsafe(
    'select max(version_number)::integer as n from question_versions where variant_id=$1',
    [source.variant_id],
  );
  const id = randomUUID();
  await client.unsafe(
    'insert into question_versions(id,variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,difficulty,content_status,reviewed_by_user_id,reviewed_at) values($1,$2,$3,$4,$5::text::jsonb,$6::text::jsonb,$7::text::jsonb,$8::text::jsonb,$9,$10,$11,now())',
    [
      id,
      source.variant_id,
      latest.n + 1,
      source.question_type,
      JSON.stringify(source.stem),
      JSON.stringify(source.options_or_statements),
      JSON.stringify(source.answer_key),
      JSON.stringify(source.explanation),
      source.difficulty,
      'READY',
      actors.admin.profileId,
    ],
  );
  versions.push(id);
}
await client.unsafe(
  "update assessment_packages set status='ARCHIVED' where level_id=any($1::uuid[]) and status='PUBLISHED'",
  [[ids.levelOne, ids.levelTwo]],
);
for (const level of [ids.levelOne, ids.levelTwo]) {
  const id = randomUUID();
  await client.unsafe(
    "insert into assessment_packages(id,family_code,package_version,name,assessment_type,chapter_id,level_id,variant_index,is_demo,scoring_policy_version_id,release_at,status) values($1,$2,1,$3,'DRILL',$4,$5,1,true,$6,now(),'PUBLISHED')",
    [id, 'QA-' + id, 'TEST ONLY QA Drill', ids.chapter, level, policy.id],
  );
  for (let i = 0; i < versions.length; i++)
    await client.unsafe(
      'insert into package_items(package_id,question_version_id,display_order,max_points) values($1,$2,$3,1)',
      [id, versions[i], i + 1],
    );
}
const authServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3500');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization,apikey,content-type,x-client-info,x-supabase-api-version',
  );
  res.setHeader('Content-Type', 'application/json');
  const send = (status, data) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  };
  try {
    if (req.method === 'OPTIONS') return send(200, {});
    if (req.url === '/auth/v1/user') {
      const found = Object.values(actors).find(
        (a) => 'Bearer ' + a.session.access_token === req.headers.authorization,
      );
      return send(found ? 200 : 401, found?.session.user || { message: 'Invalid fixture session' });
    }
    if (req.url?.startsWith('/auth/v1/logout')) return send(200, {});
    if (req.url === '/fixtures')
      return send(200, {
        runId: process.env.QA_RUN_ID,
        actors,
        ids,
        content: 'TEST_ONLY_PG',
        auth: 'EMAIL_FIXTURE_NOT_GOOGLE',
      });
    if (req.url === '/actors' && req.method === 'POST')
      return send(201, await actor('actor-' + randomUUID()));
    if (req.url === '/persistence') {
      const attempts = await client.unsafe(
        'select id,student_id,score_0_100,status,drill_policy_version from assessment_attempts',
      );
      const rewards = await client.unsafe(
        'select attempt_id,xp_amount,base_xp,bonus_xp,duration_seconds,policy_version from xp_ledger',
      );
      const events = await client.unsafe(
        "select entity_id,event_name from analytics_outbox where event_name='drill_completed'",
      );
      const pins = await client.unsafe('select attempt_id,question_version_id from attempt_items');
      return send(200, { attempts, rewards, events, pins });
    }
    return send(404, { message: 'Unknown QA fixture request' });
  } catch {
    return send(500, { message: 'QA fixture request failed' });
  }
});
await new Promise((ready, reject) => {
  authServer.once('error', reject);
  authServer.listen(3502, '127.0.0.1', ready);
});
const { NestFactory } = require('@nestjs/core');
const { AppModule } = await import(
  pathToFileURL(resolve(root, 'apps/api/dist/app.module.js')).href
);
const { configureApplication } = await import(
  pathToFileURL(resolve(root, 'apps/api/dist/bootstrap.js')).href
);
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
configureApplication(app);
await app.listen(3501, '127.0.0.1');
console.log('QA connected harness ready. Synthetic auth only; product API and database are real.');
async function shutdown() {
  await app.close();
  authServer.closeAllConnections();
  authServer.close();
  await closeDatabaseConnection();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

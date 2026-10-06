// Isolated test harness only. Production main.ts never imports this file.
import 'reflect-metadata';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const database = new URL(process.env.TEST_DATABASE_URL ?? '');
const redis = new URL(process.env.TEST_REDIS_URL ?? '');
if (
  !['localhost', '127.0.0.1'].includes(database.hostname) ||
  database.pathname !== '/numora_test_job16_e2e' ||
  !['localhost', '127.0.0.1'].includes(redis.hostname) ||
  redis.protocol !== 'redis:'
)
  throw new Error('JOB-16 E2E requires isolated localhost numora_test_job16_e2e and Redis.');
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  REDIS_URL: process.env.TEST_REDIS_URL,
  BULLMQ_PREFIX: `job16-${randomUUID()}`,
  PVP_MODE: 'demo',
  ALLOW_DEMO_SEED: 'true',
  ALLOW_SYNTHETIC_CONTENT: 'true',
  SUPABASE_URL: 'http://localhost:3452',
  SUPABASE_PUBLISHABLE_KEY: 'job16-test-only-public-key',
  TEACHER_TOKEN_PEPPER: 'job16-isolated-test-only-pepper',
  CORS_ORIGINS: 'http://localhost:3450',
  IRT_ENABLED: 'false',
  R2_MEDIA_UPLOADS_ENABLED: 'false',
});
const { getDatabase, closeDatabaseConnection, users, schools, classes, classMemberships } =
  await import('@tka/database');
const { seedPvpTestScenarios } = await import('@tka/database/testing');
const { seedDemoLearning } = await import('../../../packages/database/dist/demo-learning.js');
const { projectClassLeaderboard } = await import('../../worker/dist/class-leaderboard.js');
const { db, client } = getDatabase();
await seedPvpTestScenarios();
await seedDemoLearning(db);
const actors = {};
for (const alias of ['mandiri', 'school']) {
  const id = randomUUID();
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${id}@example.test`,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: `JOB16 ${alias}` },
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
      role: 'STUDENT',
      email: user.email,
      displayName: user.user_metadata.name,
    })
    .returning();
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
const [school] = await db
  .insert(schools)
  .values({ code: randomUUID(), name: 'JOB16 isolated school' })
  .returning();
const [cls] = await db
  .insert(classes)
  .values({ schoolId: school.id, name: 'JOB16 IX', joinCode: randomUUID().slice(0, 12) })
  .returning();
await db
  .insert(classMemberships)
  .values({ classId: cls.id, studentUserId: actors.school.profileId });
const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  encoding: 'utf8',
}).trim();
const authServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3450');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info');
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(200, {});
  if (req.url === '/fixtures')
    return send(200, { sha, actors, classId: cls.id, authMode: 'ISOLATED_TEST_FIXTURE' });
  if (req.url === '/auth/v1/user') {
    const actor = Object.values(actors).find(
      (a) => req.headers.authorization === `Bearer ${a.session.access_token}`,
    );
    return actor ? send(200, actor.session.user) : send(401, { message: 'Invalid test session' });
  }
  if (req.url === '/project' && req.method === 'POST')
    return send(200, await projectClassLeaderboard());
  if (req.url === '/persistence') {
    const matches =
      await client`select m.id,m.data_mode,m.status,m.end_reason,m.record_eligible,count(q.id)::int as questions
      from pvp_matches m join pvp_match_questions q on q.match_id=m.id where m.creator_student_id=${actors.mandiri.profileId} group by m.id`;
    const rewards =
      await client`select xp_amount from xp_ledger where student_id=${actors.school.profileId}`;
    return send(200, { matches, rewards });
  }
  return send(404, { message: 'Unknown test fixture route' });
});
await new Promise((resolve) => authServer.listen(3452, 'localhost', resolve));
const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../dist/app.module.js');
const { configureApplication } = await import('../dist/bootstrap.js');
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
configureApplication(app);
await app.listen(3451, 'localhost');
async function shutdown() {
  await app.close();
  authServer.closeAllConnections();
  await new Promise((resolve) => authServer.close(resolve));
  await closeDatabaseConnection();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

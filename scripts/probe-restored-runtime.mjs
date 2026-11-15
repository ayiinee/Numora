// Test-only child of the mapped-restore fixture. Never invoked by API/worker startup.
import assert from 'node:assert/strict';
import { createServer as httpServer } from 'node:http';
import { createServer as tlsServer } from 'node:tls';
import { connect } from 'node:net';
import { readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const apiUrl = new URL(process.env.RESTORED_API_URL ?? '');
  const workerUrl = new URL(process.env.RESTORED_WORKER_URL ?? '');
  const redis = new URL(process.env.TEST_REDIS_URL ?? '');
  const userId = process.env.RESTORED_TEST_USER_ID;
  const authId = process.env.RESTORED_TEST_AUTH_ID;
  assert.equal(process.env.NODE_ENV, 'test');
  assert.match(userId ?? '', /^[a-f0-9-]{36}$/);
  assert.match(authId ?? '', /^[a-f0-9-]{36}$/);
  for (const [url, login] of [
    [apiUrl, 'numora_api'],
    [workerUrl, 'numora_worker'],
  ]) {
    assert.equal(url.hostname, 'localhost');
    assert.match(url.pathname, /^\/numora_test_vps_restore_[a-f0-9]{32}$/);
    assert.equal(url.protocol, 'postgres:');
    assert.equal(url.username, login);
    assert.equal(url.search, '?sslmode=verify-full');
    assert.ok(url.password);
  }
  assert.equal(workerUrl.host, apiUrl.host);
  assert.equal(workerUrl.pathname, apiUrl.pathname);
  assert.ok(['localhost', '127.0.0.1'].includes(redis.hostname));
  assert.equal(redis.protocol, 'redis:');
  assert.ok(!redis.search && !redis.hash);
  // ConfigModule's test fallback must not load a developer/cloud env in this fixture.
  for (const path of ['.env', '.env.local', 'apps/api/.env', 'apps/api/.env.local']) {
    assert.equal(
      await access(join(root, path)).then(
        () => true,
        () => false,
      ),
      false,
    );
  }

  const apiRequire = createRequire(join(root, 'apps/api/package.json'));
  const workerRequire = createRequire(join(root, 'apps/worker/package.json'));
  apiRequire('reflect-metadata');
  const database = apiRequire('@tka/database');
  const { Queue } = workerRequire('bullmq');
  const { Redis } = workerRequire('ioredis');
  const suffix = randomUUID();
  const prefix = 'numora:prod:restored-test:' + suffix;
  const token = 'RESTORE_TEST_' + suffix;
  const sockets = new Set();
  const tlsDirectory = dirname(process.env.TEST_DATABASE_TLS_CA_FILE ?? '');
  const bridge = tlsServer(
    {
      key: await readFile(join(tlsDirectory, 'server.key')),
      cert: await readFile(join(tlsDirectory, 'server.crt')),
    },
    (socket) => {
      const upstream = connect(Number(redis.port || 6379), '127.0.0.1');
      for (const connection of [socket, upstream]) {
        sockets.add(connection);
        connection.on('close', () => sockets.delete(connection));
        connection.on('error', () => {
          socket.destroy();
          upstream.destroy();
        });
      }
      socket.pipe(upstream).pipe(socket);
      socket.on('close', () => upstream.destroy());
      upstream.on('close', () => socket.destroy());
    },
  );
  const auth = httpServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user' && req.headers.authorization === 'Bearer ' + token) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          id: authId,
          email: 'restore@example.test',
          role: 'authenticated',
          app_metadata: { provider: 'google' },
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        }),
      );
    } else {
      res.writeHead(401);
      res.end(JSON.stringify({ message: 'Invalid fixture token' }));
    }
  });
  const listen = (server) =>
    new Promise((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', done));
  let app, runningWorker, queue, redisClient;
  let exitCode;
  let stage = 'fixture-transport';
  const errors = [];
  const originalError = console.error;
  const originalLog = console.log;
  // Raw Nest/provider/queue diagnostics stay inside this child; only fixed outcomes leave it.
  console.error = (...parts) => {
    errors.push(parts);
  };
  console.log = () => {};
  const deadline = setTimeout(() => process.exit(1), 45000);
  try {
    await listen(bridge);
    await listen(auth);
    const redisTls = new URL(redis);
    redisTls.protocol = 'rediss:';
    redisTls.hostname = 'localhost';
    redisTls.port = String(bridge.address().port);
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: apiUrl.toString(),
      DATABASE_MIGRATION_URL: '',
      DB_POOL_MAX: '2',
      NUMORA_DEPLOYMENT_PROFILE: '',
      ALLOW_SYNTHETIC_CONTENT: 'false',
      REDIS_URL: redisTls.toString(),
      BULLMQ_PREFIX: prefix,
      SUPABASE_URL: 'http://127.0.0.1:' + auth.address().port,
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST_ONLY',
      TEACHER_TOKEN_PEPPER: 'TEST_ONLY_RESTORE_PEPPER',
      CORS_ORIGINS: 'http://localhost:3000',
      PVP_MODE: 'disabled',
      PVP_CONTENT_MODE: 'strict',
      IRT_ENABLED: 'false',
      IRT_V3_ENABLED: 'false',
      NUMORA_GENERATOR_ENABLED: 'false',
      NUMORA_OBSERVABILITY_ENABLED: 'false',
      CONTENT_IMPORT_PREVIEW_ENABLED: 'false',
    });
    const target = (login) => ({
      profile: 'production-vps',
      host: 'localhost',
      port: Number(apiUrl.port || 5432),
      database: apiUrl.pathname.slice(1),
      login,
      databaseRole: login,
    });
    stage = 'api-preflight';
    await database.verifyProductionDatabase(database.getDatabase().client, target('numora_api'));
    const { NestFactory } = apiRequire('@nestjs/core');
    stage = 'api-startup';
    const { AppModule } = apiRequire(join(root, 'apps/api/dist/app.module.js'));
    const { configureApplication } = apiRequire(join(root, 'apps/api/dist/bootstrap.js'));
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    stage = 'api-http';
    const request = (path, options) =>
      fetch(origin + '/api/v1' + path, { ...options, signal: AbortSignal.timeout(5000) });
    assert.equal((await request('/health')).status, 200);
    assert.equal((await request('/health/database')).status, 200);
    assert.equal((await request('/identity/me')).status, 401);
    assert.equal(
      (await request('/identity/me', { headers: { authorization: 'Bearer invalid' } })).status,
      401,
    );
    const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
    const profile = await request('/identity/me', { headers });
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).id, userId);
    assert.equal((await request('/admin/dashboard', { headers })).status, 403);
    const renamed = await request('/identity/me', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ displayName: 'RESTORE RUNTIME TEST' }),
    });
    assert.equal(renamed.status, 200);
    assert.equal((await renamed.json()).displayName, 'RESTORE RUNTIME TEST');
    await app.close();
    app = undefined;

    stage = 'transaction-outbox';
    const client = database.getDatabase().client;
    const rollbackEvent = randomUUID();
    await assert.rejects(
      client.begin(async (tx) => {
        await tx`UPDATE public.users SET display_name='MUST ROLLBACK' WHERE id=${userId}`;
        await tx`INSERT INTO public.analytics_outbox(id,event_name,actor_user_id,entity_type) VALUES(${rollbackEvent},'RESTORE_TEST',${userId},'TEST_ONLY')`;
        throw Error('TEST_ONLY_ROLLBACK');
      }),
      /TEST_ONLY_ROLLBACK/,
    );
    assert.equal(
      (await client`SELECT display_name FROM public.users WHERE id=${userId}`)[0].display_name,
      'RESTORE RUNTIME TEST',
    );
    assert.equal(
      (await client`SELECT id FROM public.analytics_outbox WHERE id=${rollbackEvent}`).length,
      0,
    );
    const eventId = randomUUID();
    await client.begin(async (tx) => {
      await tx`UPDATE public.users SET display_name='RESTORE COMMITTED TEST' WHERE id=${userId}`;
      await tx`INSERT INTO public.analytics_outbox(id,event_name,actor_user_id,entity_type) VALUES(${eventId},'RESTORE_TEST',${userId},'TEST_ONLY')`;
    });
    await database.closeDatabaseConnection();
    process.env.DATABASE_URL = workerUrl.toString();
    stage = 'worker-preflight';
    await database.verifyProductionDatabase(database.getDatabase().client, target('numora_worker'));
    const { runWorker } = workerRequire(join(root, 'apps/worker/dist/worker-runtime.js'));
    stage = 'worker-startup-outbox';
    runningWorker = await runWorker((code) => {
      exitCode = code;
    });
    assert.ok(runningWorker);
    assert.equal(exitCode, undefined);
    const workerClient = database.getDatabase().client;
    assert.equal(
      (
        await workerClient`SELECT count(*)::int AS count FROM public.analytics_events WHERE event_id=${eventId}`
      )[0].count,
      1,
    );
    assert.ok(
      (await workerClient`SELECT processed_at FROM public.analytics_outbox WHERE id=${eventId}`)[0]
        .processed_at,
    );
    const { drainOutboxBatch } = workerRequire(join(root, 'apps/worker/dist/outbox.js'));
    // Simulate at-least-once redelivery without deleting the durable consumer record.
    await workerClient`UPDATE public.analytics_outbox SET processed_at=NULL WHERE id=${eventId}`;
    await drainOutboxBatch();
    assert.equal(
      (
        await workerClient`SELECT count(*)::int AS count FROM public.analytics_events WHERE event_id=${eventId}`
      )[0].count,
      1,
    );
    redisClient = new Redis(redisTls.toString(), { maxRetriesPerRequest: 1 });
    stage = 'worker-queue';
    redisClient.on('error', () => {});
    queue = new Queue('bootstrap', { connection: redisClient, prefix });
    const job = await queue.add('restored-test', {});
    const until = Date.now() + 5000;
    while ((await job.getState()) !== 'completed' && Date.now() < until)
      await new Promise((done) => setTimeout(done, 50));
    assert.equal(await job.getState(), 'completed');
    await runningWorker.stop();
    stage = 'worker-shutdown';
    runningWorker = undefined;
    assert.equal(exitCode, 0);
    assert.equal(errors.length, 0);
    originalLog('Restored API and worker rehearsal passed.');
  } catch (error) {
    const reason = /^[A-Z0-9]{5}$/.test(error?.code ?? '')
      ? error.code
      : error?.name === 'AssertionError'
        ? 'assertion'
        : 'dependency';
    originalError(
      `Restored API and worker rehearsal failed at ${stage} (${reason}); no runtime acceptance recorded.`,
    );
    process.exitCode = 1;
  } finally {
    await app?.close();
    await runningWorker?.stop();
    await queue?.obliterate({ force: true });
    await queue?.close();
    redisClient?.disconnect();
    await database.closeDatabaseConnection();
    for (const socket of sockets) socket.destroy();
    await Promise.all([auth, bridge].map((server) => new Promise((done) => server.close(done))));
    clearTimeout(deadline);
    console.error = originalError;
    console.log = originalLog;
  }
}
void main().catch(() => {
  console.error(
    'Restored runtime fixture setup or cleanup failed; no runtime acceptance recorded.',
  );
  process.exitCode = 1;
});

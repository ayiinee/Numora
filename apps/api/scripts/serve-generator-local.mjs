// Interactive TEST ONLY demo. Real IdentityService/ContentAdminGuard, Nest endpoints, SQL roles,
// worker HTTP transport and Python subprocess. Auth issuer alone is synthetic.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { Test } from '@nestjs/testing';
import { getDatabase, closeDatabaseConnection } from '@tka/database';
import { pollGenerator } from '@tka/irt-orchestration';
import { IdentityModule } from '../dist/modules/identity/identity.module.js';
import { GeneratorController } from '../dist/modules/content/generator.controller.js';
import { GeneratorService } from '../dist/modules/content/generator.service.js';
import { GeneratorPackagesController } from '../dist/modules/content/generator-packages.controller.js';
import { GeneratorPackagesService } from '../dist/modules/content/generator-packages.service.js';
import { ConfigModule } from '@nestjs/config';
import { ContentImportService } from '../dist/modules/content/content-import.service.js';
import { ContentPackagesService } from '../dist/modules/content/content-packages.service.js';
import { R2MediaStorage } from '../dist/modules/content/r2-media.storage.js';
import { configureApplication } from '../dist/bootstrap.js';
const fixture = JSON.parse(await readFile(process.env.GENERATOR_FIXTURE_FILE, 'utf8'));
for (const name of ['TEST_COMPUTE_OWNER_URL', 'DATABASE_URL', 'COMPUTE_DATABASE_URL']) {
  const u = new URL(process.env[name]);
  assert(
    ['127.0.0.1', 'localhost'].includes(u.hostname) && u.pathname.startsWith('/generator_test_'),
  );
}
const owner = postgres(process.env.TEST_COMPUTE_OWNER_URL, { max: 2, onnotice: () => {} });
const compute = postgres(process.env.COMPUTE_DATABASE_URL, { max: 2, onnotice: () => {} });
const { client } = getDatabase();
process.env.CONTENT_IMPORT_PREVIEW_ENABLED = 'true';
const actors = {};
let app, web, loginFile;
const auth = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const a = Object.values(actors).find(
    (a) => `Bearer ${a.access_token}` === req.headers.authorization,
  );
  res.setHeader('Content-Type', 'application/json');
  if (req.url?.startsWith('/auth/v1/user') && a) {
    res.writeHead(200);
    res.end(JSON.stringify(a.user));
  } else {
    res.writeHead(401);
    res.end(JSON.stringify({ message: 'Invalid TEST ONLY auth token' }));
  }
});
await new Promise((r) => auth.listen(0, '127.0.0.1', r));
const authUrl = fixture.realQa?.authUrl ?? `http://127.0.0.1:${auth.address().port}`;
process.env.SUPABASE_URL = authUrl;
process.env.SUPABASE_PUBLISHABLE_KEY = fixture.realQa?.publishableKey ?? 'TEST_ONLY_PUBLIC';
try {
  for (const [alias, role, adminRole] of [
    ['content', 'ADMIN', 'CONTENT_DATA_MODERATION'],
    ['super', 'ADMIN', 'SUPER_ADMIN'],
    ['operations', 'ADMIN', 'OPERATIONS'],
    ['null', 'ADMIN', null],
    ['student', 'STUDENT', null],
    ['teacher', 'TEACHER', null],
  ]) {
    let profile;
    if (alias === 'content')
      [profile] = await owner`SELECT id,auth_user_id FROM users WHERE id=${fixture.actor}`;
    else if (alias === 'super' && fixture.realQa) {
      [profile] =
        await owner`SELECT id,auth_user_id FROM users WHERE auth_user_id=${fixture.realQa.authUserId}`;
      if (!profile)
        [profile] = await owner`INSERT INTO users(auth_user_id,role,admin_role,display_name,email)
        VALUES(${fixture.realQa.authUserId},'ADMIN','SUPER_ADMIN',${fixture.realQa.displayName},${fixture.realQa.email}) RETURNING id,auth_user_id`;
    } else
      [profile] =
        await owner`INSERT INTO users(auth_user_id,role,admin_role,display_name,email) VALUES(${randomUUID()},${role},${adminRole},'TEST generator actor',${randomUUID() + '@example.test'}) RETURNING id,auth_user_id`;
    const user = {
      id: profile.auth_user_id,
      email: 'fixture@example.test',
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    const token = [
      Buffer.from('{"alg":"HS256"}').toString('base64url'),
      Buffer.from(
        JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
      ).toString('base64url'),
      randomUUID(),
    ].join('.');
    actors[alias] = {
      access_token: token,
      refresh_token: randomUUID(),
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user,
    };
  }
  const portServer = createServer();
  await new Promise((r) => portServer.listen(0, '127.0.0.1', r));
  const webPort = process.env.GENERATOR_DEMO_WEB_PORT
    ? Number(process.env.GENERATOR_DEMO_WEB_PORT)
    : portServer.address().port;
  if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535)
    throw new Error('Invalid demo web port');
  await new Promise((r) => portServer.close(r));
  const webOrigin = `http://localhost:${webPort}`;
  process.env.CORS_ORIGINS = webOrigin;
  const module = await Test.createTestingModule({
    imports: [IdentityModule, ConfigModule.forRoot({ ignoreEnvFile: true })],
    controllers: [GeneratorController, GeneratorPackagesController],
    providers: [
      GeneratorService,
      GeneratorPackagesService,
      ContentImportService,
      ContentPackagesService,
      R2MediaStorage,
    ],
  }).compile();
  app = module.createNestApplication({ logger: false });
  configureApplication(app);
  await app.listen(0, '127.0.0.1');
  const apiUrl = await app.getUrl();
  web = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(webPort)], {
    cwd: 'apps/web',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      NUMORA_WEB_DIST_DIR: process.env.NUMORA_WEB_DIST_DIR ?? '.next-generator-handoff',
      NUMORA_LOW_MEMORY: 'true',
      NEXT_PUBLIC_API_URL: `${apiUrl}/api/v1`,
      NEXT_PUBLIC_SUPABASE_URL: authUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_GENERATOR_DEMO: 'true',
      NEXT_PUBLIC_GENERATOR_DEMO_QA_EMAIL: fixture.realQa?.email ?? '',
    },
  });
  let log = '';
  web.stdout.on('data', (c) => {
    log += c;
  });
  web.stderr.on('data', (c) => {
    log += c;
  });
  for (let i = 0; i < 120; i++) {
    if (web.exitCode !== null) throw new Error('Demo web exited: ' + log);
    try {
      if ((await fetch(webOrigin, { signal: AbortSignal.timeout(1000) })).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  const loginName = fixture.realQa ? 'admin/login' : 'generator-demo-' + randomUUID() + '.html';
  if (!fixture.realQa) {
    loginFile = 'apps/web/public/' + loginName;
    await writeFile(
      loginFile,
      '<!doctype html><meta charset="utf-8"><title>Demo generator lokal</title><p>Memasuki demo lokal Super Admin TEST ONLY�</p><script>localStorage.setItem("sb-127-auth-token",' +
        JSON.stringify(JSON.stringify(actors.super)) +
        ');location.replace("/admin/content/generator");</script>',
    );
  }
  let busy = false;
  const timer = setInterval(async () => {
    if (process.env.GENERATOR_DEMO_REUSE_WORKER === 'true') return;
    if (busy) return;
    busy = true;
    try {
      await pollGenerator(client);
    } catch {
      console.error('Demo generator notification failed');
    } finally {
      busy = false;
    }
  }, 1000);
  console.log('DEMO_READY ' + webOrigin + '/' + loginName);
  console.log('Stop this demo process to clean up its isolated database.');
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  clearInterval(timer);
} finally {
  if (loginFile) await unlink(loginFile).catch(() => {});
  if (web)
    spawn('taskkill', ['/pid', String(web.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  await app?.close();
  auth.closeAllConnections();
  await new Promise((r) => auth.close(r));
  await closeDatabaseConnection();
  await owner.end();
  await compute.end();
}

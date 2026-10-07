// TEST ONLY. Real IdentityService/ContentAdminGuard, Nest endpoints, SQL roles,
// worker HTTP transport and Python subprocess. Auth issuer alone is synthetic.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
import { GeneratorPackagesService } from '../dist/modules/content/generator-packages.service.js';
import { GeneratorPackagesController } from '../dist/modules/content/generator-packages.controller.js';
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
const actors = {};
let app, web, browser;
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
const authUrl = `http://127.0.0.1:${auth.address().port}`;
process.env.SUPABASE_URL = authUrl;
process.env.SUPABASE_PUBLISHABLE_KEY = 'TEST_ONLY_PUBLIC';
const counts = async () => {
  const [r] = await owner`SELECT (SELECT count(*) FROM assessment_attempts)::int AS attempts,
  (SELECT count(*) FROM xp_ledger)::int AS xp,(SELECT count(*) FROM student_item_exposures)::int AS exposure,
  (SELECT count(*) FROM irt_batches)::int AS irt`;
  return { ...r };
};
const baseline = await counts();
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
    else
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
  const webPort = portServer.address().port;
  await new Promise((r) => portServer.close(r));
  const webOrigin = `http://localhost:${webPort}`;
  process.env.CORS_ORIGINS = webOrigin;
  process.env.CONTENT_IMPORT_PREVIEW_ENABLED = 'true';
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
  app = module.createNestApplication({ logger: ['error'] });
  configureApplication(app);
  await app.listen(0, '127.0.0.1');
  const apiUrl = await app.getUrl(),
    base = `${apiUrl}/api/v1/admin/content/generator`;
  async function call(
    path,
    method = 'GET',
    body,
    alias = 'content',
    key = randomUUID(),
    status = 200,
  ) {
    const response = await fetch(`${base}/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        ...(alias ? { Authorization: `Bearer ${actors[alias].access_token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (response.status === 500 && path === 'packages') {
      const [actor] = await owner`SELECT id FROM users WHERE auth_user_id=${actors[alias].user.id}`;
      try {
        await app.get(GeneratorPackagesService).prepare(actor.id, key, body);
      } catch (e) {
        console.error('TEST package prepare diagnostic:', e.code, e.message);
      }
    }
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(payload)}`);
    return payload;
  }

  for (const alias of ['operations', 'null', 'student', 'teacher'])
    await call('packages/catalog', 'GET', undefined, alias, undefined, 403);
  await call('packages/catalog', 'GET', undefined, null, undefined, 401);
  const catalog = await call('packages/catalog');
  assert.equal(catalog.options.length, 3);
  if (process.env.GENERATOR_UI_ONLY !== 'true') {
    const groups = [];
    for (const option of catalog.options) {
      assert.equal(option.availableCount, option.requiredCount);
      const body = {
        assessmentType: option.assessmentType,
        title: 'TEST ' + option.assessmentType,
        ...(option.scopeId ? { scopeId: option.scopeId } : {}),
      };
      const key = randomUUID();
      const [first, second] = await Promise.all([
        call('packages', 'POST', body, 'super', key, 202),
        call('packages', 'POST', body, 'super', key, 202),
      ]);
      assert.equal(first.id, second.id);
      assert.equal(first.requests.length, option.requiredCount);
      groups.push(first);
      await call('packages', 'POST', { ...body, title: 'changed' }, 'super', key, 409);
      await call(`packages/${first.id}/file`, 'GET', undefined, 'content', undefined, 409);
    }
    for (let n = 0; n < 100; n++) {
      await pollGenerator(client);
      const states = await Promise.all(groups.map((g) => call(`packages/${g.id}`)));
      if (states.every((g) => g.status === 'READY')) break;
      if (n === 99)
        throw new Error(
          'Package timeout ' +
            JSON.stringify(
              states.map((g) => ({
                status: g.status,
                done: g.completedCount,
                failed: g.failedCount,
              })),
            ),
        );
      await new Promise((r) => setTimeout(r, 200));
    }
    for (const group of groups) {
      const file = await call(`packages/${group.id}/file`);
      assert.equal(file.items.length, group.expectedCount);
      const before = await owner`SELECT id FROM candidate_imports`;
      const preview = await call(`packages/${group.id}/validate-json`, 'POST', { file });
      assert.equal(preview.report.canImportDraft, true, JSON.stringify(preview.report));
      assert.deepEqual(await owner`SELECT id FROM candidate_imports`, before);
      await call(
        `packages/${group.id}/validate-json`,
        'POST',
        { file: { ...file, title: 'tampered' } },
        'content',
        undefined,
        409,
      );
      await call(
        `packages/${group.id}/import-json`,
        'POST',
        { file: { ...file, items: file.items.slice(1) } },
        'content',
        undefined,
        409,
      );
      const [a, b] = await Promise.all([
        call(`packages/${group.id}/import-json`, 'POST', { file }),
        call(`packages/${group.id}/import-json`, 'POST', { file }),
      ]);
      assert.equal(a.id, b.id);
      const [stored] =
        await owner`SELECT p.status,p.assessment_type,count(i.id)::int AS total,count(distinct v.question_id)::int AS families,bool_and(v.kind='VARIANT' AND q.content_status='DRAFT' AND q.parent_original_question_version_id IS NOT NULL) AS valid FROM assessment_packages p JOIN package_items i ON i.package_id=p.id JOIN question_versions q ON q.id=i.question_version_id JOIN question_variants v ON v.id=q.variant_id WHERE p.id=${a.id} GROUP BY p.id`;
      assert.equal(stored.status, 'DRAFT');
      assert.equal(stored.total, group.expectedCount);
      assert.equal(stored.families, group.expectedCount);
      assert.equal(stored.valid, true);
      assert.equal((await call(`packages/${group.id}`)).status, 'IMPORTED');
    }
  }
  if (process.env.GENERATOR_SKIP_BROWSER !== 'true') {
    const { chromium } = await import('../../web/node_modules/@playwright/test/index.mjs');
    web = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'dev', '-p', String(webPort)],
      {
        cwd: 'apps/web',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NUMORA_LOW_MEMORY: 'true',
          NUMORA_WEB_DIST_DIR: '.next-generator-package-test',
          NODE_OPTIONS: '--max-old-space-size=768',
          NEXT_PUBLIC_API_URL: `${apiUrl}/api/v1`,
          NEXT_PUBLIC_SUPABASE_URL: authUrl,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'TEST_ONLY_PUBLIC',
        },
      },
    );
    let log = '';
    web.stdout.on('data', (c) => (log += c));
    web.stderr.on('data', (c) => (log += c));
    for (let n = 0; n < 120; n++) {
      if (web.exitCode !== null) throw new Error(log);
      try {
        if ((await fetch(webOrigin, { signal: AbortSignal.timeout(1000) })).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: webOrigin,
            localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(actors.super) }],
          },
        ],
      },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => console.error(e.message));
    await page.goto(webOrigin + '/admin/content/generator');
    await page.getByLabel('Tujuan paket').selectOption('DRILL');
    await page
      .getByLabel('Subbab dan level')
      .selectOption(catalog.options.find((o) => o.assessmentType === 'DRILL').scopeId);
    await page.getByLabel('Judul paket').fill('TEST browser Drill');
    const timer = setInterval(() => void pollGenerator(client).catch(() => {}), 500);
    try {
      await page.getByRole('button', { name: 'Generate paket', exact: true }).click();
      await page.waitForURL('**/admin/content/imports?generatorPackage=*');
      await page.getByRole('heading', { name: '2. Preview dan tujuan', exact: true }).waitFor();
      assert.equal(
        await page.locator('.upload-steps [aria-current="step"]').innerText(),
        '2\nPreview & tujuan',
      );
      await page
        .getByRole('heading', { name: 'Preview JSON sebelum simpan', exact: true })
        .waitFor();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Unduh JSON' }).click();
      await download;
      await page.getByRole('button', { name: 'Lanjutkan ke pemetaan' }).click();
      await page
        .getByText('Validasi lulus. Paket siap disimpan sebagai DRAFT.', { exact: true })
        .waitFor();
      await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
      await page
        .getByText('Paket dan seluruh soal tersimpan sebagai DRAFT.', { exact: true })
        .waitFor();
      await page.getByText('Lolos', { exact: true }).first().waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Publish', exact: true }).isDisabled(),
        true,
      );
      await page.reload();
      await page.getByRole('heading', { name: '2. Preview dan tujuan', exact: true }).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
    } finally {
      clearInterval(timer);
    }
    console.log(
      'PASS connected desktop/mobile: merged generator → automatic import step 2 → validation step 3 → DRAFT and guarded publication step 4 → reload restores preview',
    );
  }
  assert.deepEqual(await counts(), baseline);
  if (process.env.GENERATOR_UI_ONLY !== 'true')
    console.log(
      'PASS package API: 30/10/20 actual Python candidates, auth, concurrent replay/import, immutable JSON, read-only validation, DRAFT lineage, no learning writes.',
    );
} finally {
  await browser?.close();
  if (web)
    spawn('taskkill', ['/pid', String(web.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  await app?.close();
  await new Promise((r) => auth.close(r));
  await closeDatabaseConnection();
  await owner.end();
  await compute.end();
}

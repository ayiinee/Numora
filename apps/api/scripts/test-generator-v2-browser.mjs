// TEST ONLY connected browser and real identity/subrole guard, loopback services.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import { pollGenerator } from '@tka/irt-orchestration';
import { IdentityModule } from '../dist/modules/identity/identity.module.js';
import { GeneratorController } from '../dist/modules/content/generator.controller.js';
import { GeneratorService } from '../dist/modules/content/generator.service.js';
import { GeneratorPackagesController } from '../dist/modules/content/generator-packages.controller.js';
import { GeneratorPackagesService } from '../dist/modules/content/generator-packages.service.js';
import { configureApplication } from '../dist/bootstrap.js';

export async function verifyV2Browser({ owner, client, fixture, service, packages }) {
  const sessions = {};
  let app, web, browser, timer;
  const auth = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'authorization,apikey,content-type,x-client-info',
    );
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const session = Object.values(sessions).find(
      (s) => `Bearer ${s.access_token}` === req.headers.authorization,
    );
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(session ? 200 : 401);
    res.end(JSON.stringify(session?.user ?? { message: 'TEST unauthorized' }));
  });
  await new Promise((r) => auth.listen(0, '127.0.0.1', r));
  const authUrl = `http://127.0.0.1:${auth.address().port}`;
  process.env.SUPABASE_URL = authUrl;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'TEST_ONLY_PUBLIC';
  try {
    for (const [alias, role, admin] of [
      ['content', 'ADMIN', 'CONTENT_DATA_MODERATION'],
      ['super', 'ADMIN', 'SUPER_ADMIN'],
      ['operations', 'ADMIN', 'OPERATIONS'],
      ['null', 'ADMIN', null],
      ['student', 'STUDENT', null],
      ['teacher', 'TEACHER', null],
    ]) {
      const [profile] =
        alias === 'content'
          ? await owner`select id,auth_user_id from users where id=${fixture.actor}`
          : await owner`insert into users(auth_user_id,role,admin_role,display_name,email) values(${randomUUID()},${role},${admin},'TEST v2 browser',${randomUUID() + '@example.test'}) returning id,auth_user_id`;
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
      sessions[alias] = {
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
    const origin = `http://localhost:${webPort}`;
    process.env.CORS_ORIGINS = origin;
    const module = await Test.createTestingModule({
      imports: [IdentityModule],
      controllers: [GeneratorController, GeneratorPackagesController],
      providers: [
        { provide: GeneratorService, useValue: service },
        { provide: GeneratorPackagesService, useValue: packages },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const api = await app.getUrl();
    for (const alias of ['content', 'super', 'operations', 'null', 'student', 'teacher', null]) {
      const response = await fetch(`${api}/api/v1/admin/content/generator/catalog`, {
        headers: alias ? { Authorization: `Bearer ${sessions[alias].access_token}` } : {},
      });
      assert.equal(
        response.status,
        !alias ? 401 : ['content', 'super'].includes(alias) ? 200 : 403,
      );
    }
    web = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'dev', '-p', String(webPort)],
      {
        cwd: 'apps/web',
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NUMORA_WEB_DIST_DIR: '.next-generator-v2-test',
          NUMORA_LOW_MEMORY: 'true',
          NODE_OPTIONS: '--max-old-space-size=1024',
          NEXT_PUBLIC_API_URL: `${api}/api/v1`,
          NEXT_PUBLIC_SUPABASE_URL: authUrl,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'TEST_ONLY_PUBLIC',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    let log = '';
    web.stdout.on('data', (c) => {
      log += c.toString();
    });
    web.stderr.on('data', (c) => {
      log += c.toString();
    });
    for (let i = 0; i < 120; i++) {
      if (web.exitCode !== null) throw new Error(log);
      try {
        if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    const { chromium } = await import('../../web/node_modules/@playwright/test/index.mjs');
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin,
            localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(sessions.content) }],
          },
        ],
      },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const catalog = await service.catalog();
    const samples = fixture.items.filter((i) =>
      [
        'pg-6-1-1',
        'mcma-16-1-7',
        'kategori-16-1-10',
        'pg-16-4-1',
        'pg-16-4-2',
        'tryout-1-b1-q07',
      ].includes(i.qid),
    );
    assert(samples.length >= 5);
    timer = setInterval(() => void pollGenerator(client).catch(() => {}), 500);
    await mkdir('outputs/generator-v2', { recursive: true });
    for (const item of samples) {
      await page.goto(`${origin}/admin/content/generator/individual`);
      const select = page.getByLabel('Original');
      try {
        await select.waitFor();
      } catch (error) {
        console.error('V2 browser page:', await page.locator('body').innerText());
        console.error('V2 Next diagnostics:', log.slice(-2500));
        throw error;
      }
      await page.waitForFunction(
        (n) => document.querySelectorAll('#generator-original option').length === n + 1,
        catalog.items.length,
      );
      await select.selectOption(item.approval);
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      await page.getByRole('button', { name: 'Lihat kandidat', exact: true }).click();
      await page.getByRole('heading', { name: 'Preview kandidat' }).waitFor();
      if (['pg-16-4-1', 'pg-16-4-2'].includes(item.qid)) {
        const image = page.locator('img[src^="data:image/png"]');
        await image.first().waitFor();
        assert(await image.first().evaluate((i) => i.complete && i.naturalWidth > 0));
      }
      await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
      await page.getByText('Varian tersimpan sebagai DRAFT.', { exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({
        path: `outputs/generator-v2/${item.qid}-mobile.png`,
        fullPage: true,
      });
      console.log(`V2 connected browser preview/save passed: ${item.qid}`);
    }
    const [group] =
      await owner`select id from generator_packages where canonical_package_id is not null order by created_at limit 1`;
    if (group) {
      await page.goto(`${origin}/admin/content/imports?generatorPackage=${group.id}`);
      await page.getByRole('heading', { name: '2. Preview dan tujuan', exact: true }).waitFor();
      const image = page.locator('img[src^="data:image/png"]');
      await image.first().waitFor();
      assert(await image.first().evaluate((i) => i.complete && i.naturalWidth > 0));
      await page.getByRole('button', { name: 'Lanjutkan ke pemetaan', exact: true }).click();
      await page
        .getByText('Validasi lulus. Paket siap disimpan sebagai DRAFT.', { exact: true })
        .waitFor();
      await page.getByRole('button', { name: 'Kembali ke preview', exact: true }).click();
      await page.getByRole('heading', { name: '2. Preview dan tujuan', exact: true }).waitFor();
      await image.first().waitFor();
      await page.screenshot({
        path: 'outputs/generator-v2/package-preview-mobile.png',
        fullPage: true,
      });
      console.log('V2 connected browser package image preview passed');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: 'outputs/generator-v2/admin-desktop.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    clearInterval(timer);
    await browser?.close();
    if (web) web.kill();
    await app?.close();
    await new Promise((r) => auth.close(r));
  }
}

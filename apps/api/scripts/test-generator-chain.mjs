// TEST ONLY. Real IdentityService/ContentAdminGuard, Nest endpoints, SQL roles,
// worker HTTP transport and Python subprocess. Auth issuer alone is synthetic.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { Test } from '@nestjs/testing';
import { getDatabase, closeDatabaseConnection, claimComputeExecution } from '@tka/database';
import { pollGenerator, generatorHttp } from '@tka/irt-orchestration';
import { IdentityModule } from '../dist/modules/identity/identity.module.js';
import { GeneratorController } from '../dist/modules/content/generator.controller.js';
import { GeneratorService } from '../dist/modules/content/generator.service.js';
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
  const module = await Test.createTestingModule({
    imports: [IdentityModule],
    controllers: [GeneratorController],
    providers: [GeneratorService],
  }).compile();
  app = module.createNestApplication({ logger: false });
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
    assert.equal(response.status, status, `${method} ${path}`);
    return response.json();
  }
  for (const alias of ['operations', 'null', 'student', 'teacher'])
    await call('catalog', 'GET', undefined, alias, undefined, 403);
  await call('catalog', 'GET', undefined, null, undefined, 401);
  try {
    await app.get(GeneratorService).catalog();
  } catch (e) {
    console.error('TEST ONLY catalog diagnostic:', e.code, e.message);
    throw e;
  }
  const catalog = await call('catalog');
  assert.equal(catalog.items.length, 3);
  await call('catalog', 'GET', undefined, 'super');
  await call('requests', 'POST', { mappingId: randomUUID() }, 'content', undefined, 409);
  await call(
    'requests',
    'POST',
    { mappingId: catalog.items[0].id, seed: 5 },
    'content',
    undefined,
    400,
  );
  const op = randomUUID();
  const parallel = await Promise.all(
    Array.from({ length: 5 }, () =>
      call('requests', 'POST', { mappingId: catalog.items[0].id }, 'content', op, 202),
    ),
  );
  assert.equal(new Set(parallel.map((r) => r.id)).size, 1);
  await call('requests', 'POST', { mappingId: catalog.items[1].id }, 'content', op, 409);
  const requests = [parallel[0]];
  for (const m of catalog.items.slice(1))
    requests.push(await call('requests', 'POST', { mappingId: m.id }, 'content', undefined, 202));
  for (const r of requests)
    await call(`requests/${r.id}/preview`, 'GET', undefined, 'content', undefined, 409);
  const before = await owner`SELECT id FROM question_variants WHERE kind='VARIANT'`;
  assert.equal(before.length, 0);
  await pollGenerator(client);
  for (const r of requests) {
    const detail = await call(`requests/${r.id}`);
    assert.equal(detail.executionStatus, 'SUCCEEDED');
    const preview = await call(`requests/${r.id}/preview`);
    assert.equal(preview.score, null);
    assert.equal(preview.scoringStatus, 'NOT_SCORED');
    const [q] = await owner`SELECT accepted_execution_id FROM analysis_requests WHERE id=${r.id}`;
    assert.equal(q.accepted_execution_id, null);
    const [notif] =
      await owner`SELECT r.input_digest,d.generation FROM analysis_requests r JOIN analysis_request_dispatches d ON d.request_id=r.id WHERE r.id=${r.id}`;
    const n = {
      contractVersion: 3,
      requestId: r.id,
      inputDigest: notif.input_digest,
      dispatchGeneration: notif.generation,
    };
    const replay = await generatorHttp('/api/v1/compute/execute', n);
    assert.equal(replay.status, 'SUCCEEDED');
    await assert.rejects(() =>
      generatorHttp('/api/v1/compute/execute', { ...n, inputDigest: '0'.repeat(64) }),
    );
    const saves = await Promise.all(
      Array.from({ length: 5 }, () => call(`requests/${r.id}/draft`, 'POST')),
    );
    assert.equal(new Set(saves.map((s) => s.id)).size, 1);
    const [saved] =
      await owner`SELECT q.*,v.kind,v.original_variant_id FROM question_versions q JOIN question_variants v ON v.id=q.variant_id WHERE q.id=${saves[0].id}`;
    assert.equal(saved.kind, 'VARIANT');
    assert.equal(saved.content_status, 'DRAFT');
    assert.equal(saved.validation_state, 'DRAFT');
    assert(saved.original_variant_id);
    const [match] =
      await owner`SELECT jsonb_build_object('questionType',q.question_type,'stem',q.stem,'optionsOrStatements',q.options_or_statements,'answerKey',q.answer_key,'explanation',q.explanation,'media',q.media,'difficulty',q.difficulty,'rubricVersionId',q.scoring_rubric_version_id,'contentFingerprint',q.content_fingerprint)=c.payload AS same
      FROM candidate_imports i JOIN question_versions q ON q.id=i.question_version_id JOIN irt_compute.generation_candidates c ON c.id=i.candidate_id WHERE q.id=${saves[0].id}`;
    assert.equal(match.same, true);
    await call(`requests/${r.id}/retry`, 'POST', undefined, 'content', undefined, 409);
  }
  // Crash/expiry: a live execution prevents retry; expired replay marks EXPIRED.
  const crashed = await call(
    'requests',
    'POST',
    { mappingId: catalog.items[0].id },
    'content',
    undefined,
    202,
  );
  const execution = await claimComputeExecution(
    compute,
    crashed.id,
    process.env.COMPUTE_SERVICE_PRINCIPAL_ID,
    1,
    1,
  );
  await call(`requests/${crashed.id}/retry`, 'POST', undefined, 'content', undefined, 409);
  await new Promise((r) => setTimeout(r, 1100));
  await pollGenerator(client);
  assert.equal((await call(`requests/${crashed.id}`)).executionStatus, 'EXPIRED');
  const retryOp = randomUUID();
  const retries = await Promise.all(
    Array.from({ length: 3 }, () =>
      call(`requests/${crashed.id}/retry`, 'POST', undefined, 'content', retryOp, 202),
    ),
  );
  assert(retries.every((r) => r.dispatchGeneration === 2));
  await pollGenerator(client);
  assert.equal((await call(`requests/${crashed.id}`)).executionStatus, 'SUCCEEDED');
  assert(execution);
  // Sealed adversarial compute fixtures test the main acceptance boundary.
  async function computedFixture(mode) {
    const r = await call(
      'requests',
      'POST',
      { mappingId: catalog.items[0].id },
      'content',
      undefined,
      202,
    );
    const e = await claimComputeExecution(
      compute,
      r.id,
      process.env.COMPUTE_SERVICE_PRINCIPAL_ID,
      60,
      1,
    );
    const [w] =
      await client`SELECT w.*,r.input_digest,g.parameters FROM analysis_requests r JOIN generation_wave_items w ON w.id=r.wave_item_id JOIN irt_compute.generator_configs g ON g.id=w.generator_config_id WHERE r.id=${r.id}`;
    const [old] =
      await client`SELECT c.* FROM irt_compute.generation_candidates c JOIN irt_compute.generation_runs run ON run.id=c.generation_run_id JOIN irt_compute.compute_executions e ON e.id=run.execution_id WHERE e.request_id=${requests[0].id}`;
    const p = structuredClone(old.payload);
    if (mode === 'tampered') p.stem.text += ' tampered';
    if (mode === 'rubric') p.rubricVersionId = fixture.items[1].rubric;
    const provenance = { ...old.parameter_values, seed: w.constraints.seed };
    await compute.begin(async (tx) => {
      const [run] =
        await tx`INSERT INTO irt_compute.generation_runs(config_id,original_question_version_id,wave_item_id,execution_id,generator_version,random_seed,parameter_values,status)
        VALUES(${w.generator_config_id},${w.original_question_version_id},${w.id},${e.id},'TEST_ONLY_ADVERSARIAL',${String(w.constraints.seed)},${JSON.stringify(provenance)}::text::jsonb,'RUNNING') RETURNING id`;
      if (mode === 'foreign') {
        await assert.rejects(
          () => tx`INSERT INTO irt_compute.generation_candidates(generation_run_id,parent_original_question_version_id,payload,random_seed,parameter_values,validation_status)
          VALUES(${run.id},${fixture.items[1].version},${JSON.stringify(p)}::text::jsonb,${String(w.constraints.seed)},${JSON.stringify(provenance)}::text::jsonb,'CONTENT_VALID')`,
        );
        // The rejected statement aborts this whole fixture transaction.
        throw new Error('TEST_FOREIGN_LINEAGE_REJECTED');
      }
      const [c] =
        await tx`INSERT INTO irt_compute.generation_candidates(generation_run_id,parent_original_question_version_id,payload,random_seed,parameter_values,validation_status)
        VALUES(${run.id},${w.original_question_version_id},${JSON.stringify(p)}::text::jsonb,${String(w.constraints.seed)},${JSON.stringify(provenance)}::text::jsonb,'CONTENT_VALID') RETURNING id`;
      await tx`INSERT INTO irt_compute.compute_outputs(execution_id,kind,sequence_number,input_digest,digest,payload,scientific_decision)
        VALUES(${e.id},'GENERATE_VARIANTS',1,${w.input_digest},'',${JSON.stringify({ candidateIds: [mode === 'undeclared' ? old.id : c.id] })}::text::jsonb,'CONTENT_VALID')`;
      await tx`UPDATE irt_compute.generation_runs SET status='SUCCEEDED',finished_at=clock_timestamp() WHERE id=${run.id}`;
      await tx`UPDATE irt_compute.compute_executions SET status='SUCCEEDED',finished_at=clock_timestamp() WHERE id=${e.id} AND fencing_token=${e.fencingToken}`;
    });
    return r;
  }
  for (const mode of ['tampered', 'rubric', 'undeclared']) {
    const r = await computedFixture(mode);
    await call(`requests/${r.id}/preview`, 'GET', undefined, 'content', undefined, 409);
    await call(`requests/${r.id}/draft`, 'POST', undefined, 'content', undefined, 409);
    const [row] = await owner`SELECT accepted_execution_id FROM analysis_requests WHERE id=${r.id}`;
    assert.equal(row.accepted_execution_id, null);
  }
  await assert.rejects(() => computedFixture('foreign'), /TEST_FOREIGN_LINEAGE_REJECTED/);
  // Two sealed candidates with identical content reuse one canonical version.
  const dup = await computedFixture('duplicate');
  const dupSave = await call(`requests/${dup.id}/draft`, 'POST');
  const originalSave = await call(`requests/${requests[0].id}/draft`, 'POST');
  assert.equal(dupSave.id, originalSave.id);
  await assert.rejects(
    () =>
      client`UPDATE irt_compute.generator_configs SET status='RETIRED' WHERE id=${randomUUID()}`,
  );
  await assert.rejects(
    () =>
      compute`UPDATE public.question_versions SET content_status='READY' WHERE id=${randomUUID()}`,
  );
  const rollback = await computedFixture('rollback');
  const [rollbackCandidate] =
    await owner`SELECT c.id FROM irt_compute.generation_candidates c JOIN irt_compute.generation_runs run ON run.id=c.generation_run_id JOIN irt_compute.compute_executions e ON e.id=run.execution_id WHERE e.request_id=${rollback.id}`;
  const [variantCount] = await owner`SELECT count(*)::int AS n FROM question_variants`;
  await owner.unsafe(
    `CREATE FUNCTION public.test_generator_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.candidate_id='${rollbackCandidate.id}'::uuid THEN RAISE EXCEPTION 'TEST_ONLY_ROLLBACK' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
  );
  await owner.unsafe(
    'CREATE TRIGGER test_generator_rollback BEFORE INSERT ON public.candidate_imports FOR EACH ROW EXECUTE FUNCTION public.test_generator_rollback()',
  );
  try {
    await call(`requests/${rollback.id}/draft`, 'POST', undefined, 'content', undefined, 409);
  } finally {
    await owner.unsafe('DROP TRIGGER test_generator_rollback ON public.candidate_imports');
    await owner.unsafe('DROP FUNCTION public.test_generator_rollback()');
  }
  const [afterRollback] = await owner`SELECT count(*)::int AS n FROM question_variants`;
  assert.equal(afterRollback.n, variantCount.n);
  const [rollbackRequest] =
    await owner`SELECT accepted_execution_id FROM analysis_requests WHERE id=${rollback.id}`;
  assert.equal(rollbackRequest.accepted_execution_id, null);
  // A late response lost after commit is reconciled from SQL, not regenerated.
  const lost = await call(
    'requests',
    'POST',
    { mappingId: catalog.items[0].id },
    'content',
    undefined,
    202,
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (String(args[0]).includes('/compute/execute'))
      throw new TypeError('TEST lost response after commit');
    return response;
  };
  try {
    await pollGenerator(client);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal((await call(`requests/${lost.id}`)).executionStatus, 'SUCCEEDED');
  await pollGenerator(client);
  const [lostCount] =
    await owner`SELECT count(*)::int AS n FROM irt_compute.compute_executions WHERE request_id=${lost.id}`;
  assert.equal(lostCount.n, 1);
  // A real unresponsive HTTP listener verifies the fixed 45-second transport bound.
  if (process.env.GENERATOR_SKIP_TIMEOUT !== 'true') {
    const blocked = await call(
      'requests',
      'POST',
      { mappingId: catalog.items[0].id },
      'content',
      undefined,
      202,
    );
    const blackhole = createServer(() => {});
    await new Promise((r) => blackhole.listen(0, '127.0.0.1', r));
    const originalUrl = process.env.NUMORA_GENERATOR_URL;
    process.env.NUMORA_GENERATOR_URL = `http://127.0.0.1:${blackhole.address().port}`;
    const started = Date.now();
    try {
      await pollGenerator(client);
    } finally {
      process.env.NUMORA_GENERATOR_URL = originalUrl;
      blackhole.closeAllConnections();
      await new Promise((r) => blackhole.close(r));
    }
    assert(Date.now() - started >= 44000 && Date.now() - started < 60000);
    assert.equal((await call(`requests/${blocked.id}`)).status, 'PENDING');
    const [noClaim] =
      await owner`SELECT count(*)::int AS n FROM irt_compute.compute_executions WHERE request_id=${blocked.id}`;
    assert.equal(noClaim.n, 0);
    await owner`UPDATE outbox_deliveries SET retry_at=NULL WHERE outbox_id IN(SELECT id FROM analytics_outbox WHERE entity_id=${blocked.id})`;
    await pollGenerator(client);
    assert.equal((await call(`requests/${blocked.id}`)).executionStatus, 'SUCCEEDED');
  }
  console.log('PASS: connected API, service execution, preview/draft and expiry/retry');
  // Actual browser → Nest → worker → Python → read-only preview → canonical DRAFT.
  if (process.env.GENERATOR_SKIP_BROWSER !== 'true') {
    const { chromium } = await import('../../web/node_modules/@playwright/test/index.mjs');
    web = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'dev', '-p', String(webPort)],
      {
        cwd: 'apps/web',
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NUMORA_WEB_DIST_DIR: '.next-generator-test',
          NUMORA_LOW_MEMORY: 'true',
          NODE_OPTIONS: '--max-old-space-size=1024',
          NEXT_PUBLIC_API_URL: `${apiUrl}/api/v1`,
          NEXT_PUBLIC_SUPABASE_URL: authUrl,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'TEST_ONLY_PUBLIC',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    let webLog = '';
    web.stdout.on('data', (chunk) => {
      webLog += chunk.toString();
    });
    web.stderr.on('data', (chunk) => {
      webLog += chunk.toString();
    });
    for (let i = 0; i < 120; i++) {
      if (web.exitCode !== null) throw new Error('Test Next process exited: ' + webLog);
      try {
        if ((await fetch(webOrigin, { signal: AbortSignal.timeout(1000) })).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: webOrigin,
            localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(actors.content) }],
          },
        ],
      },
    });
    // Supabase storage key uses the first host segment (127).
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('TEST ONLY browser console:', message.text());
    });
    page.on('requestfailed', (request) =>
      console.error('TEST ONLY request failed:', request.url(), request.failure()?.errorText),
    );
    page.on('pageerror', (e) => console.error('TEST ONLY browser error:', e.message));
    page.on('response', (r) => {
      if (r.status() >= 400)
        console.error('TEST ONLY HTTP status:', r.status(), new URL(r.url()).pathname);
    });
    await page.goto(`${webOrigin}/admin/content/generator`);
    const select = page.getByLabel('Original');
    try {
      await select.waitFor({ timeout: 30000 });
    } catch (e) {
      console.error('TEST ONLY rendered UI:', await page.locator('body').innerText());
      throw e;
    }
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('#generator-original option').length === 4,
        undefined,
        { timeout: 30000 },
      );
    } catch (e) {
      console.error('TEST ONLY rendered catalog:', await page.locator('body').innerText());
      throw e;
    }
    await select.selectOption(catalog.items[0].id);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    const transportTimer = setInterval(() => void pollGenerator(client).catch(() => {}), 500);
    try {
      await page
        .getByRole('button', { name: 'Lihat kandidat', exact: true })
        .waitFor({ timeout: 60000 });
    } finally {
      clearInterval(transportTimer);
    }
    await page.getByRole('button', { name: 'Lihat kandidat', exact: true }).click();
    await page.getByRole('heading', { name: 'Preview kandidat' }).waitFor();
    await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
    await page.getByText('Varian tersimpan sebagai DRAFT.', { exact: true }).waitFor();
    await mkdir('outputs/generator-v1', { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll('*')]
            .filter((e) => e.getBoundingClientRect().right > innerWidth)
            .map((e) => ({
              tag: e.tagName,
              cls: e.className,
              width: e.getBoundingClientRect().width,
              right: e.getBoundingClientRect().right,
            }))
            .slice(0, 15),
        ),
      ),
    );
    await page.screenshot({ path: 'outputs/generator-v1/admin-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'outputs/generator-v1/admin-desktop.png', fullPage: true });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll('*')]
            .filter((e) => e.getBoundingClientRect().right > innerWidth)
            .map((e) => ({
              tag: e.tagName,
              cls: e.className,
              width: e.getBoundingClientRect().width,
            }))
            .slice(0, 10),
        ),
      ),
    );
    await context.close();
  }
  // Approval revoked after generation/preview must block a new import.
  await owner`UPDATE configuration_approvals SET revoked_at=clock_timestamp() WHERE id=${catalog.items[0].id}`;
  await call(`requests/${crashed.id}/draft`, 'POST', undefined, 'content', undefined, 409);
  assert.deepEqual(await counts(), baseline);
  console.log(
    'PASS: real Admin auth/subroles, prepare races, three formats, HTTP replay/digest, preview, parallel save, current dispatch, expiry/retry, revoked approval, immutable payload and no assessment/XP/exposure/IRT writes' +
      (process.env.GENERATOR_SKIP_BROWSER === 'true'
        ? ' (browser skipped)'
        : ' including connected mobile/desktop UI'),
  );
} finally {
  await browser?.close();
  if (web) {
    if (process.platform === 'win32')
      spawn('taskkill', ['/pid', String(web.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    else web.kill('SIGTERM');
  }
  await app?.close();
  await new Promise((r) => auth.close(r));
  await closeDatabaseConnection();
  await owner.end();
  await compute.end();
}

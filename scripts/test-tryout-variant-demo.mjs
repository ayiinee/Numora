// Connected local smoke: real NestJS, PostgreSQL, Python generator and browser; no API mocks.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const target = new URL(process.argv[2]);
assert.equal(target.protocol, 'http:');
assert.equal(target.hostname, 'localhost');
assert.match(target.pathname, /^\/generator-demo-[a-f0-9-]{36}\.html$/);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(30000);
try {
  const originalResponse = page.waitForResponse((response) =>
    /\/admin\/content\/packages\/[a-f0-9-]{36}$/.test(new URL(response.url()).pathname),
  );
  await page.goto(target.href);
  const response = await originalResponse;
  assert.equal(response.status(), 200);
  assert(['127.0.0.1', 'localhost'].includes(new URL(response.url()).hostname));
  const original = await response.json();
  assert.equal(original.name, 'Tryout Matematika [DEMO LOKAL]');
  assert.equal(original.items.length, 30);
  await page.getByRole('heading', { name: 'Pilih 5 soal anchor' }).waitFor();
  for (let n = 1; n <= 5; n++)
    await page
      .getByRole('checkbox', { name: `Pilih soal ${n} sebagai anchor`, exact: true })
      .check();
  await page.getByRole('button', { name: 'Tinjau & lanjutkan' }).click();
  await page.getByText('25/25 soal siap').waitFor();
  const prepared = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/${original.id}/variants`) && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Generate 25 soal varian' }).click();
  const preparation = await prepared;
  assert.equal(preparation.status(), 202, 'Generation preparation must be accepted');
  const process = await preparation.json();
  assert.equal(process.requests.length, 25);
  assert.equal(process.anchorQuestionVersionIds.length, 5);
  console.log('25 real generator requests accepted; waiting for output.');
  const terminal = page.getByRole('heading', {
    name: /Varian siap disimpan|Generate belum berhasil/,
  });
  await terminal.waitFor({ timeout: 240000 });
  assert.equal(await terminal.innerText(), 'Varian siap disimpan');
  const materialized = page.waitForResponse((response) =>
    response.url().endsWith(`/${process.id}/materialize`),
  );
  await page.getByRole('button', { name: 'Simpan paket DRAFT' }).click();
  const saved = await materialized;
  assert(saved.ok(), 'Generated package must materialize');
  await page.waitForURL(/\/admin\/assessments\/tryout\/[a-f0-9-]{36}$/);
  const id = new URL(page.url()).pathname.split('/').at(-1);
  const headers = { Authorization: response.request().headers().authorization };
  const base = response.url().slice(0, response.url().lastIndexOf('/'));
  const draftResponse = await page.request.get(`${base}/${id}`, { headers });
  assert.equal(draftResponse.status(), 200);
  const draft = await draftResponse.json();
  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.items.length, 30);
  for (const [index, item] of draft.items.entries()) {
    assert.equal(item.displayOrder, original.items[index].displayOrder);
    if (index < 5) assert.equal(item.questionVersionId, original.items[index].questionVersionId);
    else assert.notEqual(item.questionVersionId, original.items[index].questionVersionId);
    assert(item.question?.stem.text);
  }
  const originalAgain = await page.request.get(response.url(), { headers });
  assert.equal(originalAgain.status(), 200);
  assert.deepEqual((await originalAgain.json()).items, original.items);
  await page.getByText(draft.name, { exact: true }).first().waitFor();
  await mkdir('.tmp/variant-demo-evidence', { recursive: true });
  await page.screenshot({ path: '.tmp/variant-demo-evidence/draft.png', fullPage: true });
  console.log(
    JSON.stringify({
      passed: true,
      anchorsUnchanged: 5,
      generatedQuestions: 25,
      draftItems: 30,
      originalUnchanged: true,
    }),
  );
} catch (error) {
  await mkdir('.tmp/variant-demo-evidence', { recursive: true });
  await page
    .screenshot({ path: '.tmp/variant-demo-evidence/failure.png', fullPage: true })
    .catch(() => {});
  console.error(
    (
      await page
        .locator('main')
        .innerText()
        .catch(() => '')
    ).slice(-2000),
  );
  throw error;
} finally {
  await browser.close();
}

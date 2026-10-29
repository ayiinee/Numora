import { expect, test, type Page } from '@playwright/test';
import { setupAssessment } from './fixtures/admin-assessment';
import { id } from './fixtures/admin';

async function selectSection(page: Page, label: string) {
  const select = page.getByRole('combobox', { name: 'Bagian konten', exact: true });
  if (await select.isVisible()) await select.selectOption({ label });
  else
    await page
      .getByRole('navigation', { name: 'Pengelolaan Admin' })
      .getByRole('button', { name: label, exact: true })
      .click();
}

for (const role of ['SUPER_ADMIN', 'CONTENT_DATA_MODERATION'] as const) {
  test(`Assessment visual audit ${role}`, async ({ page }) => {
    const { errors } = await setupAssessment(page, role);
    await page.goto('/admin/content');
    await expect(page.getByRole('list', { name: 'Daftar soal', exact: true })).toBeVisible();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`bank-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal{visibility:hidden!important}',
      });
    }
    await page.goto(`/admin/content/versions/${id(900)}`);
    await expect(page.getByText('Isi soal', { exact: true })).toBeVisible();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`review-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal{visibility:hidden!important}',
      });
    }
    expect(errors).toEqual([]);
  });
}

test('question readers show every statement, preserve source mathematics and keep technical metadata optional', async ({
  page,
}) => {
  const { assessment } = await setupAssessment(page);
  await page.goto('/admin/content');
  const first = page.locator('.assessment-question-list > li').first();
  await expect(first.getByText('Pilihan ganda kompleks', { exact: true })).toBeVisible();
  await expect(first.locator('.assessment-options > li')).toHaveCount(4);
  await expect(
    first.locator('.assessment-options > li').nth(1).locator('.katex-mathml'),
  ).toContainText('60');
  await expect(first.locator('.assessment-source dd').first()).toBeHidden();
  await first.getByText('Sumber & identitas', { exact: true }).click();
  await expect(first.getByText(assessment.versions[0]!.variantCode, { exact: true })).toBeVisible();
  await first.getByRole('link', { name: 'Detail, review & kesiapan' }).click();
  await expect(page.locator('.content-answer-section dd')).toHaveText('1, 3, 4');
  await expect(page.locator('.assessment-answer-marker')).toHaveCount(3);
  await expect(page.locator('.content-options > li')).toHaveCount(4);
  await expect(page.getByText('APPROVED_PGK_RUBRIC_REQUIRED', { exact: true })).toBeVisible();
  expect(assessment.calls.every((call) => call.method === 'GET')).toBe(true);
});

test('category keys use the same statement numbers and human category labels', async ({ page }) => {
  await setupAssessment(page);
  await page.goto(`/admin/content/versions/${id(901)}`);
  await expect(page.getByRole('heading', { name: 'Pernyataan', exact: true })).toBeVisible();
  const keys = page.locator('.content-answer-section');
  await expect(keys.locator('dt')).toHaveText([
    'Pernyataan 1',
    'Pernyataan 2',
    'Pernyataan 3',
    'Pernyataan 4',
  ]);
  await expect(keys.locator('dd')).toHaveText(['Benar', 'Salah', 'Benar', 'Benar']);
});

test('bank filters apply explicitly with trimmed source and reset server pagination', async ({
  page,
}) => {
  const { assessment } = await setupAssessment(page);
  await page.goto('/admin/content');
  const pager = page.getByRole('navigation', { name: 'Halaman data' });
  await pager.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(pager.getByText('Halaman 2')).toBeVisible();
  await page.getByRole('button', { name: /^Filter soal/ }).click();
  await page.getByLabel('Status versi', { exact: true }).selectOption('READY');
  await page.getByLabel('Sumber soal', { exact: true }).fill('  Tryout 1  ');
  expect(assessment.calls.at(-1)?.query).toContain('offset=5');
  await page.getByRole('button', { name: 'Terapkan filter', exact: true }).click();
  await expect(page.locator('.assessment-question-list > li')).toHaveCount(1);
  expect(Object.fromEntries(new URLSearchParams(assessment.calls.at(-1)!.query))).toMatchObject({
    offset: '0',
    status: 'READY',
    source: 'Tryout 1',
    limit: '5',
  });
  await page.getByRole('button', { name: 'Reset filter', exact: true }).click();
  await expect(page.locator('.assessment-question-list > li')).toHaveCount(5);
  await expect(page.getByLabel('Sumber soal', { exact: true })).toHaveValue('');
});

test('all ten sections remain reachable and preserve deep links and read-only browsing', async ({
  page,
}) => {
  const { assessment, errors } = await setupAssessment(page, 'CONTENT_DATA_MODERATION');
  await page.goto('/admin/content');
  const panels = [
    ['Materi', 'curriculum'],
    ['Video', 'videos'],
    ['Paket & Pretest', 'directedPackages'],
    ['Draf Tryout', 'packages'],
    ['Paket Drill', 'drillPackages'],
    ['Verifikasi & riwayat', 'verification'],
    ['Laporan', 'reports'],
    ['IRT', 'irt'],
    ['Audit', 'audit'],
    ['Soal', 'questions'],
  ];
  for (const [label, view] of panels) {
    await selectSection(page, label!);
    await expect(page).toHaveURL(new RegExp(`view=${view}`));
    await expect(page.locator('.admin-content-view')).toHaveAttribute('aria-label', label!);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`${view}-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal{visibility:hidden!important}',
      });
    }
  }
  await page.goBack();
  await expect(page.locator('.admin-content-view')).toHaveAttribute('aria-label', 'Audit');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Bagian konten', exact: true })).toHaveValue(
    'audit',
  );
  expect(assessment.calls.every((call) => call.method === 'GET')).toBe(true);
  expect(errors).toEqual([]);
});

test('PG dialog keeps failed drafts, traps focus and returns focus when closed', async ({
  page,
}) => {
  await setupAssessment(page);
  let fail = true;
  const bodies: unknown[] = [];
  await page.route('**/api/v1/admin/content/questions', (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill(
      fail
        ? { status: 503, json: { detail: 'Penyimpanan sementara gagal.' } }
        : { json: { id: id(990) } },
    );
  });
  await page.goto('/admin/content');
  const trigger = page.getByRole('button', { name: 'Tambah soal PG', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Kompetensi', { exact: true }).selectOption({ index: 1 });
  await dialog.getByLabel('Kode varian unik').fill('TEST-NEW');
  await dialog.getByLabel('Tujuan soal permanen').selectOption('DRILL');
  await dialog.getByLabel('Teks soal (LaTeX inline diperbolehkan)').fill('Hitung $2+2$.');
  for (const id of ['A', 'B', 'C', 'D'])
    await dialog.getByLabel(`Opsi ${id}`, { exact: true }).fill(`Jawaban ${id}`);
  await dialog.getByLabel('Pembahasan', { exact: true }).fill('Pembahasan fixture.');
  const save = dialog.getByRole('button', { name: 'Simpan versi DRAFT' });
  await save.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Tutup dialog' })).toBeFocused();
  await save.click();
  // The failure must be visible inside the dialog, above the draft it concerns.
  await expect(dialog.getByText('Penyimpanan sementara gagal.')).toBeVisible();
  await expect(dialog.getByLabel('Teks soal (LaTeX inline diperbolehkan)')).toHaveValue(
    'Hitung $2+2$.',
  );
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const formWidth = await dialog
      .locator('fieldset.admin-editor-fields')
      .evaluate((element) => element.getBoundingClientRect().width);
    const dialogWidth = await dialog.evaluate((element) => element.getBoundingClientRect().width);
    expect(formWidth).toBeGreaterThan(dialogWidth * 0.75);
    const header = await dialog.locator('.numora-dialog__header').boundingBox();
    const feedback = await dialog.getByRole('alert').boundingBox();
    expect(feedback!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
    await expect(dialog.getByRole('alert')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`editor-error-${width}.png`),
      style: 'nextjs-portal{visibility:hidden!important}',
    });
  }
  fail = false;
  await save.click();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toMatchObject({ usageType: 'DRILL', stem: 'Hitung $2+2$.' });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('review retries retain reason and expectedStatus and server denial removes the payload', async ({
  page,
}) => {
  const { assessment } = await setupAssessment(page);
  await page.goto(`/admin/content/versions/${id(900)}`);
  await page.getByLabel('Status review').selectOption('REVISION');
  await page
    .getByLabel('Alasan review')
    .fill('Periksa kembali pernyataan kedua dengan Curriculum.');
  assessment.failReview = 503;
  await page.getByRole('button', { name: 'Simpan review', exact: true }).click();
  await expect(page.getByText('Keputusan belum tersimpan.')).toBeVisible();
  await expect(page.getByLabel('Alasan review')).toHaveValue(
    'Periksa kembali pernyataan kedua dengan Curriculum.',
  );
  assessment.failReview = 0;
  await page.getByRole('button', { name: 'Simpan review', exact: true }).click();
  await expect(page.getByText('Keputusan review tersimpan.')).toBeVisible();
  expect(assessment.calls.filter((c) => c.method === 'POST').at(-1)?.body).toMatchObject({
    status: 'REVISION',
    expectedStatus: 'DRAFT',
  });
  assessment.failReview = 403;
  await page.getByLabel('Alasan review').fill('Pemeriksaan akses');
  await page.getByRole('button', { name: 'Simpan review', exact: true }).click();
  await expect(page.locator('.content-payload')).toHaveCount(0);
  await expect(page.getByLabel('Alasan review')).toHaveCount(0);
});

test('bank errors and empty filters offer a clear recovery path', async ({ page }) => {
  const { assessment } = await setupAssessment(page);
  assessment.failStatus = 503;
  await page.goto('/admin/content');
  await expect(page.getByText('Data konten sementara tidak tersedia.')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('bank-error.png'),
    fullPage: true,
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  assessment.failStatus = 0;
  await page.getByRole('button', { name: 'Muat ulang data' }).click();
  await expect(page.locator('.assessment-question-list > li')).toHaveCount(5);
  await page.getByRole('button', { name: /^Filter soal/ }).click();
  await page.getByLabel('Sumber soal', { exact: true }).fill('Tidak ada sumber ini');
  await page.getByRole('button', { name: 'Terapkan filter', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tidak ada soal pada halaman ini' }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('bank-empty.png'),
    fullPage: true,
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  await page.locator('.assessment-empty').getByRole('button', { name: 'Reset filter' }).click();
  await expect(page.locator('.assessment-question-list > li')).toHaveCount(5);
});

test('initial loading explains pending data and then reveals the bank without a blank workspace', async ({
  page,
}) => {
  await setupAssessment(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/admin/content/versions?*', async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto('/admin/content');
  try {
    await expect(page.getByRole('status').filter({ hasText: 'Memuat data Admin' })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('bank-loading.png'),
      fullPage: true,
      style: 'nextjs-portal{visibility:hidden!important}',
    });
  } finally {
    release();
  }
  await expect(page.locator('.assessment-question-list > li')).toHaveCount(5);
});

for (const role of ['OPERATIONS', null] as const) {
  test(`content remains inaccessible for ${role}`, async ({ page }) => {
    const { assessment } = await setupAssessment(page, role);
    await page.goto('/admin/content');
    await expect(page.getByRole('alert').filter({ hasText: /Akses memerlukan/ })).toBeVisible();
    expect(assessment.calls).toEqual([]);
  });
}

test('question reading and navigation remain usable at short 320px and 125 percent zoom', async ({
  page,
}) => {
  await setupAssessment(page, 'CONTENT_DATA_MODERATION');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/admin/content');
  await expect(
    page.getByRole('heading', { name: 'Konten & assessment', exact: true }),
  ).toBeVisible();
  const first = page.locator('.assessment-question-reader').first();
  await first.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(first.locator('.assessment-options')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(first.locator('.assessment-options')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('material and video edits use focused dialogs and preserve a rejected value for retry', async ({
  page,
}) => {
  await setupAssessment(page);
  let fail = true;
  const mutations: { path: string; body: unknown }[] = [];
  for (const resource of ['chapters', 'videos'])
    await page.route(`**/api/v1/admin/content/${resource}/*`, (route) => {
      mutations.push({ path: route.request().url(), body: route.request().postDataJSON() });
      return route.fulfill(
        fail
          ? { status: 503, json: { detail: 'Perubahan fixture belum tersimpan.' } }
          : { json: { id: id(991) } },
      );
    });
  await page.goto('/admin/content');
  for (const [section, trigger, label, value] of [
    ['Materi', 'Ubah nama / deskripsi', 'Nama / deskripsi baru', 'Materi fixture yang diperjelas'],
    ['Video', 'Ubah URL', 'URL HTTPS baru', 'https://example.test/video-review'],
  ]) {
    fail = true;
    await selectSection(page, section!);
    await page.getByRole('button', { name: trigger!, exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(label!, { exact: true }).fill(value!);
    await dialog.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Perubahan fixture belum tersimpan.');
    await expect(dialog.getByLabel(label!, { exact: true })).toHaveValue(value!);
    fail = false;
    await dialog.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(mutations).toHaveLength(4);
  expect(mutations[1]!.body).toMatchObject({ name: 'Materi fixture yang diperjelas' });
  expect(mutations[3]!.body).toMatchObject({ url: 'https://example.test/video-review' });
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupAssessments } from './fixtures/admin-assessments';
import { id } from './fixtures/admin';

test('Tryout ACTIVE includes drafts and published packages but excludes archives', async ({
  page,
}) => {
  const { fixture } = await setupAssessments(page);
  const draft = fixture.packs.find((pack) => pack.assessmentType === 'TRYOUT')!;
  fixture.packs.push(
    { ...structuredClone(draft), id: id(9300), name: 'Published TEST', status: 'PUBLISHED' },
    { ...structuredClone(draft), id: id(9301), name: 'Archived TEST', status: 'ARCHIVED' },
  );
  await page.goto('/admin/assessments/tryout');
  await expect(page.getByRole('link', { name: draft.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Published TEST', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Archived TEST', exact: true })).toHaveCount(0);
  await page.goto('/admin/assessments/tryout/archived');
  await expect(page.getByRole('link', { name: 'Archived TEST', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: draft.name, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Published TEST', exact: true })).toHaveCount(0);
});

test('Tryout uses the compact Pretest layout and delegates scheduling to batches', async ({
  page,
}, testInfo) => {
  const { fixture } = await setupAssessments(page);
  const title = 'SHAFWAN MAU TRY OUT - Variant Production 1 - Revisi Kurikulum';
  fixture.packs.find((pack) => pack.assessmentType === 'TRYOUT')!.name = title;
  fixture.packs.find((pack) => pack.assessmentType === 'TRYOUT')!.distribution = [
    { dimension: 'chapter', value: 'Bilangan', count: 8 },
    { dimension: 'subchapter', value: 'Bilangan Real', count: 8 },
    { dimension: 'difficulty', value: 'EASY', count: 8 },
    { dimension: 'difficulty', value: 'MEDIUM', count: 15 },
    { dimension: 'difficulty', value: 'HARD', count: 7 },
    { dimension: 'format', value: 'SINGLE_CHOICE', count: 30 },
  ];
  await page.goto('/admin/assessments/tryout');
  await expect(page.locator('.assessment-directory-compact')).toBeVisible();
  await expect(page.locator('.admin-full-width-shell')).toBeVisible();
  await expect(page.locator('.assessment-directory-filters')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Rilis', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: title, exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const toolbar = page.locator('.tryout-package-toolbar');
    await expect(toolbar.getByRole('link', { name: /Kembali ke daftar/ })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Penerbitan', exact: true })).toBeVisible();
    const more = toolbar.getByRole('button', { name: 'Tindakan lainnya' });
    const composition = page.getByRole('button', { name: 'Komposisi paket', exact: true });
    await expect(composition).toBeHidden();
    await more.click();
    await expect(composition).toBeVisible();
    const menu = page.locator('#tryout-package-actions');
    await expect(menu.getByRole('button', { name: 'Syarat penerbitan', exact: true })).toHaveCount(
      0,
    );
    await expect(menu.getByRole('link', { name: 'Batch Tryout', exact: true })).toHaveCount(0);
    const menuBounds = await menu.boundingBox();
    expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`tryout-menu-${width}.png`) });
    await more.press('Escape');
    await expect(composition).toBeHidden();
    await expect(more).toBeFocused();
    await more.click();
    await composition.click();
    await expect(page.getByRole('dialog', { name: 'Komposisi paket', exact: true })).toBeVisible();
    const compositionDialog = page.getByRole('dialog', { name: 'Komposisi paket', exact: true });
    await expect(compositionDialog.getByText('30 soal', { exact: true })).toBeVisible();
    for (const name of ['Bab', 'Subbab', 'Kesulitan', 'Jenis soal']) {
      await expect(compositionDialog.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    await expect(
      compositionDialog
        .getByRole('region', { name: 'Kesulitan', exact: true })
        .getByText('Sedang', { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`tryout-composition-${width}.png`) });
    await expect(compositionDialog.locator('details')).toHaveCount(0);
    await expect(compositionDialog.getByLabel('Nama paket', { exact: true })).toHaveCount(0);
    await expect(compositionDialog.getByRole('button', { name: 'Simpan nama' })).toHaveCount(0);
    await expect(menu).toBeHidden();
    await page.getByRole('dialog').press('Escape');
    await more.click();
    await expect(menu.getByRole('button', { name: 'Akses siswa', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Pengaturan paket' });
    await expect(settings.getByRole('heading', { name: 'Akses siswa', exact: true })).toBeVisible();
    await expect(settings).toContainText('Siswa dapat mulai sesuai jadwal');
    await expect(settings).not.toContainText('tinjauan, dan persetujuan');
    await expect(settings.getByRole('region', { name: 'Ringkasan paket' })).toBeVisible();
    await expect(
      settings.getByRole('heading', { name: 'Informasi teknis versi paket' }),
    ).toBeVisible();
    await expect(
      settings
        .locator('.assessment-settings-left')
        .getByRole('region', { name: 'Catatan asal paket' }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`tryout-settings-${width}.png`) });
    await page.getByRole('dialog').press('Escape');
    if (width === 1440) {
      const back = await toolbar.getByRole('link', { name: /Kembali ke daftar/ }).boundingBox();
      const publish = await toolbar
        .getByRole('button', { name: 'Penerbitan', exact: true })
        .boundingBox();
      expect(Math.abs(back!.y - publish!.y)).toBeLessThan(12);
    }
    await page.screenshot({
      path: testInfo.outputPath(`tryout-detail-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Penerbitan', exact: true }).click();
    await expect(
      page
        .getByRole('dialog', { name: 'Penerbitan paket' })
        .getByRole('link', { name: 'Batch Tryout', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Waktu rilis', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('dialog').press('Escape');
  }
});

for (const [kind, title] of [
  ['pretest', 'Pretest TEST 1'],
  ['drill', 'Drill TEST'],
  ['tryout', 'Tryout TEST'],
] as const) {
  test(`${kind} has a clean table and a separate add/detail route`, async ({ page }) => {
    await setupAssessments(page);
    await page.goto(`/admin/assessments/${kind}`);
    await expect(page.getByRole('table')).toBeVisible();
    await expect(
      page.locator('.assessment-page-heading,.admin-breadcrumb,.assessment-package-tabs'),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Publikasikan|Catat review/ })).toHaveCount(0);
    await page.getByRole('link', { name: title, exact: true }).click();
    await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.getByRole('link', { name: /Kembali ke daftar/ }).click();
    await page.getByRole('link', { name: 'Tambah paket', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/assessments/${kind}/new$`));
    await expect(page.getByLabel('Tujuan unggah')).toHaveCount(0);
    await page.getByLabel('Judul paket').fill(`TEST ONLY new ${kind}`);
    await page.getByLabel('Kode keluarga paket').fill(`TEST-NEW-${kind}`);
    await page.getByLabel('Kode sumber stabil').fill('TEST_ONLY');
    await page.getByLabel('Nama penyusun / tim / buku').fill('TEST ONLY Curriculum');
    await page.getByLabel('Referensi sumber', { exact: true }).fill('TEST ONLY source');
    if (kind === 'pretest') await page.getByLabel('Bab Pretest').selectOption(id(1));
    if (kind === 'drill') await page.getByLabel('Subbab dan level paket').selectOption(id(3));
    await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `TEST ONLY new ${kind}`, exact: true }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/new$/);
  });
}

test('search, filters, pagination and list context survive detail reload and Back', async ({
  page,
}) => {
  await setupAssessments(page);
  await page.goto('/admin/assessments/pretest?status=DRAFT');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(11);
  await page.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await page.getByRole('link', { name: 'Pretest TEST 11', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/pretest/${id(9010)}\\?`));
  await expect(page.getByRole('heading', { name: 'Pretest TEST 11', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: /Kembali ke daftar/ }).click();
  await expect(page).toHaveURL(/status=DRAFT&offset=10/);
  await expect(page.getByRole('link', { name: 'Pretest TEST 11', exact: true })).toBeVisible();
  await page.getByLabel('Cari nama atau kode paket', { exact: true }).fill('TEST-PRE-6');
  await page.getByLabel('Cari nama atau kode paket', { exact: true }).press('Enter');
  await expect(page).not.toHaveURL(/offset=/);
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Pretest TEST 7', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/offset=10/);
  await expect(page.locator('.assessment-directory-filters')).toHaveCount(0);
  await page.goto('/admin/assessments/pretest?status=ARCHIVED');
  await expect(page.getByText(/Belum ada paket yang cocok/)).toBeVisible();
});

test('detail redirects the wrong kind, renames DRAFT, and never fetches a package list', async ({
  page,
}) => {
  const { fixture } = await setupAssessments(page);
  await page.goto(`/admin/assessments/pretest/${id(9100)}?offset=10`);
  await expect(page).toHaveURL(new RegExp(`/tryout/${id(9100)}\\?offset=10`));
  await page.getByRole('button', { name: 'Tindakan lainnya' }).click();
  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Pengaturan paket' })).toBeVisible();
  const nameBounds = await page.getByLabel('Nama paket', { exact: true }).boundingBox();
  const saveBounds = await page
    .getByRole('button', { name: 'Simpan nama', exact: true })
    .boundingBox();
  expect(Math.abs(nameBounds!.y - saveBounds!.y)).toBeLessThan(1);
  expect(Math.abs(nameBounds!.height - saveBounds!.height)).toBeLessThan(1);
  await page.getByLabel('Nama paket', { exact: true }).fill('Renamed TEST');
  await page.getByRole('button', { name: 'Simpan nama', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Renamed TEST', exact: true })).toBeVisible();
  expect(fixture.calls.some((call) => call.path === 'admin/content/packages')).toBe(false);
  expect(fixture.calls.find((call) => call.method === 'PATCH')?.body).toEqual({
    name: 'Renamed TEST',
    expectedRevision: 1,
    questionVersionIds: [],
  });
});

test('a failed create retains fields and Cancel returns to the filtered list', async ({ page }) => {
  const { fixture } = await setupAssessments(page);
  await page.goto('/admin/assessments/tryout/new?search=TEST&offset=10');
  await page.getByLabel('Judul paket').fill('TEST ONLY retained');
  await page.getByLabel('Kode keluarga paket').fill('TEST-RETAIN');
  await page.getByLabel('Kode sumber stabil').fill('TEST_ONLY');
  await page.getByLabel('Nama penyusun / tim / buku').fill('TEST ONLY Curriculum');
  await page.getByLabel('Referensi sumber', { exact: true }).fill('TEST ONLY');
  fixture.status = 503;
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
  await expect(page.locator('.admin-state[role="alert"]')).toContainText(
    'TEST ONLY muat ulang diperlukan.',
  );
  await expect(page.getByLabel('Judul paket')).toHaveValue('TEST ONLY retained');
  fixture.status = 200;
  await page.getByRole('link', { name: 'Batal', exact: true }).click();
  await expect(page).toHaveURL(/tryout\?search=TEST&offset=10/);
});

test('directory handles missing availability and is usable on narrow screens', async ({ page }) => {
  const { fixture, errors } = await setupAssessments(page);
  delete fixture.packs[0]!.availability;
  await page.goto('/admin/assessments/pretest');
  await page.getByRole('link', { name: 'Pretest TEST 1', exact: true }).click();
  await page.getByRole('button', { name: 'Akses siswa', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Ketersediaan untuk siswa' })).toContainText(
    'Ketersediaan belum dapat diperiksa. Muat ulang paket.',
  );
  await page.getByRole('dialog').press('Escape');
  await page.getByRole('link', { name: /Kembali ke daftar/ }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 700 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('link', { name: 'Tambah paket', exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`directory-${width}.png`),
      fullPage: true,
    });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .include('.assessment-directory')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('draft conflict keeps the edited name and a missing package offers retry and Back', async ({
  page,
}) => {
  await setupAssessments(page);
  await page.route(`**/api/v1/admin/content/packages/${id(9000)}`, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 409,
          contentType: 'application/problem+json',
          json: {
            code: 'PACKAGE_REVISION_CONFLICT',
            detail: 'TEST ONLY revisi berubah. Muat ulang paket.',
          },
        })
      : route.fallback(),
  );
  await page.goto(`/admin/assessments/pretest/${id(9000)}`);
  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
  await page.getByLabel('Nama paket', { exact: true }).fill('TEST ONLY unsaved rename');
  await page.getByRole('button', { name: 'Simpan nama', exact: true }).click();
  await expect(page.locator('.admin-state[role="alert"]')).toContainText(
    'TEST ONLY revisi berubah.',
  );
  await expect(page.getByLabel('Nama paket', { exact: true })).toHaveValue(
    'TEST ONLY unsaved rename',
  );
  await page.goto(`/admin/assessments/pretest/${id(99999)}`);
  await expect(page.locator('.admin-state[role="alert"]')).toContainText(
    'TEST ONLY package missing',
  );
  await expect(page.getByRole('button', { name: 'Coba lagi', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Kembali ke daftar/ }).click();
  await expect(page.getByRole('table')).toBeVisible();
});

test('published packages expose archive only inside detail and Pretest has no filter panel', async ({
  page,
}) => {
  const { fixture } = await setupAssessments(page);
  fixture.packs[0]!.status = 'PUBLISHED';
  fixture.packs[0]!.availability = {
    state: 'AVAILABLE',
    blockers: [],
    checkedAt: '2026-11-09T00:00:00Z',
  };
  await page.goto('/admin/assessments/pretest');
  await expect(page.getByRole('button', { name: 'Arsipkan paket', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Pretest TEST 1', exact: true })).toBeVisible();
  await expect(page.locator('.assessment-directory-filters')).toHaveCount(0);
  await page.getByRole('link', { name: 'Pretest TEST 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Simpan nama', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Kelola publikasi', exact: true }).click();
  await page.getByRole('checkbox', { name: /Saya memahami arsip/ }).check();
  await page.getByRole('button', { name: 'Arsipkan paket', exact: true }).click();
  const publication = page.getByRole('dialog', { name: 'Penerbitan paket' });
  await expect(
    publication.getByText('Paket diarsipkan. Histori pengerjaan tetap dipertahankan.'),
  ).toBeVisible();
  await publication.getByRole('button', { name: 'Tutup dialog' }).click();
  await page.getByRole('button', { name: 'Akses siswa', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Paket diarsipkan' })).toBeVisible();
});

test('detail prioritizes questions and keeps release controls usable across viewports', async ({
  page,
}) => {
  const { fixture } = await setupAssessments(page);
  fixture.packs[0]!.readiness = {
    ...fixture.packs[0]!.readiness,
    canPublish: false,
    actualCount: 0,
    blockers: ['COUNT'],
    checks: [{ code: 'COUNT', passed: false, detail: '0/20 soal.' }],
  };
  await page.goto('/admin/assessments/pretest/' + id(9000));
  await expect(page.getByRole('heading', { name: 'Daftar soal', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Belum ada soal', exact: true })).toBeVisible();
  await expect(page.getByLabel('Nama paket', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
  await expect(page.getByLabel('Nama paket', { exact: true })).toBeVisible();
  await page.getByRole('dialog').press('Escape');
  await page.getByRole('button', { name: 'Akses siswa', exact: true }).click();
  await page.getByText('Informasi teknis versi paket', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Ketersediaan untuk siswa' })).toBeVisible();
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByRole('button', { name: 'Akses siswa', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Syarat penerbitan', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Syarat penerbitan paket' })).toBeVisible();
  await expect(page.locator('.assessment-publication-checks > li')).toHaveCount(1);
  await page.getByRole('dialog').press('Escape');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Penerbitan', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Publikasikan paket', exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('heading', { name: 'Lengkapi paket sebelum diterbitkan' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog').getByText('0/20 soal.', { exact: true })).toBeVisible();
    await page.getByRole('dialog').press('Escape');
    await page.screenshot({
      path: test.info().outputPath('detail-' + width + '.png'),
      fullPage: true,
    });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .include('.assessment-detail-workspace')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('all thirty Tryout questions use one view, inline answers and local navigation', async ({
  page,
}) => {
  const { fixture } = await setupAssessments(page);
  const pack = fixture.packs.find((pack) => pack.assessmentType === 'TRYOUT')!;
  await page.route('**/api/v1/admin/content/packages/' + pack.id, (route) =>
    route.fulfill({
      json: {
        ...pack,
        items: Array.from({ length: 30 }, (_, i) => ({
          questionVersionId: id(20000 + i),
          displayOrder: i + 1,
          usageType: 'TRYOUT',
          reviewedAt: null,
          contentStatus: 'DRAFT',
          question: {
            externalId: 'TEST_ONLY_' + (i + 1),
            metadata: { assetManifest: [] },
            stem: { text: 'TEST ONLY: Berapakah 2 + 2?' },
            options: [
              { id: 'A', content: { text: '4' } },
              { id: 'B', content: { text: '5' } },
            ],
            answer: { type: 'SINGLE_CHOICE', optionId: 'A' },
            explanation: { text: 'TEST ONLY: Dua ditambah dua sama dengan empat.' },
          },
        })),
      },
    }),
  );
  await page.goto('/admin/assessments/tryout/' + pack.id);
  await expect(page.locator('.assessment-question-table tbody tr')).toHaveCount(30);
  const tableScroll = page.locator('.assessment-detail-questions > .assessment-table-scroll');
  await expect
    .poll(() => tableScroll.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  const headingTop = await page
    .getByRole('heading', { name: /Daftar soal/ })
    .evaluate((element) => element.getBoundingClientRect().top);
  await tableScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() =>
      page
        .getByRole('heading', { name: /Daftar soal/ })
        .evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBe(headingTop);
  await tableScroll.evaluate((element) => {
    element.scrollTop = 0;
  });
  const search = page.getByRole('searchbox', { name: 'Cari soal berdasarkan teks atau kode' });
  await search.fill('test_only_30');
  await expect(page.locator('.assessment-question-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.assessment-question-table')).toContainText('TEST_ONLY_30');
  await search.fill('berapakah');
  await expect(page.locator('.assessment-question-table tbody tr')).toHaveCount(30);
  await search.fill('kode-tidak-ada');
  await expect(page.locator('.assessment-question-table')).toContainText(
    'Tidak ada soal yang cocok',
  );
  await search.clear();
  const completeness = page.getByRole('combobox', { name: 'Filter kelengkapan soal' });
  await completeness.selectOption('INCOMPLETE');
  await expect(page.locator('.assessment-question-table')).toContainText(
    'Tidak ada soal yang cocok',
  );
  await completeness.selectOption('COMPLETE');
  await expect(page.locator('.assessment-question-table tbody tr')).toHaveCount(30);
  await completeness.selectOption('ALL');
  await page
    .locator('.assessment-question-table tbody tr')
    .nth(29)
    .getByRole('button', { name: 'Metadata', exact: true })
    .click();
  const metadata = page.getByRole('dialog', { name: 'Metadata soal', exact: true });
  await expect(metadata.getByText('TEST_ONLY_30', { exact: true })).toBeVisible();
  await expect(
    metadata.getByRole('heading', { name: 'Materi dan tingkat kesulitan' }),
  ).toBeVisible();
  await expect(metadata.getByText('Belum tercatat').first()).toBeVisible();
  await metadata.getByRole('button', { name: /Tutup/ }).click();
  await expect(page.getByRole('link', { name: 'Impor soal', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Lihat soal', exact: true }).nth(29).click();
  await expect(page.getByRole('button', { name: /Keluarkan soal/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tampilkan gambar soal' })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Edit soal' })).toHaveAttribute(
    'href',
    '/admin/content/versions/' + id(20029) + '/edit?package=' + pack.id,
  );
  const documentRequests: string[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest()) documentRequests.push(request.url());
  });
  const bounds = await page.getByRole('dialog').boundingBox();
  await expect(page.getByRole('navigation', { name: 'Tahap pemeriksaan soal' })).toHaveCount(0);
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Pemeriksaan lulus' }),
  ).toBeDisabled();
  const first = page.getByRole('dialog').locator('.assessment-detail-question-list > li').first();
  await expect(
    page.getByRole('dialog').getByText('Soal 30 dari 30', { exact: true }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Sebelumnya', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('Soal 29 dari 30', { exact: true }),
  ).toBeVisible();
  await expect(first.locator('.assessment-question-answer')).toContainText('Jawaban: A');
  await expect(first.getByRole('heading', { name: 'Pembahasan', exact: true })).toBeVisible();
  expect(documentRequests).toEqual([]);
  expect((await page.getByRole('dialog').boundingBox())!.height).toBe(bounds!.height);
  await page.screenshot({ path: test.info().outputPath('question-detail-desktop.png') });
  await page.getByRole('dialog').press('Escape');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath('questions-' + width + '.png'),
      fullPage: true,
    });
  }
});

test('invalid legacy questions explain repair and cannot be reviewed', async ({ page }) => {
  const { fixture } = await setupAssessments(page);
  const pack = fixture.packs[0]!;
  await page.route('**/api/v1/admin/content/packages/' + pack.id, (route) =>
    route.fulfill({
      json: {
        ...pack,
        legacyPreparation: 'SAME_DRAFT',
        source: null,
        items: [
          {
            questionVersionId: id(21000),
            displayOrder: 1,
            usageType: 'PRETEST',
            contentStatus: 'DRAFT',
            reviewedAt: null,
            question: null,
          },
        ],
      },
    }),
  );
  await page.goto('/admin/assessments/pretest/' + pack.id);
  await expect(page.getByRole('table').getByText('Belum lengkap', { exact: true })).toBeVisible();
  const row = page.getByRole('table').locator('tbody tr').first();
  await expect(row.getByRole('button', { name: 'Tinjau', exact: true })).toHaveCount(0);
  await expect(row.getByRole('link', { name: 'Perbaiki', exact: true })).toHaveAttribute(
    'href',
    '/admin/content/versions/' + id(21000) + '/edit?package=' + pack.id,
  );
  await expect(page.getByRole('columnheader', { name: 'Masalah', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Pengaturan paket' })).toContainText(
    'Sumber belum diisi.',
  );
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByRole('status')).toContainText('Buat versi perbaikan melalui sumber impor');
});

test('navbar breadcrumbs link back to the assessment directory with list context', async ({
  page,
}) => {
  await setupAssessments(page);
  await page.goto('/admin/assessments/pretest/' + id(9000) + '?search=TEST&offset=10');
  await expect(page.getByRole('heading', { name: 'Pretest TEST 1', exact: true })).toBeVisible();
  const nav = page.locator('.admin-navbar-breadcrumb');
  await expect(nav.getByRole('link', { name: 'Ruang admin', exact: true })).toHaveAttribute(
    'href',
    '/admin',
  );
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Detail paket');
  await nav.getByRole('link', { name: 'Pretest', exact: true }).click();
  await expect(page).toHaveURL(/pretest\?search=TEST&offset=10$/);
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Pretest');
});

test('dedicated question editor keeps preview and separates metadata and media', async ({
  page,
}) => {
  const { fixture } = await setupAssessments(page);
  const pack = fixture.packs.find((pack) => pack.assessmentType === 'TRYOUT')!;
  const versionId = id(24000);
  await page.route('**/api/v1/admin/content/versions/' + versionId, (route) =>
    route.fulfill({
      json: {
        id: versionId,
        questionId: id(24001),
        status: 'DRAFT',
        versionNumber: 1,
        sourceNamespace: 'TEST_ONLY',
        payload: {
          externalId: 'TEST_EDITOR',
          type: 'SINGLE_CHOICE',
          stem: { text: 'Berapakah $2 + 2$?' },
          explanation: { text: 'Hasil penjumlahan adalah empat.' },
          options: [
            { id: 'A', content: { text: '4' } },
            { id: 'B', content: { text: '5' } },
          ],
          answer: { optionId: 'A' },
          metadata: { assetManifest: [] },
        },
      },
    }),
  );
  await page.route('**/api/v1/admin/content/versions/' + versionId + '/media-links', (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.goto('/admin/content/versions/' + versionId + '/edit?package=' + pack.id);
  await page.getByRole('textbox', { name: 'Teks soal', exact: true }).fill('Soal baru $2 + 3$');
  await expect(page.locator('.question-editor-preview .katex').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(page.getByLabel('Kode bab', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Media', exact: true }).click();
  await expect(page.getByText('Soal ini belum memiliki media.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Isi soal', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Teks soal', exact: true })).toHaveValue(
    'Soal baru $2 + 3$',
  );
  await expect(page.getByText('Catat keputusan review', { exact: true })).toHaveCount(0);
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 901) {
      await page.getByRole('button', { name: 'Lihat pratinjau', exact: true }).click();
      await expect(page.locator('.question-editor-preview')).toBeVisible();
      await page.getByRole('button', { name: 'Tutup pratinjau', exact: true }).click();
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

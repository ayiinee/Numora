import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setup, id } from './fixtures/admin';
import type { SaveTryoutBatchDto, TryoutBatchDto } from '../src/features/admin/generated-types';

test('Operations can read batches but cannot open management controls (TEST ONLY)', async ({
  page,
}) => {
  const { state } = await setup(page);
  state.adminRole = 'OPERATIONS';
  const batch: TryoutBatchDto = {
    id: id(9400),
    title: 'TEST ONLY operational schedule',
    revision: 1,
    startsAt: '2099-01-01T01:00:00Z',
    closesAt: '2099-01-07T13:00:00Z',
    resultDueAt: '2099-01-10T13:00:00Z',
    state: 'DRAFT',
    editable: true,
    mandiriPackageId: null,
    packages: [],
    schools: [],
    participants: [],
    resultsState: 'BLOCKED',
    resultBlockers: ['MULTI_PACKAGE_FINALIZATION_NOT_READY'],
  };
  await page.route('**/api/v1/admin/tryout-batches**', (route) => {
    expect(route.request().method()).toBe('GET');
    return route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith(batch.id)
        ? batch
        : { items: [batch], total: 1 },
    });
  });
  await page.goto('/admin/tryout-batches');
  await expect(
    page.getByRole('link', { name: 'TEST ONLY operational schedule', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tambah batch', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Kelola', exact: true }).click();
  await expect(page.getByRole('heading', { name: batch.title, exact: true })).toBeVisible();
  for (const name of ['Pengaturan', 'Terbitkan batch', 'Batalkan batch'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await page.goto('/admin/tryout-batches/new');
  await expect(
    page.getByText('Akses pengelolaan konten diperlukan.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Judul batch', { exact: true })).toHaveCount(0);
});

test('batch creation, school delegation and compact detail work across viewports (TEST ONLY)', async ({
  page,
}) => {
  await setup(page);
  const packageInfo = { familyCode: 'TEST', status: 'PUBLISHED', usedBatchCount: 2, valid: true };
  const packages = [
    { ...packageInfo, id: id(9401), name: 'TEST Original', packageVersion: 1 },
    { ...packageInfo, id: id(9402), name: 'TEST Variant', packageVersion: 1 },
  ];
  const schools = [
    { schoolId: id(9501), schoolName: 'TEST School A' },
    { schoolId: id(9502), schoolName: 'TEST School B' },
  ];
  let batch: TryoutBatchDto | null = null;
  await page.route('**/api/v1/admin/tryout-batches**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/options'))
      return route.fulfill({ json: { packages, schools, packageTotal: 2, schoolTotal: 2 } });
    if (req.method() === 'POST' && url.pathname.endsWith('/publish')) {
      batch = { ...batch!, state: 'SCHEDULED', revision: batch!.revision + 1 };
      return route.fulfill({ json: { id: batch.id } });
    }
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      const b = req.postDataJSON() as SaveTryoutBatchDto;
      expect(b.startsAt).toBe('2099-01-01T08:00:00+07:00');
      expect(b.closesAt).toBe('2099-01-07T20:00:00+07:00');
      batch = {
        id: id(9400),
        title: b.title,
        startsAt: b.startsAt,
        closesAt: b.closesAt,
        resultDueAt: new Date(Date.parse(b.closesAt) + 72 * 3600000).toISOString(),
        state: 'DRAFT',
        editable: true,
        revision: 1,
        mandiriPackageId: b.mandiriPackageId ?? null,
        packages: packages.filter((p) => b.packageIds.includes(p.id)),
        schools: b.schools.map((s) => ({
          ...s,
          schoolName: schools.find((k) => k.schoolId === s.schoolId)!.schoolName,
        })),
        participants: [],
        resultsState: 'BLOCKED',
        resultBlockers: ['MULTI_PACKAGE_FINALIZATION_NOT_READY'],
      };
      return route.fulfill({ json: { id: batch.id } });
    }
    return route.fulfill({
      json: url.pathname.endsWith(id(9400))
        ? batch
        : { items: batch ? [batch] : [], total: batch ? 1 : 0 },
    });
  });
  await page.goto('/admin/tryout-batches');
  await page.getByRole('link', { name: 'Tambah batch', exact: true }).click();
  await expect(page.getByLabel('Judul batch', { exact: true })).toHaveCSS(
    'border-top-width',
    '1px',
  );
  await expect(page.getByLabel('Judul batch', { exact: true })).toHaveCSS(
    'border-top-style',
    'solid',
  );
  await expect(page.getByLabel('Judul batch', { exact: true })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Nama dan jadwal', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  // Searching choices must work before required batch fields are filled.
  const schedule = await page
    .getByRole('region', { name: 'Nama dan jadwal', exact: true })
    .boundingBox();
  const packagesPanel = await page
    .getByRole('region', { name: 'Paket soal', exact: true })
    .boundingBox();
  await expect(page.getByRole('region', { name: 'Penerima Tryout', exact: true })).toHaveCount(0);
  expect(packagesPanel!.x).toBeGreaterThan(schedule!.x + schedule!.width);
  expect(packagesPanel!.y).toBe(schedule!.y);
  await page.getByRole('button', { name: 'Pilih paket utama', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Cari paket', exact: true }).fill('TEST');
  const searched = page.waitForRequest(
    (r) =>
      r.url().includes('/tryout-batches/options?') &&
      new URL(r.url()).searchParams.get('search') === 'TEST',
  );
  await page.getByRole('button', { name: 'Cari', exact: true }).click();
  await searched;
  const familyRequest = page.waitForRequest(
    (r) =>
      r.url().includes('/tryout-batches/options?') &&
      new URL(r.url()).searchParams.get('familyCode') === 'TEST',
  );
  for (const [index, p] of packages.entries()) {
    if (index > 0)
      await page.getByRole('button', { name: 'Tambah paket tambahan', exact: true }).click();
    await page
      .locator('.tryout-batch-package-row')
      .filter({ hasText: p.name })
      .getByRole('button', { name: 'Pilih', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await familyRequest;
  const selectedPanel = await page
    .getByRole('region', { name: 'Paket soal', exact: true })
    .boundingBox();
  expect(selectedPanel!.height).toBeCloseTo(schedule!.height, 0);
  await expect(page.getByRole('region', { name: 'Penerima Tryout', exact: true })).toBeVisible();
  await expect(page.getByText(/Sekolah aktif tanpa delegasi memakai paket utama/)).toBeVisible();
  await page.getByLabel('Judul batch', { exact: true }).fill('TEST ONLY Minggu 1');
  await page.getByLabel('Mulai (WIB)', { exact: true }).fill('2099-01-01T08:00');
  await expect(page.getByLabel('Tutup (WIB)', { exact: true })).toHaveValue('2099-01-08T08:00');
  await page.getByLabel('Tutup (WIB)', { exact: true }).fill('2099-01-07T20:00');
  await page
    .getByRole('combobox', { name: 'Paket siswa Mandiri', exact: true })
    .selectOption(packages[0]!.id);
  for (const s of schools)
    await page
      .getByRole('combobox', { name: 'Tambahkan sekolah', exact: true })
      .selectOption(s.schoolId);
  await page
    .getByRole('combobox', { name: 'Paket TEST School B', exact: true })
    .selectOption(packages[1]!.id);
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'TEST ONLY Minggu 1', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'TEST Variant', exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('dialog').press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const violations = await new AxeBuilder({ page })
    .include('.tryout-batch-workspace')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(violations.violations).toEqual([]);
  await page.getByRole('button', { name: 'Terbitkan batch', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, terbitkan batch', exact: true }).click();
  await expect(page.getByText('Terjadwal', { exact: true })).toBeVisible();
  await page.reload();
  await page.goto('/admin/tryout-batches');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('link', { name: 'TEST ONLY Minggu 1', exact: true })).toBeVisible();
});

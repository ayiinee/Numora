import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setup, id } from './fixtures/admin';
import type { SaveTryoutBatchDto, TryoutBatchDto } from '../src/features/admin/generated-types';

test('batch creation, school delegation and compact detail work across viewports (TEST ONLY)', async ({
  page,
}) => {
  await setup(page);
  const packages = [
    { id: id(9401), name: 'TEST Original', packageVersion: 1 },
    { id: id(9402), name: 'TEST Variant', packageVersion: 1 },
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
        resultBlockers: ['IRT_DELIVERY_DISABLED'],
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
  await page.getByLabel('Judul batch', { exact: true }).fill('TEST ONLY Minggu 1');
  await page.getByLabel('Mulai (WIB)', { exact: true }).fill('2099-01-01T08:00');
  await page.getByLabel('Tutup (WIB)', { exact: true }).fill('2099-01-07T20:00');
  for (const p of packages)
    await page.getByRole('combobox', { name: 'Tambahkan paket', exact: true }).selectOption(p.id);
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
  await page.getByRole('button', { name: 'Konfirmasi', exact: true }).click();
  await expect(page.getByText('Terjadwal', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Kembali ke daftar', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('link', { name: 'TEST ONLY Minggu 1', exact: true })).toBeVisible();
});

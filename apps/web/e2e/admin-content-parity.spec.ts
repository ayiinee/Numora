import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupStructures } from './fixtures/admin-structures';
import { id } from './fixtures/admin';
import { setupGenerator } from './fixtures/admin-generator';

test('Content legacy generator JSON entry uses the modern shell on desktop and mobile', async ({
  page,
}) => {
  const { errors } = await setupGenerator(page, 'CONTENT_DATA_MODERATION');
  await page.goto('/admin/content/imports/json');
  await expect(page.getByLabel('File paket JSON')).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Impor soal JSON', exact: true });
  expect((await heading.boundingBox())!.height).toBeGreaterThan(20);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`generator-json-${width}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test('Content structure directory is readable and responsive without exposing management or individuals', async ({
  page,
}) => {
  const { structures, errors } = await setupStructures(page);
  await page.goto('/admin/structures');
  await expect(page.locator('tbody tr')).toHaveCount(5);
  const heading = page.getByRole('heading', { name: 'Sekolah & kelas', exact: true });
  expect((await heading.boundingBox())!.height).toBeGreaterThan(20);
  for (const view of ['schools', 'classes']) {
    if (view === 'classes') await page.getByRole('tab', { name: 'Kelas', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(5);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const input = page.getByRole('searchbox', { name: 'Cari struktur' });
      const clearance = await input.evaluate((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const icon = el.parentElement!.querySelector('svg')!.getBoundingClientRect();
        return (
          rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) - icon.right
        );
      });
      expect(clearance).toBeGreaterThanOrEqual(8);
      if (width >= 1024) {
        const topbar = await page.locator('.app-topbar').boundingBox();
        const brand = await page.locator('.admin-sidebar-heading').boundingBox();
        expect(Math.abs(topbar!.height - brand!.height)).toBeLessThanOrEqual(1);
      }
      await page.screenshot({
        path: test.info().outputPath(`${view}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await expect(page.getByRole('button', { name: /buat|edit|terbitkan|cabut|ban/i })).toHaveCount(0);
  expect(structures.calls.every((c) => c.method === 'GET')).toBe(true);
  expect(errors).toEqual([]);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.admin-structures-shell')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('Content structure search, paging and school drilldown survive history and reload', async ({
  page,
}) => {
  const { structures } = await setupStructures(page);
  await page.goto('/admin/structures');
  const nav = page.getByRole('navigation', { name: 'Halaman struktur' });
  await nav.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page.getByText('Sekolah Fixture 7', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/offset=5/);
  await page.getByRole('searchbox').fill('  SMP-TEST-1  ');
  await page.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  expect(structures.calls.at(-1)!.query).toMatchObject({
    offset: '0',
    limit: '5',
    search: 'SMP-TEST-1',
  });
  await page.getByText('Status lainnya', { exact: false }).click();
  await expect(page.getByText('Kedaluwarsa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Lihat kelas sekolah/ }).click();
  await expect(page.getByText('Kelas IX-1 Fixture', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`schoolId=${id(101)}`));
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Kelas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Kelas dari sekolah terpilih', { exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page.getByText('Kelas IX-6 Fixture', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await nav.getByRole('button', { name: 'Sebelumnya' }).click();
  await expect(page.getByText('Kelas IX-1 Fixture', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hapus filter' }).click();
  await expect(page).not.toHaveURL(/schoolId=/);
  await page.goBack();
  await expect(page.getByText('Kelas dari sekolah terpilih', { exact: true })).toBeVisible();
  expect(structures.calls.every((c) => c.path.startsWith('/api/v1/admin/structures/'))).toBe(true);
});

test('Content structure loading, failure, empty results and keyboard tabs have recovery', async ({
  page,
}) => {
  const { structures } = await setupStructures(page);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/admin/structures/schools?**', async (route) => {
    await hold;
    await route.fallback();
  });
  await page.goto('/admin/structures');
  await expect(page.getByText('Memuat struktur…', { exact: true })).toBeVisible();
  structures.failStatus = 503;
  release();
  await expect(page.locator('.app-content').getByRole('alert')).toContainText(
    'Struktur sementara belum dapat dimuat.',
  );
  structures.failStatus = 0;
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.getByRole('searchbox').fill('tidak-ada');
  await page.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Belum ada struktur sesuai filter.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset filter' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.getByRole('tab', { name: 'Sekolah', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Kelas', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Kelas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

for (const status of [401, 403])
  test(`Content structure denial ${status} clears the loaded directory`, async ({ page }) => {
    const { structures } = await setupStructures(page);
    await page.goto('/admin/structures');
    await expect(page.getByText('SMP Tunas Bangsa', { exact: true })).toBeVisible();
    structures.failStatus = status;
    await page
      .getByRole('button', { name: /Lihat kelas sekolah/ })
      .first()
      .click();
    await expect(page.locator('.app-content').getByRole('alert')).toBeVisible();
    await expect(page.getByText('SMP Tunas Bangsa', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ke halaman masuk' })).toBeVisible();
  });

test('Content structure drops stale results after assignment is removed', async ({ page }) => {
  const { state, structures } = await setupStructures(page);
  await page.goto('/admin/structures');
  await expect(page.locator('tbody tr')).toHaveCount(5);
  state.adminRole = null;
  const previous = structures.calls.length;
  await page.reload();
  await expect(page.locator('.app-content').getByRole('alert')).toContainText(
    'Akses struktur operasional belum tersedia.',
  );
  await expect(page.locator('tbody tr')).toHaveCount(0);
  expect(structures.calls).toHaveLength(previous);
});

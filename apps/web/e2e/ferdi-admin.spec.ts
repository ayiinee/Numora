import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { id, setup } from './fixtures/admin';

for (const width of [320, 390, 768, 1440]) {
  test(`Ferdi importer source and history layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { errors } = await setup(page);
    await page.route('**/api/v1/admin/content/uploads?*', (route) =>
      route.fulfill({ json: { items: [], total: 0 } }),
    );
    await page.goto('/admin/content/imports');
    await expect(page.getByRole('heading', { name: '1. Upload Excel', exact: true })).toBeVisible();
    await expect(page.getByLabel('File soal Excel')).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const out = resolve(`../../.tmp/ferdi-admin/${process.env.NUMORA_FERDI_EVIDENCE ?? 'before'}`);
    await mkdir(out, { recursive: true });
    await page.screenshot({
      path: resolve(out, `import-${width}.png`),
      fullPage: true,
      animations: 'disabled',
      style: 'nextjs-portal {visibility:hidden !important;}',
    });
    await page.getByRole('button', { name: 'Riwayat unggahan', exact: true }).click();
    await expect(page.getByText('Belum ada unggahan yang sesuai filter.')).toBeVisible();
    expect(errors).toEqual([]);
  });
  test(`Ferdi Admin school search, URL recovery and confirmation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state, errors } = await setup(page);
    await page.goto(`/admin/schools?schoolId=${id(101)}`);
    await expect(page.getByLabel('Ubah nama')).toHaveValue(state.schools[0]!.name);
    for (const button of await page.locator('.admin-pagination button').all()) {
      expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    }
    await page.getByLabel('Cari sekolah').fill('no match');
    await page.getByRole('button', { name: 'Cari sekolah', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Belum ada sekolah.' })).toBeVisible();
    await page.getByLabel('Cari sekolah').fill('smp-test-jkt');
    await page.getByRole('button', { name: 'Cari sekolah', exact: true }).click();
    await expect(page.locator('.admin-school-rows > li')).toHaveCount(1);
    await page.getByRole('button', { name: 'Terbitkan token', exact: true }).click();
    await expect(page.getByText('DEMO-ONE-TIME')).toBeVisible();
    const deactivate = page.getByRole('button', { name: 'Nonaktifkan sekolah', exact: true });
    await deactivate.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(deactivate).toBeFocused();
    await deactivate.click();
    await page.getByRole('button', { name: 'Konfirmasi', exact: true }).click();
    await expect(page.getByText('DEMO-ONE-TIME')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Terbitkan token', exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Aktifkan sekolah', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const out = resolve(`../../.tmp/ferdi-admin/${process.env.NUMORA_FERDI_EVIDENCE ?? 'before'}`);
    await mkdir(out, { recursive: true });
    await page.screenshot({
      path: resolve(out, `schools-${width}.png`),
      fullPage: true,
      animations: 'disabled',
      style: 'nextjs-portal {visibility:hidden !important;}',
    });
    expect(errors).toEqual([]);
  });

  test(`Ferdi Admin Content panels and shared dialog at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { errors } = await setup(page);
    await page.goto('/admin/content');
    await expect(page.getByRole('heading', { name: 'Versi soal', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Buat revisi / varian' }).click();
    await page.getByLabel('Teks soal (LaTeX inline diperbolehkan)').fill('TEST unsaved revision');
    await page.getByRole('button', { name: 'Batal revisi', exact: true }).click();
    await page.getByRole('button', { name: 'Arsipkan versi', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Batal', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const out = resolve(`../../.tmp/ferdi-admin/${process.env.NUMORA_FERDI_EVIDENCE ?? 'before'}`);
    await mkdir(out, { recursive: true });
    await page.screenshot({
      path: resolve(out, `content-${width}.png`),
      fullPage: true,
      animations: 'disabled',
      style: 'nextjs-portal {visibility:hidden !important;}',
    });
    expect(errors).toEqual([]);
  });
}

test('Ferdi Operations preserves its URL, filters, selected detail, reload and Back', async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  await page.route(`**/api/v1/admin/classes/${id(700)}`, (route) =>
    route.fulfill({ json: state.classes[0] }),
  );
  await page.goto(`/admin/operations?view=classes&search=TEST&classId=${id(700)}`);
  await expect(page.getByRole('heading', { name: 'Kelas TEST 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tutup detail', exact: true }).click();
  await expect(page).not.toHaveURL(/classId=/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Kelas TEST 1', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Kelas TEST 1', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Ferdi access revocation closes loaded Content before identity recovery', async ({ page }) => {
  const { state, errors } = await setup(page);
  await page.goto('/admin/content');
  await expect(page.getByRole('heading', { name: 'Versi soal', exact: true })).toBeVisible();
  state.failMutation = true;
  state.failStatus = 403;
  await page.getByRole('button', { name: 'Arsipkan versi', exact: true }).click();
  await page.getByRole('button', { name: 'Konfirmasi', exact: true }).click();
  await expect(page.getByText('Akses Admin ditolak.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Versi soal', exact: true })).toHaveCount(0);
  state.adminRole = null;
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.getByText(/Akses memerlukan Super Admin/)).toBeVisible();
  expect(errors).toEqual([]);
});

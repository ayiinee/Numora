import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupImports } from './fixtures/admin-import';

async function screenshot(page: Page, name: string, widths = [1440, 1024, 768, 390, 320]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('*')].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > innerWidth + 1
          ? [
              {
                tag: element.tagName,
                className: element.className,
                right: rect.right,
                width: rect.width,
              },
            ]
          : [];
      }),
    );
    if (overflow.length)
      await test.info().attach(`${name}-${width}-overflow`, {
        body: JSON.stringify(overflow),
        contentType: 'application/json',
      });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`${name}-${width}.png`),
      fullPage: true,
      style:
        'nextjs-portal{visibility:hidden!important}.app-topbar{position:static!important}a[href="#main-content"]{visibility:hidden!important}',
    });
    if (name === 'excel-preview' && [1440, 390].includes(width)) {
      await page
        .locator('.excel-preview-table tbody > tr')
        .first()
        .screenshot({
          path: test.info().outputPath(`question-${width}.png`),
          style: '.app-topbar{visibility:hidden!important}',
        });
    }
  }
}
for (const role of ['SUPER_ADMIN', 'CONTENT_DATA_MODERATION'] as const) {
  test(`Import visual and accessibility audit ${role}`, async ({ page }) => {
    const { imports, errors, generator } = await setupImports(page, role);
    await page.goto('/admin/content/imports');
    await expect(page.getByRole('heading', { name: 'Impor soal', exact: true })).toBeVisible();
    await screenshot(page, 'excel-source');
    expect(
      (
        await new AxeBuilder({ page })
          .include('.admin-import-workspace')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto(`/admin/content/imports?upload=${imports.uploads[0]!.id}`);
    await expect(page.locator('.excel-preview-stem').first()).toBeVisible();
    await screenshot(page, 'excel-preview');
    expect(
      (
        await new AxeBuilder({ page })
          .include('.admin-import-workspace')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto('/admin/content/imports?view=history');
    await expect(page.locator('.upload-history-table tbody tr')).toHaveCount(5);
    await screenshot(page, 'upload-history');
    await page.goto('/admin/content/imports?mode=json');
    await expect(
      page.getByRole('heading', { name: 'File sumber soal', exact: true }),
    ).toBeVisible();
    await screenshot(page, 'json-source');
    await page.goto(`/admin/content/imports?generatorPackage=${generator.items[2]!.id}`);
    await expect(page.locator('.excel-preview-stem')).toBeVisible();
    await screenshot(page, 'generator-preview');
    expect(errors).toEqual([]);
  });
}

test('Import history URL retains filters, pagination, reload and browser Back', async ({
  page,
}) => {
  const { imports } = await setupImports(page);
  await page.goto('/admin/content/imports?view=history');
  const pager = page.getByRole('navigation', { name: 'Halaman riwayat unggahan' });
  await expect(page.locator('.upload-history-table tbody tr')).toHaveCount(5);
  await pager.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(page).toHaveURL(/offset=5/);
  await expect(page.locator('.upload-history-table tbody tr')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.upload-history-table tbody tr')).toHaveCount(2);
  await page
    .getByRole('button', { name: `Lanjutkan ${imports.uploads[5]!.fileName}`, exact: true })
    .click();
  await expect(page.locator('.excel-preview-stem').first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/view=history/);
  await expect(page.locator('.upload-history-table tbody tr')).toHaveCount(2);
  await page.getByText('Filter riwayat', { exact: true }).click();
  await page.getByLabel('Cari file atau judul').fill('IMPORT-7');
  await expect(page).not.toHaveURL(/offset=/);
  await expect(page.locator('.upload-history-table tbody tr')).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel('Cari file atau judul')).toHaveValue('IMPORT-7');
  await expect(page.locator('.upload-history-table tbody tr')).toHaveCount(1);
  expect(imports.calls.filter((call) => call.method !== 'GET')).toEqual([]);
});

test('Import preview shows all statements and keys while selection survives pagination', async ({
  page,
}) => {
  const { imports } = await setupImports(page);
  await page.goto(`/admin/content/imports?upload=${imports.uploads[0]!.id}`);
  await page.setViewportSize({ width: 390, height: 900 });
  const first = page.locator('.excel-preview-table tbody > tr').first();
  await expect(first.locator('.excel-preview-options > li')).toHaveCount(4);
  await expect(first.locator('.excel-preview-options > li').nth(1)).toBeVisible();
  await expect(first.locator('.excel-preview-options .katex-mathml').nth(1)).toContainText('60');
  await expect(first.locator('.excel-answer-options')).toContainText('A');
  await expect(page.locator('.excel-category-keys').first()).toContainText('Salah');
  await page.getByLabel('Pilih soal TEST-IMPORT-1', { exact: true }).uncheck();
  const pager = page.getByRole('navigation', { name: 'Halaman preview soal Excel' });
  await pager.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(page.getByLabel('Pilih soal TEST-IMPORT-6', { exact: true })).toBeVisible();
  await pager.getByRole('button', { name: 'Sebelumnya', exact: true }).click();
  await expect(page.getByLabel('Pilih soal TEST-IMPORT-1', { exact: true })).not.toBeChecked();
  expect(imports.calls.filter((call) => call.method !== 'GET')).toEqual([]);
});

test('Import wizard preserves revision conflicts and draft idempotency before explicit Publish', async ({
  page,
}) => {
  const { imports } = await setupImports(page, 'SUPER_ADMIN', false);
  await page.goto('/admin/content/imports');
  await page.getByLabel('File soal Excel').setInputFiles({
    name: 'TEST.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('TEST ONLY — fixture response, not a parsed workbook'),
  });
  await expect(page.locator('.excel-preview-stem').first()).toBeVisible();
  await page.getByLabel('Judul paket', { exact: true }).fill('Tryout TEST ONLY');
  imports.failPreview = true;
  await page.getByRole('button', { name: 'Lanjutkan ke pemetaan', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Revisi telah berubah' })).toBeVisible();
  await expect(page.getByLabel('Judul paket', { exact: true })).toHaveValue('Tryout TEST ONLY');
  imports.failPreview = false;
  await page.getByRole('button', { name: 'Lanjutkan ke pemetaan', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '3. Pemetaan dan validasi', exact: true }),
  ).toBeVisible();
  await screenshot(page, 'mapping', [1440, 390]);
  imports.failDraft = true;
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Penyimpanan draft belum tersedia' }),
  ).toBeVisible();
  imports.failDraft = false;
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '4. Periksa dan Publish', exact: true }),
  ).toBeVisible();
  const drafts = imports.calls.filter((call) => call.path.endsWith('/draft'));
  expect(drafts).toHaveLength(2);
  expect(drafts[0]!.key).toBeTruthy();
  expect(drafts[1]!.key).toBe(drafts[0]!.key);
  expect(drafts[1]!.body).toEqual(drafts[0]!.body);
  const publish = page.getByRole('button', { name: 'Publish sekarang', exact: true });
  await expect(publish).toBeDisabled();
  await page.getByRole('checkbox', { name: /Saya telah meninjau isi/ }).check();
  await expect(publish).toBeEnabled();
  await screenshot(page, 'draft-publish', [1440, 390]);
  await publish.click();
  await expect(page.getByText('Paket tersimpan dalam riwayat.', { exact: false })).toBeVisible();
  const publishes = imports.calls.filter((call) => call.path.endsWith('/publish'));
  expect(publishes).toHaveLength(1);
  expect(publishes[0]!.body).toMatchObject({ confirmed: true, expectedRevision: 0 });
});

test('Import keeps dirty preview when switching tabs and asks before changing source', async ({
  page,
}) => {
  const { imports } = await setupImports(page);
  await page.goto(`/admin/content/imports?upload=${imports.uploads[0]!.id}`);
  await page.getByLabel('Judul paket', { exact: true }).fill('Perubahan belum disimpan');
  await page.getByRole('button', { name: 'Riwayat unggahan', exact: true }).click();
  await page.getByRole('button', { name: 'Upload Excel', exact: true }).click();
  await expect(page.getByLabel('Judul paket', { exact: true })).toHaveValue(
    'Perubahan belum disimpan',
  );
  await page.getByRole('link', { name: 'Impor JSON', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tinggalkan perubahan preview?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Judul paket', { exact: true })).toHaveValue(
    'Perubahan belum disimpan',
  );
  expect(imports.calls.filter((call) => call.method !== 'GET')).toEqual([]);
});

test('Import recovers a failed session and ignores a late session response after Back', async ({
  page,
}) => {
  const { imports } = await setupImports(page);
  imports.failDetail = true;
  await page.goto(`/admin/content/imports?upload=${imports.uploads[0]!.id}`);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Sesi unggahan belum tersedia' }),
  ).toBeVisible();
  imports.failDetail = false;
  await page.getByRole('button', { name: 'Coba muat sesi', exact: true }).click();
  await expect(page.locator('.excel-preview-stem').first()).toBeVisible();
  await page.goto('/admin/content/imports?view=history');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const target = imports.uploads[1]!;
  await page.route(`**/uploads/${target.id}`, async (route) => {
    await gate;
    await route.fallback();
  });
  const requested = page.waitForRequest((request) =>
    request.url().endsWith(`/uploads/${target.id}`),
  );
  await page.getByRole('button', { name: `Lanjutkan ${target.fileName}`, exact: true }).click();
  await requested;
  await page.goBack();
  await expect(page.locator('.upload-history-table tbody tr')).toHaveCount(5);
  release();
  await expect(page).toHaveURL(/view=history/);
  await expect(page.locator('.excel-preview-stem')).toHaveCount(0);
});

for (const code of [401, 403])
  test(`Import clears cached preview after ${code}`, async ({ page }) => {
    const { imports } = await setupImports(page);
    await page.goto(`/admin/content/imports?upload=${imports.uploads[0]!.id}`);
    await page.getByLabel('Judul paket', { exact: true }).fill('TEST ONLY');
    imports.deny = code;
    await page.getByRole('button', { name: 'Simpan progres preview', exact: true }).click();
    await expect(page.locator('.admin-state[role=alert]')).toContainText('Akses impor dicabut.');
    await expect(page.locator('.excel-preview-stem')).toHaveCount(0);
  });
for (const role of ['OPERATIONS', null] as const)
  test(`Import role boundary ${role ?? 'unassigned'}`, async ({ page }) => {
    const { imports } = await setupImports(page, role);
    await page.goto('/admin/content/imports');
    await expect(page.locator('.admin-state[role=alert]')).toBeVisible();
    expect(imports.calls).toEqual([]);
  });

test('Import distinguishes history failure from an empty filtered result', async ({ page }) => {
  const { imports } = await setupImports(page);
  imports.failHistory = true;
  await page.goto('/admin/content/imports?view=history');
  await expect(page.locator('.admin-state[role=alert]')).toContainText('Riwayat belum tersedia.');
  await expect(
    page.getByText('Belum ada unggahan yang sesuai filter.', { exact: true }),
  ).toHaveCount(0);
  imports.failHistory = false;
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.locator('.upload-history-table tbody tr')).toHaveCount(5);
  await page.getByText('Filter riwayat', { exact: true }).click();
  await page.getByLabel('Cari file atau judul').fill('TIDAK-ADA');
  await expect(
    page.getByText('Belum ada unggahan yang sesuai filter.', { exact: true }),
  ).toBeVisible();
});

test('Import editor and leave confirmation remain reachable on short zoomed screens', async ({
  page,
}) => {
  const { imports } = await setupImports(page);
  await page.goto(`/admin/content/imports?upload=${imports.uploads[0]!.id}`);
  await page.setViewportSize({ width: 390, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
  });
  await page.getByRole('button', { name: 'Edit soal TEST-IMPORT-1', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Teks soal', exact: true })
    .fill('TEST ONLY — koreksi lokal $2+2$.');
  await page.getByRole('button', { name: 'Simpan perubahan preview', exact: true }).click();
  await expect(page.locator('.excel-preview-stem').first()).toContainText('koreksi lokal');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Impor JSON', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tinggalkan perubahan preview?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Kembali mengedit' })).toBeInViewport();
  await expect(
    dialog.getByRole('link', { name: 'Tinggalkan perubahan', exact: true }),
  ).toBeInViewport();
  await dialog.getByRole('link', { name: 'Tinggalkan perubahan', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Tutup dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: 'Impor JSON', exact: true })).toBeFocused();
  expect(imports.calls.filter((call) => call.method !== 'GET')).toEqual([]);
});

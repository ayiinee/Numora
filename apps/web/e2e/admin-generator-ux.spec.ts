import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupGenerator } from './fixtures/admin-generator';
import { id } from './fixtures/admin';

for (const role of ['SUPER_ADMIN', 'CONTENT_DATA_MODERATION'] as const) {
  test(`Generator directory visual audit ${role}`, async ({ page }) => {
    const { errors } = await setupGenerator(page, role);
    await page.goto('/admin/content/generator');
    await expect(page.getByRole('heading', { name: /^Generator paket/ }).first()).toBeVisible();
    await expect(page.locator('.generator-table tbody tr')).toHaveCount(5);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: test.info().outputPath(`generator-directory-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal{visibility:hidden!important}',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include('.admin-generator-workspace')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    const trigger = page.getByRole('button', { name: 'Generate paket', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Buat paket generator', exact: true });
    await expect(dialog.locator('.generator-source-summary dd')).toHaveText(['30', '45']);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: test.info().outputPath(`generator-dialog-${width}.png`),
        fullPage: false,
        style: 'nextjs-portal{visibility:hidden!important}',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include('.generator-dialog')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 568 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = '1.25';
    });
    await page.screenshot({
      path: test.info().outputPath('generator-dialog-short-zoom.png'),
      style: 'nextjs-portal{visibility:hidden!important}',
    });
    const action = await dialog
      .getByRole('button', { name: 'Buat paket', exact: true })
      .boundingBox();
    expect(action).not.toBeNull();
    expect(action!.y + action!.height).toBeLessThanOrEqual(568);
    await dialog.locator('.generator-source-summary').scrollIntoViewIfNeeded();
    await expect(dialog.locator('.generator-source-summary')).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Buat paket generator' })).toBeInViewport();
    await expect(dialog.locator('button[type=submit]')).toBeInViewport();
    await dialog.locator('button[type=submit]').focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Tutup dialog' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('Generator pagination survives detail navigation and reload without generating', async ({
  page,
}) => {
  const { generator } = await setupGenerator(page);
  Object.assign(generator.items[5]!, { status: 'FAILED', failedCount: 1 });
  await page.goto('/admin/content/generator');
  const pager = page.getByRole('navigation', { name: 'Halaman riwayat generator' });
  await pager.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(page).toHaveURL(/offset=5/);
  await expect(page.locator('.generator-table tbody tr')).toHaveCount(2);
  await expect(page.getByText('Menampilkan 6–7 dari 7 paket yang dimuat.')).toBeVisible();
  await page
    .getByRole('button', { name: `Lihat detail ${generator.items[5]!.title}`, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: generator.items[5]!.title, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: generator.items[5]!.title, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Kembali ke riwayat', exact: true }).click();
  await expect(page).toHaveURL(/offset=5/);
  await expect(page.locator('.generator-table tbody tr')).toHaveCount(2);
  expect(generator.requests.filter((request) => request.method === 'POST')).toEqual([]);
});

test('Generator preserves scoped form and idempotency on failure and blocks duplicate submit', async ({
  page,
}) => {
  const { generator } = await setupGenerator(page);
  generator.failMutation = true;
  await page.goto('/admin/content/generator');
  await page.getByRole('button', { name: 'Generate paket', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Buat paket generator' });
  await dialog.getByLabel('Jenis paket').selectOption('DRILL');
  await dialog.getByLabel('Subbab dan level').selectOption(id(8100));
  await dialog.getByLabel('Nama paket').fill('Latihan operasi kelas IX');
  await dialog.getByRole('button', { name: 'Buat paket', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Layanan sementara tidak tersedia.');
  await expect(dialog.getByLabel('Nama paket')).toHaveValue('Latihan operasi kelas IX');
  await expect(dialog.getByLabel('Subbab dan level')).toHaveValue(id(8100));
  generator.failMutation = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/generator\/packages$/, async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.fallback();
  });
  const pending = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/generator/packages'),
  );
  await dialog.getByRole('button', { name: 'Buat paket', exact: true }).click();
  await pending;
  await expect(dialog.locator('button[type=submit]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(
    page.getByRole('heading', { name: 'Latihan operasi kelas IX', exact: true }),
  ).toBeVisible();
  const posts = generator.requests.filter((request) => request.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[0]!.key).toBeTruthy();
  expect(posts[1]!.key).toBe(posts[0]!.key);
  expect(posts[1]!.body).toEqual({
    assessmentType: 'DRILL',
    title: 'Latihan operasi kelas IX',
    scopeId: id(8100),
  });
});

test('Generator uses catalog availability and never creates with insufficient sources', async ({
  page,
}) => {
  const { generator } = await setupGenerator(page);
  await page.goto('/admin/content/generator');
  await page.getByRole('button', { name: 'Generate paket', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Buat paket generator' });
  await dialog.getByLabel('Jenis paket').selectOption('PRETEST');
  await dialog.getByLabel('Bab', { exact: true }).selectOption(id(8200));
  await expect(dialog.locator('.generator-source-summary dd')).toHaveText(['20', '12']);
  await expect(dialog.getByText(/Sumber soal belum cukup/)).toBeVisible();
  await expect(dialog.locator('button[type=submit]')).toBeDisabled();
  expect(generator.requests.filter((request) => request.method === 'POST')).toEqual([]);
});

test('Generator polls active package and hands READY to the existing import preview', async ({
  page,
}) => {
  const { generator } = await setupGenerator(page);
  const pack = generator.items[0]!;
  await page.goto(`/admin/content/generator?package=${pack.id}`);
  await expect(page.getByRole('heading', { name: pack.title, exact: true })).toBeVisible();
  await expect(page.getByText(/Pembuatan soal sedang berjalan/)).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('generator-progress.png'),
    fullPage: true,
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  Object.assign(pack, { status: 'READY', completedCount: pack.expectedCount });
  await expect(page).toHaveURL(new RegExp(`/admin/content/imports\\?generatorPackage=${pack.id}`), {
    timeout: 15000,
  });
  await expect(page.locator('.upload-steps [aria-current="step"]')).toContainText(
    'Preview & tujuan',
  );
  await expect(page.locator('.excel-preview-stem')).toContainText('keempat operasi berikut');
  await page.getByText('Pilihan dan pembahasan', { exact: true }).click();
  await expect(page.locator('.excel-preview-options > li')).toHaveCount(4);
  await expect(
    page.locator('.excel-preview-options > li').nth(1).locator('.katex-mathml'),
  ).toContainText('60');
  expect(generator.requests.filter((request) => request.method === 'POST')).toEqual([]);
});

test('Generator distinguishes failed list, failed catalog and an empty history', async ({
  page,
}) => {
  const { generator } = await setupGenerator(page);
  generator.failList = true;
  await page.goto('/admin/content/generator');
  await expect(page.locator('.admin-state[role=alert]')).toContainText(
    'Layanan sementara tidak tersedia.',
  );
  await expect(page.getByText(/Belum ada paket generator/)).toHaveCount(0);
  generator.failList = false;
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.locator('.generator-table tbody tr')).toHaveCount(5);
  generator.failCatalog = true;
  await page.getByRole('button', { name: 'Generate paket', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Buat paket generator' });
  await expect(dialog.getByRole('alert')).toContainText('Layanan sementara tidak tersedia.');
  generator.failCatalog = false;
  await dialog.getByRole('button', { name: 'Muat ulang sumber' }).click();
  await expect(dialog.getByRole('button', { name: 'Buat paket', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  generator.items = [];
  await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
  await expect(page.getByText(/Belum ada paket generator/)).toBeVisible();
});

for (const target of ['catalog', 'detail'] as const) {
  test(`Generator clears privileged content after access revocation on ${target}`, async ({
    page,
  }) => {
    const { generator } = await setupGenerator(page);
    await page.goto(
      target === 'detail'
        ? `/admin/content/generator?package=${generator.items[0]!.id}`
        : '/admin/content/generator',
    );
    await expect(
      page.locator(target === 'detail' ? '.generator-detail' : '.generator-table'),
    ).toBeVisible();
    generator.denied = true;
    await page
      .getByRole('button', {
        name: target === 'detail' ? 'Perbarui status' : 'Generate paket',
        exact: true,
      })
      .click();
    await expect(page.locator('.admin-state[role=alert]')).toContainText(
      'Akses generator dicabut.',
    );
    await expect(page.locator('.generator-table, .generator-detail')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

for (const role of ['OPERATIONS', null] as const) {
  test(`Generator role boundary ${role ?? 'unassigned'}`, async ({ page }) => {
    const { generator } = await setupGenerator(page, role);
    await page.goto('/admin/content/generator');
    await expect(page.locator('.admin-state[role=alert]')).toBeVisible();
    expect(generator.requests).toEqual([]);
  });
}

test('Generator ignores a late detail response after returning to history', async ({ page }) => {
  const { generator } = await setupGenerator(page);
  const pack = generator.items[1]!;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/generator/packages/${pack.id}`, async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto('/admin/content/generator');
  const pending = page.waitForRequest((request) =>
    request.url().endsWith(`/generator/packages/${pack.id}`),
  );
  await page.getByRole('button', { name: `Lihat detail ${pack.title}`, exact: true }).click();
  await pending;
  await page.getByRole('button', { name: 'Kembali ke riwayat', exact: true }).click();
  await expect(page.locator('.generator-table tbody tr')).toHaveCount(5);
  release();
  await expect(page).not.toHaveURL(/package=/);
  await expect(page.locator('.generator-detail')).toHaveCount(0);
});

test('Generator retry keeps identity and idempotency after a failed request', async ({ page }) => {
  const { generator } = await setupGenerator(page);
  const pack = generator.items[1]!;
  await page.goto(`/admin/content/generator?package=${pack.id}`);
  await expect(page.getByRole('heading', { name: pack.title, exact: true })).toBeVisible();
  generator.failMutation = true;
  await page.getByRole('button', { name: 'Coba generate lagi', exact: true }).click();
  await expect(page.locator('.admin-state[role=alert]')).toContainText(
    'Layanan sementara tidak tersedia.',
  );
  generator.failMutation = false;
  await page.getByRole('button', { name: 'Coba generate lagi', exact: true }).click();
  await expect(page.getByText(/Pembuatan soal sedang berjalan/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coba generate lagi', exact: true })).toHaveCount(
    0,
  );
  const retries = generator.requests.filter((request) => request.method === 'POST');
  expect(retries).toHaveLength(2);
  expect(retries[0]!.path).toBe(`/${pack.id}/retry`);
  expect(retries[0]!.key).toBeTruthy();
  expect(retries[1]!.key).toBe(retries[0]!.key);
  await expect(page).toHaveURL(new RegExp(`package=${pack.id}`));
});

test('Generator waits for a slow poll instead of overlapping status requests', async ({ page }) => {
  const { generator } = await setupGenerator(page);
  const pack = generator.items[0]!;
  await page.goto(`/admin/content/generator?package=${pack.id}`);
  await expect(page.getByRole('heading', { name: pack.title, exact: true })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let pendingCount = 0;
  await page.route(`**/generator/packages/${pack.id}`, async (route) => {
    pendingCount += 1;
    await gate;
    await route.fallback();
  });
  await expect.poll(() => pendingCount).toBe(1);
  // Deliberately cross the 3-second polling interval while the response is held.
  await page.waitForTimeout(3500);
  expect(pendingCount).toBe(1);
  Object.assign(pack, { status: 'READY', completedCount: pack.expectedCount });
  release();
  await expect(page).toHaveURL(new RegExp(`/admin/content/imports\\?generatorPackage=${pack.id}`));
});

test('Generator explains a disabled environment without offering an enabled create action', async ({
  page,
}) => {
  await setupGenerator(page);
  await page.route(/\/generator\/packages(?:\/catalog)?$/, (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'GENERATOR_DISABLED', detail: 'Generator integration disabled' },
    }),
  );
  await page.goto('/admin/content/generator');
  await expect(page.locator('.admin-state[role=alert]')).toContainText(
    'Generator belum diaktifkan pada lingkungan ini.',
  );
  await page.getByRole('button', { name: 'Generate paket', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Buat paket generator' });
  await expect(dialog.getByRole('alert')).toContainText(
    'Generator belum diaktifkan pada lingkungan ini.',
  );
  await expect(dialog.locator('button[type=submit]')).toBeDisabled();
});

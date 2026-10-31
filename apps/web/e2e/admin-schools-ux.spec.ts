import { expect, test } from '@playwright/test';
import { id } from './fixtures/admin';
import { setupSchools } from './fixtures/admin-schools';

for (const role of ['SUPER_ADMIN', 'OPERATIONS'] as const) {
  test(`School search text clears the icon for ${role}`, async ({ page }) => {
    await setupSchools(page, role);
    await page.goto('/admin/schools');
    const search = page.getByRole('searchbox', { name: 'Cari sekolah', exact: true });
    await expect(search).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const text of ['', 'SMP Tunas Bangsa']) {
        await search.fill(text);
        const clearance = await search.evaluate((element) => {
          const input = element as HTMLInputElement;
          const style = getComputedStyle(input);
          const textStart =
            input.getBoundingClientRect().left +
            parseFloat(style.borderLeftWidth) +
            parseFloat(style.paddingLeft);
          const icon = input.parentElement!.querySelector('svg')!.getBoundingClientRect();
          return textStart - icon.right;
        });
        expect(
          clearance,
          `${role} at ${width}px, ${text ? 'filled' : 'placeholder'}`,
        ).toBeGreaterThanOrEqual(8);
      }
    }
  });
}

for (const role of ['SUPER_ADMIN', 'OPERATIONS'] as const) {
  test(`School workspace visual audit for ${role}`, async ({ page }) => {
    const { errors } = await setupSchools(page, role);
    await page.goto('/admin/schools');
    await expect(page.getByRole('heading', { name: 'Sekolah terdaftar' })).toBeVisible();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`schools-list-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal {visibility:hidden !important}',
      });
    }
    await page.getByRole('button', { name: /Kelola SMP Tunas Bangsa/ }).click();
    await expect(page.getByRole('button', { name: 'Terbitkan token', exact: true })).toBeVisible();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`schools-detail-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal {visibility:hidden !important}',
      });
    }
    expect(errors).toEqual([]);
    expect(page.url()).toContain(`schoolId=${id(101)}`);
  });
}

for (const role of ['SUPER_ADMIN', 'OPERATIONS'] as const) {
  test(`School creation, edit and status confirmation for ${role}`, async ({ page }) => {
    const { state, errors } = await setupSchools(page, role);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/schools');
    const trigger = page.getByRole('button', { name: 'Tambah sekolah', exact: true });
    await trigger.click();
    let dialog = page.getByRole('dialog', { name: 'Tambah sekolah' });
    await dialog.getByLabel('Kode sekolah').fill('Test-Ab');
    await dialog.getByLabel('Nama sekolah', { exact: true }).fill(' Sekolah Baru Fixture ');
    await dialog.getByLabel('Alamat sekolah', { exact: false }).fill('Jalan Verifikasi 1');
    state.failMutation = true;
    await dialog.getByRole('button', { name: 'Simpan sekolah' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Permintaan belum berhasil.');
    await expect(dialog.getByLabel('Nama sekolah', { exact: true })).toHaveValue(
      ' Sekolah Baru Fixture ',
    );
    await page.screenshot({
      path: test.info().outputPath('schools-create-error.png'),
      style: 'nextjs-portal {visibility:hidden !important}',
    });
    state.failMutation = false;
    await dialog.getByRole('button', { name: 'Simpan sekolah' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Sekolah Baru Fixture', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('TEST-AB', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit sekolah', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Edit sekolah' });
    await dialog.getByLabel('Ubah nama').fill('Sekolah Direvisi Fixture');
    await dialog.getByLabel('Ubah alamat').fill('Jalan Verifikasi 2');
    const before = state.calls.filter((c) => c.method === 'PATCH').length;
    expect(before).toBe(0);
    await dialog.getByRole('button', { name: 'Simpan perubahan' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Sekolah Direvisi Fixture', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Jalan Verifikasi 2', { exact: true })).toBeVisible();
    const deactivate = page.getByRole('button', { name: 'Nonaktifkan sekolah', exact: true });
    await deactivate.click();
    await page.keyboard.press('Escape');
    await expect(deactivate).toBeFocused();
    expect(state.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    await deactivate.click();
    state.failMutation = true;
    const confirmation = page.getByRole('dialog', { name: 'Nonaktifkan sekolah' });
    await confirmation.getByRole('button', { name: 'Konfirmasi', exact: true }).click();
    await expect(confirmation.getByRole('alert')).toBeVisible();
    state.failMutation = false;
    await confirmation.getByRole('button', { name: 'Konfirmasi', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Terbitkan token', exact: true })).toBeDisabled();
    await expect(page.getByText('Nonaktif', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('school and token pages preserve URL state, browser Back and edit drafts', async ({
  page,
}) => {
  const { state } = await setupSchools(page);
  await page.goto('/admin/schools');
  const schools = page.getByRole('navigation', { name: 'Halaman sekolah' });
  await schools.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page.getByText('SMP Negeri Fixture 7', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/offset=5/);
  await page.getByRole('searchbox', { name: 'Cari sekolah' }).fill('  SMP-TEST-1  ');
  await page.getByRole('button', { name: 'Cari sekolah', exact: true }).click();
  await expect(page.locator('.schools-directory-table tbody tr')).toHaveCount(1);
  await expect(schools.getByText('Halaman 1')).toBeVisible();
  await page.getByRole('button', { name: 'Kelola SMP Tunas Bangsa', exact: true }).click();
  const tokenNav = page.getByRole('navigation', { name: 'Halaman token Guru' });
  await tokenNav.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(tokenNav.getByText('Halaman 2')).toBeVisible();
  await expect(page).toHaveURL(/tokenOffset=5/);
  await page.getByRole('button', { name: 'Edit sekolah', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit sekolah' });
  await dialog.getByLabel('Ubah nama').fill('Draf belum disimpan');
  await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
  await tokenNav.getByRole('button', { name: 'Sebelumnya' }).click();
  await expect(tokenNav.getByText('Halaman 1')).toBeVisible();
  await page.getByRole('button', { name: 'Edit sekolah', exact: true }).click();
  await expect(dialog.getByLabel('Ubah nama')).toHaveValue('Draf belum disimpan');
  await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
  await page.getByRole('button', { name: 'Kembali ke daftar sekolah' }).click();
  await expect(page.getByRole('searchbox', { name: 'Cari sekolah' })).toHaveValue('SMP-TEST-1');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Edit sekolah', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Terbitkan token', exact: true })).toBeVisible();
  expect(state.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
});

test('one-time token copy, reissue and revoke keep secrets out of URL and browser storage', async ({
  page,
}) => {
  const { state, errors } = await setupSchools(page);
  await page.goto(`/admin/schools?schoolId=${id(101)}`);
  state.mutationDelay = 500;
  await page.getByRole('button', { name: 'Terbitkan token', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Terbitkan token', exact: false })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Kembali ke daftar sekolah' })).toBeDisabled();
  const issued = page.getByRole('region', { name: 'Token baru' });
  await expect(issued).toBeVisible();
  const secret = await issued.locator('code').innerText();
  await expect(issued).toBeInViewport();
  await issued.getByRole('button', { name: 'Salin token', exact: true }).click();
  await expect(issued.getByRole('status')).toContainText('Token disalin.');
  expect(
    await page.evaluate(() => (window as unknown as { fixtureClipboard: string }).fixtureClipboard),
  ).toBe(secret);
  expect(page.url()).not.toContain(secret);
  expect(
    await page.evaluate(
      (value) =>
        Object.values(localStorage)
          .concat(Object.values(sessionStorage))
          .some((item) => item.includes(value)),
      secret,
    ),
  ).toBe(false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath('schools-issued-token.png'),
    fullPage: true,
    style: 'nextjs-portal {visibility:hidden !important}',
  });
  await page.getByRole('button', { name: 'Terbit ulang', exact: true }).first().click();
  let dialog = page.getByRole('dialog', { name: 'Terbit ulang token' });
  expect(state.calls.filter((c) => c.path.endsWith('/reissue'))).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Konfirmasi', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(issued.locator('code')).not.toHaveText(secret);
  await page.getByRole('button', { name: 'Cabut', exact: true }).first().click();
  dialog = page.getByRole('dialog', { name: 'Cabut token' });
  await dialog.getByRole('button', { name: 'Konfirmasi', exact: true }).click();
  await expect(issued).toHaveCount(0);
  expect(
    state.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/teacher-tokens')),
  ).toHaveLength(1);
  await page.reload();
  await expect(issued).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('token detail retains audit identifiers and server history without offering consumed-token mutations', async ({
  page,
}) => {
  await setupSchools(page);
  await page.goto(`/admin/schools?schoolId=${id(101)}`);
  await page.getByRole('button', { name: `Detail token ${id(301)}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Detail token Guru' });
  await expect(dialog.getByText(id(301), { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Guru Fixture/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cabut', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: `Detail token ${id(301)}`, exact: true }),
  ).toBeFocused();
  const used = page
    .locator('tr')
    .filter({ has: page.getByRole('button', { name: `Detail token ${id(301)}`, exact: true }) });
  await expect(used.getByRole('button', { name: 'Terbit ulang', exact: true })).toHaveCount(0);
});

test('inactive school blocks issue and reissue while revocation stays available', async ({
  page,
}) => {
  const { state } = await setupSchools(page);
  await page.goto(`/admin/schools?schoolId=${id(102)}`);
  await expect(page.getByRole('button', { name: 'Terbitkan token', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Terbit ulang', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cabut', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Cabut token' })
    .getByRole('button', { name: 'Konfirmasi', exact: true })
    .click();
  await expect(page.getByText('Dicabut', { exact: true })).toBeVisible();
  expect(state.calls.filter((c) => c.path.endsWith('/reissue'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Aktifkan sekolah', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Aktifkan sekolah' })
    .getByRole('button', { name: 'Konfirmasi', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Terbitkan token', exact: true })).toBeEnabled();
});

test('loading, independent failure and empty states provide recovery', async ({ page }) => {
  const { state } = await setupSchools(page);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/v1\/admin\/schools\?/, async (route) => {
    await hold;
    await route.fallback();
  });
  await page.goto('/admin/schools');
  await expect(page.getByRole('status').filter({ hasText: 'Memuat sekolah' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('schools-loading.png'),
    style: 'nextjs-portal {visibility:hidden !important}',
  });
  release();
  await expect(
    page.getByRole('button', { name: 'Kelola SMP Tunas Bangsa', exact: true }),
  ).toBeVisible();
  await page.getByRole('searchbox', { name: 'Cari sekolah' }).fill('unmatched');
  await page.getByRole('button', { name: 'Cari sekolah', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sekolah tidak ditemukan' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset pencarian', exact: true }).click();
  state.failPath = 'teacher-tokens';
  await page.getByRole('button', { name: 'Kelola SMP Tunas Bangsa', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Permintaan belum berhasil.' });
  await expect(alert).toBeVisible();
  await expect(page.getByRole('heading', { name: 'SMP Tunas Bangsa', exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('schools-token-error.png'),
    style: 'nextjs-portal {visibility:hidden !important}',
  });
  state.failPath = '';
  state.tokens[id(101)] = [];
  await alert.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.getByRole('heading', { name: 'Belum ada token.' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('schools-tokens-empty.png'),
    style: 'nextjs-portal {visibility:hidden !important}',
  });
});

for (const status of [401, 403]) {
  test(`server denial ${status} clears modal, cached school and raw token`, async ({ page }) => {
    const { state } = await setupSchools(page);
    await page.goto(`/admin/schools?schoolId=${id(101)}`);
    await page.getByRole('button', { name: 'Terbitkan token', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Token baru' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit sekolah', exact: true }).click();
    state.failMutation = true;
    state.failStatus = status;
    const dialog = page.getByRole('dialog', { name: 'Edit sekolah' });
    await dialog.getByLabel('Ubah nama').fill('Draf rahasia fixture');
    await dialog.getByRole('button', { name: 'Simpan perubahan' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Token baru' })).toHaveCount(0);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Akses sekolah telah dicabut.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit sekolah', exact: true })).toHaveCount(0);
  });
}

for (const role of ['CONTENT_DATA_MODERATION', null] as const) {
  test(`direct school management is denied to ${role}`, async ({ page }) => {
    const { state } = await setupSchools(page, role);
    await page.goto('/admin/schools');
    await expect(page.getByRole('alert').filter({ hasText: /hanya tersedia/ })).toBeVisible();
    expect(state.calls).toHaveLength(0);
  });
}

test('short viewport, keyboard dialog and zoom keep every control reachable', async ({ page }) => {
  await setupSchools(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/admin/schools');
  const trigger = page.getByRole('button', { name: 'Tambah sekolah', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Tambah sekolah' });
  await dialog.getByRole('button', { name: 'Simpan sekolah' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Tutup dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Simpan sekolah' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Simpan sekolah' }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Simpan sekolah' })).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath('schools-dialog-short.png'),
    style: 'nextjs-portal {visibility:hidden !important}',
  });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
  });
  await page.getByRole('button', { name: 'Kelola SMP Tunas Bangsa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Terbitkan token', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

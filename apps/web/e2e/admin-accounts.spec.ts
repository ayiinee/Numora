import { expect, test } from '@playwright/test';
import { setupAccounts } from './fixtures/admin-accounts';

const mutations = (state: Awaited<ReturnType<typeof setupAccounts>>, suffix = '') =>
  state.requests.filter((request) => request.method !== 'GET' && request.path.endsWith(suffix));

test('account directory is readable across desktop, tablet and narrow phones', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setupAccounts(page);
  let release!: () => void;
  const loading = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/v1\/admin\/accounts\?/, async (route) => {
    await loading;
    await route.fallback();
  });
  await page.goto('/admin/accounts');
  await expect(page.getByRole('status').filter({ hasText: 'Memuat akun' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('accounts-loading.png') });
  release();
  await expect(
    page.getByRole('button', { name: 'Kelola akun Super Fixture', exact: true }),
  ).toBeVisible();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Akun Admin', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`accounts-after-${width}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test('invite failure preserves draft and reuses operation key; pending action cannot duplicate', async ({
  page,
}) => {
  const state = await setupAccounts(page);
  state.failInvite = true;
  state.delay = 150;
  await page.goto('/admin/accounts');
  await page.getByRole('button', { name: 'Undang Admin', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Undang Admin' });
  await dialog.getByLabel('Email Admin').fill('invite@example.test');
  await dialog.getByLabel('Nama lengkap').fill('Invite Fixture');
  await dialog.getByRole('button', { name: 'Kirim undangan', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /Kirim undangan/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Pengiriman belum dikonfirmasi');
  await expect(dialog.getByLabel('Nama lengkap')).toHaveValue('Invite Fixture');
  await dialog.getByRole('button', { name: 'Kirim undangan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Undangan', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Invite Fixture', { exact: true })).toBeVisible();
  const calls = mutations(state, '/admin/invitations');
  expect(calls).toHaveLength(2);
  expect(calls[0]!.key).toBeTruthy();
  expect(calls[0]!.key).toBe(calls[1]!.key);
});

test('edit requires explicit save and keeps failed changes available for correction', async ({
  page,
}) => {
  const state = await setupAccounts(page);
  state.failUpdate = true;
  await page.goto('/admin/accounts');
  const trigger = page.getByRole('button', { name: 'Kelola akun Super Fixture', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Kelola akun' });
  await expect(dialog.getByRole('button', { name: 'Simpan perubahan' })).toBeDisabled();
  await dialog.getByLabel('Peran akses').selectOption('OPERATIONS');
  await dialog.getByLabel('Status akun', { exact: true }).selectOption('DISABLED');
  expect(mutations(state)).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Super Admin aktif terakhir');
  await expect(dialog.getByLabel('Peran akses')).toHaveValue('OPERATIONS');
  await expect(dialog.getByLabel('Status akun', { exact: true })).toHaveValue('DISABLED');
  await page.screenshot({
    path: test.info().outputPath('accounts-edit-error.png'),
    fullPage: true,
  });
  state.failUpdate = false;
  await dialog.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(dialog).toHaveCount(0);
  expect(mutations(state).at(-1)!.body).toEqual({ adminRole: 'OPERATIONS', status: 'DISABLED' });
  await expect(
    page.getByRole('status').filter({ hasText: 'Perubahan akses akun tersimpan.' }),
  ).toBeVisible();
});

test('recovery and cancellation require confirmation and preserve safe retry', async ({ page }) => {
  const state = await setupAccounts(page);
  state.failRecovery = true;
  await page.goto('/admin/accounts');
  await page.getByRole('button', { name: 'Pulihkan password Super Fixture', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Pulihkan password' });
  expect(mutations(state)).toHaveLength(0);
  await recovery.getByRole('button', { name: 'Kirim pemulihan', exact: true }).click();
  await expect(recovery.getByRole('alert')).toContainText('Pemulihan belum berhasil');
  await recovery.getByRole('button', { name: 'Kirim pemulihan', exact: true }).click();
  await expect(recovery).toHaveCount(0);
  const recoveries = mutations(state, '/recovery');
  expect(recoveries).toHaveLength(2);
  expect(recoveries[0]!.key).toBe(recoveries[1]!.key);
  await page.getByRole('tab', { name: 'Undangan', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Batalkan undangan Undangan Fixture 2', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Batalkan undangan Undangan Fixture 1', exact: true })
    .click();
  const cancel = page.getByRole('dialog', { name: 'Batalkan undangan' });
  expect(mutations(state, '/cancel')).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(cancel).toHaveCount(0);
  expect(mutations(state, '/cancel')).toHaveLength(0);
  await page
    .getByRole('button', { name: 'Batalkan undangan Undangan Fixture 1', exact: true })
    .click();
  await cancel.getByRole('button', { name: 'Batalkan undangan', exact: true }).click();
  await expect(cancel).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Batalkan undangan Undangan Fixture 1', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Proses ulang undangan Undangan Fixture 0', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Proses ulang undangan Undangan Fixture 0', exact: true }),
  ).toHaveCount(0);
  expect(mutations(state, '/retry')).toHaveLength(1);
});

test('server search and independent pagination use five-item pages', async ({ page }) => {
  const state = await setupAccounts(page);
  await page.goto('/admin/accounts');
  const accounts = page.getByRole('navigation', { name: 'Halaman akun Admin' });
  await accounts.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(accounts.getByText('Halaman 2')).toBeVisible();
  await expect(page.getByText('admin6@example.test', { exact: true })).toBeVisible();
  await accounts.getByRole('button', { name: 'Sebelumnya' }).click();
  await expect(page.getByText('admin0@example.test', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Undangan', exact: true }).click();
  const invites = page.getByRole('navigation', { name: 'Halaman undangan' });
  await invites.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page.getByText('Undangan Fixture 6', { exact: true })).toBeVisible();
  await invites.getByRole('button', { name: 'Sebelumnya' }).click();
  await expect(page.getByText('Undangan Fixture 0', { exact: true })).toBeVisible();
  await invites.getByRole('button', { name: 'Berikutnya' }).click();
  await page.getByRole('searchbox', { name: 'Cari nama atau email' }).fill('  invite3  ');
  await page.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(page.getByText('Undangan Fixture 3', { exact: true })).toBeVisible();
  await expect(invites.getByText('Halaman 1')).toBeVisible();
  const lastQuery = state.requests
    .filter((req) => req.path.endsWith('/admin/invitations') && req.method === 'GET')
    .at(-1)!;
  expect(new URLSearchParams(lastQuery.query).get('search')).toBe('invite3');
  expect(new URLSearchParams(lastQuery.query).get('offset')).toBe('0');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('Undangan Fixture 0', { exact: true })).toBeVisible();
});

test('independent failure, retry and empty states remain useful', async ({ page }) => {
  const state = await setupAccounts(page);
  state.failInvitations = 503;
  await page.goto('/admin/accounts');
  await expect(page.getByText('admin0@example.test', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Undangan/ }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Daftar undangan belum dapat dimuat.' }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('invitations-error.png') });
  state.failInvitations = 0;
  state.invitations = [];
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Belum ada undangan' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('invitations-empty.png') });
  await page.getByRole('tab', { name: 'Akun Admin', exact: true }).click();
  await page.getByRole('searchbox').fill('no-results');
  await page.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tidak ada hasil yang cocok' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset pencarian' }).click();
  await expect(page.getByText('admin0@example.test', { exact: true })).toBeVisible();
});

test('tabs, modal focus, Escape and short viewport work with keyboard', async ({ page }) => {
  await setupAccounts(page);
  await page.setViewportSize({ width: 390, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/admin/accounts');
  const accountsTab = page.getByRole('tab', { name: 'Akun Admin', exact: true });
  await accountsTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Undangan', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(accountsTab).toBeFocused();
  const trigger = page.getByRole('button', { name: 'Undang Admin', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Undang Admin' });
  await dialog.getByRole('button', { name: 'Kirim undangan', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Tutup dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Kirim undangan', exact: true })).toBeFocused();
  await dialog.getByLabel('Nama lengkap').fill('Keyboard Fixture');
  await dialog.getByLabel('Email Admin').fill('keyboard@example.test');
  await dialog
    .getByRole('button', { name: 'Kirim undangan', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole('button', { name: 'Kirim undangan', exact: true }),
  ).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('accounts-invite-short-mobile.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('invitation states and account actions remain readable at 125 percent zoom', async ({
  page,
}) => {
  await setupAccounts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/accounts');
  await page.getByRole('tab', { name: 'Undangan', exact: true }).click();
  await expect(page.getByText('Perlu ditangani', { exact: true })).toBeVisible();
  await expect(page.getByText('Menunggu penerimaan', { exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('invitations-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({ path: test.info().outputPath('invitations-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    document.body.style.zoom = '1.25';
  });
  await page.getByRole('tab', { name: 'Akun Admin', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Kelola akun Super Fixture', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Kelola akun' });
  await dialog.getByLabel('Status akun', { exact: true }).selectOption('DISABLED');
  await dialog.getByRole('button', { name: 'Simpan perubahan' }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Simpan perubahan' })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('account-edit-zoom.png') });
});

for (const role of ['OPERATIONS', 'CONTENT_DATA_MODERATION', null]) {
  test(`assignment ${role} cannot load accounts even with a stale capability`, async ({ page }) => {
    const state = await setupAccounts(page, { role, staleCapability: true });
    await page.goto('/admin/accounts');
    await expect(page.getByText(/Hanya Super Admin/)).toBeVisible();
    expect(state.requests.some((req) => /admin\/(accounts|invitations)/.test(req.path))).toBe(
      false,
    );
  });
}

test('server access denial clears the open dialog and cached account list', async ({ page }) => {
  const state = await setupAccounts(page);
  await page.goto('/admin/accounts');
  await page.getByRole('button', { name: 'Kelola akun Super Fixture', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.route('**/api/v1/admin/accounts/*', (route) =>
    route.fulfill({
      status: 403,
      json: { code: 'FORBIDDEN', detail: 'Akses akun telah dicabut.' },
    }),
  );
  await page.getByLabel('Status akun', { exact: true }).selectOption('DISABLED');
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('admin0@example.test', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Akses akun telah dicabut.' }),
  ).toBeVisible();
  const requests = state.requests.length;
  await expect(page.getByRole('button', { name: 'Undang Admin', exact: true })).toHaveCount(0);
  expect(state.requests.length).toBe(requests);
});

test('expired invite removes secret URL and does not offer password setup', async ({ page }) => {
  await setupAccounts(page);
  await page.goto('/admin/auth/confirm?token_hash=TEST_ONLY_EXPIRED&type=invite');
  await expect(page.getByText(/Tautan telah dipakai/)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/auth\/confirm$/);
  await expect(page.getByLabel('Password baru')).toHaveCount(0);
});

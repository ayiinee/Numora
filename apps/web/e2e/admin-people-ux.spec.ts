import { expect, test } from '@playwright/test';
import { setupPeople } from './fixtures/admin-people';
import { id } from './fixtures/admin';

for (const role of ['SUPER_ADMIN', 'OPERATIONS'] as const) {
  test(`People and classes visual audit ${role}`, async ({ page }) => {
    const { errors } = await setupPeople(page, role);
    for (const view of ['users', 'classes']) {
      await page.goto(`/admin/operations?view=${view}`);
      await expect(
        page.getByRole('heading', {
          name: view === 'users' ? 'Daftar pengguna' : 'Daftar kelas',
          exact: true,
        }),
      ).toBeVisible();
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const input = await page.locator('.people-search input').boundingBox();
        const search = await page.locator('.people-search > button').first().boundingBox();
        const filter = await page.locator('.people-search > button').last().boundingBox();
        expect(Math.abs(search!.y - filter!.y)).toBeLessThan(2);
        if (width >= 768) expect(Math.abs(input!.y - search!.y)).toBeLessThan(2);
        expect(
          await page
            .locator('.people-search input')
            .evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft)),
        ).toBeGreaterThanOrEqual(38);
        await page.screenshot({
          path: test.info().outputPath(`${view}-list-${width}.png`),
          fullPage: true,
          style: 'nextjs-portal{visibility:hidden!important}',
        });
      }
      await page.getByRole('button', { name: 'Lihat detail', exact: true }).first().click();
      await expect(
        page.getByText(view === 'users' ? 'user0@example.test' : 'Anggota kelas', { exact: true }),
      ).toBeVisible();
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: test.info().outputPath(`${view}-detail-${width}.png`),
          fullPage: true,
          style: 'nextjs-portal{visibility:hidden!important}',
        });
      }
    }
    expect(errors).toEqual([]);
  });
}

test('user filters apply trimmed names, role, status and affiliation through the server contract', async ({
  page,
}) => {
  const { state } = await setupPeople(page);
  await page.goto('/admin/operations');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByLabel('Peran', { exact: true }).selectOption('STUDENT');
  await page.getByLabel('Status akun', { exact: true }).selectOption('ACTIVE');
  await page.getByLabel('Afiliasi siswa', { exact: true }).selectOption('SCHOOL');
  await page.getByLabel('Nama pengguna').fill('  Nadia  ');
  await page.getByRole('button', { name: 'Terapkan filter', exact: true }).click();
  await expect(page.getByText('Nadia Siswa Fixture', { exact: true })).toBeVisible();
  await expect(page.locator('.people-users-table tbody tr')).toHaveCount(1);
  const call = state.calls.filter((call) => call.path === 'admin/users').at(-1)!;
  const query = new URLSearchParams(call.query);
  expect(Object.fromEntries(query)).toMatchObject({
    search: 'Nadia',
    role: 'STUDENT',
    status: 'ACTIVE',
    affiliation: 'SCHOOL',
    offset: '0',
    limit: '5',
  });
  await page.getByRole('button', { name: 'Hapus filter', exact: true }).click();
  await expect(page.locator('.people-users-table tbody tr')).toHaveCount(5);
  expect(state.calls.every((call) => call.method === 'GET')).toBe(true);
});

test('school and teacher lookups search by name and only apply after confirmation', async ({
  page,
}) => {
  const { state } = await setupPeople(page);
  await page.goto('/admin/operations?view=classes');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Pilih sekolah', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Pilih sekolah' });
  await dialog.getByRole('searchbox', { name: 'Cari sekolah' }).fill('smp');
  await dialog.getByRole('button', { name: 'Cari', exact: true }).click();
  await dialog.getByRole('button', { name: /SMPN 1 Jakarta/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/schoolId=/);
  await page.getByRole('button', { name: 'Pilih Guru', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Pilih Guru' });
  const teacherPages = dialog.getByRole('navigation', { name: 'Halaman pilihan Guru' });
  await teacherPages.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(teacherPages.getByText('Halaman 2')).toBeVisible();
  await dialog.getByRole('searchbox', { name: 'Cari Guru' }).fill('Raka');
  await dialog.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Raka Guru Fixture', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('teacher-picker.png'),
    fullPage: true,
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  await dialog.getByRole('button', { name: 'Raka Guru Fixture', exact: true }).click();
  await page.getByLabel('Status kelas', { exact: true }).selectOption('active');
  await page.screenshot({
    path: test.info().outputPath('classes-filters.png'),
    fullPage: true,
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  await page.getByRole('button', { name: 'Terapkan filter', exact: true }).click();
  await expect(page.locator('.people-classes-table tbody tr')).toHaveCount(5);
  const call = state.calls.filter((call) => call.path === 'admin/classes').at(-1)!;
  expect(Object.fromEntries(new URLSearchParams(call.query))).toMatchObject({
    schoolId: id(101),
    teacherId: id(201),
    state: 'active',
    offset: '0',
  });
  expect(
    state.calls
      .filter((call) => call.path === 'admin/users')
      .every((call) => new URLSearchParams(call.query).get('role') === 'TEACHER'),
  ).toBe(true);
});

test('server pagination, detail Back and browser history preserve the applied view and filters', async ({
  page,
}) => {
  await setupPeople(page);
  await page.goto('/admin/operations?view=users&role=STUDENT');
  const nav = page.getByRole('navigation', { name: 'Halaman pengguna' });
  await nav.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(nav.getByText('Halaman 2')).toBeVisible();
  await page.getByRole('button', { name: 'Lihat detail', exact: true }).first().click();
  await expect(page.getByRole('region', { name: 'Detail pengguna' })).toBeVisible();
  await expect(page.locator('.people-users-table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tutup detail', exact: true }).click();
  await expect(nav.getByText('Halaman 2')).toBeVisible();
  await page.getByRole('tab', { name: 'Kelas', exact: true }).click();
  await expect(page).toHaveURL(/view=classes/);
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Pengguna', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(nav.getByText('Halaman 2')).toBeVisible();
  await page.reload();
  await expect(nav.getByText('Halaman 2')).toBeVisible();
});

test('membership history pages independently and minimal account details remain read only', async ({
  page,
}) => {
  const { state } = await setupPeople(page);
  await page.goto(`/admin/operations?userId=${id(200)}`);
  await expect(page.getByText('user0@example.test', { exact: true })).toBeVisible();
  const membership = page.getByRole('region', { name: 'Keanggotaan dan verifikasi sekolah' });
  await expect(membership.locator('tbody tr')).toHaveCount(5);
  await membership.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(membership.getByText('Halaman 2')).toBeVisible();
  await expect(page.getByText('user0@example.test', { exact: true })).toBeVisible();
  await page.getByText('Identitas data', { exact: true }).click();
  await expect(page.getByText(id(200), { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /ban|nonaktifkan|simpan perubahan/i })).toHaveCount(
    0,
  );
  expect(state.calls.every((call) => call.method === 'GET')).toBe(true);
});

test('class without an active teacher keeps roster paging, former members and search available', async ({
  page,
}) => {
  const { state } = await setupPeople(page);
  await page.goto(`/admin/operations?view=classes&classId=${id(401)}`);
  await expect(page.getByText('Tanpa Guru aktif', { exact: true })).toBeVisible();
  const roster = page.getByRole('region', { name: 'Anggota kelas' });
  await roster.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(roster.getByText('Halaman 2')).toBeVisible();
  await page.getByLabel('Status keanggotaan').selectOption('former');
  await expect(roster.locator('tbody tr')).toHaveCount(1);
  await expect(roster.getByText('Halaman 1')).toBeVisible();
  await page.getByLabel('Status keanggotaan').selectOption('');
  await page.getByLabel('Cari anggota', { exact: true }).fill('  Nadia  ');
  await page.getByRole('button', { name: 'Cari anggota', exact: true }).click();
  await expect(roster.getByText('Nadia Siswa Fixture', { exact: true })).toBeVisible();
  const call = state.calls.filter((call) => call.path.endsWith('/roster')).at(-1)!;
  expect(new URLSearchParams(call.query).get('search')).toBe('Nadia');
  expect(new URLSearchParams(call.query).get('offset')).toBe('0');
  expect(state.calls.every((call) => call.method === 'GET')).toBe(true);
});

test('list loading, failure, retry and empty results keep clear recovery actions', async ({
  page,
}) => {
  const { state } = await setupPeople(page);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/v1\/admin\/users\?/, async (route) => {
    await waiting;
    await route.fallback();
  });
  await page.goto('/admin/operations');
  await expect(page.getByRole('status').filter({ hasText: 'Memuat pengguna' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('users-loading.png'),
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  state.failPath = 'admin/users';
  release();
  const alert = page.getByRole('alert').filter({ hasText: 'Data sementara belum dapat dimuat.' });
  await expect(alert).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('users-error.png'),
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  state.failPath = '';
  await alert.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.getByText('Nadia Siswa Fixture', { exact: true })).toBeVisible();
  await page.getByLabel('Nama pengguna').fill('unmatched');
  await page.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tidak ada pengguna yang cocok dengan filter.' }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('users-empty.png'),
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  await page.getByRole('button', { name: 'Reset filter', exact: true }).click();
  await expect(page.getByText('Nadia Siswa Fixture', { exact: true })).toBeVisible();
});

test('membership failure does not conceal the loaded account and can retry', async ({ page }) => {
  const { state } = await setupPeople(page);
  state.failPath = 'memberships';
  await page.goto(`/admin/operations?userId=${id(200)}`);
  await expect(page.getByText('user0@example.test', { exact: true })).toBeVisible();
  const membership = page.getByRole('region', { name: 'Keanggotaan dan verifikasi sekolah' });
  await expect(membership.getByRole('alert')).toBeVisible();
  state.failPath = '';
  await membership.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(membership.locator('tbody tr')).toHaveCount(5);
});

for (const target of ['memberships', 'roster'] as const) {
  test(`server denial clears ${target} and every cached individual record`, async ({ page }) => {
    const { state } = await setupPeople(page);
    state.failPath = target;
    state.failStatus = 403;
    await page.goto(
      target === 'memberships'
        ? `/admin/operations?userId=${id(200)}`
        : `/admin/operations?view=classes&classId=${id(400)}`,
    );
    await expect(
      page.getByRole('alert').filter({ hasText: 'Akses data operasional dicabut.' }),
    ).toBeVisible();
    await expect(page.getByText('user0@example.test', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Anggota kelas' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Pengguna', exact: true })).toHaveCount(0);
  });
}

test('a denied school lookup closes the picker and removes the underlying directory', async ({
  page,
}) => {
  await setupPeople(page);
  await page.goto('/admin/operations');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.route('**/api/v1/admin/schools?*', (route) =>
    route.fulfill({ status: 401, json: { detail: 'Sesi operasional berakhir.' } }),
  );
  await page.getByRole('button', { name: 'Pilih sekolah', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Nadia Siswa Fixture', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Sesi operasional berakhir.' }),
  ).toBeVisible();
});

for (const role of ['CONTENT_DATA_MODERATION', null] as const) {
  test(`individual data remains inaccessible for ${role}`, async ({ page }) => {
    const { state } = await setupPeople(page, role);
    await page.goto('/admin/operations');
    await expect(page.getByRole('alert').filter({ hasText: /hanya tersedia/ })).toBeVisible();
    expect(state.calls).toHaveLength(0);
  });
}

test('keyboard tabs, modal focus and zoom remain usable on a short phone viewport', async ({
  page,
}) => {
  await setupPeople(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/admin/operations');
  await page.getByRole('tab', { name: 'Pengguna', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Kelas', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Pilih sekolah', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Pilih sekolah' });
  await expect(dialog).toBeVisible();
  const last = dialog.getByRole('button', { name: 'Berikutnya', exact: true });
  await expect(last).toBeDisabled();
  await dialog.locator('.people-picker-list button').last().focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Tutup dialog' })).toBeFocused();
  await page.screenshot({
    path: test.info().outputPath('school-picker-mobile.png'),
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

import { expect, test, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setup } from './fixtures/admin';
import { setupAssessments } from './fixtures/admin-assessments';

async function expandAll(navigation: Locator) {
  for (const button of await navigation.locator('button[aria-expanded]').all()) {
    if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
  }
}

const primary = '.admin-navigation-group > a, .admin-navigation-branch > button';

test('Admin dropdowns share state across desktop and mobile and preserve independent choices', async ({
  page,
}) => {
  const { errors } = await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/content?view=questions');
  const nav = page.locator('#admin-sidebar nav');
  const bank = nav.getByRole('button', { name: 'Bank konten', exact: true });
  const review = nav.getByRole('button', { name: 'Review & laporan', exact: true });
  await expect(bank).toHaveAttribute('aria-expanded', 'true');
  await expect(review).toHaveAttribute('aria-expanded', 'false');
  await review.focus();
  await page.keyboard.press('Enter');
  await expect(review).toHaveAttribute('aria-expanded', 'true');
  await expect(bank).toHaveAttribute('aria-expanded', 'true');
  await bank.focus();
  await page.keyboard.press('Space');
  await expect(bank).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: 'Soal', exact: true })).toHaveCount(0);
  await expect(review).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(/view=questions$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu navigasi', exact: true }).click();
  const mobile = page.locator('#mobile-menu');
  await expect(mobile.getByRole('button', { name: 'Bank konten', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(
    mobile.getByRole('button', { name: 'Review & laporan', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await mobile.getByRole('button', { name: 'Paket asesmen', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(nav.getByRole('button', { name: 'Paket asesmen', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.reload();
  await expect(bank).toHaveAttribute('aria-expanded', 'true');
  await expect(review).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('button', { name: 'Paket asesmen', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(errors).toEqual([]);
});

test('Admin submenu destinations and retained tabs follow query navigation, Back and reload', async ({
  page,
}) => {
  const { errors } = await setupAssessments(page, 'SUPER_ADMIN');
  // TEST ONLY empty IRT options; this test exercises navigation, not scientific publication.
  await page.route('**/api/v1/admin/irt/options', (route) =>
    route.fulfill({ json: { enabled: false, configurations: [] } }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/content');
  const nav = page.locator('#admin-sidebar nav');
  const destinations = [
    ['Bank konten', 'Soal', '/admin/content?view=questions'],
    ['Bank konten', 'Struktur materi', '/admin/content?view=curriculum'],
    ['Bank konten', 'Video', '/admin/content?view=videos'],
    ['Review & laporan', 'Status review', '/admin/content?view=verification'],
    ['Review & laporan', 'Laporan masalah', '/admin/content?view=reports'],
    ['Review & laporan', 'Riwayat aktivitas', '/admin/content?view=audit'],
    ['Bank konten', 'Tambah konten', '/admin/content/imports'],
    ['Paket asesmen', 'Pretest', '/admin/assessments/pretest'],
    ['Paket asesmen', 'Drill', '/admin/assessments/drill'],
    ['Paket asesmen', 'Tryout', '/admin/assessments/tryout'],
    ['Pengguna & kelas', 'Pengguna', '/admin/operations?view=users'],
    ['Pengguna & kelas', 'Kelas', '/admin/operations?view=classes'],
    ['Hasil Tryout', 'Batch & rilis hasil', '/admin/irt?view=batches'],
    ['Hasil Tryout', 'Proses IRT', '/admin/irt?view=requests'],
    ['Akun Admin', 'Daftar Admin', '/admin/accounts?view=accounts'],
    ['Akun Admin', 'Undangan', '/admin/accounts?view=invitations'],
  ];
  for (const [parent, label, route] of destinations) {
    const button = nav.getByRole('button', { name: parent!, exact: true });
    await expect(button).toBeAttached();
    if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
    await nav.getByRole('link', { name: label!, exact: true }).click();
    await expect(page).toHaveURL(route!);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(label!);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(page.getByRole('tab', { name: 'Undangan', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Daftar undangan', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Akun Admin', exact: true }).click();
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Daftar Admin');
  await page.goBack();
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Undangan');
  await expect(page.getByRole('heading', { name: 'Daftar undangan', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Undangan', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goto('/admin/content?view=questions');
  await page
    .getByRole('navigation', { name: 'Pengelolaan Admin' })
    .getByRole('button', { name: 'Video', exact: true })
    .click();
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Video');
  await page.goBack();
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Soal');
  await expect(page.locator('#content-view-title')).toHaveText('Bank soal');
  await page.goto('/admin/operations?view=users');
  await page.getByRole('tab', { name: 'Kelas', exact: true }).click();
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Kelas');
  await page.goBack();
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Pengguna');
  await page.goto('/admin/irt?view=batches');
  await page
    .getByRole('navigation', { name: 'Bagian IRT' })
    .getByRole('button', { name: 'Request analisis', exact: true })
    .click();
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Proses IRT');
  expect(errors).toEqual([]);
});

test('Admin dropdowns work with blocked storage and disappear when assignment is removed', async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Object.defineProperty(sessionStorage, method, {
        value: () => {
          throw new DOMException('Storage blocked', 'SecurityError');
        },
      });
    }
  });
  await page.goto('/admin/content');
  const nav = page.locator('#admin-sidebar nav');
  const review = nav.getByRole('button', { name: 'Review & laporan', exact: true });
  await review.click();
  await expect(review).toHaveAttribute('aria-expanded', 'true');
  await review.click();
  await expect(review).toHaveAttribute('aria-expanded', 'false');
  state.adminRole = null;
  await page.reload();
  await expect(nav.getByRole('link')).toHaveCount(0);
  await expect(nav.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('Content');
  expect(errors).toEqual([]);
});

for (const [role, width, height, zoom] of [
  ['SUPER_ADMIN', 1280, 480, 1],
  ['SUPER_ADMIN', 1536, 695, 1],
  ['SUPER_ADMIN', 1536, 695, 1.25],
  ['SUPER_ADMIN', 1536, 695, 2],
  ['CONTENT_DATA_MODERATION', 1280, 360, 1],
  ['OPERATIONS', 1280, 240, 1],
] as const) {
  test(`Admin sidebar scroll reaches every menu for ${role} at ${width}x${height} and ${zoom * 100}% zoom`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const { state, errors } = await setup(page);
    state.adminRole = role;
    await page.goto('/admin/schools');
    const sidebar = page.locator('.app-sidebar');
    const navigation = sidebar.getByRole('navigation');
    const links = navigation.locator('a:visible, button:visible');
    await expect(
      sidebar.getByRole('button', {
        name: role === 'OPERATIONS' ? 'Pengguna & kelas' : 'Hasil Tryout',
        exact: true,
      }),
    ).toBeAttached();
    await expandAll(navigation);
    await page.evaluate(
      (value) => document.documentElement.style.setProperty('zoom', String(value)),
      zoom,
    );
    const pageScroll = await page.evaluate(() => window.scrollY);
    if (await navigation.evaluate((element) => element.scrollHeight > element.clientHeight)) {
      await navigation.hover({ position: { x: 80, y: 12 } });
      await page.mouse.wheel(0, 1600);
      await expect
        .poll(() => navigation.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
    const last = links.last();
    await last.scrollIntoViewIfNeeded();
    const insideSidebar = () =>
      last.evaluate((element) => {
        const item = element.getBoundingClientRect();
        const frame = element.closest('.admin-navigation')!.getBoundingClientRect();
        // Chromium rounds native keyboard scroll offsets to whole CSS pixels.
        return item.top >= frame.top - 1 && item.bottom <= frame.bottom + 1;
      });
    await expect.poll(insideSidebar).toBe(true);
    await last.click({ trial: true });
    await navigation.evaluate((element) => element.scrollTo(0, 0));
    await links.first().focus();
    for (let index = 1; index < (await links.count()); index++) await page.keyboard.press('Tab');
    await expect(last).toBeFocused();
    await expect.poll(insideSidebar).toBe(true);
    await expect(sidebar.locator('.app-brand')).toBeVisible();
    await expect(sidebar.locator('.sidebar-account')).toBeVisible();
    expect(
      await sidebar.evaluate(
        (element) => element.getBoundingClientRect().bottom <= innerHeight + 1,
      ),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath('sidebar-scroll.png') });
    expect(errors).toEqual([]);
  });
}

test('Admin mobile menu keeps its last link reachable and restores focus after Escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 360 });
  const { errors } = await setup(page);
  await page.goto('/admin/schools');
  await expect(
    page.locator('.app-sidebar nav button').filter({ hasText: 'Hasil Tryout' }),
  ).toBeAttached();
  const toggle = page.getByRole('button', { name: 'Menu navigasi' });
  await toggle.click();
  const menu = page.locator('#mobile-menu');
  const dialog = page.getByRole('dialog', { name: 'Menu admin' });
  await expect(dialog).toBeVisible();
  await expandAll(menu);
  const last = menu.getByRole('link').last();
  await last.focus();
  await expect(last).toBeFocused();
  await last.click({ trial: true });
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Tutup dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(toggle).toBeFocused();
  expect(errors).toEqual([]);
});

for (const role of ['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'] as const) {
  test(`Admin navigation visual and access audit for ${role}`, async ({ page }) => {
    const { state, errors } = await setup(page);
    state.adminRole = role;
    state.displayName = 'Admin dengan nama lengkap yang cukup panjang untuk audit';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(role === 'CONTENT_DATA_MODERATION' ? '/admin/content' : '/admin/schools');
    const sidebar = page.locator('.app-sidebar');
    await expect(sidebar.locator('.sidebar-account strong')).toHaveText(state.displayName);
    const expected =
      role === 'SUPER_ADMIN'
        ? [
            'Dashboard',
            'Sekolah & verifikasi guru',
            'Pengguna & kelas',
            'Bank konten',
            'Review & laporan',
            'Paket asesmen',
            'Hasil Tryout',
            'Akun Admin',
          ]
        : role === 'OPERATIONS'
          ? ['Dashboard', 'Sekolah & verifikasi guru', 'Pengguna & kelas']
          : [
              'Dashboard',
              'Sekolah & kelas (baca saja)',
              'Bank konten',
              'Review & laporan',
              'Paket asesmen',
              'Hasil Tryout',
            ];
    await expect(sidebar.getByRole('navigation').locator(primary)).toHaveText(expected);
    await expandAll(sidebar.getByRole('navigation'));
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      const frame = await sidebar.boundingBox();
      expect(frame!.width).toBe(248);
      for (const link of await sidebar
        .getByRole('navigation')
        .locator('a:visible, button:visible')
        .all()) {
        await link.click({ trial: true });
        expect(await link.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await link.evaluate((node) => node.getBoundingClientRect().height >= 44)).toBe(true);
      }
      await page.screenshot({
        path: test.info().outputPath(`navigation-${role}-${width}.png`),
        style: 'nextjs-portal{visibility:hidden!important}',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include('.app-sidebar')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    const toggle = page.getByRole('button', { name: 'Menu navigasi' });
    await toggle.click();
    const dialog = page.getByRole('dialog', { name: 'Menu admin' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('navigation').locator(primary)).toHaveText(expected);
    expect(
      (
        await new AxeBuilder({ page })
          .include('.admin-navigation-drawer')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`navigation-${role}-390.png`),
      style: 'nextjs-portal{visibility:hidden!important}',
    });
    await dialog.getByRole('button', { name: 'Tutup dialog' }).click();
    await expect(toggle).toBeFocused();
    await toggle.click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(dialog).toHaveCount(0);
    await expect(sidebar).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const role of ['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'] as const) {
  test(`Admin desktop sidebar closes and reopens for ${role}`, async ({ page }) => {
    const { state, errors } = await setup(page);
    state.adminRole = role;
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(role === 'CONTENT_DATA_MODERATION' ? '/admin/content' : '/admin/schools');
    const sidebar = page.locator('#admin-sidebar');
    const close = page.getByRole('button', { name: 'Tutup sidebar', exact: true });
    const open = page.getByRole('button', { name: 'Buka sidebar', exact: true });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('navigation').getByRole('link').first()).toBeVisible();
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(sidebar).toBeHidden();
    await expect(open).toBeFocused();
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(
      await page.locator('.app-workspace').evaluate((node) => node.getBoundingClientRect().left),
    ).toBe(0);
    await page.screenshot({ path: test.info().outputPath(`sidebar-collapsed-${role}.png`) });
    await page.goto(
      role === 'CONTENT_DATA_MODERATION' ? '/admin/content/pretest' : '/admin/operations',
    );
    await expect(sidebar).toBeHidden();
    await page.reload();
    await expect(sidebar).toBeHidden();
    await open.click();
    await expect(sidebar).toBeVisible();
    await expect(close).toBeFocused();
    await expect(close).toHaveAttribute('aria-expanded', 'true');
    expect(
      await page.locator('.app-workspace').evaluate((node) => node.getBoundingClientRect().left),
    ).toBe(248);
    await close.click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Menu navigasi', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu admin' });
    await expect(drawer.getByRole('link').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(sidebar).toBeHidden();
    await open.click();
    await expect(sidebar).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('Admin drawer works at narrow and landscape sizes and selects the most specific route', async ({
  page,
}) => {
  const { errors } = await setup(page);
  await page.goto('/admin/content/imports');
  const sidebar = page.locator('.app-sidebar');
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(sidebar.locator('[aria-current="page"]')).toHaveText('Tambah konten');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [
    [320, 568],
    [844, 390],
    [768, 700],
    [390, 240],
  ] as const) {
    await page.setViewportSize({ width, height });
    const toggle = page.getByRole('button', { name: 'Menu navigasi' });
    await toggle.click();
    const dialog = page.getByRole('dialog', { name: 'Menu admin' });
    await expandAll(dialog.getByRole('navigation'));
    const last = dialog.getByRole('link').last();
    await last.focus();
    await last.click({ trial: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
  });
  await page.getByRole('button', { name: 'Menu navigasi' }).click();
  const zoomedDialog = page.getByRole('dialog', { name: 'Menu admin' });
  await zoomedDialog.getByRole('link').last().focus();
  await zoomedDialog.getByRole('link').last().click({ trial: true });
  expect(
    await zoomedDialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.bottom <= innerHeight + 1 && bounds.right <= innerWidth + 1;
    }),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1';
  });
  await page.getByRole('button', { name: 'Menu navigasi' }).click();
  await page.locator('#mobile-menu').getByRole('link', { name: 'Pengguna', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/operations\?view=users$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

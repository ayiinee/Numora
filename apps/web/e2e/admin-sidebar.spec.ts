import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setup } from './fixtures/admin';

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
    const links = navigation.getByRole('link');
    await expect(
      sidebar.getByRole('link', {
        name: role === 'OPERATIONS' ? 'Pengguna & kelas' : 'Request IRT & publikasi',
        exact: true,
      }),
    ).toBeAttached();
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
  await expect(page.locator('.app-sidebar nav a[href="/admin/irt"]')).toBeAttached();
  const toggle = page.getByRole('button', { name: 'Menu navigasi' });
  await toggle.click();
  const menu = page.locator('#mobile-menu');
  const dialog = page.getByRole('dialog', { name: 'Menu admin' });
  await expect(dialog).toBeVisible();
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
            'Analytics',
            'Akun Admin',
            'Sekolah & credential',
            'Pengguna & kelas',
            'Konten & assessment',
            'Pretest authoring',
            'Generator paket',
            'Impor soal',
            'Request IRT & publikasi',
          ]
        : role === 'OPERATIONS'
          ? ['Sekolah & credential', 'Pengguna & kelas']
          : [
              'Konten & assessment',
              'Impor soal',
              'Pretest authoring',
              'Generator paket',
              'Request IRT & publikasi',
              'Sekolah & kelas (baca saja)',
            ];
    await expect(sidebar.getByRole('navigation').getByRole('link')).toHaveText(expected);
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      const frame = await sidebar.boundingBox();
      expect(frame!.width).toBe(248);
      for (const link of await sidebar.getByRole('navigation').getByRole('link').all()) {
        await link.click({ trial: true });
        expect(await link.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        if (role === 'SUPER_ADMIN')
          expect(
            await link
              .locator('span')
              .evaluate(
                (node) =>
                  node.getBoundingClientRect().height <=
                  parseFloat(getComputedStyle(node).lineHeight) + 1,
              ),
          ).toBe(true);
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
    await expect(dialog.getByRole('navigation').getByRole('link')).toHaveText(expected);
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
  await expect(sidebar.locator('[aria-current="page"]')).toHaveText('Impor soal');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [
    [320, 568],
    [844, 390],
    [390, 240],
  ] as const) {
    await page.setViewportSize({ width, height });
    const toggle = page.getByRole('button', { name: 'Menu navigasi' });
    await toggle.click();
    const dialog = page.getByRole('dialog', { name: 'Menu admin' });
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
  await page
    .locator('#mobile-menu')
    .getByRole('link', { name: 'Pengguna & kelas', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/operations$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

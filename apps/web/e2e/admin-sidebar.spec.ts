import { expect, test } from '@playwright/test';
import { setup } from './fixtures/admin';

for (const [role, width, height, zoom] of [
  ['SUPER_ADMIN', 1280, 480, 1],
  ['SUPER_ADMIN', 1536, 695, 1],
  ['SUPER_ADMIN', 1536, 695, 1.25],
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
    const links = sidebar.getByRole('link');
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
    expect(await sidebar.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    const pageScroll = await page.evaluate(() => window.scrollY);
    await sidebar.hover({ position: { x: 80, y: 100 } });
    await page.mouse.wheel(0, 1600);
    await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
    const last = links.last();
    const insideSidebar = () =>
      last.evaluate((element) => {
        const item = element.getBoundingClientRect();
        const frame = element.closest('.app-sidebar')!.getBoundingClientRect();
        // Chromium rounds native keyboard scroll offsets to whole CSS pixels.
        return item.top >= frame.top - 1 && item.bottom <= frame.bottom + 1;
      });
    await expect.poll(insideSidebar).toBe(true);
    await last.click({ trial: true });
    await sidebar.evaluate((element) => element.scrollTo(0, 0));
    await links.first().focus();
    for (let index = 1; index < (await links.count()); index++) await page.keyboard.press('Tab');
    await expect(last).toBeFocused();
    await expect.poll(insideSidebar).toBe(true);
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
  const last = menu.getByRole('link').last();
  await last.focus();
  await expect(last).toBeFocused();
  await last.click({ trial: true });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(toggle).toBeFocused();
  expect(errors).toEqual([]);
});

import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupAnalytics } from './fixtures/admin-analytics';
test('Analytics dashboard visual audit', async ({ page }) => {
  const { errors } = await setupAnalytics(page);
  await page.goto('/admin/analytics');
  await expect(page.getByRole('heading', { name: /^Analytics/ })).toBeVisible();
  await expect(page.getByText('Akun siswa aktif', { exact: true })).toBeVisible();
  await expect(page.locator('[data-metric]')).toHaveCount(22);
  const keys = await page
    .locator('[data-metric]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-metric')));
  expect(new Set(keys).size).toBe(22);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: test.info().outputPath(`analytics-${width}.png`),
      fullPage: true,
      style: 'nextjs-portal{visibility:hidden!important}.app-topbar{position:static!important}',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(
    (
      await new AxeBuilder({ page })
        .include('.admin-analytics-workspace')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('Analytics refresh keeps the timestamp and snapshot until a new response is received', async ({
  page,
}) => {
  const { analytics } = await setupAnalytics(page);
  await page.goto('/admin/analytics');
  await expect(page.locator('[data-metric=students]')).toContainText('3.600');
  const initialRequests = analytics.requests.length;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/admin/analytics', async (route) => {
    await gate;
    await route.fallback();
  });
  const requested = page.waitForRequest((request) => request.url().endsWith('/admin/analytics'));
  await page.getByRole('button', { name: 'Perbarui analytics', exact: true }).click();
  await requested;
  await expect(page.getByRole('button', { name: /Perbarui analytics/ })).toBeDisabled();
  await expect(page.locator('[data-metric=students]')).toContainText('3.600');
  await expect(page.locator('.analytics-toolbar time')).toContainText('15.00 WIB');
  analytics.data.metrics.find((metric) => metric.key === 'students')!.value = 4000;
  analytics.data.generatedAt = '2026-10-30T09:00:00Z';
  release();
  await expect(page.locator('[data-metric=students]')).toContainText('4.000');
  await expect(page.locator('.analytics-toolbar time')).toContainText('16.00 WIB');
  expect(analytics.requests).toHaveLength(initialRequests + 1);
  expect(analytics.requests.every((method) => method === 'GET')).toBe(true);
});

test('Analytics labels a retained snapshot on refresh failure and recovers on retry', async ({
  page,
}) => {
  const { analytics } = await setupAnalytics(page);
  await page.goto('/admin/analytics');
  await expect(page.locator('[data-metric=students]')).toContainText('3.600');
  analytics.status = 503;
  await page.getByRole('button', { name: 'Perbarui analytics', exact: true }).click();
  await expect(page.locator('.admin-state[role=alert]')).toContainText(
    'Analytics sementara tidak tersedia.',
  );
  await expect(page.locator('.analytics-stale')).toHaveText('Data sebelumnya');
  await expect(page.locator('[data-metric=students]')).toContainText('3.600');
  await expect(page.locator('.analytics-toolbar time')).toContainText('15.00 WIB');
  analytics.status = 200;
  analytics.data.generatedAt = '2026-10-30T10:00:00Z';
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.locator('.analytics-toolbar time')).toContainText('17.00 WIB');
  await expect(page.locator('.analytics-stale')).toHaveCount(0);
});

test('Analytics distinguishes valid zero, unavailable, empty and a failed initial request', async ({
  page,
}) => {
  const { analytics } = await setupAnalytics(page);
  analytics.status = 503;
  await page.goto('/admin/analytics');
  await expect(page.locator('.admin-state[role=alert]')).toContainText(
    'Analytics sementara tidak tersedia.',
  );
  await expect(page.locator('.analytics-kpis')).toHaveCount(0);
  analytics.status = 200;
  analytics.data.metrics.forEach((metric) => {
    metric.value = 0;
  });
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.locator('[data-metric=students] .analytics-value')).toHaveText('0');
  await expect(
    page.getByText('Belum ada level untuk menghitung cakupan.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.is-unavailable')).toHaveCount(0);
  expect(
    await page
      .locator('.analytics-bar > span')
      .evaluateAll((elements) =>
        elements.every((element) => element.getBoundingClientRect().width === 0),
      ),
  ).toBe(true);
  const metric = analytics.data.metrics.find((metric) => metric.key === 'readyVersions')!;
  metric.value = null;
  metric.unavailableReason = 'QUERY_UNAVAILABLE';
  await page.getByRole('button', { name: 'Perbarui analytics', exact: true }).click();
  await expect(page.locator('[data-metric=readyVersions] .analytics-value')).toHaveText(
    'Tidak tersedia',
  );
  await expect(page.getByText('1 metrik belum tersedia.', { exact: false })).toBeVisible();
  analytics.data.metrics = [];
  await page.getByRole('button', { name: 'Perbarui analytics', exact: true }).click();
  await expect(
    page.getByText('Belum ada metrik analytics yang dikirim oleh sumber data.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.analytics-kpis')).toHaveCount(0);
});

for (const status of [401, 403])
  test(`Analytics discards all cached metrics after ${status}`, async ({ page }) => {
    const { analytics } = await setupAnalytics(page);
    await page.goto('/admin/analytics');
    await expect(page.locator('[data-metric=students]')).toBeVisible();
    analytics.status = status;
    await page.getByRole('button', { name: 'Perbarui analytics', exact: true }).click();
    await expect(page.locator('.admin-state[role=alert]')).toBeVisible();
    await expect(
      page.locator('.analytics-kpis,.analytics-activity,.analytics-attention'),
    ).toHaveCount(0);
  });

for (const role of ['OPERATIONS', 'CONTENT_DATA_MODERATION', null] as const)
  test(`Analytics role boundary ${role ?? 'unassigned'}`, async ({ page }) => {
    const { analytics } = await setupAnalytics(page, role);
    await page.goto('/admin/analytics');
    if (role === 'OPERATIONS') await expect(page).toHaveURL(/\/admin\/schools$/);
    else if (role === 'CONTENT_DATA_MODERATION') await expect(page).toHaveURL(/\/admin\/content$/);
    else await expect(page.locator('.admin-state[role=alert]')).toBeVisible();
    expect(analytics.requests).toEqual([]);
  });

test('Analytics is the first landing and first navigation item for an authorized Super Admin', async ({
  page,
}) => {
  await setupAnalytics(page);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/analytics$/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390)
      await page.getByRole('button', { name: 'Menu navigasi', exact: true }).click();
    const nav =
      width === 390
        ? page.locator('#mobile-menu')
        : page.getByRole('navigation', { name: 'Navigasi Ruang admin', exact: true });
    const first = nav.getByRole('link').first();
    await expect(first).toHaveText('Analytics');
    await expect(first).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Ringkasan', exact: true })).toHaveCount(0);
  }
});

test('Analytics never clamps inconsistent coverage to a reassuring percentage', async ({
  page,
}) => {
  const { analytics } = await setupAnalytics(page);
  analytics.data.metrics.find((metric) => metric.key === 'levelsWithPublishedDrill')!.value = 81;
  analytics.data.metrics.find((metric) => metric.key === 'totalLevels')!.value = 80;
  await page.goto('/admin/analytics');
  const coverage = page.getByRole('region', { name: 'Cakupan paket Drill', exact: true });
  await expect(coverage).toContainText('81');
  await expect(coverage).toContainText('80');
  await expect(coverage).toContainText('Angka cakupan belum konsisten.');
  await expect(coverage.locator('.analytics-coverage-bar')).toHaveCount(0);
});

test('Analytics glossary and links work with keyboard on a short zoomed viewport', async ({
  page,
}) => {
  await setupAnalytics(page);
  await page.goto('/admin/analytics');
  await expect(page.locator('.analytics-definitions')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
  });
  const summary = page.getByText('Cara membaca dashboard', { exact: true });
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.analytics-definitions')).toHaveAttribute('open', '');
  await expect(page.getByText('Nilai nol adalah data yang sah.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Tinjau laporan', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/content\?view=reports$/);
});

test('Analytics keeps large exact counts inside their KPI on narrow layouts', async ({ page }) => {
  const { analytics } = await setupAnalytics(page);
  for (const metric of analytics.data.metrics) metric.value = 2_147_483_647;
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/admin/analytics');
  await expect(page.locator('[data-metric=students] .analytics-value')).toHaveText('2.147.483.647');
  for (const width of [390, 320, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.locator('.analytics-kpi .analytics-value').evaluateAll((values) =>
        values.every((value) => {
          const panel = value.closest('.analytics-kpi')!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(value);
          return [...range.getClientRects()].every(
            (rect) => rect.left >= panel.left && rect.right <= panel.right,
          );
        }),
      ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

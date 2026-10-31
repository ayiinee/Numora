import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { id } from './fixtures/admin';
import { setupIrt } from './fixtures/admin-irt';

test('IRT visual audit', async ({ page }) => {
  const { errors, irt } = await setupIrt(page);
  await page.goto('/admin/irt');
  await expect(
    page.getByRole('heading', { name: 'Request IRT & publikasi', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Tryout Matematika · Pekan 43', { exact: true }).first(),
  ).toBeVisible();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: test.info().outputPath(`irt-${width}.png`),
      fullPage: true,
      style: 'nextjs-portal{visibility:hidden!important}.app-topbar{position:static!important}',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(irt.posts).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.admin-irt-workspace')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

async function chooseConfiguration(page: Page) {
  await page.getByLabel('Konteks batch', { exact: true }).selectOption(id(300));
  await page.getByLabel('Model IRT', { exact: true }).selectOption(id(700));
  await page.getByLabel('Quality gate', { exact: true }).selectOption(id(701));
}
test('IRT request directory, detail and technical evidence remain readable and accessible', async ({
  page,
}) => {
  const { errors, irt } = await setupIrt(page);
  await page.goto('/admin/irt?view=requests');
  await expect(page.locator('[data-request]')).toHaveCount(5);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: test.info().outputPath(`requests-${width}.png`),
      fullPage: true,
      style: 'nextjs-portal{visibility:hidden!important}.app-topbar{position:static!important}',
    });
  }
  await page.getByRole('button', { name: `Detail request ${id(401)}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Detail request', exact: true })).toBeVisible();
  await expect(page.getByText('Keputusan ilmiah: PASS', { exact: true })).toBeVisible();
  await expect(page.locator('.irt-states')).toContainText('Belum diadopsi');
  await page.getByText('Pin konfigurasi & identitas teknis', { exact: true }).click();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: test.info().outputPath(`detail-${width}.png`),
      fullPage: true,
      style: 'nextjs-portal{visibility:hidden!important}.app-topbar{position:static!important}',
    });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .include('.admin-irt-workspace')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(irt.posts).toEqual([]);
  expect(errors).toEqual([]);
});
test('IRT preserves independent pagination, selected request and browser history in the URL', async ({
  page,
}) => {
  const { irt } = await setupIrt(page);
  await page.goto('/admin/irt');
  await expect(page.locator('[data-batch]')).toHaveCount(5);
  await page
    .getByRole('navigation', { name: 'Halaman batch' })
    .getByRole('button', { name: 'Berikutnya' })
    .click();
  await expect(page.locator('[data-batch]')).toHaveCount(2);
  await expect(page).toHaveURL(/batchesOffset=5/);
  await page.getByRole('button', { name: 'Request analisis', exact: true }).click();
  await expect(page.locator('[data-request]')).toHaveCount(5);
  await page
    .getByRole('navigation', { name: 'Halaman request' })
    .getByRole('button', { name: 'Berikutnya' })
    .click();
  await expect(page.locator('[data-request]')).toHaveCount(2);
  await page.getByRole('button', { name: `Detail request ${id(406)}`, exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Detail request', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kembali ke daftar request', exact: true }).click();
  await expect(page.locator('[data-request]')).toHaveCount(2);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Detail request', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lihat batch & publikasi', exact: true }).click();
  await expect(page.locator('[data-batch]')).toHaveCount(2);
  expect(irt.gets).toContain('requests?limit=6&offset=5');
  expect(irt.gets).toContain('batch-health?limit=6&offset=5');
  expect(irt.posts).toEqual([]);
});
test('IRT prepare preserves choices, scope and the operation key after a transport failure', async ({
  page,
}) => {
  const { irt } = await setupIrt(page);
  irt.options.configurations.push({
    ...irt.options.configurations[0]!,
    approvalId: id(702),
    code: 'OTHER_CONTEXT',
    contextId: id(999),
  });
  await page.goto('/admin/irt');
  const trigger = page.getByRole('button', { name: 'Siapkan request', exact: true });
  await trigger.click();
  await chooseConfiguration(page);
  await expect(page.getByLabel('Model IRT', { exact: true }).locator('option')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByLabel('Model IRT', { exact: true })).toHaveValue(id(700));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('prepare-390.png'), fullPage: false });
  irt.mutationStatus = 503;
  await page.getByRole('button', { name: 'Siapkan request IRT', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'TEST tindakan belum dapat diselesaikan.',
  );
  await expect(page.getByLabel('Quality gate', { exact: true })).toHaveValue(id(701));
  irt.mutationStatus = 200;
  await page.getByRole('button', { name: 'Siapkan request IRT', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Detail request', exact: true })).toBeVisible();
  expect(irt.posts).toHaveLength(2);
  expect(irt.posts[0]!.key).toBeTruthy();
  expect(irt.posts[0]!.key).toBe(irt.posts[1]!.key);
  expect(irt.posts[1]!.body).toEqual({
    contextId: id(300),
    configurationPins: [
      { approvalId: id(700), digest: 'TEST-model' },
      { approvalId: id(701), digest: 'TEST-quality' },
    ],
  });
});
test('IRT retry requires confirmation and preserves its operation key and immutable snapshot', async ({
  page,
}) => {
  const { irt } = await setupIrt(page);
  await page.goto(`/admin/irt?view=requests&requestId=${id(400)}`);
  await page.getByRole('button', { name: 'Kirim ulang request', exact: true }).click();
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  expect(irt.posts).toEqual([]);
  await page.getByRole('button', { name: 'Kirim ulang request', exact: true }).click();
  irt.mutationStatus = 503;
  await page.getByRole('button', { name: 'Konfirmasi kirim ulang', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'TEST tindakan belum dapat diselesaikan.',
  );
  irt.mutationStatus = 200;
  await page.getByRole('button', { name: 'Konfirmasi kirim ulang', exact: true }).click();
  await expect(page.locator('.irt-states')).toContainText('Menunggu');
  expect(irt.posts.map((post) => post.path)).toEqual([
    `requests/${id(400)}/retry`,
    `requests/${id(400)}/retry`,
  ]);
  expect(irt.posts[0]!.key).toBe(irt.posts[1]!.key);
  expect(irt.requests[0]!.snapshotDigest).toBe('TEST-snapshot-' + 'b'.repeat(64));
  await expect(page.getByRole('button', { name: 'Adopsi evidence', exact: true })).toBeDisabled();
});
test('IRT adoption is confirmed once while pending and never publishes the participant result', async ({
  page,
}) => {
  const { irt } = await setupIrt(page);
  await page.goto(`/admin/irt?view=requests&requestId=${id(401)}`);
  await page.getByRole('button', { name: 'Adopsi evidence', exact: true }).click();
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  expect(irt.posts).toEqual([]);
  await page.getByRole('button', { name: 'Adopsi evidence', exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route('**/admin/irt/requests/*/adopt', async (route) => {
    entered();
    await gate;
    await route.fallback();
  });
  await page.getByRole('button', { name: 'Konfirmasi adopsi', exact: true }).click();
  await started;
  await expect(
    page.getByRole('dialog').getByRole('button', { name: /^Konfirmasi adopsi/ }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Adopsi evidence ilmiah?' })).toBeVisible();
  release();
  await expect(page.locator('.irt-states')).toContainText('Sudah diadopsi');
  await expect(page.getByRole('button', { name: 'Adopsi evidence', exact: true })).toBeDisabled();
  expect(irt.posts).toHaveLength(1);
  expect(irt.posts[0]!.path).toBe(`requests/${id(401)}/adopt`);
  expect(irt.batches[1]!.publishedAt).toBeNull();
  await page.getByRole('button', { name: 'Lihat batch & publikasi', exact: true }).click();
  await expect(page.locator(`[data-batch="${id(101)}"]`)).toContainText('Belum dipublikasikan');
});
test('IRT disabled environment keeps history visible and blocks prepare, retry and adoption', async ({
  page,
}) => {
  const { irt } = await setupIrt(page);
  irt.options.enabled = false;
  await page.goto('/admin/irt');
  await expect(page.getByRole('button', { name: 'Siapkan request', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Analisis IRT belum diaktifkan');
  await page.getByRole('button', { name: 'Request analisis', exact: true }).click();
  await page.getByRole('button', { name: `Detail request ${id(400)}`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Kirim ulang request', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Adopsi evidence', exact: true })).toBeDisabled();
  expect(irt.posts).toEqual([]);
});
test('IRT independent loader failures do not hide healthy history and can be retried', async ({
  page,
}) => {
  const { irt } = await setupIrt(page);
  irt.optionsStatus = 503;
  irt.requestsStatus = 503;
  await page.goto('/admin/irt');
  await expect(page.locator('[data-batch]')).toHaveCount(5);
  await page.getByRole('button', { name: 'Request analisis', exact: true }).click();
  await expect(page.locator('[data-request]')).toHaveCount(0);
  irt.requestsStatus = 200;
  await page.getByRole('button', { name: 'Perbarui request', exact: true }).click();
  await expect(page.locator('[data-request]')).toHaveCount(5);
  await page.getByRole('button', { name: `Detail request ${id(400)}`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Kirim ulang request', exact: true }),
  ).toBeEnabled();
  irt.batchesStatus = 503;
  await page.getByRole('button', { name: 'Lihat batch & publikasi', exact: true }).click();
  await page.getByRole('button', { name: 'Perbarui batch', exact: true }).click();
  await expect(page.locator('[data-batch]')).toHaveCount(0);
  irt.batchesStatus = 200;
  await page.getByRole('button', { name: 'Perbarui batch', exact: true }).click();
  await expect(page.locator('[data-batch]')).toHaveCount(5);
});
for (const reader of ['requests', 'batches', 'options', 'detail'] as const)
  test(`IRT clears all data and actions after ${reader} access is revoked`, async ({ page }) => {
    const { irt } = await setupIrt(page);
    await page.goto(`/admin/irt?view=requests&requestId=${id(400)}`);
    await expect(page.locator('.irt-states')).toBeVisible();
    if (reader === 'requests') {
      irt.requestsStatus = 403;
      await page.getByRole('button', { name: 'Kembali ke daftar request', exact: true }).click();
      await page.getByRole('button', { name: 'Perbarui request', exact: true }).click();
    }
    if (reader === 'batches') {
      irt.batchesStatus = 401;
      await page.getByRole('button', { name: 'Lihat batch & publikasi', exact: true }).click();
      await page.getByRole('button', { name: 'Perbarui batch', exact: true }).click();
    }
    if (reader === 'options') {
      irt.optionsStatus = 403;
      await page.reload();
    }
    if (reader === 'detail') {
      irt.detailStatus = 403;
      await page.getByRole('button', { name: 'Perbarui detail', exact: true }).click();
    }
    await expect(page.locator('.admin-state[role=alert]')).toContainText(
      'Akses IRT telah berubah.',
    );
    await expect(page.locator('.admin-irt-workspace')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(irt.posts).toEqual([]);
  });
for (const role of ['OPERATIONS', null] as const)
  test(`IRT rejects the ${role ?? 'unassigned'} portal without reading queues`, async ({
    page,
  }) => {
    const { irt } = await setupIrt(page, role);
    await page.goto(`/admin/irt?view=requests&requestId=${id(401)}`);
    await expect(page.getByText('Akses Content diperlukan.', { exact: true })).toBeVisible();
    expect(irt.gets).toEqual([]);
    expect(irt.posts).toEqual([]);
  });
test('IRT keeps unknown blockers and long metadata readable without implying release readiness', async ({
  page,
}) => {
  const { irt } = await setupIrt(page);
  const code = 'TEST_UNKNOWN_' + 'x'.repeat(100);
  irt.batches[0]!.prepareBlockers = [code];
  irt.batches[0]!.publicationBlockers = [code];
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/admin/irt');
  const batch = page.locator(`[data-batch="${id(100)}"]`);
  await expect(batch.getByRole('button', { name: 'Siapkan analisis', exact: true })).toBeDisabled();
  await batch.getByText('Rincian kesiapan', { exact: false }).click();
  await expect(batch).toContainText(code);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: /publikasikan|rilis paksa/i })).toHaveCount(0);
});
test('IRT empty, ineligible and missing approval states explain why prepare is unavailable', async ({
  page,
}) => {
  const { irt } = await setupIrt(page);
  for (const batch of irt.batches) batch.prepareBlockers = ['CONFIGURATION_APPROVALS_MISSING'];
  await page.goto('/admin/irt');
  await page.getByRole('button', { name: 'Siapkan request', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Belum ada batch siap diproses pada halaman ini.',
  );
  await expect(
    page.getByRole('button', { name: 'Siapkan request IRT', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  irt.batches[0]!.prepareBlockers = [];
  irt.options.configurations.splice(0);
  await page.reload();
  await page.getByRole('button', { name: 'Siapkan request', exact: true }).click();
  await page.getByLabel('Konteks batch', { exact: true }).selectOption(id(300));
  await expect(page.getByRole('dialog')).toContainText('Belum ada versi yang sesuai.');
  await expect(
    page.getByRole('button', { name: 'Siapkan request IRT', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  irt.requests.splice(0);
  irt.batches.splice(0);
  await page.reload();
  await expect(page.getByText('Belum ada batch pada halaman ini.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Request analisis', exact: true }).click();
  await expect(
    page.getByText('Belum ada request pada halaman ini.', { exact: true }),
  ).toBeVisible();
  expect(irt.posts).toEqual([]);
});
test('IRT modal keyboard, short viewport and zoom preserve focus and all controls', async ({
  page,
}) => {
  await setupIrt(page);
  await page.setViewportSize({ width: 390, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/admin/irt');
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
  });
  const trigger = page.getByRole('button', { name: 'Siapkan request', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Siapkan request IRT', exact: true });
  await expect(dialog).toBeVisible();
  await chooseConfiguration(page);
  const submit = dialog.getByRole('button', { name: 'Siapkan request IRT', exact: true });
  await submit.focus();
  await expect(submit).toBeInViewport();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Tutup dialog', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

for (const action of ['prepare', 'retry', 'adopt'] as const)
  test(`IRT removes the workspace when ${action} is denied by the server`, async ({ page }) => {
    const { irt } = await setupIrt(page);
    irt.mutationStatus = 403;
    if (action === 'prepare') {
      await page.goto('/admin/irt');
      await page.getByRole('button', { name: 'Siapkan request', exact: true }).click();
      await chooseConfiguration(page);
      await page.getByRole('button', { name: 'Siapkan request IRT', exact: true }).click();
    } else {
      await page.goto(`/admin/irt?view=requests&requestId=${id(action === 'retry' ? 400 : 401)}`);
      await page
        .getByRole('button', {
          name: action === 'retry' ? 'Kirim ulang request' : 'Adopsi evidence',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: action === 'retry' ? 'Konfirmasi kirim ulang' : 'Konfirmasi adopsi',
          exact: true,
        })
        .click();
    }
    await expect(page.locator('.admin-state[role=alert]')).toContainText(
      'Akses IRT telah berubah.',
    );
    await expect(page.locator('.admin-irt-workspace')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(irt.posts).toHaveLength(1);
  });

test('IRT terminal requests and failed adoption are not presented as actionable or published', async ({
  page,
}) => {
  const { irt } = await setupIrt(page);
  irt.requests[1]!.status = 'CANCELLED';
  await page.goto(`/admin/irt?view=requests&requestId=${id(401)}`);
  await expect(page.getByRole('button', { name: 'Adopsi evidence', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Kirim ulang request', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('.irt-next-action')).toContainText('Request dibatalkan.');
  irt.requests[1]!.status = 'FAILED';
  await page.getByRole('button', { name: 'Perbarui detail', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adopsi evidence', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Kirim ulang request', exact: true }),
  ).toBeEnabled();
  irt.requests[1]!.status = 'COMPLETED';
  await page.getByRole('button', { name: 'Perbarui detail', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Kirim ulang request', exact: true }),
  ).toBeDisabled();
  expect(irt.posts).toEqual([]);
  expect(irt.batches[1]!.publishedAt).toBeNull();
});

test('IRT Super Admin can read both workspaces while retaining Analytics as the first menu', async ({
  page,
}) => {
  const { irt } = await setupIrt(page, 'SUPER_ADMIN');
  await page.goto('/admin/irt');
  await expect(page.locator('[data-batch]')).toHaveCount(5);
  await expect(
    page
      .getByRole('navigation', { name: 'Navigasi Ruang admin', exact: true })
      .getByRole('link')
      .first(),
  ).toHaveText('Analytics');
  await page.getByRole('button', { name: 'Request analisis', exact: true }).click();
  await page.getByRole('button', { name: `Detail request ${id(400)}`, exact: true }).click();
  await expect(page.locator('.irt-states')).toContainText('Gagal');
  expect(irt.posts).toEqual([]);
});

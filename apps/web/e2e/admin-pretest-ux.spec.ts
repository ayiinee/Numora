import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupAssessments } from './fixtures/admin-assessments';
import { id } from './fixtures/admin';

for (const role of ['SUPER_ADMIN', 'CONTENT_DATA_MODERATION'] as const)
  test(`Canonical Pretest workspace, review, publication and responsive access for ${role}`, async ({
    page,
  }) => {
    const { fixture, errors } = await setupAssessments(page, role);
    await page.goto(`/admin/content/pretest?packageId=${id(9000)}&status=DRAFT&offset=0`);
    await expect(page).toHaveURL(new RegExp(`/admin/assessments/pretest/${id(9000)}`));
    await expect(page.locator('.assessment-page-heading,.admin-breadcrumb')).toHaveCount(0);
    expect(fixture.calls.some((call) => call.path === 'admin/content/packages')).toBe(false);
    await page.getByRole('button', { name: 'Penerbitan', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Publikasikan paket', exact: true }),
    ).toBeDisabled();
    await page.getByText('1. Simpan persetujuan tim kurikulum', { exact: true }).click();
    await page.getByLabel('Bukti persetujuan tim kurikulum').fill('TEST ONLY reviewed source');
    await page.getByRole('checkbox', { name: /Susunan paket/ }).check();
    await page.getByRole('button', { name: 'Simpan persetujuan' }).click();
    await page.getByRole('checkbox', { name: /Saya telah memeriksa paket/ }).check();
    await page.getByRole('button', { name: 'Publikasikan paket', exact: true }).click();
    const publication = page.getByRole('dialog', { name: 'Penerbitan paket' });
    await expect(publication.getByRole('button', { name: 'Arsipkan paket' })).toBeVisible();
    await publication.getByRole('button', { name: 'Tutup dialog' }).click();
    await page.getByText('Akses siswa dan informasi versi', { exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Bisa dikerjakan' })).toBeVisible();
    expect(fixture.calls.filter((call) => call.path.endsWith('/publish'))).toHaveLength(1);
    expect(fixture.calls.some((call) => call.path.includes('pretest-packages'))).toBe(false);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('navigation', { name: 'Jenis asesmen' })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`canonical-pretest-${width}.png`),
        fullPage: true,
      });
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include('#paket-soal')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

test('Package filters, pagination, Back and reload preserve the selected context', async ({
  page,
}) => {
  await setupAssessments(page);
  await page.goto('/admin/assessments?type=PRETEST&status=DRAFT');
  await page.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(page).toHaveURL(/offset=5/);
  await page.getByRole('link', { name: 'Pretest TEST 6', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Pretest TEST 6/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Pretest TEST 6/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: /Pretest TEST 6/ })).toHaveCount(0);
  await expect(page).toHaveURL(/offset=5/);
});

test('Package load failure can be retried and an empty search explains the next action', async ({
  page,
}) => {
  const { fixture } = await setupAssessments(page);
  fixture.status = 503;
  await page.goto(`/admin/assessments?type=PRETEST&package=${id(9000)}`);
  await expect(page.locator('.admin-state[role="alert"]')).toContainText(
    'TEST ONLY muat ulang diperlukan.',
  );
  fixture.status = 200;
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Pretest TEST 1/ })).toBeVisible();
  await page.getByRole('link', { name: /Kembali ke daftar/ }).click();
  await page
    .getByRole('searchbox', { name: 'Cari nama atau kode paket' })
    .fill('Tidak ada paket TEST');
  await page.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(
    page.getByText('Belum ada paket yang cocok. Ubah pencarian/filter atau tambah paket.'),
  ).toBeVisible();
});

test('Tryout package publication delegates scheduling to Batch Tryout', async ({ page }) => {
  const { fixture } = await setupAssessments(page);
  await page.goto(`/admin/assessments?type=TRYOUT&package=${id(9100)}`);
  await page.getByRole('button', { name: 'Penerbitan', exact: true }).click();
  const publication = page.getByRole('dialog', { name: 'Penerbitan paket' });
  await expect(publication.getByRole('link', { name: 'Batch Tryout' })).toHaveAttribute(
    'href',
    '/admin/tryout-batches',
  );
  const publish = publication.getByRole('button', { name: 'Publikasikan paket', exact: true });
  await expect(publish).toBeDisabled();
  await page.getByRole('checkbox', { name: /Saya telah memeriksa paket/ }).check();
  await publish.click();
  await expect(publication.getByRole('button', { name: 'Arsipkan paket' })).toBeVisible();
  expect(fixture.calls.find((call) => call.path.endsWith('/publish'))?.body).toEqual({
    expectedRevision: 1,
  });
});

for (const role of ['OPERATIONS', null] as const)
  test(`Direct package URL rejects ${role ?? 'unassigned'} before loading content`, async ({
    page,
  }) => {
    const { fixture } = await setupAssessments(page, role);
    await page.goto(`/admin/assessments?type=PRETEST&package=${id(9000)}`);
    await expect(
      page.getByText('Akses memerlukan Super Admin atau Admin Content, Data & Moderation.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(fixture.calls).toEqual([]);
  });

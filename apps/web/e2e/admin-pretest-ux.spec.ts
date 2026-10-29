import { expect, test } from '@playwright/test';
import { setupPretest } from './fixtures/admin-pretest';
import { id } from './fixtures/admin';

for (const role of ['SUPER_ADMIN', 'CONTENT_DATA_MODERATION'] as const)
  test(`Pretest visual audit ${role}`, async ({ page }) => {
    const { errors } = await setupPretest(page, role);
    await page.goto('/admin/content/pretest');
    await expect(page.getByText('Pretest Bilangan', { exact: true })).toBeVisible();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const tableBox = await page.locator('.pretest-table').boundingBox();
      const buttonBox = await page
        .getByRole('button', { name: 'Lihat detail', exact: true })
        .first()
        .boundingBox();
      expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width);
      await page.screenshot({
        path: test.info().outputPath(`directory-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal{visibility:hidden!important}',
      });
    }
    await page.getByRole('button', { name: 'Lihat detail', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Susunan soal', exact: true })).toBeVisible();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`detail-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal{visibility:hidden!important}',
      });
    }
    await page.getByRole('button', { name: 'Edit draf', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`editor-${width}.png`),
        style: 'nextjs-portal{visibility:hidden!important}',
      });
    }
    await page.keyboard.press('Escape');
    for (const [state, packageId] of [
      ['reviewed', id(4001)],
      ['archived', id(4002)],
    ]) {
      await page.goto(`/admin/content/pretest?packageId=${packageId}`);
      await expect(page.locator('.pretest-question-order > li')).toHaveCount(5);
      await expect(page.getByText('Memuat isi soal...', { exact: true })).toHaveCount(0);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: test.info().outputPath(`${state}-${width}.png`),
          fullPage: true,
          style: 'nextjs-portal{visibility:hidden!important}',
        });
      }
      if (state === 'archived') {
        await expect(page.getByRole('button', { name: 'Edit draf', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Arsipkan', exact: true })).toHaveCount(0);
      }
    }
    expect(errors).toEqual([]);
  });

test('create saves scoped selections in explicit order and preserves them across question pages', async ({
  page,
}) => {
  const { pretest } = await setupPretest(page);
  await page.goto('/admin/content/pretest');
  await page.getByRole('button', { name: 'Buat draf Pretest', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Kode keluarga', { exact: true }).fill('TEST-NEW');
  await dialog.getByLabel('Nama paket', { exact: true }).fill('Pretest baru');
  await dialog.getByLabel('Bab', { exact: true }).selectOption(id(5000));
  const options = dialog.getByRole('list', { name: 'Pilihan soal Pretest' });
  await options.getByRole('checkbox').first().check();
  const pager = dialog.getByRole('navigation', { name: 'Halaman pilihan soal Pretest' });
  await pager.getByRole('button', { name: 'Berikutnya' }).click();
  await options.getByRole('checkbox', { name: /Pertanyaan fixture 6:/ }).check();
  await pager.getByRole('button', { name: 'Sebelumnya' }).click();
  await expect(options.getByRole('checkbox', { name: /Tentukan hasil/ })).toBeChecked();
  await dialog.getByText('Kelola urutan soal terpilih (2/20)', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Turunkan soal 1', exact: true }).click();
  expect(pretest.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Simpan draf', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const call = pretest.calls.find(
    (call) => call.method === 'POST' && call.path === 'admin/content/pretest-packages',
  );
  expect(call?.body).toMatchObject({
    familyCode: 'TEST-NEW',
    name: 'Pretest baru',
    chapterId: id(5000),
    blueprintVersionId: null,
    questionVersionIds: [id(3005), id(3000)],
  });
  const queries = pretest.calls.filter((c) => c.path === 'admin/content/versions');
  expect(Object.fromEntries(new URLSearchParams(queries[0]!.query))).toMatchObject({
    limit: '5',
    usageType: 'PRETEST',
    status: 'READY',
    chapterId: id(5000),
  });
});

test('editing retains off-page pins and a missing blueprint while a failed save remains retryable', async ({
  page,
}) => {
  const { pretest } = await setupPretest(page);
  pretest.packs[1]!.state = 'DRAFT';
  pretest.blueprints.splice(0);
  await page.goto(`/admin/content/pretest?packageId=${id(4001)}`);
  await page.getByRole('button', { name: 'Edit draf', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Blueprint yang disahkan')).toHaveValue(id(5100));
  await expect(dialog.getByRole('checkbox').nth(0)).toBeChecked();
  await dialog.getByLabel('Nama paket').fill('Revisi nama draf');
  pretest.failMutation = 503;
  await dialog.getByRole('button', { name: 'Simpan draf', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Perubahan fixture belum tersimpan.');
  await expect(dialog.getByRole('alert')).toBeInViewport();
  await expect(dialog.getByLabel('Nama paket')).toHaveValue('Revisi nama draf');
  await page.screenshot({
    path: test.info().outputPath('edit-retry.png'),
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  pretest.failMutation = 0;
  await dialog.getByRole('button', { name: 'Simpan draf', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(pretest.calls.filter((c) => c.method === 'PUT').at(-1)?.body).toMatchObject({
    name: 'Revisi nama draf',
    blueprintVersionId: id(5100),
    questionVersionIds: pretest.questions.slice(0, 20).map((q) => q.id),
  });
});

test('reviewed packages create a revision and archive requires an explicit retryable confirmation', async ({
  page,
}) => {
  const { pretest } = await setupPretest(page);
  await page.goto(`/admin/content/pretest?packageId=${id(4001)}`);
  await page.getByRole('button', { name: 'Buat versi baru', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Nama paket').fill('Versi berikutnya');
  await editor.getByRole('button', { name: 'Simpan draf', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(pretest.calls.filter((c) => c.method === 'POST')[0]?.path).toBe(
    `admin/content/pretest-packages/${id(4001)}/revisions`,
  );
  expect(pretest.packs[1]!.state).toBe('REVIEWED');
  await page.getByRole('button', { name: 'Arsipkan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Arsipkan paket?' });
  expect(pretest.calls.filter((c) => c.path.endsWith('/archive'))).toHaveLength(0);
  pretest.failMutation = 409;
  await dialog.getByRole('button', { name: 'Arsipkan paket', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  pretest.failMutation = 0;
  await dialog.getByRole('button', { name: 'Arsipkan paket', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Buat versi baru', exact: true })).toHaveCount(0);
  expect(pretest.packs[1]!.state).toBe('ARCHIVED');
});

test('editorial review keeps its reason on failure and publication blockers remain separate', async ({
  page,
}) => {
  const { pretest } = await setupPretest(page);
  await page.goto(`/admin/content/pretest?packageId=${id(4003)}`);
  await page.getByRole('button', { name: 'Review paket', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Alasan review').fill('Sudah diperiksa untuk review editorial.');
  pretest.failMutation = 503;
  await dialog.getByRole('button', { name: 'Sahkan review editorial' }).click();
  await expect(dialog.getByLabel('Alasan review')).toHaveValue(
    'Sudah diperiksa untuk review editorial.',
  );
  await expect(dialog.getByRole('alert')).toBeVisible();
  pretest.failMutation = 0;
  await dialog.getByRole('button', { name: 'Sahkan review editorial' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Review editorial tersimpan.')).toBeVisible();
  await expect(page.getByText('PRETEST_STUDENT_CONSUMER_REQUIRED', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Publikasikan|Publish/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Buat versi baru' })).toBeVisible();
});

test('manual IDs validate duplicates, format, unapplied changes and the twenty item maximum', async ({
  page,
}) => {
  await setupPretest(page);
  await page.goto('/admin/content/pretest');
  await page.getByRole('button', { name: 'Buat draf Pretest', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Masukkan ID versi secara manual', { exact: true }).click();
  const input = dialog.getByLabel('ID versi soal (baris baru atau koma)');
  await input.fill(`${id(3000)},${id(3000)}`);
  await expect(dialog.getByRole('button', { name: 'Simpan draf', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Terapkan ID' }).click();
  await expect(dialog.getByRole('alert')).toContainText('berulang');
  await input.fill('invalid-id');
  await dialog.getByRole('button', { name: 'Terapkan ID' }).click();
  await expect(dialog.getByRole('alert')).toContainText('UUID');
  await input.fill(Array.from({ length: 21 }, (_, i) => id(3000 + i)).join('\n'));
  await dialog.getByRole('button', { name: 'Terapkan ID' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Maksimal 20');
  await input.fill(id(3000));
  await dialog.getByRole('button', { name: 'Terapkan ID' }).click();
  await expect(dialog.getByRole('button', { name: 'Simpan draf', exact: true })).toBeEnabled();
});

test('list pagination and detail deep links preserve Back, reload and the final page boundary', async ({
  page,
}) => {
  const { pretest } = await setupPretest(page);
  await page.goto('/admin/content/pretest');
  await expect(page.locator('.pretest-table tbody tr')).toHaveCount(5);
  const pager = page.getByRole('navigation', { name: 'Halaman paket Pretest' });
  await pager.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page.locator('.pretest-table tbody tr')).toHaveCount(2);
  await expect(pager.getByRole('button', { name: 'Berikutnya' })).toBeDisabled();
  expect(pretest.calls.find((c) => c.query.includes('offset=5'))?.query).toContain('limit=6');
  await page.getByRole('button', { name: 'Lihat detail', exact: true }).first().click();
  await expect(page).toHaveURL(/packageId=/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Susunan soal' })).toBeVisible();
  await page.getByRole('button', { name: 'Kembali ke daftar' }).click();
  await expect(page.locator('.pretest-table tbody tr')).toHaveCount(2);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Susunan soal' })).toBeVisible();
});

test('reference and list failures have independent retries and missing question labels keep pins intact', async ({
  page,
}) => {
  const { pretest } = await setupPretest(page);
  pretest.failPath = 'admin/content/pretest-packages/blueprints';
  await page.goto('/admin/content/pretest');
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
    'Blueprint belum bisa dimuat',
  );
  await expect(page.locator('.pretest-table tbody tr')).toHaveCount(5);
  await page.screenshot({
    path: test.info().outputPath('recovery.png'),
    fullPage: true,
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  pretest.failPath = '';
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
  pretest.failPath = 'admin/content/pretest-packages';
  await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
    'Data fixture sementara',
  );
  await page.screenshot({
    path: test.info().outputPath('recovery.png'),
    fullPage: true,
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  pretest.failPath = '';
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.locator('.pretest-table tbody tr')).toHaveCount(5);
  pretest.failPath = `admin/content/versions/${id(3000)}`;
  await page.getByRole('button', { name: 'Lihat detail', exact: true }).first().click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
    'Sebagian isi soal',
  );
  await expect(page.getByRole('link', { name: /Detail versi soal 1/ })).toBeVisible();
  pretest.failPath = '';
  await page.getByRole('button', { name: 'Muat ulang isi soal' }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
});

for (const target of ['lookup', 'mutation'] as const)
  test(`a server access denial clears every pretest draft and payload from ${target}`, async ({
    page,
  }) => {
    const { pretest } = await setupPretest(page);
    await page.goto(`/admin/content/pretest?packageId=${id(4000)}`);
    await page.getByRole('button', { name: 'Edit draf', exact: true }).click();
    if (target === 'lookup') {
      pretest.failStatus = 403;
      pretest.failPath = 'admin/content/versions';
      await page
        .getByRole('navigation', { name: 'Halaman pilihan soal Pretest' })
        .getByRole('button', { name: 'Berikutnya' })
        .click();
    } else {
      pretest.failMutation = 401;
      await page.getByRole('button', { name: 'Simpan draf', exact: true }).click();
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Pretest Bilangan', exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toBeVisible();
  });

for (const role of ['OPERATIONS', null] as const)
  test(`pretest role boundary rejects ${role}`, async ({ page }) => {
    const { pretest } = await setupPretest(page, role);
    await page.goto('/admin/content/pretest');
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
      'Akses memerlukan',
    );
    expect(pretest.calls).toHaveLength(0);
  });

test('keyboard modal focus, Escape and reduced-motion short viewport work at 125 percent zoom', async ({
  page,
}) => {
  await setupPretest(page, 'CONTENT_DATA_MODERATION');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/admin/content/pretest');
  const trigger = page.getByRole('button', { name: 'Buat draf Pretest', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Simpan draf', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Tutup dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('selected pages keep all twenty pins and replacing one updates only the intended version', async ({
  page,
}) => {
  const { pretest } = await setupPretest(page);
  pretest.packs[1]!.state = 'DRAFT';
  await page.goto(`/admin/content/pretest?packageId=${id(4001)}`);
  await page.getByRole('button', { name: 'Edit draf', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Kelola urutan soal terpilih (20/20)', { exact: true }).click();
  await expect(dialog.locator('.pretest-question-order > li')).toHaveCount(5);
  await dialog.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('.numora-dialog__content')!;
    const target = element.querySelector('.pretest-selected-disclosure')!;
    body.scrollTop += target.getBoundingClientRect().top - body.getBoundingClientRect().top;
  });
  await page.screenshot({
    path: test.info().outputPath('selected-order.png'),
    style: 'nextjs-portal{visibility:hidden!important}',
  });
  await dialog
    .getByRole('navigation', { name: 'Halaman susunan soal' })
    .getByRole('button', { name: 'Berikutnya' })
    .click();
  await dialog.getByRole('button', { name: 'Keluarkan soal 6', exact: true }).click();
  const picker = dialog.getByRole('navigation', { name: 'Halaman pilihan soal Pretest' });
  const choices = dialog.getByRole('list', { name: 'Pilihan soal Pretest' });
  for (let i = 1; i <= 4; i++) {
    await picker.getByRole('button', { name: 'Berikutnya' }).click();
    await expect(
      choices.getByRole('checkbox', { name: new RegExp(`Pertanyaan fixture ${i * 5 + 1}:`) }),
    ).toBeVisible();
  }
  await choices.getByRole('checkbox', { name: /Pertanyaan fixture 21:/ }).check();
  await expect(
    dialog.getByText('Kelola urutan soal terpilih (20/20)', { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('list', { name: 'Pilihan soal Pretest' }).getByRole('checkbox').nth(1),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Simpan draf', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const body = pretest.calls.filter((c) => c.method === 'PUT').at(-1)?.body;
  expect(body).toMatchObject({
    questionVersionIds: [
      ...pretest.questions
        .slice(0, 20)
        .map((q) => q.id)
        .filter((value) => value !== id(3005)),
      id(3020),
    ],
  });
});

test('loading and empty directory states explain the next action', async ({ page }) => {
  const { pretest } = await setupPretest(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/admin/content/pretest-packages?*', async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto('/admin/content/pretest');
  try {
    await expect(page.getByRole('status').filter({ hasText: 'Memuat paket' })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('loading.png'),
      fullPage: true,
      style: 'nextjs-portal{visibility:hidden!important}',
    });
  } finally {
    release();
  }
  await expect(page.locator('.pretest-table tbody tr')).toHaveCount(5);
  pretest.packs.splice(0);
  await page.getByRole('button', { name: 'Muat ulang', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Belum ada paket pada halaman ini' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Halaman paket Pretest' })
      .getByRole('button', { name: 'Berikutnya' }),
  ).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath('empty.png'),
    fullPage: true,
    style: 'nextjs-portal{visibility:hidden!important}',
  });
});

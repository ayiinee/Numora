import { expect, test } from '@playwright/test';
import { id, setup } from './fixtures/admin';

for (const width of [1280, 390]) {
  test(`variant anchors remain local, readable and recoverable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    const packageId = id(900);
    const questions = Array.from({ length: 30 }, (_, index) => ({
      id: id(index + 1000),
      displayOrder: index + 1,
      label: `TRYOUT-${index + 1}`,
      externalId: `TRYOUT-${index + 1}`,
    }));
    let optionCalls = 0;
    const submissions: Record<string, unknown>[] = [];
    const process = {
      id: id(2000),
      status: 'GENERATING',
      generatedPackageId: null,
      requests: questions.slice(5).map((item) => ({
        id: item.id,
        label: item.label,
        executionStatus: 'PENDING',
        failureCode: null,
      })),
    };
    await page.route('http://localhost:3301/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/variant-options')) {
        optionCalls++;
        const anchors = (url.searchParams.get('anchors') ?? '').split(',');
        const focalQuestions = questions
          .filter((item) => !anchors.includes(item.id))
          .map((item) => ({
            ...item,
            mapping: { id: id(3000 + item.displayOrder), label: item.label, configVersion: 1 },
            blockers: [],
          }));
        return route.fulfill({
          json: {
            packageId,
            packageName: 'Tryout Matematika TEST',
            packageVersion: 1,
            contentRevision: 3,
            status: 'PUBLISHED',
            questions,
            focalQuestions,
            blockers: anchors.length === 5 ? [] : ['ANCHOR_COUNT_INVALID'],
            generatorBlockers: [],
            generatorAvailable: true,
            canGenerate: anchors.length === 5,
          },
        });
      }
      if (url.pathname.endsWith(`/content/packages/${packageId}`))
        return route.fulfill({
          json: {
            items: questions.map((item) => ({
              questionVersionId: item.id,
              question: {
                stem: {
                  text: `Hitung hasil dari ${item.displayOrder} + 12. Tentukan jawaban yang tepat.`,
                },
                options: [{ id: 'A', content: { text: 'Pilihan jawaban contoh' } }],
                metadata: { assetManifest: [] },
              },
            })),
          },
        });
      if (url.pathname.endsWith(`/${packageId}/variants`)) {
        submissions.push(route.request().postDataJSON());
        if (submissions.length === 1)
          return route.fulfill({
            status: 409,
            json: { code: 'GENERATOR_MAPPING_NOT_APPROVED', detail: 'Conflict Exception' },
          });
        return route.fulfill({ status: 202, json: process });
      }
      if (url.pathname.endsWith(`/variant-processes/${process.id}/materialize`))
        return route.fulfill({ json: { id: id(4000) } });
      if (url.pathname.endsWith(`/variant-processes/${process.id}`))
        return route.fulfill({
          json: {
            ...process,
            status: 'READY',
            requests: process.requests.map((item) => ({ ...item, executionStatus: 'SUCCEEDED' })),
          },
        });
      return route.fallback();
    });
    await page.goto(`/admin/assessments/tryout/${packageId}/variant/new`);
    await expect(page.locator('.tryout-variant-stem').first()).toBeVisible();
    const initialCalls = optionCalls;
    await page.getByRole('searchbox', { name: 'Cari soal' }).fill('TRYOUT-30');
    await expect(
      page.getByRole('checkbox', { name: 'Pilih soal 30 sebagai anchor', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: 'Pilih soal 1 sebagai anchor', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Cari soal' }).fill('');
    const firstStem = page.getByText('Hitung hasil dari 1 + 12. Tentukan jawaban yang tepat.', {
      exact: true,
    });
    await expect(firstStem).toHaveCount(1);
    await page.getByText('Lihat pilihan jawaban', { exact: true }).first().click();
    await expect(firstStem).toHaveCount(1);
    await expect(page.getByText('Pilihan jawaban contoh').first()).toBeVisible();
    await page.getByText('Sembunyikan pilihan jawaban', { exact: true }).first().click();
    await expect(page.getByText('Pilihan jawaban contoh').first()).toBeHidden();
    await expect(firstStem).toBeVisible();
    for (let n = 1; n <= 5; n++)
      await page
        .getByRole('checkbox', { name: `Pilih soal ${n} sebagai anchor`, exact: true })
        .check();
    expect(optionCalls).toBe(initialCalls);
    await expect(
      page.getByRole('checkbox', { name: 'Pilih soal 6 sebagai anchor', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Kosongkan pilihan' }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Pilih soal 6 sebagai anchor', exact: true }),
    ).toBeEnabled();
    for (let n = 1; n <= 5; n++)
      await page
        .getByRole('checkbox', { name: `Pilih soal ${n} sebagai anchor`, exact: true })
        .check();
    await page.getByRole('checkbox', { name: 'Terpilih saja' }).check();
    await expect(page.locator('.tryout-variant-question')).toHaveCount(5);
    expect(optionCalls).toBe(initialCalls);
    await page.screenshot({ path: `test-results/variant-selection-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Tinjau & lanjutkan' }).click();
    await expect(page.getByRole('heading', { name: 'Tinjau sebelum generate' })).toBeVisible();
    await expect(page.getByText('25/25 soal siap')).toBeVisible();
    await page.getByRole('button', { name: 'Generate 25 soal varian' }).click();
    await expect(
      page.getByText('Approval generator berubah atau tidak valid.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Generate 25 soal varian' }).click();
    expect(submissions).toHaveLength(2);
    expect(submissions[0]!.operationKey).toBe(submissions[1]!.operationKey);
    expect(submissions[1]!.anchorQuestionVersionIds).toEqual(
      questions.slice(0, 5).map((item) => item.id),
    );
    await expect(page.getByRole('heading', { name: 'Varian siap disimpan' })).toBeVisible();
    await page.getByRole('button', { name: 'Simpan paket DRAFT' }).click();
    await expect(page).toHaveURL(new RegExp(`/tryout/${id(4000)}$`));
  });
}

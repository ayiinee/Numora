import { expect, test } from '@playwright/test';
import { setupAssessments } from './fixtures/admin-assessments';
import { id } from './fixtures/admin';

declare global {
  interface Window {
    printResults: { url: string; ready: boolean }[][];
  }
}

test('PDF loads isolated question images before printing and blocks broken media', async ({
  page,
}) => {
  const { fixture } = await setupAssessments(page);
  const pack = fixture.packs.find((p) => p.assessmentType === 'TRYOUT')!;
  pack.readiness.expectedCount = 2;
  pack.items = [0, 1].map((index) => ({
    questionVersionId: id(700 + index),
    displayOrder: index + 1,
    question: {
      externalId: 'PDF-' + index,
      type: 'SINGLE_CHOICE',
      stem: { text: 'Gambar soal ' + index + ' [[asset:figure]]' },
      options: [{ id: 'A', content: { text: 'Jawaban [[asset:figure]]' } }],
      answer: { optionId: 'A' },
      explanation: { text: 'Pembahasan' },
      metadata: { assetManifest: [{ assetId: 'figure' }], categories: [] },
    },
  })) as unknown as typeof pack.items;
  let broken = false;
  const calls: string[] = [];
  await page.route('**/media-links', async (route) => {
    const version = route.request().url().includes(id(700)) ? 'first' : 'second';
    calls.push(version);
    await route.fulfill({
      json: {
        items: [
          {
            status: 'READY',
            assetId: 'figure',
            altText: version,
            url: 'http://localhost:3300/pdf-image/' + version + (broken ? '-broken' : ''),
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
        ],
      },
    });
  });
  await page.route('**/pdf-image/*', async (route) => {
    if (route.request().url().endsWith('-broken')) return route.fulfill({ status: 404 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const color = route.request().url().endsWith('first') ? 'red' : 'blue';
    await route.fulfill({
      contentType: 'image/svg+xml',
      body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="' +
        color +
        '"/></svg>',
    });
  });
  await page.addInitScript(() => {
    window.printResults = [];
    window.print = () => {
      window.printResults.push(
        [...document.querySelectorAll<HTMLImageElement>('.tryout-pdf-print img')].map((img) => ({
          url: img.src,
          ready: img.complete && img.naturalWidth > 0,
        })),
      );
    };
  });
  await page.goto('/admin/assessments/tryout/' + pack.id);
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.printResults.length)).toBe(1);
  expect(calls).toEqual(['first', 'second']);
  const images = await page.evaluate(() => window.printResults[0]!);
  expect(images.map((img: { url: string }) => img.url.split('/').pop())).toEqual([
    'first',
    'first',
    'second',
    'second',
  ]);
  expect(images.every((img: { ready: boolean }) => img.ready)).toBe(true);
  broken = true;
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Export PDF gagal' })).toBeVisible();
  expect(await page.evaluate(() => window.printResults.length)).toBe(1);
  broken = false;
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.printResults.length)).toBe(2);
});

import { expect, test, type Page } from '@playwright/test';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const versionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function fixture(page: Page) {
  const now = Math.floor(Date.now() / 1000),
    user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'admin@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-05T00:00:00Z',
    };
  const session = {
    access_token: [
      Buffer.from('{"alg":"HS256"}').toString('base64url'),
      Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, role: 'authenticated' })).toString(
        'base64url',
      ),
      'fixture-signature',
    ].join('.'),
    refresh_token: 'TEST ONLY',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user,
  };
  await page.addInitScript(
    (value) => localStorage.setItem('sb-numora-e2e-auth-token', JSON.stringify(value)),
    session,
  );
  let status = 'DRAFT';
  const decisions: unknown[] = [];
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    if (path === 'identity/me')
      return route.fulfill({
        json: {
          id: userId,
          role: 'ADMIN',
          status: 'ACTIVE',
          adminRole: 'CONTENT_DATA_MODERATION',
          displayName: 'Content Fixture',
          capabilities: ['CONTENT_MANAGE'],
        },
      });
    const detail = {
      id: versionId,
      questionId: userId,
      versionNumber: 2,
      status,
      revisedFromId: userId,
      sourceNamespace: 'TEST',
      reviewedByUserId: null,
      reviewedAt: null,
      reviews: [],
      payload: {
        externalId: 'TEST Q1',
        type: 'CATEGORY',
        chapterCode: 'C',
        subchapterCode: 'S',
        competencyCode: 'I',
        difficulty: 'EASY',
        stem: { text: 'TEST '.repeat(140) + ' kategori' },
        options: [{ id: 'S1', content: { text: 'Pernyataan fixture' } }],
        answer: { categoryByStatementId: { S1: 'TRUE' } },
        explanation: { text: 'TEST pembahasan' },
        metadata: {
          sourceLevelNumber: 1,
          categories: [
            { id: 'TRUE', label: 'Benar' },
            { id: 'FALSE', label: 'Salah' },
          ],
        },
      },
      readiness: {
        canReviewReady: true,
        contentBlockers: [],
        publicationBlockers: ['APPROVED_PGK_RUBRIC_REQUIRED'],
      },
    };
    if (path === `admin/content/versions/${versionId}/review`) {
      const body = route.request().postDataJSON();
      decisions.push(body);
      status = body.status;
      return route.fulfill({ json: { id: versionId } });
    }
    if (path === `admin/content/versions/${versionId}`) return route.fulfill({ json: detail });
    if (path === `admin/reports/QUESTION/${userId}`)
      return route.fulfill({
        json: {
          id: userId,
          kind: 'QUESTION',
          referenceId: userId,
          category: 'ANSWER_KEY',
          details: 'TEST laporan versi lama',
          status: 'OPEN',
          followUp: null,
          reportedAt: '2026-10-05T00:00:00Z',
          question: { ...detail, status: 'ARCHIVED', versionNumber: 1 },
          video: null,
          revisionQuestionVersionId: null,
        },
      });
    return route.fulfill({ status: 404, json: { detail: 'TEST fixture route missing' } });
  });
  return decisions;
}
test('Content reviews rich versions and sees academic publication blocker at narrow and wide viewports', async ({
  page,
}) => {
  const decisions = await fixture(page);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/admin/content/versions/${versionId}`);
    await expect(page.getByText('APPROVED_PGK_RUBRIC_REQUIRED')).toBeVisible();
    await page.getByText('Identitas versi & riwayat review', { exact: true }).click();
    await expect(page.getByRole('link', { name: userId })).toHaveAttribute(
      'href',
      `/admin/content/versions/${userId}`,
    );
    await page
      .getByLabel('Alasan review')
      .fill('TEST lengkap secara editorial, scoring menunggu persetujuan');
    await page.getByRole('button', { name: 'Simpan review' }).click();
    await expect(page.getByText('Keputusan review tersimpan.')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    if (width === 1440)
      await page.screenshot({
        path: '../../.tmp/admin-content-ux-review.png',
        fullPage: true,
        animations: 'disabled',
        style: 'nextjs-portal {visibility:hidden !important;}',
      });
  }
  expect(decisions[0]).toMatchObject({ status: 'READY', expectedStatus: 'DRAFT' });
  expect(decisions[1]).toMatchObject({ status: 'READY', expectedStatus: 'READY' });
});
test('moderation opens the archived target directly without fetching current bank pages', async ({
  page,
}) => {
  await fixture(page);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/admin/reports/QUESTION/${userId}`);
    await expect(
      page.getByRole('link', { name: /Buka versi yang dilaporkan \(v1, ARCHIVED\)/ }),
    ).toHaveAttribute('href', `/admin/content/versions/${versionId}`);
    await expect(page.getByText('TEST laporan versi lama')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }
});

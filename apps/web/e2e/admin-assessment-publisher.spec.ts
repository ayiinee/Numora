import { expect, test, type Page } from '@playwright/test';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function fixture(page: Page, role: 'ADMIN' | 'STUDENT' = 'ADMIN') {
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

  let pretestState = 'DRAFT';
  const saves: unknown[] = [];
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    if (path === 'identity/me')
      return route.fulfill({
        json: {
          id: userId,
          role,
          status: 'ACTIVE',
          adminRole: role === 'ADMIN' ? 'CONTENT_DATA_MODERATION' : null,
          displayName: 'TEST',
          capabilities: role === 'ADMIN' ? ['CONTENT_MANAGE'] : [],
          teacherVerified: false,
        },
      });
    if (path === 'admin/content/curriculum')
      return route.fulfill({
        json: {
          items: [
            {
              id: userId,
              kind: 'CHAPTER',
              name: 'TEST chapter',
              code: 'TEST',
              parentId: null,
              displayOrder: 1,
              status: 'READY',
            },
          ],
        },
      });
    if (path === 'admin/content/pretest-packages/blueprints')
      return route.fulfill({ json: { items: [] } });
    if (path.includes('/review')) {
      pretestState = 'REVIEWED';
      return route.fulfill({ json: { id: userId } });
    }
    if (path.startsWith('admin/content/pretest-packages'))
      return route.fulfill({
        json: {
          items: [
            {
              id: userId,
              familyCode: 'TEST',
              packageVersion: 1,
              name: 'TEST Pretest',
              chapterId: userId,
              blueprintVersionId: null,
              state: pretestState,
              manifestDigest: pretestState === 'DRAFT' ? null : 'TEST',
              questionVersionIds: Array.from(
                { length: 20 },
                (_, i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, '0')}`,
              ),
              reviewBlockers: [],
              publicationBlockers: [
                'APPROVED_PRETEST_BLUEPRINT_REQUIRED',
                'PRETEST_STUDENT_CONSUMER_REQUIRED',
              ],
            },
          ],
        },
      });
    if (path === 'assessment-attempts/TEST')
      return route.fulfill({
        json: {
          id: 'TEST',
          levelId: userId,
          levelTitle: 'TEST level',
          status: 'inProgress',
          startedAt: new Date().toISOString(),
          isDemo: false,
          questions: [
            {
              questionInstanceId: 'MCMA',
              type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
              stem: 'TEST multi',
              richStem: { text: 'TEST multi' },
              options: [
                { id: 'A', text: 'Alpha' },
                { id: 'B', text: 'Beta' },
              ],
              selectedOptionId: null,
              answer: null,
            },
            {
              questionInstanceId: 'CATEGORY',
              type: 'CATEGORY',
              stem: 'TEST category',
              richStem: { text: 'TEST category' },
              options: [
                { id: 'S1', text: 'First statement' },
                { id: 'S2', text: 'Second statement' },
              ],
              categories: [
                { id: 'Y', text: 'Ya' },
                { id: 'N', text: 'Tidak' },
              ],
              selectedOptionId: null,
              answer: null,
            },
          ],
        },
      });
    if (path.includes('/answers/')) {
      const { answer } = route.request().postDataJSON();
      saves.push(answer);
      return route.fulfill({
        json: { questionInstanceId: path.split('/').pop(), selectedOptionId: null, answer },
      });
    }
    if (path === 'students/me/learning-interactions')
      return route.fulfill({ json: { state: 'policyPending' } });
    return route.fulfill({ json: { items: [] } });
  });
  return saves;
}
test('Pretest editorial review preserves a concrete production blocker at mobile and desktop', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/admin/content/pretest');
  await expect(page.getByText('TEST Pretest', { exact: true })).toBeVisible();
  await page.getByLabel('Alasan review').fill('TEST editorial review');
  await page.getByRole('button', { name: 'Sahkan review editorial' }).click();
  await expect(page.getByRole('button', { name: 'Buat versi baru' })).toBeVisible();
  await expect(page.getByText(/PRETEST_STUDENT_CONSUMER_REQUIRED/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Publish|Publikasikan/i })).toHaveCount(0);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('*'))
          .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
          .map((e) => [e.tagName, e.className, e.getBoundingClientRect().right]),
      ),
    ).toEqual([]);
  }
});
test('Student saves MCMA and Category using versioned server acknowledgements', async ({
  page,
}) => {
  const saves = await fixture(page, 'STUDENT');
  await page.goto('/student/drill/TEST');
  await page.getByRole('checkbox', { name: /Alpha/ }).check();
  await expect(page.getByRole('checkbox', { name: /Beta/ })).toBeEnabled();
  await page.getByRole('checkbox', { name: /Beta/ }).check();
  await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
  expect(saves).toContainEqual({ optionIds: ['A', 'B'] });
  await page.getByRole('button', { name: 'Berikutnya' }).click();
  await page.getByRole('radio', { name: 'Ya', exact: true }).first().check();
  await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
  expect(saves).toContainEqual({ categoryByStatementId: { S1: 'Y' } });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
        .map((e) => [e.tagName, e.className, e.getBoundingClientRect().right]),
    ),
  ).toEqual([]);
});

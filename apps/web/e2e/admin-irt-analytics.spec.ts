import { expect, test, type Page } from '@playwright/test';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function fixture(page: Page, operations = false) {
  const now = Math.floor(Date.now() / 1000),
    user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'fixture@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-05T00:00:00Z',
    };
  const session = {
    access_token: [
      Buffer.from('{"alg":"HS256"}').toString('base64url'),
      Buffer.from(JSON.stringify({ sub: id, exp: now + 3600, role: 'authenticated' })).toString(
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
    (s) => localStorage.setItem('sb-numora-e2e-auth-token', JSON.stringify(s)),
    session,
  );
  let prepare = 0;
  const keys: string[] = [];
  const request = {
    id,
    contextId: id,
    packageId: id,
    contractVersion: 3,
    status: 'RUNNING',
    inputDigest: 'TEST-digest',
    snapshotId: id,
    snapshotDigest: 'TEST-snapshot',
    rowCount: 30,
    dispatchGeneration: 1,
    dueAt: '2026-10-08T17:00:00Z',
    overdue: false,
    acceptedExecutionId: null,
    execution: {
      id,
      status: 'SUCCEEDED',
      attemptNumber: 1,
      leaseExpired: false,
      failureCode: null,
    },
    failureCode: null,
    configurationPins: [{ approvalId: id, digest: 'TEST' }],
    artifacts: [{ id, digest: 'TEST-output', scientificDecision: 'PASS' }],
  };
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    if (path === 'identity/me')
      return route.fulfill({
        json: {
          id,
          role: 'ADMIN',
          status: 'ACTIVE',
          adminRole: operations ? 'OPERATIONS' : 'CONTENT_DATA_MODERATION',
          displayName: 'TEST reviewer',
          teacherVerified: false,
          capabilities: operations
            ? ['OPERATIONS_MANAGE', 'ANALYTICS_OPERATIONS']
            : ['CONTENT_MANAGE', 'ANALYTICS_CONTENT', 'OPERATIONS_LIMITED_READ'],
        },
      });
    if (path === 'admin/analytics')
      return route.fulfill({
        json: {
          generatedAt: '2026-10-06T00:00:00Z',
          source: 'POSTGRESQL',
          metrics: [
            {
              key: 'schools',
              label: 'Sekolah tercatat',
              domain: 'STRUCTURE',
              value: 0,
              unavailableReason: null,
            },
            {
              key: 'ready',
              label: 'Versi READY',
              domain: 'CONTENT',
              value: null,
              unavailableReason: 'QUERY_UNAVAILABLE',
            },
          ],
        },
      });
    if (path === 'admin/irt/options')
      return route.fulfill({
        json: {
          enabled: true,
          configurations: [
            {
              approvalId: id,
              digest: 'TEST-model',
              code: 'TEST_MODEL',
              version: 1,
              kind: 'IRT_MODEL',
              contextId: id,
              approvedAt: '2026-10-05T00:00:00Z',
            },
            {
              approvalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              digest: 'TEST-quality',
              code: 'TEST_QUALITY',
              version: 1,
              kind: 'QUALITY_GATE',
              contextId: id,
              approvedAt: '2026-10-05T00:00:00Z',
            },
          ],
        },
      });
    if (path === 'admin/irt/batch-health')
      return route.fulfill({
        json: {
          items: [
            {
              id,
              packageId: id,
              title: 'TEST weekly package',
              contextId: id,
              status: 'CLOSED',
              closesAt: '2026-10-04T17:00:00Z',
              dueAt: '2026-10-07T17:00:00Z',
              overdue: true,
              activeAttemptCount: 0,
              finalizedAttemptCount: 30,
              publicationMode: null,
              publicationVersion: null,
              publishedAt: null,
              prepareBlockers: [],
              publicationBlockers: ['RESPONDENT_CONTRACT_NOT_APPROVED'],
            },
          ],
        },
      });
    if (path === 'admin/irt/requests' && route.request().method() === 'POST') {
      const operationKey = route.request().headers()['idempotency-key'];
      if (!operationKey) throw new Error('Fixture operation key missing');
      keys.push(operationKey);
      if (++prepare === 1)
        return route.fulfill({
          status: 503,
          json: { code: 'TEST_OUTAGE', detail: 'TEST transport outage' },
        });
      return route.fulfill({ status: 201, json: request });
    }
    if (path === 'admin/irt/requests') return route.fulfill({ json: { items: [request] } });
    if (path === `admin/irt/requests/${id}`) return route.fulfill({ json: request });
    return route.fulfill({ status: 404, json: { detail: 'Fixture endpoint not available' } });
  });
  return keys;
}
for (const width of [320, 1440])
  test(`IRT request pins, retry and publication blockers at ${width}px`, async ({ page }) => {
    const keys = await fixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/irt');
    await page.getByLabel('Konteks batch').selectOption(id);
    await page.getByRole('combobox', { name: 'Model IRT', exact: true }).selectOption(id);
    await page
      .getByRole('combobox', { name: 'Quality gate', exact: true })
      .selectOption('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await page.getByRole('button', { name: 'Siapkan request IRT', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'TEST transport outage' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Siapkan request IRT', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Detail request', exact: true })).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    await expect(page.getByText('Scientific decision: PASS', { exact: false })).toBeVisible();
    await expect(page.getByText('Adoption: belum diterima.', { exact: false })).toBeVisible();
    await expect(page.getByText('SLA 72 jam terlewati; hasil belum dipublikasikan.')).toBeVisible();
    await page.getByText('Blocker persiapan dan publikasi', { exact: true }).click();
    await expect(
      page.getByText('Kontrak hasil peserta dan mapping menunggu pengesahan Data.'),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `../../.tmp/admin-m6-irt-${width}.png`, fullPage: true });
  });
test('Operations analytics preserves zero and unavailable and denies the IRT direct route', async ({
  page,
}) => {
  await fixture(page, true);
  await page.goto('/admin/analytics');
  await expect(page.getByText('Tidak tersedia', { exact: true })).toBeVisible();
  await expect(page.getByText('0', { exact: true })).toBeVisible();
  await page.goto('/admin/irt');
  await expect(page.getByText('Akses Content diperlukan.', { exact: true })).toBeVisible();
});

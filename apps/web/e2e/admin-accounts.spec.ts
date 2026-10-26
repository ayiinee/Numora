import { expect, test, type Page } from '@playwright/test';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function setup(page: Page, role = 'SUPER_ADMIN') {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: [
      Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
      Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, role: 'authenticated' })).toString(
        'base64url',
      ),
      'test-signature',
    ].join('.'),
    refresh_token: 'TEST ONLY',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'admin@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-05T00:00:00Z',
    },
  };
  await page.addInitScript(
    (value) => localStorage.setItem('sb-numora-e2e-auth-token', JSON.stringify(value)),
    session,
  );
  const state = {
    keys: [] as string[],
    invitations: [] as unknown[],
    failed: false,
    requests: [] as string[],
  };
  await page.route('https://numora-e2e.supabase.co/**', (route) =>
    route.fulfill({
      status: 400,
      json: { error: 'otp_expired', error_description: 'TEST ONLY expired' },
    }),
  );
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    state.requests.push(path);
    if (path.endsWith('/identity/me'))
      return route.fulfill({
        json: {
          id: userId,
          role: 'ADMIN',
          status: 'ACTIVE',
          displayName: 'Super Fixture',
          email: 'admin@example.test',
          adminRole: role,
          capabilities:
            role === 'SUPER_ADMIN'
              ? ['ADMIN_ACCOUNTS_MANAGE', 'OPERATIONS_MANAGE', 'CONTENT_MANAGE']
              : ['OPERATIONS_MANAGE'],
          teacherVerified: null,
          studentAffiliation: null,
        },
      });
    if (path.endsWith('/admin/accounts'))
      return route.fulfill({
        json: {
          items: [
            {
              id: userId,
              displayName: 'Super Fixture',
              email: 'admin@example.test',
              adminRole: 'SUPER_ADMIN',
              status: 'ACTIVE',
              createdAt: '2026-10-05T00:00:00Z',
            },
          ],
          nextOffset: null,
        },
      });
    if (path.endsWith('/admin/invitations') && route.request().method() === 'POST') {
      state.keys.push(route.request().headers()['idempotency-key']!);
      if (state.failed) {
        state.failed = false;
        return route.fulfill({
          status: 503,
          json: { code: 'ADMIN_INVITE_DELIVERY_UNCONFIRMED', detail: 'TEST ONLY retry delivery' },
        });
      }
      const input = route.request().postDataJSON();
      state.invitations = [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          ...input,
          targetRole: input.adminRole,
          status: 'INVITED',
          userId: null,
          failureCode: null,
          createdAt: '2026-10-05T00:00:00Z',
          updatedAt: '2026-10-05T00:00:00Z',
        },
      ];
      return route.fulfill({ json: state.invitations[0] });
    }
    if (path.endsWith('/admin/invitations'))
      return route.fulfill({ json: { items: state.invitations, nextOffset: null } });
    return route.fulfill({ status: 404, json: { detail: 'Unexpected fixture endpoint' } });
  });
  return state;
}
test('account invite retry reuses operation key and fits narrow/wide viewport', async ({
  page,
}) => {
  const state = await setup(page);
  state.failed = true;
  await page.goto('/admin/accounts');
  await page.getByLabel('Email internal').fill('invite@example.test');
  await page.getByLabel('Nama', { exact: true }).fill('Invite Fixture');
  await page.getByRole('button', { name: 'Kirim invite' }).click();
  await expect(page.getByText('TEST ONLY retry delivery')).toBeVisible();
  await page.getByRole('button', { name: 'Kirim invite' }).click();
  await expect(page.getByText('Status: INVITED', { exact: false })).toBeVisible();
  expect(state.keys).toHaveLength(2);
  expect(state.keys[0]).toBe(state.keys[1]);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
test('Operations direct account route never loads account or invitation data', async ({ page }) => {
  const state = await setup(page, 'OPERATIONS');
  await page.goto('/admin/accounts');
  await expect(page.getByText(/Hanya Super Admin/)).toBeVisible();
  expect(state.requests.some((path) => /admin\/(accounts|invitations)/.test(path))).toBe(false);
});
test('expired invite removes secret URL and does not offer password setup', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/auth/confirm?token_hash=TEST_ONLY_EXPIRED&type=invite');
  await expect(page.getByText(/Tautan telah dipakai/)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/auth\/confirm$/);
  await expect(page.getByLabel('Password baru')).toHaveCount(0);
});

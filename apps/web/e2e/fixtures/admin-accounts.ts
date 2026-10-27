import type { Page } from '@playwright/test';
import type { AdminAccountDto, AdminInvitationDto } from '../../src/features/admin/generated-types';

export const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const account = (index: number): AdminAccountDto => ({
  id: index === 0 ? userId : `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
  displayName: [
    'Super Fixture',
    'Nadia Operasional',
    'Raka Konten',
    'Alya Tim Kurikulum dan Moderasi',
    'Dimas Tanpa Assignment',
  ][index % 5]!,
  email: index === 3 ? 'kurikulum.dan.moderasi.wilayah@example.test' : `admin${index}@example.test`,
  adminRole: (
    [
      'SUPER_ADMIN',
      'OPERATIONS',
      'CONTENT_DATA_MODERATION',
      'CONTENT_DATA_MODERATION',
      null,
    ] as const
  )[index % 5]!,
  status: index === 3 ? 'DISABLED' : 'ACTIVE',
  createdAt: '2026-10-05T00:00:00Z',
});
export const invitation = (
  index: number,
  status: AdminInvitationDto['status'] = 'INVITED',
): AdminInvitationDto => ({
  id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
  email: `invite${index}@example.test`,
  displayName: `Undangan Fixture ${index}`,
  targetRole: 'OPERATIONS',
  status,
  userId: null,
  failureCode: status === 'FAILED' ? 'TEST_ONLY_DELIVERY_FAILURE' : null,
  createdAt: '2026-10-05T00:00:00Z',
  updatedAt: '2026-10-06T00:00:00Z',
});

/** Local browser fixtures only: no Supabase business queries or real email delivery. */
export async function setupAccounts(
  page: Page,
  options: { role?: string | null; status?: string; staleCapability?: boolean } = {},
) {
  const role = options.role === undefined ? 'SUPER_ADMIN' : options.role;
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
    accounts: Array.from({ length: 7 }, (_, index) => account(index)),
    invitations: [
      invitation(0, 'FAILED'),
      invitation(1),
      invitation(2, 'ACCEPTED'),
      invitation(3, 'CANCELLED'),
      invitation(4, 'SENDING'),
      invitation(5, 'RESERVED'),
      invitation(6),
    ],
    requests: [] as {
      path: string;
      query: string;
      method: string;
      body: unknown;
      key: string | undefined;
    }[],
    failInvite: false,
    failRecovery: false,
    failUpdate: false,
    failAccounts: 0,
    failInvitations: 0,
    delay: 0,
  };
  await page.route('https://numora-e2e.supabase.co/**', (route) =>
    route.fulfill({
      status: 400,
      json: { error: 'otp_expired', error_description: 'TEST ONLY expired' },
    }),
  );
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    state.requests.push({
      path,
      query: url.search,
      method,
      body: req.postData() ? req.postDataJSON() : null,
      key: req.headers()['idempotency-key'],
    });
    if (path.endsWith('/identity/me'))
      return route.fulfill({
        json: {
          id: userId,
          role: 'ADMIN',
          status: options.status ?? 'ACTIVE',
          displayName: 'Super Fixture',
          email: 'admin@example.test',
          adminRole: role,
          capabilities:
            role === 'SUPER_ADMIN' || options.staleCapability
              ? ['ADMIN_ACCOUNTS_MANAGE', 'OPERATIONS_MANAGE', 'CONTENT_MANAGE']
              : role === 'OPERATIONS'
                ? ['OPERATIONS_MANAGE']
                : role === 'CONTENT_DATA_MODERATION'
                  ? ['CONTENT_MANAGE']
                  : [],
          teacherVerified: null,
          studentAffiliation: null,
        },
      });
    if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
    if (path.endsWith('/admin/accounts') && method === 'GET') {
      if (state.failAccounts)
        return route.fulfill({
          status: state.failAccounts,
          json: {
            code: 'TEST_ACCOUNT_ERROR',
            detail:
              state.failAccounts === 403
                ? 'Akses akun telah dicabut.'
                : 'Daftar akun belum dapat dimuat.',
          },
        });
      const filter = url.searchParams.get('search')?.toLowerCase() ?? '';
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      const rows = state.accounts.filter((row) =>
        `${row.displayName} ${row.email}`.toLowerCase().includes(filter),
      );
      return route.fulfill({
        json: {
          items: rows.slice(offset, offset + limit),
          nextOffset: offset + limit < rows.length ? offset + limit : null,
        },
      });
    }
    if (path.endsWith('/admin/invitations') && method === 'GET') {
      if (state.failInvitations)
        return route.fulfill({
          status: state.failInvitations,
          json: { code: 'TEST_INVITE_ERROR', detail: 'Daftar undangan belum dapat dimuat.' },
        });
      const filter = url.searchParams.get('search')?.toLowerCase() ?? '';
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      const rows = state.invitations.filter((row) =>
        `${row.displayName} ${row.email}`.toLowerCase().includes(filter),
      );
      return route.fulfill({
        json: {
          items: rows.slice(offset, offset + limit),
          nextOffset: offset + limit < rows.length ? offset + limit : null,
        },
      });
    }
    if (path.endsWith('/admin/invitations') && method === 'POST') {
      if (state.failInvite) {
        state.failInvite = false;
        return route.fulfill({
          status: 503,
          json: {
            code: 'ADMIN_INVITE_DELIVERY_UNCONFIRMED',
            detail: 'Pengiriman belum dikonfirmasi. Coba lagi.',
          },
        });
      }
      const input = req.postDataJSON();
      const created = { ...invitation(8), ...input, targetRole: input.adminRole };
      state.invitations.unshift(created);
      return route.fulfill({ json: created });
    }
    if (/\/admin\/accounts\/[^/]+$/.test(path) && method === 'PATCH') {
      if (state.failUpdate)
        return route.fulfill({
          status: 409,
          json: {
            code: 'ADMIN_LAST_SUPER_ADMIN',
            detail: 'Super Admin aktif terakhir tidak dapat dinonaktifkan.',
          },
        });
      const row = state.accounts.find((item) => item.id === path.split('/').at(-1));
      Object.assign(row!, req.postDataJSON());
      return route.fulfill({ json: row });
    }
    if (path.endsWith('/recovery') && method === 'POST') {
      if (state.failRecovery) {
        state.failRecovery = false;
        return route.fulfill({
          status: 503,
          json: { code: 'TEST_RECOVERY_ERROR', detail: 'Pemulihan belum berhasil. Coba lagi.' },
        });
      }
      return route.fulfill({ json: { success: true } });
    }
    if (/\/admin\/invitations\/[^/]+\/(retry|cancel)$/.test(path) && method === 'POST') {
      const row = state.invitations.find((item) => item.id === path.split('/').at(-2));
      row!.status = path.endsWith('/cancel') ? 'CANCELLED' : 'INVITED';
      row!.failureCode = null;
      return route.fulfill({ json: row });
    }
    return route.fulfill({ status: 404, json: { detail: 'Unexpected fixture endpoint' } });
  });
  return state;
}

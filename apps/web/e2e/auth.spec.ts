import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Synthetic browser fixtures only: exercise the real SDK/AuthProvider without cloud writes.
const userId = '11111111-1111-4111-8111-111111111111';
function session() {
  const accessToken = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: userId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.');
  return {
    access_token: accessToken,
    refresh_token: 'fixture-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'kirino@example.test',
      app_metadata: { provider: 'google' },
      user_metadata: { full_name: 'Kirino S.' },
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}
async function setup(page: Page, signedIn = false) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const value = session();
  if (signedIn)
    await page.addInitScript((value) => {
      if (!localStorage.getItem('auth-fixture-initialized')) {
        localStorage.setItem('auth-fixture-initialized', 'yes');
        localStorage.setItem('sb-numora-e2e-auth-token', JSON.stringify(value));
      }
    }, value);
  const state = {
    role: '' as '' | 'STUDENT' | 'TEACHER' | 'ADMIN',
    verified: false,
    identityError: 0,
    failRegister: false,
    failExchange: false,
    posts: [] as unknown[],
    exchanges: [] as Record<string, unknown>[],
    identityWait: null as Promise<void> | null,
    exchangeWait: null as Promise<void> | null,
  };
  await page.route('https://numora-e2e.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/token')) {
      state.exchanges.push(route.request().postDataJSON());
      if (state.exchangeWait) await state.exchangeWait;
      if (state.failExchange)
        return route.fulfill({
          status: 400,
          json: { error: 'invalid_grant', error_description: 'Fixture code expired.' },
        });
      return route.fulfill({ json: value });
    }
    await route.fulfill({ json: {} });
  });
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const fail = (status: number, code: string, detail: string) =>
      route.fulfill({
        status,
        contentType: 'application/problem+json',
        json: { status, code, detail },
      });
    let data: unknown = {};
    if (path === '/identity/me') {
      if (state.identityWait) await state.identityWait;
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        state.posts.push(body);
        if (state.failRegister)
          return fail(503, 'PROFILE_UNAVAILABLE', 'Profil belum tersimpan. Coba lagi.');
        state.role = body.role;
      }
      if (state.identityError)
        return fail(
          state.identityError,
          state.identityError === 403 ? 'ACCOUNT_DISABLED' : 'FIXTURE_ERROR',
          state.identityError === 401 ? 'Sesi berakhir.' : 'Akun belum dapat diperiksa.',
        );
      if (!state.role) return fail(404, 'ACCOUNT_NOT_REGISTERED', 'Pilih role untuk melanjutkan.');
      data = {
        id: userId,
        role: state.role,
        status: 'ACTIVE',
        displayName: 'Kirino S.',
        email: 'kirino@example.test',
        teacherVerified: state.role === 'TEACHER' ? state.verified : null,
        studentAffiliation: state.role === 'STUDENT' ? 'MANDIRI' : null,
      };
    } else if (path === '/students/me/dashboard')
      data = {
        displayName: 'Kirino S.',
        affiliation: 'MANDIRI',
        class: null,
        completedLevels: 0,
        availableLevels: 5,
        latestDrillScore: null,
        bestDrillScore: null,
        activities: [],
        activeDrill: null,
        features: {
          drill: true,
          tryout: true,
          pretest: false,
          pvp: false,
          classLeaderboard: false,
          pendingPolicies: ['OPEN-07', 'OPEN-11'],
        },
      };
    else if (path === '/tryout/packages/current')
      data = { state: 'unavailable', message: 'Belum ada paket.' };
    else if (path === '/students/me/feedback/summary') data = { unreadCount: 0, latest: [] };
    else if (path === '/chapters') data = { chapters: [] };
    else if (['/schools', '/classes', '/admin/schools'].includes(path)) data = { items: [] };
    await route.fulfill({ json: data });
  });
  return { state, errors };
}
async function capture(page: Page, name: string, width: number) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    bounds: [
      ...document.querySelectorAll(
        '.auth-brand-header,.auth-welcome,.auth-card,.auth-role-option,.auth-google-identity',
      ),
    ].map((el) => {
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        className: el.className,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        radius: s.borderRadius,
        font: s.fontFamily,
      };
    }),
  }));
  expect(geometry.overflow).toBe(false);
  const out = resolve('../../.tmp/redesign-phase8');
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, `${name}-${width}.json`), JSON.stringify(geometry, null, 2));
  await page.screenshot({
    path: resolve(out, `${name}-${width}.png`),
    fullPage: true,
    animations: 'disabled',
    style: 'nextjs-portal { visibility:hidden !important; }',
  });
}
for (const width of [320, 360, 390, 393, 430, 768, 1024, 1280, 1440]) {
  test(`Auth visual states at ${width}px keep Google identity and keyboard role selection`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state, errors } = await setup(page, true);
    // Explicitly clear the synthetic session to view the signed-out login first.
    await page.goto('/');
    await expect(page).toHaveURL(/onboarding/);
    await page.getByRole('button', { name: 'Keluar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeVisible();
    await capture(page, 'login', width);
    await page.evaluate(
      (value) => localStorage.setItem('sb-numora-e2e-auth-token', JSON.stringify(value)),
      session(),
    );
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: 'Lengkapi profilmu' })).toBeVisible();
    await expect(page.getByText('kirino@example.test')).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await capture(page, 'onboarding', width);
    const student = page.getByRole('radio', { name: /Siswa/ });
    await student.focus();
    await page.keyboard.press('Space');
    await expect(student).toBeChecked();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: /Guru/ })).toBeChecked();
    await capture(page, 'onboarding-teacher', width);
    expect(state.posts).toEqual([]);
    await page.goto('/auth/callback?error=access_denied');
    await expect(page.getByRole('heading', { name: 'Login belum berhasil' })).toBeVisible();
    await capture(page, 'callback-error', width);
    expect(errors).toEqual([]);
  });
}
test('Google login launches the existing PKCE authorize URL and origin callback', async ({
  page,
}) => {
  const { errors } = await setup(page);
  let authorize: URL | undefined;
  await page.route('https://numora-e2e.supabase.co/auth/v1/authorize**', (route) => {
    authorize = new URL(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<p>Fixture Google consent</p>' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Lanjutkan dengan Google' }).click();
  await expect(page.getByText('Fixture Google consent')).toBeVisible();
  expect(authorize?.searchParams.get('provider')).toBe('google');
  expect(authorize?.searchParams.get('redirect_to')).toBe('http://localhost:3300/auth/callback');
  expect(authorize?.searchParams.get('code_challenge')).toBeTruthy();
  expect(authorize?.searchParams.get('code_challenge_method')?.toLowerCase()).toBe('s256');
  expect(errors).toEqual([]);
});
test('PKCE callback exchanges once, persists a session, and recovers an expired code', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'sb-numora-e2e-auth-token-code-verifier',
      JSON.stringify('fixture-verifier'),
    ),
  );
  let release!: () => void;
  state.exchangeWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.goto('/auth/callback?code=fixture-code');
  await expect(page.getByRole('heading', { name: 'Menyelesaikan login' })).toBeVisible();
  await capture(page, 'callback-loading', 390);
  release();
  state.exchangeWait = null;
  await expect(page).toHaveURL(/onboarding/);
  expect(state.exchanges).toEqual([
    { auth_code: 'fixture-code', code_verifier: 'fixture-verifier' },
  ]);
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  state.failExchange = true;
  await page.goto('/auth/callback?code=expired-fixture');
  await expect(page.getByText('Sesi login belum dapat dibuat. Coba masuk lagi.')).toBeVisible();
  await capture(page, 'callback-expired', 390);
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeVisible();
  expect(errors).toEqual([]);
});
for (const role of ['STUDENT', 'TEACHER'] as const) {
  test(`${role} onboarding retries registration, sends only role, and follows server destination`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const { state, errors } = await setup(page, true);
    state.failRegister = true;
    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Simpan dan lanjutkan' }).click();
    await expect(page.getByText('Pilih role.', { exact: true })).toBeVisible();
    expect(state.posts).toEqual([]);
    await page.getByRole('radio', { name: role === 'STUDENT' ? /Siswa/ : /Guru/ }).check();
    await page.getByRole('button', { name: 'Simpan dan lanjutkan' }).click();
    await expect(page.getByText('Profil belum tersimpan. Coba lagi.')).toBeVisible();
    await capture(page, `registration-error-${role.toLowerCase()}`, 390);
    state.failRegister = false;
    await page.getByRole('button', { name: 'Simpan dan lanjutkan' }).click();
    await expect(page).toHaveURL(
      role === 'STUDENT' ? /\/student$/ : /teacher\/verification-required$/,
    );
    expect(state.posts).toEqual([{ role }, { role }]);
    if (role === 'STUDENT') {
      await expect(
        page
          .getByRole('link', { name: 'Buka profil siswa' })
          .getByText('User Mandiri', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: /Latihan Soal/ })).toBeVisible();
    } else await expect(page.getByRole('combobox', { name: 'Sekolah', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test('identity retry, disabled account logout, and expired session retain recovery', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page, true);
  state.identityError = 503;
  await page.goto('/');
  await expect(page.getByText('Akun belum dapat diperiksa.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeDisabled();
  await capture(page, 'identity-error', 390);
  state.identityError = 0;
  await page.getByRole('button', { name: 'Periksa lagi' }).click();
  await expect(page).toHaveURL(/onboarding/);
  state.identityError = 403;
  await page.goto('/');
  await expect(page.getByText('Akun ini tidak aktif.')).toBeVisible();
  await capture(page, 'account-disabled', 390);
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeVisible();
  await page.evaluate(
    (value) => localStorage.setItem('sb-numora-e2e-auth-token', JSON.stringify(value)),
    session(),
  );
  state.identityError = 401;
  await page.reload();
  await expect(page.getByText('Sesi berakhir. Login kembali.')).toBeVisible();
  await capture(page, 'session-expired', 390);
  expect(errors).toEqual([]);
});
test('loading and long Google identity reflow without overflow at narrow width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const { state, errors } = await setup(page, true);
  let release!: () => void;
  state.identityWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Memeriksa sesi…' })).toBeVisible();
  await capture(page, 'onboarding-loading', 320);
  release();
  state.identityWait = null;
  await expect(page.getByRole('radio', { name: /Siswa/ })).toBeVisible();
  await page.evaluate(() => {
    const key = 'sb-numora-e2e-auth-token';
    const value = JSON.parse(localStorage.getItem(key)!);
    value.user.user_metadata.full_name =
      'Nama Akun Google Sangat Panjang Untuk Pemeriksaan Tata Letak';
    value.user.email = 'nama.siswa.yang.sangat.panjang@example.test';
    localStorage.setItem(key, JSON.stringify(value));
  });
  await page.reload();
  await expect(page.getByText('nama.siswa.yang.sangat.panjang@example.test')).toBeVisible();
  await capture(page, 'onboarding-long-identity', 320);
  expect(errors).toEqual([]);
});

for (const [role, verified, path] of [
  ['STUDENT', false, '/student'],
  ['TEACHER', false, '/teacher/verification-required'],
  ['TEACHER', true, '/teacher'],
  ['ADMIN', false, '/admin/schools'],
] as const) {
  test(`Existing ${role} ${verified ? 'verified' : 'default'} identity leaves login for ${path}`, async ({
    page,
  }) => {
    const { state, errors } = await setup(page, true);
    state.role = role;
    state.verified = verified;
    await page.goto('/');
    await expect(page).toHaveURL(`http://localhost:3300${path}`);
    await expect(page.locator('.auth-registration-form')).toHaveCount(0);
    expect(state.posts).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('onboarding identity errors retry without exposing role choices prematurely', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page, true);
  state.identityError = 503;
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Profil belum dapat diperiksa' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await capture(page, 'onboarding-error', 390);
  state.identityError = 0;
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.getByRole('radio', { name: /Siswa/ })).toBeVisible();
  expect(errors).toEqual([]);
});

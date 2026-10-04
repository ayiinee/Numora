import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Browser-only synthetic fixtures. No product auth bypass or cloud writes.
const teacherId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const studentId = '33333333-3333-4333-8333-333333333333';
const schoolId = '44444444-4444-4444-8444-444444444444';
async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: teacherId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.');
  await page.addInitScript(
    ({ jwt, teacherId }) => {
      if (!localStorage.getItem('test-logged-out'))
        localStorage.setItem(
          'sb-numora-e2e-auth-token',
          JSON.stringify({
            access_token: jwt,
            refresh_token: 'fixture-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: teacherId,
              aud: 'authenticated',
              role: 'authenticated',
              email: 'ratna@example.test',
              app_metadata: { provider: 'google' },
              user_metadata: { name: 'Bu Ratna, M.Pd.' },
              created_at: '2026-01-01T00:00:00Z',
            },
          }),
        );
    },
    { jwt, teacherId },
  );
  const state = {
    verified: false,
    failSchools: false,
    emptySchools: false,
    failVerify: false,
    verifyStatus: 400,
    failCreate: false,
    emptyClass: false,
    denied: 0,
    emptyProgress: false,
    verifyTokens: [] as string[],
    creates: [] as string[],
    classes: [
      { id: classId, name: 'Kelas IX-B', joinCode: 'CLS-9B-JKT' },
      { id: '55555555-5555-4555-8555-555555555555', name: 'Kelas IX-A', joinCode: 'QA2345' },
      {
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Kelas Pendampingan Matematika Semester Ganjil',
        joinCode: 'Ab_cd-234',
      },
      { id: '77777777-7777-4777-8777-777777777777', name: 'Kelas IX-C', joinCode: 'QA6789' },
    ],
  };
  await page.route('https://numora-e2e.supabase.co/**', (route) => route.fulfill({ json: {} }));
  const fail = (status: number, detail: string) => ({
    status,
    contentType: 'application/problem+json',
    json: { status, code: 'FIXTURE_ERROR', detail },
  });
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown;
    if (path === '/identity/me')
      data = {
        id: teacherId,
        role: 'TEACHER',
        status: 'ACTIVE',
        displayName: 'Bu Ratna, M.Pd.',
        email: 'ratna@example.test',
        teacherVerified: state.verified,
        studentAffiliation: null,
      };
    else if (path === '/schools') {
      if (state.failSchools) return route.fulfill(fail(503, 'Sekolah belum dapat dimuat.'));
      data = { items: state.emptySchools ? [] : [{ id: schoolId, name: 'SMPN 1 Jakarta' }] };
    } else if (path === `/schools/${schoolId}/teacher-verifications`) {
      state.verifyTokens.push(route.request().postDataJSON().token);
      if (state.failVerify)
        return route.fulfill(fail(state.verifyStatus, 'Token kedaluwarsa atau sudah digunakan.'));
      state.verified = true;
      data = { verified: true };
    } else if (path === '/classes') {
      if (route.request().method() === 'POST') {
        const name = route.request().postDataJSON().name;
        state.creates.push(name);
        if (state.failCreate) return route.fulfill(fail(503, 'Kelas belum dapat dibuat.'));
        const value = { id: '88888888-8888-4888-8888-888888888888', name, joinCode: 'Ab_cd-234' };
        state.classes.push(value);
        data = value;
      } else data = { items: state.classes };
    } else if (path === `/classes/${classId}/students`) {
      if (state.denied) return route.fulfill(fail(state.denied, 'Akses kelas ditolak.'));
      data = {
        class: state.classes[0],
        items: state.emptyClass
          ? []
          : [
              { id: studentId, displayName: 'Kirino S.' },
              {
                id: '99999999-9999-4999-8999-999999999999',
                displayName: 'Nabila Az-Zahra Putri Pratama',
              },
              { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', displayName: 'Dimas A.' },
            ],
      };
    } else if (path === `/classes/${classId}/students/${studentId}/progress`) {
      if (state.denied) return route.fulfill(fail(state.denied, 'Akses kelas ditolak.'));
      data = {
        class: { id: classId, name: 'Kelas IX-B' },
        student: { id: studentId, displayName: 'Kirino S.' },
        latestDrillScore: state.emptyProgress ? null : 0,
        levels: state.emptyProgress
          ? []
          : [
              {
                levelId: 'l1',
                chapterLabel: 'Bab 2 · Aljabar',
                subchapterLabel: 'Faktorisasi & Bentuk Kuadrat',
                levelLabel: 'Level 1 · Pengenalan Suku & Faktor',
                accessStatus: 'UNLOCKED',
                inProgress: false,
                latestDrillScore: 0,
                bestDrillScore: 90,
              },
              {
                levelId: 'l2',
                chapterLabel: 'Bab 2 · Aljabar',
                subchapterLabel: 'Faktorisasi & Bentuk Kuadrat',
                levelLabel: 'Level 2 · Bentuk Kuadrat Sempurna',
                accessStatus: 'UNLOCKED',
                inProgress: true,
                latestDrillScore: 60,
                bestDrillScore: 80,
              },
              {
                levelId: 'l3',
                chapterLabel: 'Bab 2 · Aljabar',
                subchapterLabel: 'Faktorisasi & Bentuk Kuadrat',
                levelLabel: 'Level 3 · Persamaan Kuadrat',
                accessStatus: 'LOCKED',
                inProgress: false,
                latestDrillScore: null,
                bestDrillScore: null,
              },
              {
                levelId: 'l4',
                chapterLabel: 'Bab 3 · Geometri',
                subchapterLabel: 'Geometri & Teorema Pythagoras',
                levelLabel: 'Level 1 · Pengenalan Bangun',
                accessStatus: 'UNLOCKED',
                inProgress: false,
                latestDrillScore: null,
                bestDrillScore: null,
              },
            ],
      };
    } else return route.fulfill(fail(404, 'Fixture route tidak tersedia.'));
    return route.fulfill({ json: data });
  });
  return { state, errors };
}
async function capture(page: Page, name: string, width: number) {
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  const out = resolve('../../.tmp/redesign-phase7');
  await mkdir(out, { recursive: true });
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    bounds: [
      ...document.querySelectorAll(
        '.app-topbar,.teacher-identity-card,.teacher-class-card,.teacher-create-card,.teacher-filter-card,.teacher-students-card,.teacher-student-identity,.teacher-latest-score,.teacher-level-card,.teacher-account-card,.teacher-verification-intro,.teacher-verification-form',
      ),
    ].map((el) => {
      const b = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      return {
        className: el.className,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        radius: c.borderRadius,
        background: c.backgroundColor,
      };
    }),
  }));
  expect(geometry.overflow).toBe(false);
  await writeFile(resolve(out, `${name}-${width}.json`), JSON.stringify(geometry, null, 2));
  await page.screenshot({
    path: resolve(out, `${name}-${width}.png`),
    fullPage: true,
    animations: 'disabled',
    style: 'nextjs-portal {visibility:hidden !important;}',
  });
}
for (const width of [320, 360, 390, 393, 430, 768, 1024, 1280, 1440]) {
  test(`Teacher verification, class, student and profile at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state, errors } = await setup(page);
    await page.goto('/teacher/verification-required');
    await expect(page.getByRole('combobox', { name: 'Sekolah', exact: true })).toBeEnabled();
    await capture(page, 'verification', width);
    await page.getByRole('combobox', { name: 'Sekolah', exact: true }).selectOption(schoolId);
    await page.getByLabel('Token verifikasi').fill('Ab2345Cd');
    await page.getByRole('button', { name: 'Verifikasi dan lanjutkan' }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    expect(state.verifyTokens).toEqual(['Ab2345Cd']);
    await expect(page.locator('.teacher-class-card')).toHaveCount(4);
    await capture(page, 'classes', width);
    const create = page.locator('.teacher-create-details summary');
    await create.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Nama kelas')).toBeVisible();
    await page.getByLabel('Nama kelas').fill(' IX-D ');
    await capture(page, 'create-class', width);
    await page.getByRole('button', { name: 'Buat kelas', exact: true }).click();
    await expect(page.locator('.teacher-class-card')).toHaveCount(5);
    expect(state.creates).toEqual(['IX-D']);
    await expect(page.locator('.teacher-created-code')).toContainText('Ab_cd-234');
    await page.getByRole('link', { name: /Kelas IX-B/ }).click();
    await expect(page.locator('.teacher-student-link')).toHaveCount(3);
    await capture(page, 'students', width);
    await page.getByLabel('Cari siswa').fill('NABILA');
    await expect(page.locator('.teacher-student-link')).toHaveCount(1);
    await page.getByLabel('Cari siswa').fill('');
    await page.getByLabel('Urutkan').selectOption('desc');
    await expect(page.locator('.teacher-student-link').first()).toContainText('Nabila');
    await page.getByRole('link', { name: /Kirino S/ }).click();
    await expect(page.getByRole('heading', { name: '0', exact: true })).toBeVisible();
    await expect(
      page.locator('.teacher-level-card').first().getByText('90', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Terkunci', { exact: true })).toBeVisible();
    await expect(page.locator('main input,main select,main textarea')).toHaveCount(0);
    await capture(page, 'progress', width);
    await page.getByRole('link', { name: 'Buka profil' }).click();
    await expect(page.getByRole('heading', { name: 'Profil & akun' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keluar dari akun' })).toBeVisible();
    await capture(page, 'profile', width);
    if (width < 960) {
      await page.getByRole('button', { name: 'Menu navigasi', exact: true }).click();
      await expect(
        page.locator('#mobile-menu').getByRole('link', { name: 'Profil' }),
      ).toHaveAttribute('aria-current', 'page');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Menu navigasi', exact: true })).toBeFocused();
    }
    expect(errors).toEqual([]);
  });
}
test('Teacher failed verification and school loading remain retryable without opening classes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  state.failSchools = true;
  await page.goto('/teacher/verification-required');
  await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeVisible();
  await capture(page, 'verification-school-error', 390);
  state.failSchools = false;
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await page.getByRole('combobox', { name: 'Sekolah', exact: true }).selectOption(schoolId);
  await page.getByLabel('Token verifikasi').fill('Ab2345Cd');
  state.failVerify = true;
  await page.getByRole('button', { name: 'Verifikasi dan lanjutkan' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Token kedaluwarsa');
  await expect(page.getByLabel('Token verifikasi')).toHaveValue('Ab2345Cd');
  await expect(page).toHaveURL(/verification-required$/);
  await capture(page, 'verification-token-error', 390);
  state.failVerify = false;
  await page.getByRole('button', { name: 'Verifikasi dan lanjutkan' }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  expect(state.verifyTokens).toEqual(['Ab2345Cd', 'Ab2345Cd']);
  expect(errors).toEqual([]);
});
test('Teacher create error, empty classes and students retain recovery and no fake data', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  state.verified = true;
  state.classes = [];
  state.failCreate = true;
  await page.goto('/teacher');
  await expect(page.getByRole('heading', { name: 'Kelas pertama dimulai di sini' })).toBeVisible();
  await capture(page, 'classes-empty', 390);
  await page.locator('.teacher-create-details summary').click();
  await page.getByLabel('Nama kelas').fill('IX Retry');
  await page.getByRole('button', { name: 'Buat kelas', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Kelas belum dapat dibuat.');
  await expect(page.getByLabel('Nama kelas')).toHaveValue('IX Retry');
  await capture(page, 'create-error', 390);
  state.failCreate = false;
  await page.getByRole('button', { name: 'Buat kelas', exact: true }).click();
  await expect(page.locator('.teacher-class-card')).toHaveCount(1);
  state.classes = [{ id: classId, name: 'Kelas IX-B', joinCode: 'QA2345' }];
  state.emptyClass = true;
  await page.goto(`/teacher/classes/${classId}`);
  await expect(page.getByRole('heading', { name: 'Belum ada siswa', exact: true })).toBeVisible();
  await capture(page, 'students-empty', 390);
  state.emptyProgress = true;
  await page.goto(`/teacher/classes/${classId}/students/${studentId}`);
  await expect(page.getByRole('heading', { name: 'Belum ada latihan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Belum ada level', exact: true })).toBeVisible();
  await capture(page, 'progress-empty', 390);
  expect(errors).toEqual([]);
});
test('Teacher denied class and expired session never expose student scores', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  state.verified = true;
  state.denied = 403;
  await page.goto(`/teacher/classes/${classId}/students/${studentId}`);
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  await expect(page.locator('.teacher-level-card')).toHaveCount(0);
  await capture(page, 'progress-forbidden', 390);
  state.denied = 401;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sesi berakhir' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Masuk kembali' })).toHaveAttribute('href', '/');
  await capture(page, 'progress-session-expired', 390);
  expect(errors).toEqual([]);
});

test('Teacher verification handles empty schools, expired token session and disabled identity', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  state.emptySchools = true;
  await page.goto('/teacher/verification-required');
  await expect(page.getByText('Belum ada sekolah aktif.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verifikasi dan lanjutkan' })).toBeDisabled();
  await capture(page, 'verification-empty', 390);
  state.emptySchools = false;
  state.failVerify = true;
  state.verifyStatus = 401;
  await page.reload();
  await page.getByRole('combobox', { name: 'Sekolah', exact: true }).selectOption(schoolId);
  await page.getByLabel('Token verifikasi').fill('Ab2345Cd');
  await page.getByRole('button', { name: 'Verifikasi dan lanjutkan' }).click();
  await expect(page.getByRole('link', { name: 'Masuk kembali' })).toHaveAttribute('href', '/');
  await capture(page, 'verification-session-expired', 390);
  await page.route('http://localhost:3301/api/v1/identity/me', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/problem+json',
      json: { code: 'ACCOUNT_DISABLED', detail: 'Akun tidak aktif.' },
    }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Akun tidak aktif' })).toBeVisible();
  await expect(page.getByLabel('Token verifikasi')).toHaveCount(0);
  await capture(page, 'verification-disabled', 390);
  expect(errors).toEqual([]);
});

test('Teacher class loading does not fabricate cards before the server responds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  state.verified = true;
  let release!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('http://localhost:3301/api/v1/classes', async (route) => {
    await responseGate;
    await route.fulfill({ json: { items: state.classes } });
  });
  try {
    await page.goto('/teacher');
    await expect(
      page.getByRole('heading', { name: 'Selamat datang, Bu Ratna, M.Pd.' }),
    ).toBeVisible();
    await expect(page.getByLabel('Memuat data')).toBeVisible();
    await expect(page.locator('.teacher-class-card')).toHaveCount(0);
    await capture(page, 'classes-loading', 390);
  } finally {
    release();
  }
  await expect(page.locator('.teacher-class-card')).toHaveCount(4);
  expect(errors).toEqual([]);
});

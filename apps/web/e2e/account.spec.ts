import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Synthetic browser-only fixtures; no app auth bypass, cloud seed or real messages.
const studentId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const noteId = '33333333-3333-4333-8333-333333333333';
const fixtureNotes = [
  {
    id: noteId,
    classId,
    studentId,
    teacherName: 'Bu Ratna, M.Pd.',
    body: 'Hebat Kirino! Pemahamanmu di Faktorisasi Kuadrat sudah tuntas 85%. Pertahankan streak dan tingkatkan kecepatan di Level 3 ya! Perhatikan kembali tanda minus saat pemfaktoran selisih dua kuadrat di soal nomor 7 tadi.',
    sentAt: '2026-10-04T02:30:00Z',
    readAt: null as string | null,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    classId,
    studentId,
    teacherName: 'Bu Ratna, M.Pd.',
    body: 'Hasil Tryout Paket #03 cukup solid di bab Bilangan dan Aljabar. Namun bagian Geometri Ruang masih butuh penguatan di rumus luas permukaan prisma. Coba luangkan waktu drill 10 soal geometri besok ya!',
    sentAt: '2026-09-28T07:15:00Z',
    readAt: '2026-09-29T02:00:00Z',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    classId,
    studentId,
    teacherName: 'Bu Ratna, M.Pd.',
    body: 'Selamat atas pencapaianmu! Tetap konsisten dan jaga ritme pengerjaan 15 menit per hari menjelang TKA resmi.',
    sentAt: '2026-09-21T03:00:00Z',
    readAt: '2026-09-22T02:00:00Z',
  },
];
async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: studentId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.');
  await page.addInitScript(
    ({ jwt, studentId }) => {
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
              id: studentId,
              aud: 'authenticated',
              role: 'authenticated',
              email: 'kirino@example.test',
              app_metadata: { provider: 'google' },
              user_metadata: { name: 'Kirino S.' },
              created_at: '2026-01-01T00:00:00Z',
            },
          }),
        );
    },
    { jwt, studentId },
  );
  const state = {
    school: true,
    notes: fixtureNotes.map((n) => ({ ...n })),
    reads: 0,
    failRead: false,
    failList: false,
    nextPage: false,
    failPage: false,
    failJoin: false,
    joins: [] as string[],
  };
  await page.route('https://numora-e2e.supabase.co/**', (route) => route.fulfill({ json: {} }));
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    let data: unknown;
    if (path === '/identity/me')
      data = {
        id: studentId,
        role: 'STUDENT',
        status: 'ACTIVE',
        displayName: 'Kirino S.',
        email: 'kirino@example.test',
        studentAffiliation: state.school ? 'SCHOOL' : 'MANDIRI',
        teacherVerified: null,
      };
    else if (path === '/students/me/dashboard')
      data = {
        displayName: 'Kirino S.',
        affiliation: state.school ? 'SCHOOL' : 'MANDIRI',
        class: state.school ? { id: classId, name: 'IX-B', schoolName: 'SMPN 1 Jakarta' } : null,
        completedLevels: 14,
        availableLevels: 20,
        latestDrillScore: 86,
        bestDrillScore: 90,
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
      data = {
        state: 'resultReady',
        title: 'Tryout Mingguan #03',
        attemptId: '66666666-6666-4666-8666-666666666666',
      };
    else if (path === '/students/me/feedback/summary')
      data = {
        unreadCount: state.notes.filter((n) => !n.readAt).length,
        latest: state.notes.slice(0, 3),
      };
    else if (path === '/students/me/feedback') {
      if (state.failList || (url.searchParams.get('offset') === '20' && state.failPage))
        return route.fulfill({
          status: 403,
          contentType: 'application/problem+json',
          json: { detail: 'Catatan belum tersedia.', code: 'FEEDBACK_DENIED' },
        });
      data = {
        items:
          url.searchParams.get('offset') === '20'
            ? state.notes.slice(1)
            : state.nextPage
              ? state.notes.slice(0, 1)
              : state.notes,
        nextOffset: state.nextPage && url.searchParams.get('offset') === '0' ? 20 : null,
      };
    } else if (path.endsWith('/read')) {
      state.reads++;
      if (state.failRead)
        return route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          json: { detail: 'Belum dapat ditandai.', code: 'READ_UNAVAILABLE' },
        });
      const id = path.split('/').at(-2)!;
      const note = state.notes.find((n) => n.id === id)!;
      note.readAt ??= '2026-10-04T03:00:00Z';
      data = { id, readAt: note.readAt };
    } else if (path === '/classes/join') {
      const { joinCode } = route.request().postDataJSON() as { joinCode: string };
      state.joins.push(joinCode);
      if (state.failJoin)
        return route.fulfill({
          status: 404,
          contentType: 'application/problem+json',
          json: { code: 'CLASS_NOT_FOUND', detail: 'Kode kelas tidak valid.' },
        });
      state.school = true;
      data = { joined: true, class: { id: classId, name: 'IX-B' } };
    } else data = {};
    await route.fulfill({ json: data });
  });
  return { state, errors };
}
async function capture(page: Page, name: string, width: number) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  const out = resolve('../../.tmp/redesign-phase6');
  await mkdir(out, { recursive: true });
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    bounds: [
      ...document.querySelectorAll(
        '.student-account-header,.student-profile-identity,.student-profile-stat,.student-profile-settings,.student-feedback-card',
      ),
    ].map((el) => {
      const b = el.getBoundingClientRect();
      return {
        className: el.className,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        radius: getComputedStyle(el).borderRadius,
      };
    }),
  }));
  expect(geometry.overflow).toBe(false);
  await writeFile(resolve(out, `${name}-${width}.json`), JSON.stringify(geometry, null, 2));
  await page.screenshot({
    path: resolve(out, `${name}-${width}.png`),
    fullPage: true,
    animations: 'disabled',
    style: 'nextjs-portal { visibility:hidden !important; }',
  });
}
for (const width of [320, 360, 390, 393, 430, 768, 1024, 1280, 1440]) {
  test(`Student profile and feedback at ${width}px preserve explicit read and responsive layout`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state, errors } = await setup(page);
    await page.goto('/student/profile');
    await expect(page.getByText('TERAFILIASI SEKOLAH')).toBeVisible();
    await expect(page.getByText('Hasil tersedia')).toBeVisible();
    await expect(page.getByLabel('Kode kelas')).toHaveCount(0);
    await capture(page, 'profile-school', width);
    const summary = page.locator('summary').filter({ hasText: 'Data Diri & Akun Siswa' });
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Email akun', { exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await page
      .locator('.student-profile-settings')
      .getByRole('link', { name: /Catatan Guru/ })
      .click();
    await expect(page).toHaveURL(/student\/feedback$/);
    await expect(page.getByRole('button', { name: 'Tandai Dibaca' })).toBeVisible();
    expect(state.reads).toBe(0);
    await capture(page, 'feedback-all', width);
    await page.getByRole('button', { name: 'Baru & Belum Dibaca (1)' }).click();
    await expect(page.locator('.student-feedback-card')).toHaveCount(1);
    await capture(page, 'feedback-unread', width);
    await page.getByRole('button', { name: 'Tandai Dibaca' }).click();
    await expect(page.getByRole('button', { name: 'Baru & Belum Dibaca (0)' })).toBeVisible();
    expect(state.reads).toBe(1);
    await expect(page.getByRole('button', { name: 'Baru & Belum Dibaca (0)' })).toBeFocused();
    await page.getByRole('button', { name: 'Semua Catatan (3)' }).click();
    await expect(page.locator('.student-feedback-card')).toHaveCount(3);
    await capture(page, 'feedback-read', width);
    state.school = false;
    await page.goto('/student/profile');
    await expect(page.getByText('BELAJAR MANDIRI', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Kode kelas')).toBeVisible();
    await capture(page, 'profile-mandiri', width);
    state.notes = [];
    await page.goto('/student/feedback');
    await page.getByRole('button', { name: 'Perbarui catatan' }).click();
    await expect(page.getByRole('heading', { name: 'Belum ada catatan guru' })).toBeVisible();
    await capture(page, 'feedback-empty', width);
    expect(errors).toEqual([]);
  });
}
test('feedback failure, pagination retry and refresh preserve messages without false read success', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  state.nextPage = true;
  state.failPage = true;
  await page.goto('/student/feedback');
  await page.getByRole('button', { name: 'Muat lainnya' }).click();
  await expect(page.getByRole('button', { name: 'Coba muat catatan lagi' })).toBeVisible();
  await expect(page.getByText(fixtureNotes[0]!.body)).toBeVisible();
  state.failPage = false;
  await page.getByRole('button', { name: 'Coba muat catatan lagi' }).click();
  await expect(page.locator('.student-feedback-card')).toHaveCount(3);
  state.failRead = true;
  await page.getByRole('button', { name: 'Tandai Dibaca' }).click();
  await expect(page.getByRole('button', { name: 'Coba tandai dibaca lagi' })).toBeVisible();
  await capture(page, 'feedback-read-error', 390);
  state.failRead = false;
  await page.getByRole('button', { name: 'Coba tandai dibaca lagi' }).click();
  await expect(page.getByRole('button', { name: 'Baru & Belum Dibaca (0)' })).toBeVisible();
  expect(state.reads).toBe(2);
  state.failList = true;
  await page.getByRole('button', { name: 'Perbarui catatan' }).click();
  await expect(page.getByRole('button', { name: 'Coba muat ulang catatan' })).toBeVisible();
  await expect(page.locator('.student-feedback-card')).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  await capture(page, 'feedback-forbidden', 390);
  state.failList = false;
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Semua Catatan (1)' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('Mandiri join failure preserves input; successful join refreshes identity; logout guards the inbox', async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  state.school = false;
  state.failJoin = true;
  await page.goto('/student/profile');
  await page.getByLabel('Kode kelas').fill('BAD999');
  await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
  await expect(page.getByText('Kode kelas tidak valid.')).toBeVisible();
  await expect(page.getByLabel('Kode kelas')).toHaveValue('BAD999');
  await expect(page.getByText('BELAJAR MANDIRI', { exact: true })).toBeVisible();
  state.failJoin = false;
  await page.getByLabel('Kode kelas').fill(' FIX234 ');
  await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
  await expect(page.getByText('TERAFILIASI SEKOLAH')).toBeVisible();
  expect(state.joins).toEqual(['BAD999', 'FIX234']);
  await page.evaluate(() => localStorage.setItem('test-logged-out', '1'));
  await page.getByRole('button', { name: 'Keluar Akun Google' }).click();
  await expect(page).toHaveURL('http://localhost:3300/');
  await page.goto('/student/feedback');
  await expect(page).toHaveURL('http://localhost:3300/');
  expect(errors).toEqual([]);
});

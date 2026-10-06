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
    teacherName: 'Bu Ratna, M.Pd.',
    verified: false,
    failSchools: false,
    emptySchools: false,
    failVerify: false,
    verifyStatus: 400,
    failCreate: false,
    emptyClass: false,
    denied: 0,
    emptyProgress: false,
    failFeedback: false,
    feedbackSends: [] as { clientRequestId: string; body: string }[],
    feedback: Array.from({ length: 21 }, (_, i) => ({
      id: `feedback-${i}`,
      classId,
      studentId,
      teacherName: 'Bu Ratna, M.Pd.',
      body: `Catatan belajar ${i + 1}: lanjutkan latihan sesuai level yang terbuka.`,
      sentAt: '2026-10-04T02:00:00Z',
      readAt: i % 2 ? null : '2026-10-04T03:00:00Z',
    })),
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
        displayName: state.teacherName,
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
    } else if (/^\/classes\/[^/]+\/students$/.test(path)) {
      if (state.denied) return route.fulfill(fail(state.denied, 'Akses kelas ditolak.'));
      data = {
        class: state.classes.find((value) => value.id === path.split('/')[2]) ?? {
          id: classId,
          name: 'Kelas IX-B',
        },
        items:
          state.emptyClass || path !== `/classes/${classId}/students`
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
    } else if (/^\/classes\/[^/]+\/students\/[^/]+\/progress$/.test(path)) {
      if (state.denied) return route.fulfill(fail(state.denied, 'Akses kelas ditolak.'));
      data = {
        class: { id: classId, name: 'Kelas IX-B' },
        student: {
          id: path.split('/')[4],
          displayName:
            path.split('/')[4] === studentId
              ? 'Kirino S.'
              : path.split('/')[4]!.startsWith('999')
                ? 'Nabila Az-Zahra Putri Pratama'
                : 'Dimas A.',
        },
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
    } else if (path.endsWith('/assessment-results')) {
      data = {
        records: [
          {
            attemptId: 'result-1',
            activity: 'drill',
            title: 'Latihan Aljabar',
            isDemo: false,
            submittedAt: '2026-10-04T01:00:00Z',
            resultState: 'ready',
            score: 0,
          },
          {
            attemptId: 'result-2',
            activity: 'tryout',
            title: 'Tryout Mingguan',
            isDemo: false,
            submittedAt: '2026-10-04T01:30:00Z',
            resultState: 'waitingIrt',
            score: null,
          },
        ],
        nextCursor: null,
      };
    } else if (path.endsWith('/feedback')) {
      const recipient = path.split('/')[4]!;
      if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON();
        state.feedbackSends.push(input);
        if (state.failFeedback)
          return route.fulfill(fail(503, 'Pengiriman belum dapat dipastikan. Coba lagi.'));
        if (!state.feedback.some((entry) => entry.id === input.clientRequestId))
          state.feedback.unshift({
            id: input.clientRequestId,
            classId,
            studentId: recipient,
            teacherName: state.teacherName,
            body: input.body,
            sentAt: new Date().toISOString(),
            readAt: null,
          });
        data = { id: input.clientRequestId };
      } else {
        const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0);
        const entries = state.feedback.filter((entry) => entry.studentId === recipient);
        data = {
          items: entries.slice(offset, offset + 20),
          nextOffset: entries.length > offset + 20 ? offset + 20 : null,
        };
      }
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
  const out = resolve('../../.tmp/teacher-redesign');
  await mkdir(out, { recursive: true });
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    bounds: [
      ...document.querySelectorAll(
        '.teacher-header,.teacher-sidebar,.teacher-bottom-nav,.teacher-identity-card,.teacher-class-card,.teacher-create-card,.teacher-filter-card,.teacher-students-card,.teacher-student-identity,.teacher-latest-score,.teacher-level-card,.teacher-account-card,.teacher-verification-intro,.teacher-verification-form',
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
for (const width of [320, 360, 375, 390, 393, 430, 768, 834, 1024, 1280, 1366, 1440, 1920]) {
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
    await expect(page.locator('.teacher-header')).toHaveCSS(
      'min-height',
      width < 960 ? '80px' : '64px',
    );
    await expect(page.locator('.teacher-redesign-shell')).toHaveCSS(
      'background-color',
      'rgb(243, 236, 203)',
    );
    await expect(page.getByRole('link', { name: 'Pusat Notifikasi' })).toHaveCount(0);
    const primaryNav = page.locator(width < 960 ? '.teacher-bottom-nav' : '.teacher-sidebar__nav');
    await expect(primaryNav.getByRole('link')).toHaveCount(2);
    await expect(primaryNav.getByRole('link', { name: 'Kelas', exact: true })).toHaveAttribute(
      'href',
      '/teacher',
    );
    await expect(primaryNav.getByRole('link', { name: 'Profil', exact: true })).toHaveAttribute(
      'href',
      '/teacher/profile',
    );
    await expect(page.getByText('Siswa di kelas Anda').locator('..').locator('strong')).toHaveText(
      '3',
    );
    const metrics = await page
      .locator('.teacher-dashboard-metrics .teacher-metric')
      .evaluateAll((cards) =>
        cards.map((card) => {
          const box = card.getBoundingClientRect();
          return { top: box.top, width: box.width };
        }),
      );
    expect(metrics).toHaveLength(2);
    expect(metrics[1]!.width).toBeCloseTo(metrics[0]!.width, 0);
    if (width >= 375) expect(metrics[1]!.top).toBeCloseTo(metrics[0]!.top, 0);
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
    await expect(page.locator('.teacher-student-record').first()).toContainText('Nabila');
    await page.getByRole('link', { name: /Kirino S/ }).click();
    await expect(page.getByRole('heading', { name: '0', exact: true })).toBeVisible();
    await expect(
      page.locator('.teacher-level-card').first().getByText('90', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Terkunci', { exact: true })).toBeVisible();
    await expect(page.locator('main input,main select,main textarea')).toHaveCount(0);
    await capture(page, 'progress', width);
    await expect(page.getByText('Menunggu IRT', { exact: true })).toBeVisible();
    await page.goto(`/teacher/classes/${classId}/invite`);
    await expect(page.getByRole('img', { name: 'QR kode kelas Kelas IX-B' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Unduh PNG QR' })).toHaveAttribute(
      'download',
      'numora-kode-kelas.png',
    );
    await capture(page, 'invite', width);
    await page.goto(`/teacher/classes/${classId}/settings`);
    await expect(page).toHaveURL(`/teacher/classes/${classId}`);
    await expect(page.locator('.teacher-student-link')).toHaveCount(3);
    await page.goto(`/teacher/monitoring?classId=${classId}`);
    await expect(page).toHaveURL(`/teacher/classes/${classId}`);
    await expect(
      page.locator('.teacher-progress-row, .teacher-metric, .teacher-curriculum'),
    ).toHaveCount(0);
    await capture(page, 'class-redirect', width);
    await page.goto(`/teacher/feedback?classId=${classId}&studentId=${studentId}`);
    await expect(page.locator('.teacher-feedback-entry')).toHaveCount(20);
    await page.getByLabel('Pesan feedback').fill('Terus berlatih di level yang sudah terbuka.');
    await capture(page, 'feedback', width);
    await page.getByRole('button', { name: 'Kirim feedback', exact: true }).click();
    await expect(page.getByText('Feedback berhasil dikirim kepada Kirino S.')).toBeVisible();
    expect(state.feedbackSends).toHaveLength(1);
    await expect(page.getByLabel('Status baca')).toHaveCount(0);
    await expect(page.getByLabel('Penerima feedback')).toHaveCount(0);
    await expect(page.locator('.teacher-feedback-history')).not.toContainText('Sudah dibaca');
    const removed = await page.goto('/teacher/notifications');
    expect(removed?.status()).toBe(404);
    await page.goto('/teacher/profile');
    await expect(page.getByRole('heading', { name: 'Profil & akun' })).toBeVisible();
    await expect(
      page.locator(
        'main a[href="/teacher/monitoring"], main a[href="/teacher/feedback"], main a[href="/teacher/notifications"]',
      ),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Keluar dari akun' })).toBeVisible();
    await capture(page, 'profile', width);
    await expect(page.locator('.teacher-sidebar')).toBeVisible({ visible: width >= 960 });
    await expect(page.locator('.teacher-bottom-nav')).toBeVisible({ visible: width < 960 });
    await expect(primaryNav.getByRole('link', { name: 'Profil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    if (width < 960) {
      await primaryNav.getByRole('link', { name: 'Kelas', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(primaryNav.getByRole('link', { name: 'Profil', exact: true })).toBeFocused();
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
    await expect(page.getByRole('heading', { name: 'Kelas saya', exact: true })).toBeVisible();
    await expect(page.locator('.teacher-header__identity strong')).toHaveText('Bu Ratna, M.Pd.');
    await expect(page.getByLabel('Memuat data')).toBeVisible();
    await expect(page.locator('.teacher-class-card')).toHaveCount(0);
    await capture(page, 'classes-loading', 390);
  } finally {
    release();
  }
  await expect(page.locator('.teacher-class-card')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('Teacher long identity, reduced motion and narrow content keep navigation accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { state, errors } = await setup(page);
  state.verified = true;
  state.teacherName = 'Ibu Nabila Az-Zahra Putri Pratama, S.Pd., M.Pd.';
  await page.goto('/teacher');
  await expect(page.locator('.teacher-header__identity strong')).toHaveText(state.teacherName);
  await expect(page.locator('.teacher-class-card')).toHaveCount(4);
  await capture(page, 'long-identity', 320);
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const nav = page.locator('.teacher-bottom-nav');
  await nav.getByRole('link', { name: 'Profil', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keluar dari akun' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('test-logged-out', '1'));
  await page.getByRole('button', { name: 'Keluar dari akun' }).click();
  await expect(page).toHaveURL('http://localhost:3300/');
  await page.goto('/teacher');
  await expect(page).toHaveURL('http://localhost:3300/');
  await expect(page.locator('.teacher-bottom-nav')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Teacher viewport transition switches navigation without overlapping sidebar and bottom bar', async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  state.verified = true;
  await page.goto('/teacher');
  await expect(page.locator('.teacher-class-card')).toHaveCount(4);
  for (const width of [959, 960, 834, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.teacher-sidebar')).toBeVisible({ visible: width >= 960 });
    await expect(page.locator('.teacher-bottom-nav')).toBeVisible({ visible: width < 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
});

test('Teacher desktop invite dialog traps focus, copies the actual code, downloads QR and restores focus', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { state, errors } = await setup(page);
  state.verified = true;
  await page.goto(`/teacher/classes/${classId}`);
  const trigger = page.getByRole('link', { name: 'Undang siswa', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Undang siswa', exact: true });
  await expect(dialog.getByRole('img', { name: 'QR kode kelas Kelas IX-B' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Salin kode', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('CLS-9B-JKT');
  const downloadLink = dialog.getByRole('link', { name: 'Unduh PNG QR' });
  const downloading = page.waitForEvent('download');
  await downloadLink.click();
  expect((await downloading).suggestedFilename()).toBe('numora-kode-kelas.png');
  await downloadLink.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Tutup dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(downloadLink).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test('Teacher feedback retries delivery with the same UUID, paginates and isolates recipient histories', async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  state.verified = true;
  state.failFeedback = true;
  await page.goto(`/teacher/feedback?classId=${classId}&studentId=${studentId}`);
  await expect(page.locator('.teacher-feedback-entry')).toHaveCount(20);
  await page.getByRole('button', { name: 'Muat riwayat sebelumnya' }).click();
  await expect(page.locator('.teacher-feedback-entry')).toHaveCount(21);
  await expect(page.getByLabel('Status baca')).toHaveCount(0);
  await expect(page.locator('.teacher-feedback-history')).not.toContainText('Dibaca ');
  await page.getByLabel('Pesan feedback').fill('  Periksa langkah faktorisasi.  ');
  await page.getByRole('button', { name: 'Kirim feedback', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Pengiriman belum dapat dipastikan',
  );
  await expect(page.getByLabel('Pesan feedback')).toHaveValue('  Periksa langkah faktorisasi.  ');
  state.failFeedback = false;
  await page.getByRole('button', { name: 'Kirim feedback', exact: true }).click();
  await expect(page.getByText('Feedback berhasil dikirim kepada Kirino S.')).toBeVisible();
  expect(state.feedbackSends[0]).toEqual(state.feedbackSends[1]);
  expect(state.feedbackSends[0]?.body).toBe('Periksa langkah faktorisasi.');
  await page.goto(
    `/teacher/feedback?classId=${classId}&studentId=99999999-9999-4999-8999-999999999999`,
  );
  await expect(
    page.getByRole('heading', { name: 'Belum ada feedback', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.teacher-feedback-entry')).toHaveCount(0);
  await expect(page.locator('.teacher-feedback-recipient')).toContainText('Nabila');
  await page.goto('/teacher/feedback');
  await expect(page).toHaveURL('/teacher');
  await expect(page.getByLabel('Pesan feedback')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Legacy Teacher routes and contextual feedback preserve ownership and expired-session states', async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  state.verified = true;
  await page.goto('/teacher/monitoring');
  await expect(page).toHaveURL('/teacher');
  for (const path of ['/teacher/feedback', `/teacher/feedback?classId=${classId}`]) {
    await page.goto(path);
    await expect(page).toHaveURL('/teacher');
    await expect(page.getByLabel('Pesan feedback')).toHaveCount(0);
  }
  for (const path of [
    `/teacher/feedback?classId=${classId}&studentId=${studentId}`,
    `/teacher/classes/${classId}/invite`,
    `/teacher/classes/${classId}/settings`,
    `/teacher/monitoring?classId=${classId}`,
  ]) {
    state.denied = 403;
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Akses ditolak', exact: true })).toBeVisible();
    await expect(page.getByLabel('Pesan feedback')).toHaveCount(0);
    await expect(page.locator('.teacher-code-panel')).toHaveCount(0);
  }
  state.denied = 401;
  await page.goto(`/teacher/feedback?classId=${classId}&studentId=${studentId}`);
  await expect(page.getByRole('heading', { name: 'Sesi berakhir', exact: true })).toBeVisible();
  await expect(page.getByLabel('Pesan feedback')).toHaveCount(0);
  state.denied = 404;
  await page.goto(
    `/teacher/feedback?classId=${classId}&studentId=00000000-0000-4000-8000-000000000000`,
  );
  await expect(page.getByRole('heading', { name: 'Tidak ditemukan', exact: true })).toBeVisible();
  await expect(page.getByLabel('Pesan feedback')).toHaveCount(0);
  expect(errors).toEqual([]);
});

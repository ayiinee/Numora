import { expect, test, type Page } from '@playwright/test';

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});
// Browser fixtures live only in the test harness. No application auth bypass exists.
const studentId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const subchapterId = '33333333-3333-4333-8333-333333333333';
const attemptId = '44444444-4444-4444-8444-444444444444';
const questionId = '55555555-5555-4555-8555-555555555555';
const levelId = '66666666-6666-4666-8666-666666666666';
async function fixtures(
  page: Page,
  role: 'STUDENT' | 'TEACHER' | 'ADMIN' = 'STUDENT',
  teacherVerified = true,
  verificationIdentityDelayMs = 0,
) {
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
              email: 'fixture@example.test',
              app_metadata: { provider: 'google' },
              user_metadata: { name: 'Siswa fixture' },
              created_at: '2026-01-01T00:00:00Z',
            },
          }),
        );
    },
    { jwt, studentId },
  );
  let school = false;
  let option: string | null = null;
  let completed = false;
  await page.route('https://numora-e2e.supabase.co/**', (route) => route.fulfill({ json: {} }));
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown;
    if (path === '/identity/me') {
      if (teacherVerified && verificationIdentityDelayMs)
        await new Promise((resolve) => setTimeout(resolve, verificationIdentityDelayMs));
      data = {
        id: studentId,
        displayName: 'Siswa fixture',
        role,
        status: 'ACTIVE',
        email: 'fixture@example.test',
        studentAffiliation: school ? 'SCHOOL' : 'MANDIRI',
        teacherVerified: role === 'TEACHER' ? teacherVerified : null,
      };
    } else if (path === '/schools')
      data = { items: [{ id: chapterId, code: 'QA', name: 'Sekolah fixture' }] };
    else if (path === `/schools/${chapterId}/teacher-verifications`) {
      teacherVerified = true;
      data = { verified: true };
    } else if (path === '/classes/join') {
      const { joinCode } = route.request().postDataJSON() as { joinCode: string };
      if (!['FIX234', 'QA_LEGACY-CLASS'].includes(joinCode))
        return route.fulfill({
          status: 404,
          contentType: 'application/problem+json',
          json: { code: 'CLASS_NOT_FOUND', detail: 'Kode Class tidak valid.' },
        });
      school = true;
      data = { joined: true, class: { id: chapterId, name: 'IX fixture' } };
    } else if (path === '/students/me/dashboard')
      data = {
        displayName: 'Siswa fixture',
        affiliation: school ? 'SCHOOL' : 'MANDIRI',
        class: school ? { id: chapterId, name: 'IX fixture', schoolName: 'Sekolah fixture' } : null,
        completedLevels: completed ? 1 : 0,
        availableLevels: 2,
        latestDrillScore: completed ? 80 : null,
        bestDrillScore: completed ? 80 : null,
        activities: [],
        activeDrill: !completed ? { attemptId, title: 'Drill fixture', levelId } : null,
        features: {
          drill: true,
          tryout: true,
          pvp: false,
          pretest: false,
          classLeaderboard: false,
          pendingPolicies: ['OPEN-07', 'OPEN-11'],
        },
      };
    else if (path === '/students/me/feedback/summary')
      data = {
        unreadCount: 1,
        latest: [
          {
            id: questionId,
            classId: chapterId,
            studentId,
            teacherName: 'Guru fixture',
            body: 'Catatan persisted fixture: lanjutkan latihan persamaan.',
            sentAt: '2026-10-01T00:00:00Z',
            readAt: null,
          },
        ],
      };
    else if (path === '/students/me/learning-interactions') data = { state: 'policyPending' };
    else if (path === '/chapters')
      data = { chapters: [{ id: chapterId, title: 'Aljabar fixture', order: 1 }] };
    else if (path === `/chapters/${chapterId}`)
      data = {
        chapter: { id: chapterId, title: 'Aljabar fixture', order: 1 },
        subchapters: [{ id: subchapterId, chapterId, title: 'Persamaan fixture', order: 1 }],
      };
    else if (path === `/subchapters/${subchapterId}`)
      data = {
        subchapter: { id: subchapterId, chapterId, title: 'Persamaan fixture', order: 1 },
        levels: [
          {
            id: levelId,
            title: 'Level 1 fixture',
            order: 1,
            status: 'inProgress',
            latestScore: null,
            bestScore: null,
          },
        ],
      };
    else if (path === `/assessment-attempts/${attemptId}/answers/${questionId}`) {
      option = (route.request().postDataJSON() as { optionId: string | null }).optionId;
      data = { questionInstanceId: questionId, selectedOptionId: option };
    } else if (path === `/assessment-attempts/${attemptId}/submit`) {
      completed = true;
      data = {};
    } else if (path.endsWith('/result'))
      data = {
        attemptId,
        levelId,
        levelTitle: 'Level 1 fixture',
        score: 80,
        correctCount: 8,
        questionCount: 10,
        rawPoints: 8,
        mastered: true,
        stars: 2,
        unlockedLevelId: null,
        isDemo: true,
        explanationState: 'available',
        questions: [],
        recommendations: [],
      };
    else if (path === `/assessment-attempts/${attemptId}` || path === '/assessments/drill/attempts')
      data = {
        id: attemptId,
        levelId,
        levelTitle: 'Drill fixture',
        status: completed ? 'completed' : 'inProgress',
        startedAt: '2026-10-01T00:00:00Z',
        isDemo: true,
        questions: [
          {
            questionInstanceId: questionId,
            order: 1,
            stem: 'Fixture: 1 + 1?',
            options: [
              { id: 'A', text: '2' },
              { id: 'B', text: '3' },
            ],
            selectedOptionId: option,
          },
        ],
      };
    else if (path === '/students/me/assessment-results')
      data = {
        records: [
          {
            attemptId,
            activity: 'tryout',
            title: 'Tryout fixture',
            submittedAt: '2026-10-01T00:00:00Z',
            resultState: 'waitingIrt',
            score: null,
            isDemo: true,
          },
        ],
        nextCursor: null,
      };
    else if (path === '/tryout/packages/current') data = { state: 'unavailable' };
    else if (path === '/pvp/availability')
      data = { available: false, reasonCode: 'PVP_POLICY_OPEN', message: 'PvP belum tersedia.' };
    else if (path === '/leaderboards/class' && !school)
      return route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        json: {
          code: 'CLASS_REQUIRED',
          detail: 'Bergabung ke kelas untuk mengakses peringkat kelas.',
        },
      });
    else if (path.startsWith('/leaderboards/'))
      data = {
        policyPending: true,
        reasonCode: path.endsWith('/class') ? 'OPEN-11' : 'OPEN-07',
        className: school ? 'IX fixture' : null,
        unit: 'points',
        period: {
          startsAt: '2026-09-30T17:00:00Z',
          endsAt: '2026-10-07T17:00:00Z',
          timezone: 'Asia/Jakarta',
        },
        updatedAt: null,
        entries: [],
        ownEntry: null,
      };
    else if (path === '/classes')
      data =
        route.request().method() === 'POST'
          ? { id: chapterId, name: 'IX fixture', joinCode: 'QA2345' }
          : { items: [{ id: chapterId, name: 'IX fixture', joinCode: 'QA2345' }] };
    else if (path === `/classes/${chapterId}/students`)
      data = {
        class: { id: chapterId, name: 'IX fixture' },
        items: [{ id: studentId, displayName: 'Siswa fixture' }],
      };
    else if (path === `/classes/${chapterId}/students/${studentId}/progress`)
      data = {
        class: { id: chapterId, name: 'IX fixture' },
        student: { id: studentId, displayName: 'Siswa fixture' },
        latestDrillScore: 0,
        levels: [
          {
            levelId,
            chapterLabel: 'Aljabar',
            subchapterLabel: 'Persamaan',
            levelLabel: 'Level 1',
            accessStatus: 'UNLOCKED',
            inProgress: false,
            latestDrillScore: 0,
            bestDrillScore: 0,
          },
        ],
      };
    else if (path === '/admin/schools')
      data = { items: [{ id: chapterId, code: 'QA', name: 'Sekolah fixture', status: 'ACTIVE' }] };
    else if (path === `/admin/schools/${chapterId}/teacher-tokens`)
      data =
        route.request().method() === 'POST'
          ? { id: questionId, token: 'QAAB2345', expiresAt: '2026-10-05T00:00:00Z' }
          : { items: [] };
    else
      return route.fulfill({
        status: 404,
        json: { detail: `Unexpected fixture request: ${path}` },
      });
    return route.fulfill({ json: data });
  });
}
for (const width of [320, 360, 390, 768, 1440])
  test(`student routes at ${width}px use real-data boundaries and accessible navigation`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await fixtures(page);
    await page.goto('/student');
    await expect(page.getByRole('heading', { name: /Halo, Siswa/ })).toBeVisible();
    await expect(page.getByText('User Mandiri', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
    const nav = page.getByRole('navigation', {
      name: width <= 959 ? 'Navigasi utama' : 'Navigasi Ruang belajar',
      exact: true,
    });
    await nav.getByRole('link', { name: 'Belajar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Belajar matematika' })).toBeVisible();
    await page.getByRole('link', { name: /Aljabar fixture/ }).click();
    await page.getByRole('link', { name: /Persamaan fixture/ }).click();
    await page.getByRole('button', { name: 'Lanjutkan latihan' }).click();
    await page.getByRole('radio').first().check();
    await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('radio').first()).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath(`drill-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Kirim Drill' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Navigasi Ruang belajar' })).toHaveCount(0);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Kirim Drill' }).click();
    await expect(page.getByText('Tuntas', { exact: true })).toBeVisible();
    for (const [label, text] of [
      ['Tryout', 'Paket belum tersedia'],
      ['Progres', 'Menunggu hasil'],
      ['PvP', 'PvP belum tersedia'],
      ['Peringkat', 'Peringkat belum tersedia'],
    ] as const) {
      if (label === 'PvP' || label === 'Peringkat')
        await page.goto(label === 'PvP' ? '/student/pvp' : '/student/leaderboards');
      else await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByText(text!, { exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await nav.getByRole('link', { name: 'Belajar', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name: 'Tryout', exact: true })).toBeFocused();
  });
test('Mandiri Tryout starts and resumes without a class, then waits for released results', async ({
  page,
}) => {
  await fixtures(page);
  let state: 'open' | 'inProgress' | 'waitingIrt' | 'resultReady' = 'open';
  const attempt = {
    id: attemptId,
    packageId: chapterId,
    packageTitle: 'Tryout fixture',
    status: 'inProgress',
    deadlineAt: null,
    questions: [
      {
        questionInstanceId: questionId,
        order: 1,
        stem: 'Fixture: 1 + 1?',
        options: [
          { id: 'A', text: '2' },
          { id: 'B', text: '3' },
        ],
        selectedOptionId: null,
      },
    ],
  };
  await page.route('http://localhost:3301/api/v1/tryout/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/tryout/packages/current') {
      return route.fulfill({
        json: {
          id: chapterId,
          title: attempt.packageTitle,
          releaseAt: '2026-09-27T17:00:00Z',
          state,
          eligible: state === 'open',
          attemptId: state === 'open' ? null : attemptId,
          questionCount: 1,
          durationSeconds: null,
        },
      });
    }
    if (path === '/tryout/attempts') {
      expect(route.request().postDataJSON()).toEqual({ packageId: chapterId });
      state = 'inProgress';
      return route.fulfill({ status: 201, json: attempt });
    }
    if (path === `/tryout/attempts/${attemptId}`) return route.fulfill({ json: attempt });
    if (path === `/tryout/attempts/${attemptId}/result`)
      return route.fulfill({
        json: {
          attemptId,
          packageTitle: attempt.packageTitle,
          score: 100,
          correctCount: 1,
          questionCount: 1,
          explanation: [
            {
              questionInstanceId: questionId,
              stem: 'Fixture: 1 + 1?',
              selectedOptionId: 'A',
              correctOptionId: 'A',
              explanation: 'Fixture explanation',
            },
          ],
        },
      });
    return route.fallback();
  });
  await page.goto('/student/tryout');
  await expect(page.getByText(/TryOut gratis untuk seluruh siswa/)).toBeVisible();
  await page.getByRole('button', { name: 'Detail dan aturan paket' }).click();
  await page.getByLabel('Saya memahami aturan pengerjaan.').check();
  await page.getByRole('button', { name: 'Mulai TryOut' }).click();
  await expect(page).toHaveURL(`/student/tryout/${attemptId}`);
  await expect(page.getByText('Fixture: 1 + 1?', { exact: true })).toBeVisible();
  await page.goto('/student/tryout');
  await expect(page.getByRole('link', { name: 'Lanjutkan TryOut' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mulai TryOut' })).toHaveCount(0);
  state = 'waitingIrt';
  await page.reload();
  await expect(
    page.getByRole('status').filter({ hasText: 'pembahasan belum tersedia' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lihat hasil simulasi' })).toHaveCount(0);
  state = 'resultReady';
  await page.reload();
  await page.getByRole('link', { name: 'Lihat hasil simulasi' }).click();
  await expect(page).toHaveURL(`/student/tryout/${attemptId}/result`);
  await expect(page.getByText('Fixture explanation', { exact: true })).toBeVisible();
});

test('history keeps zero/context, hides pending links and retries pagination without losing records', async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('http://localhost:3301/api/v1/students/me/progress', (route) =>
    route.fulfill({
      json: { completedLevels: 0, totalLevels: 2, latestScore: 0 },
    }),
  );
  let failNextPage = true;
  const historyRecord = {
    attemptId,
    activity: 'drill',
    title: 'History zero fixture',
    isDemo: true,
    submittedAt: '2026-10-01T12:00:00Z',
    resultState: 'ready',
    score: 0,
    chapterTitle: 'Bilangan fixture',
    subchapterTitle: 'Pecahan fixture',
    levelTitle: 'Level 1',
    xpState: 'pending',
    starsState: 'pending',
  };
  await page.route('http://localhost:3301/api/v1/students/me/assessment-results*', (route) => {
    if (new URL(route.request().url()).searchParams.has('cursor')) {
      expect(new URL(route.request().url()).searchParams.get('cursor')).toBe(levelId);
      if (failNextPage) {
        return route.fulfill({ status: 503, json: { detail: 'Fixture temporary error' } });
      }
      return route.fulfill({
        json: {
          records: [
            { ...historyRecord, attemptId: levelId, title: 'History second fixture', score: 70 },
          ],
          nextCursor: null,
        },
      });
    }
    return route.fulfill({
      json: {
        records: [
          historyRecord,
          {
            ...historyRecord,
            attemptId: chapterId,
            activity: 'tryout',
            title: 'History waiting fixture',
            resultState: 'waitingIrt',
            score: null,
            starsState: 'notApplicable',
          },
          {
            ...historyRecord,
            attemptId: subchapterId,
            activity: 'pretest',
            title: 'History Pretest fixture',
            xpState: 'notApplicable',
            starsState: 'notApplicable',
          },
        ],
        nextCursor: levelId,
      },
    });
  });
  await page.goto('/student/assessment');
  const zero = page.getByRole('link', { name: /History zero fixture/ });
  await expect(zero.getByText('0', { exact: true })).toBeVisible();
  await expect(zero.getByText('Bilangan fixture · Pecahan fixture · Level 1')).toBeVisible();
  await expect(zero.getByText('XP dan bintang belum tersedia')).toBeVisible();
  await expect(
    page.getByRole('link', { name: /History waiting fixture|History Pretest fixture/ }),
  ).toHaveCount(0);
  expect(
    await page
      .getByText('Menunggu hasil', { exact: true })
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.getByRole('button', { name: 'Muat hasil lain' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Halaman berikutnya belum dapat dimuat' }),
  ).toBeVisible();
  await expect(zero).toHaveCount(1);
  failNextPage = false;
  await page.getByRole('button', { name: 'Muat hasil lain' }).click();
  await expect(page.getByRole('link', { name: /History second fixture/ })).toBeVisible();
  await expect(zero).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Muat hasil lain' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('heading', { name: 'Riwayat aktivitas' }).click();
  await page.screenshot({ path: test.info().outputPath('history-390.png'), fullPage: true });
});

for (const joinCode of ['FIX234', 'QA_LEGACY-CLASS'])
  test(`join class ${joinCode} refreshes eligibility, and removed demo routes return 404`, async ({
    page,
  }) => {
    await fixtures(page);
    await page.goto('/student');
    await page.getByRole('link', { name: 'Buka profil' }).click();
    await page.getByLabel('Kode kelas').fill(` ${joinCode} `);
    await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
    await expect(page.getByText('Terhubung dengan kelas', { exact: true })).toBeVisible();
    await page.goto('/student');
    await expect(page.getByRole('heading', { name: 'IX fixture', exact: true })).toBeVisible();
    await expect(page.getByText('Sekolah fixture', { exact: true })).toBeVisible();
    for (const path of ['/demo/student', '/demo/pvp', '/demo/leaderboards']) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      expect(response?.request().redirectedFrom()).toBeNull();
    }
  });

test('Mandiri keeps learning and global PvP access while class ranking stays restricted', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/student');
  await expect(page.getByText('Siswa mandiri', { exact: true })).toBeVisible();
  await page.goto(`/student/drill/${attemptId}`);
  await expect(page.getByText('Fixture: 1 + 1?')).toBeVisible();
  await page.goto('/student/pvp');
  await expect(page.getByRole('heading', { name: 'PvP belum tersedia' })).toBeVisible();
  await page.goto('/student/leaderboards');
  await expect(page.getByRole('button', { name: 'Global PvP' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Peringkat belum tersedia' })).toBeVisible();
  await page.getByRole('button', { name: 'Kelas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  await page.goto('/student/profile');
  await expect(page.getByLabel('Kode kelas')).toBeVisible();
});

test('invalid class code does not change Mandiri affiliation', async ({ page }) => {
  await fixtures(page);
  await page.goto('/student/profile');
  await page.getByLabel('Kode kelas').fill('BAD999');
  await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
  await expect(page.getByText('Kode Class tidak valid.')).toBeVisible();
  await expect(page.getByText('Belajar mandiri')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Belajar mandiri')).toBeVisible();
});

test('joined class affiliation persists after signing out and back in', async ({ page }) => {
  await fixtures(page);
  await page.goto('/student/profile');
  await page.getByLabel('Kode kelas').fill(' FIX234 ');
  await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
  await expect(page.getByText('Terhubung dengan kelas')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('test-logged-out', '1'));
  await page.getByRole('button', { name: 'Keluar dari akun' }).click();
  await expect(page).toHaveURL('http://localhost:3300/');
  await page.evaluate(() => localStorage.removeItem('test-logged-out'));
  await page.reload();
  await expect(page).toHaveURL(/\/student$/);
  await page.goto('/student/profile');
  await expect(page.getByText('Terhubung dengan kelas')).toBeVisible();
  await expect(page.getByLabel('Kode kelas')).toHaveCount(0);
  await page.goto('/student/leaderboards?tab=class');
  await expect(
    page.getByText('Aturan XP kelas sedang ditetapkan.', { exact: false }),
  ).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`Teacher class monitoring at ${width}px keeps zero scores and accessible navigation`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await fixtures(page, 'TEACHER');
    await page.goto('/teacher');
    await page.getByRole('link', { name: /IX fixture/ }).click();
    await page.getByRole('link', { name: /Siswa fixture/ }).click();
    await expect(page.getByRole('heading', { name: 'Progres per level' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '0', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`teacher-${width}.png`), fullPage: true });
  });
  test(`Admin school/token workflow at ${width}px retains operational forms`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await fixtures(page, 'ADMIN');
    await page.goto('/admin/schools');
    await expect(page.getByRole('button', { name: 'Keluar', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Buka profil' })).toHaveCount(0);
    await page.getByRole('button', { name: /Sekolah fixture/ }).click();
    await page.getByRole('button', { name: 'Terbitkan token' }).click();
    await expect(page.getByText('QAAB2345', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`admin-${width}.png`), fullPage: true });
  });
}

test('Teacher profile owns logout and signed-out Teacher routes stay protected', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fixtures(page, 'TEACHER');
  await page.goto('/teacher');
  await expect(page.getByRole('button', { name: 'Keluar', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Buka profil' }).click();
  await expect(page).toHaveURL(/\/teacher\/profile$/);
  await expect(page.getByRole('heading', { name: 'Profil & akun' })).toBeVisible();
  await expect(page.getByText('Terverifikasi')).toBeVisible();
  await expect(page.getByRole('link', { name: /Kelas saya/ }).last()).toHaveAttribute(
    'href',
    '/teacher',
  );
  await page.evaluate(() => localStorage.setItem('test-logged-out', '1'));
  await page.getByRole('button', { name: 'Keluar dari akun' }).click();
  await expect(page).toHaveURL('http://localhost:3300/');
  await page.goto('/teacher/profile');
  await expect(page).toHaveURL('http://localhost:3300/');
  await expect(page.getByRole('heading', { name: 'Profil & akun' })).toHaveCount(0);
});

test('Student cannot open Teacher profile', async ({ page }) => {
  await fixtures(page);
  await page.goto('/teacher/profile');
  await expect(page).toHaveURL('http://localhost:3300/student');
  await expect(page.getByRole('heading', { name: 'Profil & akun' })).toHaveCount(0);
});

test('Teacher sees distinct latest and best Drill scores but no foreign Class progress', async ({
  page,
}) => {
  await fixtures(page, 'TEACHER');
  await page.route(
    `http://localhost:3301/api/v1/classes/${chapterId}/students/${studentId}/progress`,
    (route) =>
      route.fulfill({
        json: {
          class: { id: chapterId, name: 'IX fixture' },
          student: { id: studentId, displayName: 'Siswa fixture' },
          latestDrillScore: 60,
          levels: [
            {
              levelId,
              chapterLabel: 'Aljabar',
              subchapterLabel: 'Persamaan',
              levelLabel: 'Level 1',
              accessStatus: 'UNLOCKED',
              inProgress: false,
              latestDrillScore: 60,
              bestDrillScore: 90,
            },
          ],
        },
      }),
  );
  await page.goto('/teacher');
  await page.getByRole('link', { name: /IX fixture/ }).click();
  await page.getByRole('link', { name: /Siswa fixture/ }).click();
  await expect(page.getByRole('heading', { name: '60', exact: true })).toBeVisible();
  const level = page.locator('.level-card');
  await expect(level.getByText('60', { exact: true })).toBeVisible();
  await expect(level.getByText('90', { exact: true })).toBeVisible();

  const foreignClassId = '77777777-7777-4777-8777-777777777777';
  await page.route(
    `http://localhost:3301/api/v1/classes/${foreignClassId}/students/${studentId}/progress`,
    (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        json: { code: 'CLASS_FORBIDDEN', detail: 'Akses Class ditolak.' },
      }),
  );
  await page.goto(`/teacher/classes/${foreignClassId}/students/${studentId}`);
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  await expect(page.locator('.level-card')).toHaveCount(0);
});

test('signed-out login offers Google authentication without removed demo destinations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeVisible();
  await expect(page.locator('a[href^="/demo/"]')).toHaveCount(0);
});

test('Drill result retry uses its server level and navigates to a new server attempt', async ({
  page,
}) => {
  await fixtures(page);
  const newId = '77777777-7777-4777-8777-777777777777';
  const attempt = {
    id: newId,
    levelId,
    levelTitle: 'TEST retry',
    status: 'inProgress',
    startedAt: new Date().toISOString(),
    isDemo: true,
    questions: [
      {
        questionInstanceId: questionId,
        stem: 'TEST retry question',
        options: [
          { id: 'A', text: '2' },
          { id: 'B', text: '3' },
        ],
        selectedOptionId: null,
      },
    ],
  };
  await page.route('http://localhost:3301/api/v1/assessments/drill/attempts', (route) =>
    route.fulfill({ json: attempt }),
  );
  await page.route(`http://localhost:3301/api/v1/assessment-attempts/${newId}`, (route) =>
    route.fulfill({ json: attempt }),
  );
  await page.goto(`/student/drill/${attemptId}/result`);
  const starting = page.waitForRequest((request) =>
    request.url().endsWith('/assessments/drill/attempts'),
  );
  await page.getByRole('button', { name: 'Ulangi level ini' }).click();
  expect((await starting).postDataJSON()).toEqual({ levelId });
  await expect(page).toHaveURL(new RegExp(`/student/drill/${newId}$`));
  await expect(page.getByText('TEST retry question')).toBeVisible();
});

test('failed Drill save warns before refresh and can recover without claiming Saved prematurely', async ({
  page,
}) => {
  await fixtures(page);
  let failed = false;
  await page.route(
    `http://localhost:3301/api/v1/assessment-attempts/${attemptId}/answers/${questionId}`,
    (route) => {
      if (!failed) {
        failed = true;
        return route.abort('internetdisconnected');
      }
      return route.fallback();
    },
  );
  await page.goto(`/student/drill/${attemptId}`);
  await page.getByRole('radio').first().check();
  await expect(page.getByText('Belum tersimpan', { exact: true })).toBeVisible();
  const warning = page.waitForEvent('dialog');
  const reload = page.reload({ timeout: 5000 }).catch(() => null);
  const dialog = await warning;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await reload;
  await expect(page.getByRole('radio').first()).toBeChecked();
  await page.getByRole('button', { name: 'Coba simpan lagi' }).click();
  await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio').first()).toBeChecked();
});

test('TEST ONLY TryOut with 35 PG questions preserves countdown on reload and recovers a lost auto-submit acknowledgement', async ({
  page,
}) => {
  await fixtures(page);
  const options = [
    { id: 'A', text: '2' },
    { id: 'B', text: '3' },
  ];
  const ids = Array.from(
    { length: 35 },
    (_, index) => `88888888-8888-4888-8888-${String(index + 1).padStart(12, '0')}`,
  );
  const answers = new Map<string, string | null>();
  let deadline = 0;
  let submitted = false;
  let submits = 0;
  let dialogs = 0;
  page.on('dialog', (dialog) => {
    dialogs++;
    void dialog.dismiss();
  });
  await page.route(`http://localhost:3301/api/v1/tryout/attempts/${attemptId}`, (route) => {
    deadline ||= Date.now() + 12_000;
    return route.fulfill({
      json: {
        id: attemptId,
        packageId: chapterId,
        packageTitle: 'TEST ONLY countdown',
        status: submitted ? 'submitted' : 'inProgress',
        serverTime: new Date().toISOString(),
        deadlineAt: new Date(deadline).toISOString(),
        questions: submitted
          ? []
          : ids.map((id, index) => ({
              questionInstanceId: id,
              stem: `TEST question ${index + 1}`,
              options,
              selectedOptionId: answers.get(id) ?? null,
            })),
      },
    });
  });
  await page.route(
    `http://localhost:3301/api/v1/tryout/attempts/${attemptId}/answers/*`,
    (route) => {
      const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
      const { optionId } = route.request().postDataJSON();
      answers.set(id, optionId);
      return route.fulfill({ json: { questionInstanceId: id, selectedOptionId: optionId } });
    },
  );
  await page.route(`http://localhost:3301/api/v1/tryout/attempts/${attemptId}/submit`, (route) => {
    submits++;
    submitted = true;
    return route.abort('connectionreset');
  });
  await page.route(`http://localhost:3301/api/v1/tryout/attempts/${attemptId}/result`, (route) =>
    route.fulfill({
      status: 409,
      json: { code: 'TRYOUT_RESULT_PENDING', detail: 'TEST result not released' },
    }),
  );
  await page.goto(`/student/tryout/${attemptId}`);
  await expect(
    page.getByRole('navigation', { name: 'Navigasi soal' }).getByRole('button'),
  ).toHaveCount(35);
  await page.getByRole('radio').first().check();
  await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
  const before = (await page.getByRole('timer').innerText()).split(':').map(Number);
  const beforeSeconds = before[0]! * 60 + before[1]!;
  await page.reload();
  await expect(page.getByRole('radio').first()).toBeChecked();
  const after = (await page.getByRole('timer').innerText()).split(':').map(Number);
  expect(after[0]! * 60 + after[1]!).toBeLessThanOrEqual(beforeSeconds);
  await expect(page.getByRole('heading', { name: 'Jawaban sudah dikirim' })).toBeVisible({
    timeout: 20_000,
  });
  expect(submits).toBe(1);
  expect(dialogs).toBe(0);
  await page.goto(`/student/tryout/${attemptId}/result`);
  await expect(page.getByRole('heading', { name: 'Menunggu hasil IRT' })).toBeVisible();
  await expect(page.getByText('80', { exact: true })).toHaveCount(0);
});

for (const verificationToken of ['QAAB2345', 'Ab_cd-'.repeat(6)]) {
  test(`Teacher verification accepts ${verificationToken.length === 8 ? 'short' : 'legacy'} token without changing capitalization`, async ({
    page,
  }) => {
    await fixtures(page, 'TEACHER', false);
    await page.goto('/teacher/verification-required');
    await page.getByLabel('Sekolah', { exact: true }).selectOption(chapterId);
    await page.getByLabel('Token verifikasi').fill(` ${verificationToken} `);
    const request = page.waitForRequest((request) =>
      request.url().endsWith('/teacher-verifications'),
    );
    await page.getByRole('button', { name: 'Verifikasi dan lanjutkan' }).click();
    expect((await request).postDataJSON()).toEqual({ token: verificationToken });
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole('heading', { name: 'Kelas saya', exact: true })).toBeVisible();
  });
}

test('Teacher stays on verification while refreshed identity is pending', async ({ page }) => {
  await fixtures(page, 'TEACHER', false, 2_000);
  const teacherNavigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/teacher')
      teacherNavigations.push(frame.url());
  });
  await page.goto('/teacher/verification-required');
  await page.getByLabel('Sekolah', { exact: true }).selectOption(chapterId);
  await page.getByLabel('Token verifikasi').fill('QAAB2345');
  const refreshedIdentity = page.waitForRequest((request) =>
    request.url().endsWith('/identity/me'),
  );
  await page.getByRole('button', { name: 'Verifikasi dan lanjutkan' }).click();

  await refreshedIdentity;
  await page.waitForTimeout(250);
  expect(teacherNavigations).toHaveLength(0);
  await expect(page).toHaveURL(/\/teacher$/);
});

for (const width of [390, 1440]) {
  test(`Admin PR40 package lifecycle, report resolution and IRT release state at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await fixtures(page, 'ADMIN');
    const policyId = '77777777-7777-4777-8777-777777777777';
    const packageId = '99999999-9999-4999-8999-999999999999';
    const ids = Array.from(
      { length: 10 },
      (_, index) => `88888888-8888-4888-8888-${String(index + 1).padStart(12, '0')}`,
    );
    let pack: Record<string, unknown> | null = null;
    const report = {
      id: questionId,
      kind: 'QUESTION',
      referenceId: attemptId,
      category: 'Kunci',
      details: 'Laporan fixture',
      status: 'OPEN',
      followUp: null as string | null,
      reportedAt: '2026-10-03T00:00:00Z',
    };
    const mutations: string[] = [];
    await page.route('http://localhost:3301/api/v1/admin/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace('/api/v1/', '');
      if (request.method() !== 'GET') {
        mutations.push(`${request.method()} ${path}`);
        const body = request.postDataJSON() as Record<string, unknown>;
        if (path === 'admin/content/drill-packages') {
          expect(body.questionVersionIds).toEqual(ids);
          expect(body.levelId).toBe(levelId);
          pack = { ...body, id: packageId, status: 'DRAFT', releaseAt: null };
        } else if (path === `admin/content/drill-packages/${packageId}`) {
          expect(body.questionVersionIds).toEqual(ids);
          pack = { ...pack, ...body };
        } else if (path.endsWith('/publish')) pack = { ...pack, status: 'PUBLISHED' };
        else if (path.endsWith('/archive')) pack = { ...pack, status: 'ARCHIVED' };
        else if (path === `admin/reports/QUESTION/${questionId}`) {
          expect(body.status).toBe('RESOLVED');
          expect(body.followUp).toBe('Tindak lanjut fixture');
          report.status = 'RESOLVED';
          report.followUp = String(body.followUp);
        } else return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
        return route.fulfill({ json: { id: path.includes('/reports/') ? questionId : packageId } });
      }
      const responses: Record<string, unknown> = {
        'admin/content/curriculum': {
          items: [
            {
              id: levelId,
              kind: 'LEVEL',
              parentId: subchapterId,
              code: 'DEMO-L1',
              name: 'Level fixture',
              displayOrder: 1,
              status: 'READY',
            },
          ],
        },
        'admin/content/versions': {
          items: [
            {
              id: ids[0],
              questionId,
              primaryCompetencyId: subchapterId,
              variantId: questionId,
              variantCode: 'DEMO-01',
              variantKind: 'ORIGINAL',
              originalVariantId: null,
              versionNumber: 1,
              questionType: 'SINGLE_CHOICE',
              stem: 'Soal fixture',
              options: [],
              answerOptionId: 'A',
              explanation: 'Demo',
              difficulty: 'DEMO',
              contentStatus: 'READY',
              questionStatus: 'READY',
              reviewedByUserId: studentId,
              reviewedAt: '2026-10-01T00:00:00Z',
            },
          ],
        },
        'admin/content/videos': { items: [] },
        'admin/reports': { items: [report] },
        'admin/irt': { items: [] },
        'admin/irt/batches': {
          items: [
            {
              id: attemptId,
              packageId,
              batchKind: 'TRYOUT',
              modelVersion: 'TEST-ONLY',
              status: 'SUCCEEDED',
              startedAt: '2026-10-01T00:00:00Z',
              finishedAt: '2026-10-01T01:00:00Z',
              resultReleasedAt: null,
              failureCode: null,
            },
          ],
        },
        'admin/audit-logs': { items: [] },
        'admin/dashboard': {
          schools: 1,
          chapters: 1,
          questions: 1,
          readyVersions: 1,
          openReports: report.status === 'OPEN' ? 1 : 0,
        },
        'admin/content/tryout-packages': { items: [] },
        'admin/content/drill-packages': { items: pack ? [pack] : [] },
      };
      return route.fulfill({ json: responses[path] ?? { items: [] } });
    });
    await page.goto('/admin/content');
    await page.getByRole('button', { name: 'Paket Drill', exact: true }).click();
    await page.getByLabel('Kode keluarga', { exact: true }).fill('DEMO-E2E');
    await page.getByLabel('Versi paket', { exact: true }).fill('1');
    await page.getByRole('combobox', { name: 'Level', exact: true }).selectOption(levelId);
    await page.getByLabel('Indeks varian', { exact: true }).fill('1');
    await page.getByLabel('Nama paket', { exact: true }).fill('Paket fixture baru');
    await page.getByLabel('ID versi kebijakan penilaian', { exact: true }).fill(policyId);
    await page
      .getByLabel('ID versi soal (pisahkan dengan baris baru atau koma)', { exact: true })
      .fill(ids.join('\n'));
    await page.getByRole('button', { name: 'Simpan draf paket', exact: true }).click();
    await expect(page.getByText('Paket fixture baru', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit draf', exact: true }).click();
    await page.getByLabel('Nama paket', { exact: true }).fill('Paket fixture direvisi');
    await page.getByRole('button', { name: 'Simpan draf paket', exact: true }).click();
    await expect(page.getByText('Paket fixture direvisi', { exact: true })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Publikasikan paket', exact: true }).click();
    await expect(page.getByText(/DEMO-E2E.*PUBLISHED/)).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Arsipkan paket', exact: true }).click();
    await expect(page.getByText(/DEMO-E2E.*ARCHIVED/)).toBeVisible();
    await page.getByRole('button', { name: 'Laporan', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Status tindak lanjut', exact: true })
      .selectOption('RESOLVED');
    await page.getByLabel('Catatan tindak lanjut', { exact: true }).fill('Tindak lanjut fixture');
    await page
      .getByRole('button', { name: 'Simpan status dan tindak lanjut', exact: true })
      .click();
    await expect(page.getByText('Tindak lanjut tersimpan:', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'IRT', exact: true }).click();
    await expect(page.getByText('TRYOUT · SUCCEEDED', { exact: true })).toBeVisible();
    await expect(page.getByText(/Rilis belum tercatat/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(mutations).toEqual([
      'POST admin/content/drill-packages',
      `PATCH admin/content/drill-packages/${packageId}`,
      `POST admin/content/drill-packages/${packageId}/publish`,
      `POST admin/content/drill-packages/${packageId}/archive`,
      `PATCH admin/reports/QUESTION/${questionId}`,
    ]);
    await page.screenshot({
      path: testInfo.outputPath(`admin-content-${width}.png`),
      fullPage: true,
    });
  });
}

for (const { role, verified, path, destination } of [
  { role: 'STUDENT', verified: true, path: '/teacher', destination: '/student' },
  { role: 'TEACHER', verified: true, path: '/student', destination: '/teacher' },
  {
    role: 'TEACHER',
    verified: false,
    path: '/admin/schools',
    destination: '/teacher/verification-required',
  },
  { role: 'ADMIN', verified: true, path: '/student', destination: '/admin/schools' },
] as const) {
  test(`${role}${verified ? '' : ' unverified'} cannot enter ${path}`, async ({ page }) => {
    await fixtures(page, role, verified);
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  });
}

type FixtureNote = {
  id: string;
  classId: string;
  studentId: string;
  teacherName: string;
  body: string;
  sentAt: string;
  readAt: string | null;
};

function inboxNote(
  id: string,
  body: string,
  sentAt: string,
  readAt: string | null = null,
): FixtureNote {
  return { id, classId: chapterId, studentId, teacherName: 'Guru fixture', body, sentAt, readAt };
}

// Teacher notes are read-only for the Student: the inbox answers, never replies.
async function stubInbox(page: Page, notes: FixtureNote[]) {
  const reads: string[] = [];
  await page.route('http://localhost:3301/api/v1/students/me/feedback*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/summary'))
      return route.fulfill({
        json: {
          unreadCount: notes.filter((note) => note.readAt === null).length,
          latest: notes.slice(0, 3),
        },
      });
    if (url.pathname.endsWith('/read')) {
      const segments = url.pathname.split('/');
      const id = segments[segments.length - 2]!;
      const target = notes.find((note) => note.id === id);
      if (!target)
        return route.fulfill({
          status: 404,
          contentType: 'application/problem+json',
          json: { code: 'FEEDBACK_NOT_FOUND', detail: 'Feedback tidak ditemukan.' },
        });
      if (target.readAt === null) {
        target.readAt = '2026-10-02T01:00:00Z';
        reads.push(id);
      }
      return route.fulfill({ status: 201, json: { id, readAt: target.readAt } });
    }
    const offset = Number(url.searchParams.get('offset') ?? '0');
    const limit = Number(url.searchParams.get('limit') ?? '20');
    return route.fulfill({
      json: {
        items: notes.slice(offset, offset + limit),
        nextOffset: offset + limit < notes.length ? offset + limit : null,
      },
    });
  });
  return reads;
}

const inboxReadNote = () =>
  inboxNote(
    levelId,
    'Nilai awal pecahanmu 60; ulangi langkah penyederhanaan.',
    '2026-09-24T00:00:00Z',
    '2026-09-25T00:00:00Z',
  );

test('Student inbox marks one note read and keeps the dashboard preview honest', async ({
  page,
}) => {
  await fixtures(page);
  const reads = await stubInbox(page, [
    inboxNote(
      questionId,
      'Catatan persisted fixture: lanjutkan latihan persamaan.',
      '2026-10-01T00:00:00Z',
    ),
    inboxReadNote(),
  ]);
  await page.goto('/student/feedback');
  await expect(page.getByText('Guru fixture · Belum dibaca', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Catatan persisted fixture: lanjutkan latihan persamaan.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tandai sudah dibaca' })).toHaveCount(1);
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);

  await page.getByRole('button', { name: 'Tandai sudah dibaca' }).click();
  await expect(page.getByText('Guru fixture · Belum dibaca', { exact: true })).toHaveCount(0);
  await expect(page.locator('time', { hasText: 'Dibaca' })).toHaveCount(2);
  await expect(
    page.getByText('Nilai awal pecahanmu 60; ulangi langkah penyederhanaan.', { exact: true }),
  ).toBeVisible();
  expect(reads).toEqual([questionId]);

  await page.goto('/student');
  await expect(page.getByText('0 catatan belum dibaca.', { exact: true })).toBeVisible();
});

test('Student inbox keeps earlier notes while paging with the server offset', async ({ page }) => {
  await fixtures(page);
  await stubInbox(
    page,
    Array.from({ length: 21 }, (_, index) =>
      inboxNote(
        `note-${index}`,
        `Catatan fixture ${index + 1}.`,
        `2026-09-${String(28 - index).padStart(2, '0')}T00:00:00Z`,
        '2026-09-28T00:00:00Z',
      ),
    ),
  );
  await page.goto('/student/feedback');
  await expect(page.getByText('Catatan fixture 1.', { exact: true })).toBeVisible();
  await expect(page.getByText('Catatan fixture 21.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Muat catatan lain' }).click();
  await expect(page.getByText('Catatan fixture 21.', { exact: true })).toBeVisible();
  await expect(page.getByText('Catatan fixture 1.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Muat catatan lain' })).toHaveCount(0);
});

test('Student inbox shows a server refusal instead of an empty inbox', async ({ page }) => {
  await fixtures(page);
  await page.route('http://localhost:3301/api/v1/students/me/feedback*', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/summary')) return route.fallback();
    return route.fulfill({
      status: 403,
      contentType: 'application/problem+json',
      json: { code: 'FORBIDDEN', detail: 'Akses akun aktif dan peran yang sesuai diperlukan.' },
    });
  });
  await page.goto('/student/feedback');
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  await expect(
    page.getByText('Akses akun aktif dan peran yang sesuai diperlukan.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Belum ada catatan', { exact: true })).toHaveCount(0);
});

test('Student inbox reports a refused read without hiding the note', async ({ page }) => {
  await fixtures(page);
  const reads = await stubInbox(page, [
    inboxNote(
      questionId,
      'Catatan persisted fixture: lanjutkan latihan persamaan.',
      '2026-10-01T00:00:00Z',
    ),
  ]);
  await page.route('http://localhost:3301/api/v1/students/me/feedback/*/read', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      json: { code: 'FEEDBACK_NOT_FOUND', detail: 'Feedback tidak ditemukan.' },
    }),
  );
  await page.goto('/student/feedback');
  await page.getByRole('button', { name: 'Tandai sudah dibaca' }).click();
  await expect(page.getByText('Feedback tidak ditemukan.', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tandai sudah dibaca' })).toHaveCount(1);
  await expect(
    page.getByText('Catatan persisted fixture: lanjutkan latihan persamaan.', { exact: true }),
  ).toBeVisible();
  expect(reads).toEqual([]);
});

for (const width of [320, 390, 1440])
  test(`Student inbox at ${width}px keeps the read action reachable by keyboard`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await fixtures(page);
    await stubInbox(page, [
      inboxNote(
        questionId,
        'Catatan persisted fixture: lanjutkan latihan persamaan.',
        '2026-10-01T00:00:00Z',
      ),
      inboxReadNote(),
    ]);
    await page.goto('/student/feedback');
    await expect(page.getByRole('heading', { name: 'Catatan dari Guru' })).toBeVisible();
    const action = page.getByRole('button', { name: 'Tandai sudah dibaca' });
    await action.focus();
    await expect(action).toBeVisible();
    await action.press('Enter');
    await expect(page.getByText('Guru fixture · Belum dibaca', { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`student-inbox-${width}.png`),
      fullPage: true,
    });
  });

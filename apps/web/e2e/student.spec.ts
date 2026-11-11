import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TryoutResultDto } from '../src/features/core-learning/generated-types';
import { id as adminFixtureId, selectContentSection } from './fixtures/admin';
import { setupAssessments } from './fixtures/admin-assessments';
import { analyticsSnapshot } from './fixtures/admin-analytics';

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
  adminRole: 'OPERATIONS' | 'CONTENT_DATA_MODERATION' = 'CONTENT_DATA_MODERATION',
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
        adminRole: role === 'ADMIN' ? adminRole : null,
        capabilities:
          role !== 'ADMIN'
            ? []
            : adminRole === 'OPERATIONS'
              ? [
                  'OPERATIONS_MANAGE',
                  'OPERATIONS_LIMITED_READ',
                  'ANALYTICS_OPERATIONS',
                  'AUDIT_READ',
                ]
              : ['CONTENT_MANAGE', 'OPERATIONS_LIMITED_READ', 'ANALYTICS_CONTENT', 'AUDIT_READ'],
        email: 'fixture@example.test',
        studentAffiliation: school ? 'SCHOOL' : 'MANDIRI',
        teacherVerified: role === 'TEACHER' ? teacherVerified : null,
      };
    } else if (path === '/schools')
      data = { items: [{ id: chapterId, code: 'QA', name: 'Sekolah fixture' }] };
    else if (path === '/schools/mine' && role === 'TEACHER' && teacherVerified)
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
        totalXp: completed ? 80 : 0,
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
    else if (path === '/students/me/notifications/summary') data = { total: 0, unread: 0 };
    else if (path === '/students/me/materials')
      data = {
        recentChapterId: chapterId,
        chapters: [
          {
            id: chapterId,
            title: 'Aljabar fixture',
            order: 1,
            category: 'algebra',
            totalLevels: 2,
            completedLevels: completed ? 1 : 0,
            continueSubchapterId: subchapterId,
            subchapters: [
              {
                id: subchapterId,
                title: 'Persamaan fixture',
                order: 1,
                totalLevels: 2,
                completedLevels: completed ? 1 : 0,
                availableLevels: 1,
                latestScore: completed ? 80 : null,
                bestScore: completed ? 80 : null,
              },
            ],
          },
        ],
      };
    else if (path === `/pretest/chapters/${chapterId}`)
      data = {
        chapterId,
        chapterTitle: 'Aljabar fixture',
        state: 'unavailable',
        canStart: false,
        canSkip: false,
        attemptId: null,
        skipped: false,
        isDemo: true,
      };
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
      const payload = route.request().postDataJSON();
      option = payload.answer?.optionId ?? payload.optionId ?? null;
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
    else if (path === '/tryout/batches') data = { routingActive: false, items: [] };
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
    else if (path === '/leaderboards/periods') data = { periods: [] };
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
    else if (path === '/admin/analytics') data = analyticsSnapshot();
    else if (path === '/admin/schools')
      data = { items: [{ id: chapterId, code: 'QA', name: 'Sekolah fixture', status: 'ACTIVE' }] };
    else if (path === `/admin/schools/${chapterId}`)
      data = {
        id: chapterId,
        code: 'QA',
        name: 'Sekolah fixture',
        status: 'ACTIVE',
        address: null,
      };
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
// Synthetic handoff-like data. This fixture does not approve OPEN XP policy or enable production features.
for (const width of [320, 360, 390, 393, 430, 768, 1024, 1280, 1440]) {
  test(`home visual composition at ${width}px preserves query and navigation boundaries`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width < 700 ? 1374 : 1000 });
    await fixtures(page);
    const mutations: string[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith('http://localhost:3301/api/v1/') && request.method() !== 'GET')
        mutations.push(request.method());
    });
    await page.route('http://localhost:3301/api/v1/identity/me', (route) =>
      route.fulfill({
        json: {
          id: studentId,
          displayName: 'Kirino S.',
          role: 'STUDENT',
          status: 'ACTIVE',
          email: 'fixture@example.invalid',
          studentAffiliation: 'SCHOOL',
          teacherVerified: null,
        },
      }),
    );
    await page.route('http://localhost:3301/api/v1/students/me/dashboard', (route) =>
      route.fulfill({
        json: {
          displayName: 'Kirino S.',
          affiliation: 'SCHOOL',
          totalXp: 1450,
          class: { id: chapterId, name: 'IX-A', schoolName: 'SMPN 1 Jakarta' },
          completedLevels: 14,
          availableLevels: 20,
          latestDrillScore: 85,
          bestDrillScore: 90,
          activeDrill: { attemptId, title: 'Level 3 (Akar Kuadrat)', levelId },
          activities: [
            {
              attemptId: 'completed-fixture',
              activity: 'drill',
              title: 'Faktorisasi Aljabar Kuadrat',
              chapterId,
              subchapterId,
              levelId,
              subchapterTitle: 'Subbab 2.1',
              submittedAt: '2026-10-03T02:30:00Z',
              resultState: 'ready',
              score: 85,
              isDemo: false,
              xpState: 'pending',
              starsState: 'ready',
              stars: 1,
            },
          ],
          features: {
            drill: true,
            tryout: true,
            pretest: false,
            pvp: false,
            classLeaderboard: true,
            pendingPolicies: [],
          },
        },
      }),
    );
    await page.route('http://localhost:3301/api/v1/tryout/packages/current', (route) =>
      route.fulfill({
        json: {
          id: chapterId,
          title: 'Paket Tryout Mingguan #04 Rilis!',
          state: 'open',
          eligible: true,
          questionCount: 30,
          durationSeconds: 4800,
        },
      }),
    );
    await page.route('http://localhost:3301/api/v1/leaderboards/class', (route) =>
      route.fulfill({
        json: {
          policyPending: false,
          reasonCode: null,
          className: 'IX-A',
          unit: 'xp',
          period: {
            startsAt: '2026-10-01T00:00:00Z',
            endsAt: '2026-10-08T00:00:00Z',
            timezone: 'Asia/Jakarta',
          },
          updatedAt: '2026-10-03T02:00:00Z',
          entries: [
            { studentId: 'fixture-siti', displayName: 'Siti Rahma', rank: 1, points: 1890 },
            { studentId: 'fixture-dimas', displayName: 'Dimas A.', rank: 2, points: 1620 },
            { studentId, displayName: 'Kirino S.', rank: 3, points: 1450 },
          ],
          ownEntry: { studentId, displayName: 'Kirino S.', rank: 3, points: 1450 },
        },
      }),
    );
    await page.route('http://localhost:3301/api/v1/students/me/feedback/summary', (route) =>
      route.fulfill({
        json: {
          unreadCount: 0,
          latest: [
            {
              id: questionId,
              classId: chapterId,
              studentId,
              teacherName: 'Bu Ratna, M.Pd.',
              body: 'Hebat Kirino! Pemahamanmu di Faktorisasi Kuadrat sudah tuntas 85%. Pertahankan latihan dan tingkatkan kecepatan di Level 3 ya!',
              sentAt: '2026-10-03T02:30:00Z',
              readAt: '2026-10-03T03:00:00Z',
            },
          ],
        },
      }),
    );
    await page.goto('/student');
    await expect(page.getByText('1.890 XP')).toBeVisible();
    await expect(page.getByText('Bu Ratna, M.Pd.')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const pattern = /header-pattern\.png/;
    await expect(page.locator('.sh-identity:visible')).toHaveCSS('background-image', pattern);
    const imageSlots = [
      '.recent-activity__art img[src="/illustrations/student-heroes/drill-owl.webp"]',
      '.sh-identity__bell img',
      '.sh-identity__announcement img',
      '.sh-shortcut__icon img',
      '.sh-class__trophy',
      '.sh-feedback__icon img',
    ];
    for (const slot of imageSlots) {
      await expect
        .poll(
          () =>
            page.locator(slot).evaluateAll(
              (nodes) =>
                nodes.length > 0 &&
                nodes.every((node) => {
                  const image = node as HTMLImageElement;
                  return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
                }),
            ),
          { message: slot },
        )
        .toBe(true);
    }
    for (const [slide, asset] of [
      ['drill', 'drill-owl.webp'],
      ['tryout', 'tryout-exam.webp'],
    ]) {
      const background = await page
        .locator(`.sh-carousel__slide--${slide} .sh-hero`)
        .evaluate((hero) => getComputedStyle(hero, '::after').backgroundImage);
      expect(background).toContain(asset);
      expect(
        await page.evaluate(async (filename) => {
          const picture = new Image();
          picture.src = `/illustrations/student-heroes/${filename}`;
          await picture.decode();
          return picture.naturalWidth > 0 && picture.naturalHeight > 0;
        }, asset),
      ).toBe(true);
    }
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const bounds = await page.evaluate(() => {
      const selectors = [
        '.sh-identity',
        '.sh-carousel',
        '.sh-shortcuts',
        '.sh-activities',
        '.sh-class',
        '.sh-feedback',
        '.student-bottom-nav',
        '.recent-activity__card',
      ];
      return {
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        cards: selectors.flatMap((selector) =>
          Array.from(document.querySelectorAll(selector))
            .filter((element) => element.getBoundingClientRect().width > 0)
            .map((element) => {
              const box = element.getBoundingClientRect();
              return {
                selector,
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                radius: getComputedStyle(element).borderRadius,
              };
            }),
        ),
      };
    });
    expect(bounds.overflow).toBe(false);
    if (width >= 960) {
      const desktop = await page.locator('.sh-layout').evaluate((layout) => {
        const rect = (selector: string) => layout.querySelector(selector)!.getBoundingClientRect();
        const identity = rect('.sh-desktop-identity');
        const main = rect('.sh-main');
        const aside = rect('.sh-aside');
        return {
          headerSpansColumns: identity.left === main.left && identity.right === aside.right,
          columnsAlign: main.top === aside.top,
          columnGap: aside.left - main.right,
          asideWidth: aside.width,
        };
      });
      expect(desktop).toEqual({
        headerSpansColumns: true,
        columnsAlign: true,
        columnGap: 24,
        asideWidth: 300,
      });
    }
    if (width < 700) {
      const cards = bounds.cards.filter((card) =>
        [
          '.sh-identity',
          '.sh-carousel',
          '.sh-shortcuts',
          '.sh-activities',
          '.sh-class',
          '.sh-feedback',
        ].includes(card.selector),
      );
      expect(cards.map((card) => card.selector)).toEqual([
        '.sh-identity',
        '.sh-carousel',
        '.sh-shortcuts',
        '.sh-activities',
        '.sh-class',
        '.sh-feedback',
      ]);
      for (let index = 1; index < cards.length; index++)
        expect(cards[index]!.y).toBeGreaterThanOrEqual(
          cards[index - 1]!.y + cards[index - 1]!.height,
        );
      expect(cards[0]!.x).toBe(0);
      expect(cards[0]!.width).toBe(width);
    }
    await writeFile(
      testInfo.outputPath(`home-geometry-${width}.json`),
      JSON.stringify(bounds, null, 2),
    );
    await testInfo.attach('home-geometry', {
      body: JSON.stringify(bounds, null, 2),
      contentType: 'application/json',
    });
    if (width < 960) {
      const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width, height: Math.max(1374, fullHeight) });
    }
    await page.screenshot({
      path: testInfo.outputPath(`home-reference-${width}.png`),
      fullPage: true,
    });
    if (width < 960) await page.setViewportSize({ width, height: width < 700 ? 1374 : 1000 });
    expect(mutations).toEqual([]);
    await expect(page.getByRole('button', { name: 'Pretest belum tersedia' })).toHaveCount(0);
    await expect(page.locator('.sh-shortcuts__grid > a')).toHaveCount(3);
    await expect(page.locator('.sh-shortcuts .sh-section__heading a')).toHaveCount(0);
    await expect(page.locator('.sh-shortcut__arrow')).toHaveCount(0);
    await expect(page.locator('.sh-carousel__arrow, .sh-carousel__pause')).toHaveCount(0);
    await expect(page.locator('.sh-identity__xp:visible svg')).toHaveCount(1);
    await expect(page.locator('.student-identity__affiliation')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Lanjutkan latihan', exact: true }),
    ).toHaveAttribute('href', `/student/drill/${attemptId}`);
    expect(
      await page.locator('.sh-carousel__slide--tryout a').evaluate((link) => {
        (link as HTMLElement).focus();
        return document.activeElement === link;
      }),
    ).toBe(false);
    await page.getByRole('button', { name: 'Tampilkan slide Tryout' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.sh-carousel__slide--tryout')).toHaveAttribute(
      'aria-hidden',
      'false',
    );
    await expect(page.getByRole('link', { name: 'Lihat aturan' })).toHaveAttribute(
      'href',
      '/student/tryout',
    );
    await page.getByRole('button', { name: 'Tampilkan slide Tryout' }).evaluate((button) => {
      (button as HTMLButtonElement).blur();
    });
    if ([320, 390, 1440].includes(width)) {
      await expect
        .poll(() =>
          page.locator('.sh-carousel__viewport').evaluate((viewport) => {
            const track = viewport.querySelector<HTMLElement>('.sh-carousel__track');
            const tryout = viewport.querySelector<HTMLElement>('.sh-carousel__slide--tryout');
            const nextDrill = track?.children[3] as HTMLElement | undefined;
            if (!track || !nextDrill || !tryout || track.dataset.phase !== 'hold') return false;
            const viewportBox = viewport.getBoundingClientRect();
            const activeBox = tryout.getBoundingClientRect();
            const nextBox = nextDrill.getBoundingClientRect();
            return (
              Math.abs(activeBox.left - viewportBox.left) <= 2 &&
              nextBox.left > activeBox.right &&
              nextBox.left < viewportBox.right - 12
            );
          }),
        )
        .toBe(true);
    }
    const tryoutActionFits = await page
      .locator('.sh-carousel__slide--tryout .sh-hero__action')
      .evaluate((action) => {
        const card = action.closest('.sh-hero');
        return (
          card != null &&
          action.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom
        );
      });
    expect(tryoutActionFits).toBe(true);
    if ([320, 390, 1440].includes(width))
      await page.screenshot({
        path: testInfo.outputPath(`home-tryout-${width}.png`),
        fullPage: true,
      });
    if ([320, 390, 1440].includes(width)) {
      await page.getByRole('button', { name: 'Tampilkan slide Drill' }).click();
      await expect(page.locator('.sh-carousel__slide--drill')).toHaveAttribute(
        'aria-hidden',
        'false',
      );
      await expect
        .poll(() =>
          page.locator('.sh-carousel__viewport').evaluate((viewport) => {
            const track = viewport.querySelector<HTMLElement>('.sh-carousel__track');
            const drill = viewport.querySelector<HTMLElement>('.sh-carousel__slide--drill');
            const tryout = viewport.querySelector<HTMLElement>('.sh-carousel__slide--tryout');
            if (!track || !drill || !tryout || track.dataset.phase !== 'hold') return false;
            const viewportBox = viewport.getBoundingClientRect();
            const activeBox = drill.getBoundingClientRect();
            const nextBox = tryout.getBoundingClientRect();
            return (
              Math.abs(activeBox.left - viewportBox.left) <= 2 &&
              nextBox.left > activeBox.right &&
              nextBox.left < viewportBox.right - 12
            );
          }),
        )
        .toBe(true);
      await page.getByRole('button', { name: 'Tampilkan slide Tryout' }).click();
      await expect(page.locator('.sh-carousel__slide--tryout')).toHaveAttribute(
        'aria-hidden',
        'false',
      );
    }
    await expect(page.locator('.sh-carousel__track')).toHaveAttribute('data-phase', 'hold');
    await page.getByRole('button', { name: 'Tampilkan slide Drill' }).click();
    await expect(page.locator('.sh-carousel__slide--drill')).toHaveAttribute(
      'aria-hidden',
      'false',
    );
    if (width === 390) {
      const viewport = page.locator('.sh-carousel__viewport');
      await expect(page.locator('.sh-carousel__track')).toHaveAttribute('data-phase', 'hold');
      const box = await viewport.boundingBox();
      expect(box).not.toBeNull();
      const startX = box!.x + box!.width * 0.68;
      const startY = box!.y + 30;
      for (const nextSlide of ['tryout', 'drill']) {
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX - 110, startY, { steps: 8 });
        await page.mouse.up();
        await expect(page.locator(`.sh-carousel__slide--${nextSlide}`)).toHaveAttribute(
          'aria-hidden',
          'false',
        );
        await expect(page.locator('.sh-carousel__track')).toHaveAttribute('data-phase', 'hold');
      }
    }
    await page.locator('.sh-identity__bell:visible').click();
    await expect(page).toHaveURL('/student/notifications');
    await expect(page.locator('.notification-header')).toHaveCSS('background-image', pattern);
    if (width === 390) {
      await page.goto('/student');
      const homeRecent = page.locator('.recent-activity__card');
      await expect(homeRecent.getByText('85%')).toBeVisible();
      await expect(homeRecent.getByText('1/3 bintang')).toBeVisible();
      await expect(
        homeRecent.getByRole('link', { name: 'Lanjutkan', exact: true }),
      ).toHaveAttribute('href', `/student/drill/${attemptId}`);
      await homeRecent.screenshot({ path: testInfo.outputPath('beranda-aktivitas-390.png') });
      const homeHero = page.locator('.sh-carousel__slide--drill .sh-hero');
      const homeHeight = await homeHero.evaluate(
        (element) => (element as HTMLElement).offsetHeight,
      );

      await page.goto('/student/learn');
      const recent = page.locator('.recent-activity__card');
      await expect(recent.locator('.recent-activity__art img')).toHaveAttribute(
        'src',
        '/illustrations/student-heroes/drill-owl.webp',
      );
      await expect(recent).toHaveCSS('background-image', /linear-gradient/);
      await expect(recent.getByRole('link', { name: 'Lanjutkan', exact: true })).toHaveAttribute(
        'href',
        `/student/drill/${attemptId}`,
      );
      await expect(recent.getByText('85%')).toBeVisible();
      await expect(recent.getByText('1/3 bintang')).toBeVisible();
      await recent.screenshot({ path: testInfo.outputPath('latihan-aktivitas-390.png') });

      await page.goto(`/student/learn/${chapterId}`);
      await expect(
        page.locator('.app-mobile-header').getByRole('link', { name: 'Semua bab' }),
      ).toHaveAttribute('href', '/student/learn');

      await page.goto('/student/pvp');
      const pvpHero = page.locator('.student-illustrated-hero--pvp');
      expect(await pvpHero.evaluate((element) => (element as HTMLElement).offsetHeight)).toBe(
        homeHeight,
      );
      await pvpHero.screenshot({ path: testInfo.outputPath('pvp-hero-390.png') });

      await page.goto('/student/profile');
      const profileHeader = page.locator('main .materials-header');
      await expect(profileHeader.getByRole('heading', { name: 'Profil' })).toHaveCSS(
        'text-align',
        'center',
      );
      await expect(profileHeader).toHaveCSS('background-image', pattern);
      await expect(profileHeader.getByRole('link')).toHaveCount(0);
      await expect(page.locator('#pengaturan-akun')).toBeAttached();
      await profileHeader.screenshot({ path: testInfo.outputPath('profil-header-390.png') });
    }
    if (width === 1440) {
      await page.goto(`/student/learn/${chapterId}`);
      const header = page.locator('.app-mobile-header .materials-header');
      await expect(header.getByRole('link', { name: 'Semua bab' })).toBeVisible();
      await expect(header).toHaveCSS('background-image', pattern);
      await expect(page.getByRole('heading', { name: 'Latihan Soal', exact: true })).toHaveCount(1);
      await page.goto('/student/assessment');
      const progressHeader = page.locator('.app-topbar');
      await expect(
        progressHeader.getByRole('heading', { name: 'Progres & riwayat' }),
      ).toBeVisible();
      await expect(progressHeader).toHaveCSS('background-image', pattern);
      await expect(progressHeader.locator('.desktop-context')).toHaveCount(0);
    }
    expect(mutations).toEqual([]);
  });
}

for (const width of [320, 360, 390, 393, 430, 768, 1024, 1280, 1440])
  test(`student routes at ${width}px use real-data boundaries and accessible navigation`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await fixtures(page);
    await page.goto('/student');
    await expect(page.getByRole('heading', { name: 'Siswa fixture' })).toBeVisible();
    await expect(page.getByText('Belajar mandiri', { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('body')).toHaveCSS('font-family', /jakarta/i);
    // Hide the development toolbar only in visual evidence; it is absent in production.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
    const nav = page.getByRole('navigation', {
      name: width <= 959 ? 'Navigasi utama' : 'Navigasi Ruang belajar',
      exact: true,
    });
    if (width <= 959) {
      await expect(nav.getByRole('link')).toHaveText([
        'Belajar',
        'Latihan',
        'Tryout',
        'PvP',
        'Profil',
      ]);
      await expect(nav.getByRole('link', { name: 'Belajar', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
    await nav.getByRole('link', { name: 'Latihan', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Latihan Soal' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Latihan', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.locator(`a[href="/student/learn/${chapterId}"]`).click();
    await page.getByRole('link', { name: /Persamaan fixture/ }).click();
    await page.getByRole('button', { name: /^Level 1,/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Lanjutkan latihan' }).click();
    await page.getByRole('radio').first().check();
    await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('radio').first()).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath(`drill-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Kirim Drill' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Navigasi Ruang belajar' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Kirim Drill' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ya, Kumpulkan Jawaban' }).click();
    await expect(page.getByText('Tuntas', { exact: true })).toBeVisible();
    await page.goto('/student');
    for (const [label, text] of [
      ['Tryout', 'Paket belum tersedia'],
      ['Progres', 'Menunggu hasil'],
      ['PvP', 'PvP belum tersedia'],
      ['Peringkat', 'Peringkat belum tersedia'],
    ] as const) {
      if (label === 'Peringkat' || (label === 'Progres' && width <= 959))
        await page.goto(label === 'Progres' ? '/student/assessment' : '/student/leaderboards');
      else await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByText(text!, { exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await nav.getByRole('link', { name: 'Latihan', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name: 'Tryout', exact: true })).toBeFocused();
  });
test('home loading and independent Tryout errors preserve learning and pending class policy', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await fixtures(page);
  await page.goto('/student');
  await expect(page.getByText(/Catatan persisted fixture/)).toBeVisible();
  await page.getByRole('button', { name: 'Tampilkan slide Tryout' }).click();
  await expect(page.getByRole('heading', { name: 'Tryout Matematika' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.screenshot({ path: testInfo.outputPath('home-mandiri-390.png'), fullPage: true });
  await page.route('http://localhost:3301/api/v1/identity/me', (route) =>
    route.fulfill({
      json: {
        id: studentId,
        displayName: 'Siswa fixture',
        role: 'STUDENT',
        status: 'ACTIVE',
        email: 'fixture@example.invalid',
        studentAffiliation: 'SCHOOL',
        teacherVerified: null,
      },
    }),
  );
  await page.route('http://localhost:3301/api/v1/students/me/dashboard', (route) =>
    route.fulfill({
      json: {
        displayName: 'Siswa fixture',
        totalXp: 80,
        affiliation: 'SCHOOL',
        class: { id: chapterId, name: 'IX fixture', schoolName: 'Sekolah fixture' },
        completedLevels: 1,
        availableLevels: 2,
        latestDrillScore: 80,
        bestDrillScore: 80,
        activities: [],
        activeDrill: null,
        features: {
          drill: true,
          tryout: true,
          pretest: false,
          pvp: false,
          classLeaderboard: false,
          pendingPolicies: ['OPEN-11'],
        },
      },
    }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  let classRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/leaderboards/class')) classRequests++;
  });
  await page.route('http://localhost:3301/api/v1/tryout/packages/current', async (route) => {
    await gate;
    await route.fulfill(
      fail
        ? { status: 503, json: { detail: 'Fixture offline' } }
        : {
            json: {
              title: 'Paket pulih',
              state: 'open',
              eligible: true,
              questionCount: 30,
              durationSeconds: 4800,
            },
          },
    );
  });
  await page.goto('/student');
  try {
    await page.getByRole('button', { name: 'Tampilkan slide Tryout' }).click();
    await expect(page.getByRole('status', { name: 'Memuat Tryout' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shortcut Belajar' })).toBeVisible();
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.screenshot({ path: testInfo.outputPath('home-loading-390.png'), fullPage: true });
  } finally {
    release();
  }
  const tryoutError = page.locator('.sh-carousel__slide--tryout');
  await expect(
    tryoutError.getByRole('heading', { name: 'Tryout belum dapat dimuat' }),
  ).toBeVisible();
  const retryTryout = tryoutError.getByRole('button', { name: 'Coba lagi' });
  await expect(retryTryout).toBeVisible();
  expect(
    await retryTryout.evaluate((button) => {
      const hero = button.closest('.sh-hero')!.getBoundingClientRect();
      return button.getBoundingClientRect().bottom <= hero.bottom;
    }),
  ).toBe(true);
  await expect(page.getByText('Peringkat belum tersedia', { exact: true })).toBeVisible();
  await expect(page.getByText(/Catatan persisted fixture/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('home-error-pending-390.png'),
    fullPage: true,
  });
  fail = false;
  await tryoutError.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.getByRole('heading', { name: 'Paket pulih' })).toBeVisible();
  expect(classRequests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
              options: attempt.questions[0]!.options,
              selectedOptionId: 'A',
              correctOptionId: 'A',
              explanation: 'Fixture explanation',
            },
          ],
        } satisfies TryoutResultDto,
      });
    return route.fallback();
  });
  await page.goto('/student/tryout');
  await expect(page.getByText('Gratis', { exact: true })).toBeVisible();
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
  await page.getByRole('link', { name: 'Lihat pembahasan', exact: true }).click();
  await expect(page).toHaveURL(`/student/tryout/${attemptId}/explanation`);
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
  await expect(page.getByRole('link', { name: /History waiting fixture/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /History Pretest fixture/ })).toHaveAttribute(
    'href',
    `/student/pretest/${subchapterId}/result`,
  );
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page
        .getByText('Menunggu hasil', { exact: true })
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
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
    await page.getByRole('link', { name: 'Buka profil siswa', exact: true }).click();
    await page.getByLabel('Kode kelas').fill(` ${joinCode} `);
    await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
    await expect(
      page.locator('.student-profile-identity').getByText('Sekolah fixture', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Profil dan progres' })
        .getByText('IX fixture', { exact: true }),
    ).toBeVisible();
    await page.goto('/student');
    await expect(
      page.locator('.sh-identity:visible').getByText('Sekolah fixture', { exact: true }),
    ).toBeVisible();
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
  await expect(page.getByText('User Mandiri', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('User Mandiri', { exact: true })).toBeVisible();
});

test('joined class affiliation persists after signing out and back in', async ({ page }) => {
  await fixtures(page);
  await page.goto('/student/profile');
  await page.getByLabel('Kode kelas').fill(' FIX234 ');
  await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
  await expect(
    page.locator('.student-profile-identity').getByText('Sekolah fixture', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => localStorage.setItem('test-logged-out', '1'));
  await page.getByRole('button', { name: 'Keluar Akun Google' }).click();
  await expect(page).toHaveURL('http://localhost:3300/login');
  await page.evaluate(() => localStorage.removeItem('test-logged-out'));
  await page.reload();
  await expect(page).toHaveURL(/\/student$/);
  await page.goto('/student/profile');
  await expect(
    page.locator('.student-profile-identity').getByText('Sekolah fixture', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Kode kelas')).toBeEnabled();
  await page.goto('/student/leaderboards?tab=class');
  await expect(
    page.getByText('Aturan XP kelas sedang ditetapkan.', { exact: false }),
  ).toBeVisible();
});

for (const joinCode of ['FIX234', 'QA_LEGACY-CLASS'])
  test(`class join link ${joinCode} trims the query and keeps its capitalization`, async ({
    page,
  }) => {
    await fixtures(page);
    const sent: string[] = [];
    let identityReads = 0;
    await page.route('http://localhost:3301/api/v1/classes/join', async (route) => {
      sent.push((route.request().postDataJSON() as { joinCode: string }).joinCode);
      await route.fulfill({ json: { joined: true, class: { id: chapterId, name: 'IX fixture' } } });
    });
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/v1/identity/me') identityReads += 1;
    });

    await page.goto(`/student/join?code=%20${joinCode}%20`);
    await expect(page.getByRole('heading', { name: 'Konfirmasi gabung kelas' })).toBeVisible();
    await expect(page.getByRole('main').getByText(joinCode, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
    await expect(page).toHaveURL('http://localhost:3300/student');
    expect(sent).toEqual([joinCode]);
    expect(identityReads).toBeGreaterThanOrEqual(2);
  });

test('class join link reports the server reason for a code that no longer joins', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/student/join?code=BAD999');
  await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Kode Class tidak valid. Kode bisa salah, kelas sudah diarsipkan, atau sekolah tidak aktif.',
  );
  await expect(page.getByRole('main').getByRole('status')).toHaveCount(0);
});

test('class join link explains the five-class limit and links to the profile', async ({ page }) => {
  await fixtures(page);
  await page.route('http://localhost:3301/api/v1/classes/join', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: {
        code: 'CLASS_LIMIT_REACHED',
        detail: 'Siswa hanya dapat memiliki maksimal 5 kelas aktif.',
      },
    });
  });
  await page.goto('/student/join?code=FIX234');
  await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Siswa hanya dapat memiliki maksimal 5 kelas aktif. Kamu dapat mengikuti maksimal lima kelas aktif. Keluar dari kelas melalui Profil.',
  );
  await page.getByRole('link', { name: 'Batal dan buka profil' }).click();
  await expect(page).toHaveURL(/\/student\/profile$/);
});

for (const [status, code, detail, hint] of [
  [
    429,
    'CODE_ATTEMPT_LIMIT',
    'Terlalu banyak percobaan kode. Coba lagi setelah jeda.',
    'Tunggu beberapa saat sebelum mencoba kode lagi.',
  ],
  [
    503,
    'CODE_LIMITER_UNAVAILABLE',
    'Verifikasi kode sementara tidak tersedia.',
    'Pemeriksaan kode sementara tidak tersedia. Coba lagi nanti.',
  ],
] as const)
  test(`class join link keeps the code retryable on ${status}`, async ({ page }) => {
    await fixtures(page);
    await page.route('http://localhost:3301/api/v1/classes/join', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/problem+json',
        json: { code, detail },
      });
    });
    await page.goto('/student/join?code=FIX234');
    await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(`${detail} ${hint}`);
    await expect(page.getByRole('button', { name: 'Gabung kelas', exact: true })).toBeEnabled();
  });

test('class join link refuses a malformed code before any request', async ({ page }) => {
  await fixtures(page);
  let joinRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/classes/join') joinRequests += 1;
  });
  await page.goto('/student/join?code=ab!');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Format kode kelas tidak dikenali.',
  );
  await expect(page.getByRole('button', { name: 'Gabung kelas' })).toHaveCount(0);
  expect(joinRequests).toBe(0);
});

test('class join link without a code points to the existing manual entry', async ({ page }) => {
  await fixtures(page);
  await page.goto('/student/join');
  await expect(page.getByRole('heading', { name: 'Kode kelas tidak tersedia' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gabung dengan kode' })).toHaveAttribute(
    'href',
    '/student/profile',
  );
  await expect(page.getByRole('button', { name: 'Gabung kelas' })).toHaveCount(0);
});

test('class join link warns an already affiliated Student and stays server-authoritative', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/student/profile');
  await page.getByLabel('Kode kelas').fill('FIX234');
  await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
  await expect(
    page.locator('.student-profile-identity').getByText('Sekolah fixture', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Profil dan progres' })
      .getByText('IX fixture', { exact: true }),
  ).toBeVisible();

  await page.goto('/student/join?code=QA_LEGACY-CLASS');
  await expect(
    page.getByText(
      'Akunmu sudah terhubung dengan sebuah kelas. Hasil akhir tetap ditentukan server.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3300/student');
  await expect(
    page.locator('.sh-identity:visible').getByText('Sekolah fixture', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Buka profil siswa', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Profil dan progres' })
      .getByText('IX fixture', { exact: true }),
  ).toBeVisible();
});

test('class join link opened while signed out opens login and saves the invitation', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/student/profile');
  await page.evaluate(() => {
    localStorage.setItem('test-logged-out', '1');
    localStorage.removeItem('sb-numora-e2e-auth-token');
  });

  await page.goto('/student/join?code=FIX234');
  await expect(page).toHaveURL('http://localhost:3300/login');
  expect(await page.evaluate(() => sessionStorage.getItem('numora:class-invitation'))).toBe(
    'FIX234',
  );
  await expect(page.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeVisible();
});

for (const width of [320, 390, 1440])
  test(`class join link at ${width}px is operable by keyboard without horizontal overflow`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await fixtures(page);
    await page.goto('/student/join?code=FIX234');
    await expect(page.getByRole('heading', { name: 'Konfirmasi gabung kelas' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`class-join-${width}.png`), fullPage: true });

    await page.getByRole('button', { name: 'Gabung kelas', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('http://localhost:3300/student');
    await expect(
      page.locator('.sh-identity:visible').getByText('Sekolah fixture', { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('link', { name: 'Buka profil siswa', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Profil dan progres' })
        .getByText('IX fixture', { exact: true }),
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
    await expect(page.getByRole('region', { name: 'Progres per level' })).toBeVisible();
    await expect(page.locator('.teacher-latest-score__value')).toHaveText('0/100');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`teacher-${width}.png`), fullPage: true });
  });
  test(`Admin school/token workflow at ${width}px retains operational forms`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await fixtures(page, 'ADMIN', true, 0, 'OPERATIONS');
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
  await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
  await expect(page.getByText('Terverifikasi', { exact: true })).toBeVisible();
  await expect(page.getByText('Sekolah fixture', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Buka daftar kelas/ })).toHaveAttribute(
    'href',
    '/teacher',
  );
  await page.evaluate(() => localStorage.setItem('test-logged-out', '1'));
  await page.getByRole('button', { name: 'Keluar dari akun' }).click();
  await expect(page).toHaveURL('http://localhost:3300/login');
  await page.goto('/teacher/profile');
  await expect(page).toHaveURL('http://localhost:3300/login');
  await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toHaveCount(0);
});

test('Student cannot open Teacher profile', async ({ page }) => {
  await fixtures(page);
  await page.goto('/teacher/profile');
  await expect(page).toHaveURL('http://localhost:3300/student');
  await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toHaveCount(0);
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
  await expect(page.locator('.teacher-latest-score__value')).toHaveText('60/100');
  const level = page
    .getByRole('region', { name: 'Progres per level' })
    .locator('.teacher-level-card');
  await expect(level.locator('dt')).toHaveText(['Terakhir', 'Terbaik']);
  await expect(level.locator('dd')).toHaveText(['60', '90']);

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
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeVisible();
  await expect(page.locator('a[href^="/demo/"]')).toHaveCount(0);
});

test('Drill timer waits for explicit resume and pauses on confirmed exit', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 668 });
  await fixtures(page);
  const sessionId = '77000000-0000-4777-8777-000000000001';
  let running = false;
  let resumeCount = 0;
  let pauseCount = 0;
  let elapsedMs = 42_000;
  const clock = () => ({
    elapsedMs,
    remainingMs: running ? 30_000 : 0,
    sessionId: running ? sessionId : null,
  });
  const attempt = () => ({
    id: attemptId,
    levelId,
    levelTitle: 'Drill timer fixture',
    startedAt: '2026-10-01T00:00:00Z',
    status: 'inProgress',
    isDemo: true,
    clock: clock(),
    questions: running
      ? [
          {
            questionInstanceId: questionId,
            stem: 'Berapa hasil sqrt(16)?\n\nSiswa | Elevasi | Satuan | Catatan\n--- | ---: | --- | ---\nRani | 2 | m | Di atas titik netral\nBudi | -1,4 | m | Di bawah titik netral',
            options: [
              { id: 'A', text: '\\frac{8}{2}' },
              { id: 'B', text: 'π' },
            ],
            selectedOptionId: 'A',
          },
        ]
      : [],
  });
  await page.route(`**/api/v1/assessment-attempts/${attemptId}`, (route) =>
    route.fulfill({ json: attempt() }),
  );
  await page.route('**/api/v1/assessments/drill/attempts', (route) => {
    expect(route.request().postDataJSON()).toEqual({ levelId });
    resumeCount++;
    running = true;
    return route.fulfill({ json: attempt() });
  });
  await page.route(`**/api/v1/assessment-attempts/${attemptId}/drill-clock`, (route) => {
    const command = route.request().postDataJSON();
    expect(command.sessionId).toBe(sessionId);
    if (command.action === 'pause') {
      running = false;
      elapsedMs = 45_000;
      pauseCount++;
    }
    return route.fulfill({ json: clock() });
  });

  const url = `/student/drill/${attemptId}`;
  const duration = page.getByRole('group', { name: 'Waktu tersimpan' });
  const resume = page.getByRole('button', { name: 'Lanjutkan latihan' });
  async function expectPausedLayout(width: number) {
    await expect(duration).toBeVisible();
    await expect(resume).toBeVisible();
    const timerBox = await duration.boundingBox();
    const buttonBox = await resume.boundingBox();
    expect(timerBox!.y + timerBox!.height).toBeLessThan(buttonBox!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({
      path: testInfo.outputPath(`drill-paused-${width}.png`),
      style: 'nextjs-portal { display: none !important; }',
    });
  }

  await page.goto('/student/learn');
  await page.goto(url);
  // Seed same-document history, as produced by a client-side route into the attempt.
  await page.evaluate((attemptUrl) => {
    window.history.replaceState(window.history.state, '', '/student/learn');
    window.history.pushState(window.history.state, '', attemptUrl);
  }, url);
  await expect(page.getByRole('heading', { name: 'Latihan dijeda' })).toBeVisible();
  await expect(duration).toContainText('0:42');
  await expectPausedLayout(320);
  expect(resumeCount).toBe(0);
  await page.setViewportSize({ width: 634, height: 668 });
  await resume.click();
  await expect(page.getByLabel('Waktu berjalan')).toBeVisible();
  await expect(page.locator('.practice-stem')).toHaveCSS('font-size', '15px');
  await expect(page.locator('.practice-stem .katex-html')).toBeVisible();
  await expect(page.locator('.practice-stem math msqrt')).toHaveText('16');
  await expect(page.locator('.practice-option__text math mfrac')).toHaveCount(1);
  await expect(page.locator('.practice-option__text math mi')).toHaveText('π');
  await expect(page.locator('.practice-option__indicator').first()).toBeHidden();
  await expect(page.locator('.practice-option__text').first()).toHaveCSS('font-weight', '700');
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expect(page.getByRole('table', { name: 'Data soal' })).toBeVisible();
  await expect(page.getByRole('columnheader')).toHaveCount(4);
  await expect(page.locator('.practice-save-notice')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 668 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath('drill-table-320.png'), fullPage: true });
  await page.evaluate(() => window.history.back());
  const exitDialog = page.getByRole('dialog', { name: 'Jeda latihan dulu?' });
  await expect(exitDialog).toBeVisible();
  await expect(exitDialog).toContainText('Timer akan dijeda');
  expect(pauseCount).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('drill-exit-320.png') });
  await exitDialog.getByRole('button', { name: 'Lanjut mengerjakan' }).click();
  await expect(exitDialog).toBeHidden();
  await expect(page).toHaveURL(url);
  expect(pauseCount).toBe(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.practice-stem')).toHaveCSS('font-size', '17px');
  await page.getByRole('link', { name: 'Kembali ke materi' }).click();
  await expect(exitDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(exitDialog).toBeHidden();
  await expect(page.getByRole('link', { name: 'Kembali ke materi' })).toBeFocused();
  await page.getByRole('link', { name: 'Kembali ke materi' }).click();
  await page.screenshot({ path: testInfo.outputPath('drill-exit-1280.png') });
  await exitDialog.getByRole('button', { name: 'Ya, keluar dulu' }).click();
  await expect(page).toHaveURL('/student/learn');
  await expect.poll(() => pauseCount).toBe(1);
  await page.goto(url);
  await expect(duration).toContainText('0:45');
  await expectPausedLayout(1280);
  expect(resumeCount).toBe(1);
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

test('TEST ONLY TryOut with 30 PG questions preserves countdown on reload and recovers a lost auto-submit acknowledgement', async ({
  page,
}) => {
  await fixtures(page);
  const options = [
    { id: 'A', text: '2' },
    { id: 'B', text: '3' },
  ];
  const ids = Array.from(
    { length: 30 },
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
      const payload = route.request().postDataJSON();
      const optionId = payload.answer?.optionId ?? payload.optionId ?? null;
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
  ).toHaveCount(30);
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
    await page.getByRole('combobox', { name: 'Sekolah', exact: true }).selectOption(chapterId);
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
  await page.getByRole('combobox', { name: 'Sekolah', exact: true }).selectOption(chapterId);
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
  test(
    'Admin Drill package lifecycle, report resolution and IRT release state at ' + width + 'px',
    async ({ page }, testInfo) => {
      const { fixture, errors } = await setupAssessments(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/assessments/drill/new');
      await page.getByLabel('Judul paket').fill('Paket fixture baru');
      await page.getByLabel('Kode keluarga paket').fill('DEMO-E2E');
      await page.getByLabel('Subbab dan level paket').selectOption(adminFixtureId(3));
      await page.getByLabel('Kode sumber stabil').fill('TEST_ONLY');
      await page.getByLabel('Nama penyusun / tim / buku').fill('TEST ONLY Curriculum');
      await page.getByLabel('Referensi sumber', { exact: true }).fill('TEST ONLY browser fixture');
      await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Paket fixture baru', exact: true }),
      ).toBeVisible();
      const pack = fixture.packs.at(-1)!;
      expect(pack.assessmentType).toBe('DRILL');
      const versionIds = Array.from({ length: 10 }, (_, index) => adminFixtureId(8800 + index));
      // The canonical flow imports questions separately from draft creation.
      pack.items = versionIds.map((questionVersionId, index) => ({
        questionVersionId,
        questionId: questionVersionId,
        displayOrder: index + 1,
        usageType: 'DRILL',
        contentStatus: 'READY',
        reviewedAt: '2026-10-01T00:00:00Z',
        reviewedByUserId: studentId,
        question: null,
      }));
      pack.readiness.expectedCount = 10;
      pack.readiness.actualCount = 10;
      await page.reload();
      await expect(page.locator('.assessment-question-table tbody tr')).toHaveCount(10);
      await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
      await page.getByLabel('Nama paket', { exact: true }).fill('Paket fixture direvisi');
      await page.getByRole('button', { name: 'Simpan nama', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Paket fixture direvisi', exact: true }),
      ).toBeVisible();
      expect(
        fixture.calls.find((call) => call.method === 'PATCH')?.body?.questionVersionIds,
      ).toEqual(versionIds);
      await page
        .getByRole('dialog', { name: 'Pengaturan paket' })
        .getByRole('button', { name: 'Tutup dialog' })
        .click();
      await page.getByRole('button', { name: 'Penerbitan', exact: true }).click();
      const publication = page.getByRole('dialog', { name: 'Penerbitan paket' });
      await expect(publication.getByRole('button', { name: 'Publikasikan paket' })).toBeDisabled();
      await publication.getByText('1. Simpan persetujuan tim kurikulum', { exact: true }).click();
      await publication
        .getByLabel('Bukti persetujuan tim kurikulum')
        .fill('TEST_ONLY_BROWSER_APPROVAL');
      await publication.getByRole('checkbox', { name: /Susunan paket/ }).check();
      await publication.getByRole('button', { name: 'Simpan persetujuan' }).click();
      await publication.getByRole('checkbox', { name: /Saya telah memeriksa paket/ }).check();
      await publication.getByRole('button', { name: 'Publikasikan paket', exact: true }).click();
      await publication.getByRole('checkbox', { name: /Saya memahami arsip/ }).check();
      await publication.getByRole('button', { name: 'Arsipkan paket', exact: true }).click();
      await expect(
        publication.getByText('Paket diarsipkan. Histori pengerjaan tetap dipertahankan.'),
      ).toBeVisible();
      expect(
        fixture.calls.filter((call) => call.method !== 'GET').map((call) => call.path),
      ).toEqual([
        'admin/content/packages',
        'admin/content/packages/' + pack.id,
        'admin/content/packages/' + pack.id + '/approval',
        'admin/content/packages/' + pack.id + '/publish',
        'admin/content/packages/' + pack.id + '/archive',
      ]);
      const report = {
        id: questionId,
        kind: 'QUESTION',
        referenceId: attemptId,
        category: 'Kunci',
        details: 'Laporan fixture',
        status: 'OPEN',
        followUp: null as string | null,
        reportedAt: '2026-10-03T00:00:00Z',
        reportCount: 1,
      };
      let caseRevision = 0;
      await page.route('**/api/v1/admin/reports**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() === 'GET') {
          return route.fulfill({
            json: path.endsWith(report.id)
              ? { ...report, caseRevision, sourceReports: [report], history: [] }
              : { items: [report], total: 1, nextOffset: null },
          });
        }
        const body = route.request().postDataJSON();
        expect(body).toMatchObject(
          caseRevision === 0
            ? { status: 'IN_REVIEW', expectedRevision: 0 }
            : { status: 'RESOLVED', followUp: 'Tindak lanjut fixture', expectedRevision: 1 },
        );
        caseRevision++;
        Object.assign(report, body);
        return route.fulfill({ json: { id: report.id } });
      });
      await page.goto('/admin/content');
      await selectContentSection(page, 'Laporan');
      await page.getByRole('link', { name: 'Buka kasus', exact: true }).click();
      await page.getByRole('button', { name: 'Mulai tinjauan', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Simpan tindak lanjut', exact: true }),
      ).toBeVisible();
      await page
        .getByRole('combobox', { name: 'Status tindak lanjut', exact: true })
        .selectOption('RESOLVED');
      await page.getByLabel('Catatan tindak lanjut', { exact: true }).fill('Tindak lanjut fixture');
      await page.getByRole('button', { name: 'Simpan tindak lanjut', exact: true }).click();
      await expect(page.getByText('Selesai · 1 laporan', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Kembali ke daftar laporan', exact: true }).click();
      await expect(page.getByText('Tindak lanjut tersimpan:', { exact: true })).toBeVisible();
      await page.route('**/api/v1/admin/irt/batch-health?*', (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: attemptId,
                packageId: pack.id,
                title: 'Batch TEST ONLY',
                contextId: null,
                status: 'CLOSED',
                closesAt: '2026-10-01T01:00:00Z',
                dueAt: '2026-10-04T01:00:00Z',
                overdue: false,
                activeAttemptCount: 0,
                finalizedAttemptCount: 1,
                publishedAt: null,
                prepareBlockers: [],
                publicationBlockers: ['RESPONDENT_CONTRACT_NOT_APPROVED'],
              },
            ],
          },
        }),
      );
      await page.goto('/admin/irt?view=batches');
      await expect(
        page.getByRole('heading', { name: 'Batch TEST ONLY', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Nilai dan pembahasan belum dirilis', { exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(errors).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath('admin-content-' + width + '.png'),
        fullPage: true,
      });
    },
  );
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
  { role: 'ADMIN', verified: true, path: '/student', destination: '/admin/analytics' },
] as const) {
  test(`${role}${verified ? '' : ' unverified'} cannot enter ${path}`, async ({ page }) => {
    await fixtures(page, role, verified);
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  });
}

// Phase 3 visual evidence is deterministic test data, never inserted as user results.
for (const width of [320, 360, 390, 393, 430, 768, 1024, 1280, 1440]) {
  test(`learning visual evidence at ${width}px preserves mastery and saved-answer boundaries`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 700 ? 940 : 1000 });
    await fixtures(page);
    const output = resolve(process.cwd(), '../../.tmp/redesign-phase3');
    await mkdir(output, { recursive: true });
    await page.route('http://localhost:3301/api/v1/students/me/dashboard', async (route) => {
      return route.fulfill({
        json: {
          displayName: 'Kirino S.',
          totalXp: 320,
          affiliation: 'SCHOOL',
          class: { id: chapterId, name: 'IX-A', schoolName: 'SMPN 1 Jakarta' },
          completedLevels: 2,
          availableLevels: 5,
          latestDrillScore: 100,
          bestDrillScore: 100,
          activities: [],
          activeDrill: { attemptId, levelId, title: 'Level 3' },
          features: {
            drill: true,
            tryout: true,
            pvp: false,
            pretest: false,
            classLeaderboard: false,
            pendingPolicies: [],
          },
        },
      });
    });
    await page.route('http://localhost:3301/api/v1/tryout/packages/current', (route) =>
      route.fulfill({
        json: {
          state: 'open',
          id: chapterId,
          title: 'TO TKA Matematika SMP #04',
          eligible: true,
          questionCount: 30,
          durationSeconds: 4800,
        },
      }),
    );
    const questions = Array.from({ length: 10 }, (_, index) => ({
      questionInstanceId: `55000000-0000-4555-8555-${String(index + 1).padStart(12, '0')}`,
      stem: 'Diketahui persamaan kuadrat $x^2 + 6x + c = 0$ dapat diubah secara ekuivalen menjadi bentuk kuadrat sempurna $(x + p)^2 = 0$. Nilai dari konstanta c dan p berturut-turut adalah…',
      options: [
        { id: 'A', text: '$c=9$ dan $p=3$' },
        { id: 'B', text: '$c=6$ dan $p=3$' },
        { id: 'C', text: '$c=9$ dan $p=6$' },
        { id: 'D', text: '$c=36$ dan $p=6$' },
      ],
      selectedOptionId: index === 5 ? null : 'A',
    }));
    const answerKeys = new Map(questions.map((q) => [q.questionInstanceId, q.selectedOptionId]));
    let resultStars: number | null = null;
    let submits = 0;
    await page.route('http://localhost:3301/api/v1/subchapters/**', (route) =>
      route.fulfill({
        json: {
          subchapter: {
            id: subchapterId,
            chapterId,
            title: 'Subbab 2.1: Faktorisasi & Bentuk Kuadrat',
            order: 1,
          },
          levels: Array.from({ length: 5 }, (_, i) => ({
            id: i === 2 ? levelId : `66000000-0000-4666-8666-${String(i + 1).padStart(12, '0')}`,
            title: [
              'Pengenalan Suku & Faktor',
              'Identitas Aljabar',
              'Bentuk Kuadrat Sempurna',
              'Bentuk ax² + bx + c',
              'Master HOTS Kuadrat',
            ][i],
            order: i + 1,
            status: i < 2 ? 'completed' : i === 2 ? 'inProgress' : 'locked',
            latestScore: i === 0 ? 0 : i === 1 ? 100 : null,
            bestScore: i < 2 ? 100 : null,
            latestStars: i === 0 ? 0 : i === 1 ? 3 : i === 2 ? 2 : null,
          })),
        },
      }),
    );
    await page.route(`http://localhost:3301/api/v1/assessment-attempts/${attemptId}**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/result'))
        return route.fulfill({
          json: {
            attemptId,
            levelId,
            levelTitle: 'Level 3: Bentuk Kuadrat Sempurna',
            score: 90,
            rawPoints: 9,
            correctCount: 9,
            questionCount: 10,
            mastered: true,
            stars: resultStars,
            unlockedLevelId: subchapterId,
            isDemo: false,
            explanationState: 'available',
            recommendations: [],
            questions: questions.map((q, i) => ({
              ...q,
              selectedOptionId: i === 2 ? 'C' : 'A',
              reviewStatus: i === 2 ? 'incorrect' : 'correct',
              correctOptionId: 'A',
              explanation:
                'Kenali bentuk kuadrat sempurna: $(x+p)^2=x^2+2px+p^2$. Samakan koefisien: $2p=6$ sehingga $p=3$. Konstanta $c=p^2=9$. Jadi jawaban yang benar adalah A.',
            })),
          },
        });
      if (path.endsWith('/submit')) {
        submits++;
        return route.fulfill({ json: {} });
      }
      if (path.includes('/answers/')) {
        const id = path.split('/').at(-1)!;
        const payload = route.request().postDataJSON();
        const answer = (payload.answer?.optionId ?? payload.optionId ?? null) as string | null;
        answerKeys.set(id, answer);
        return route.fulfill({ json: { questionInstanceId: id, selectedOptionId: answer } });
      }
      return route.fulfill({
        json: {
          id: attemptId,
          levelId,
          levelTitle: 'Level 3: Bentuk Kuadrat Sempurna',
          status: 'inProgress',
          startedAt: new Date(Date.now() - 165000).toISOString(),
          isDemo: false,
          questions: questions.map((q) => ({
            ...q,
            selectedOptionId: answerKeys.get(q.questionInstanceId),
          })),
        },
      });
    });
    const capture = async (screen: string) => {
      if (width === 390)
        await page.setViewportSize({
          width,
          height:
            screen === 'level-map'
              ? 1840
              : screen === 'result'
                ? 1874
                : screen === 'submit-dialog'
                  ? 1064
                  : 940,
        });
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        width: innerWidth,
        cards: Array.from(
          document.querySelectorAll('.practice-question,.adventure-summary,.drill-review'),
        ).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            className: el.className,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            radius: getComputedStyle(el).borderRadius,
          };
        }),
      }));
      expect(geometry.overflow, screen).toBe(false);
      await writeFile(
        resolve(output, `${screen}-${width}.json`),
        JSON.stringify(geometry, null, 2),
      );
      await page.screenshot({
        path: resolve(output, `${screen}-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal { visibility:hidden; }',
      });
    };
    await page.goto('/student/learn');
    await expect(page.getByRole('heading', { name: 'Latihan Soal' })).toBeVisible();
    await capture('catalog');
    await page.goto(`/student/learn/${chapterId}`);
    await expect(page.getByRole('link', { name: /Persamaan fixture/ })).toBeVisible();
    await capture('chapter');
    if (width === 320) await page.setViewportSize({ width, height: 760 });
    await page.goto(`/student/learn/${chapterId}/${subchapterId}`);
    const map = page.getByRole('list', { name: 'Peta level latihan' });
    const currentMedal = map.getByRole('button', { name: /^Level 3,/ });
    const firstMedal = map.getByRole('button', { name: /^Level 1,/ });
    await expect(
      page.locator('header.adventure-summary').getByRole('heading', { level: 1 }),
    ).toHaveText('Subbab 2.1: Faktorisasi & Bentuk Kuadrat');
    await expect(page.locator('.learning-map-shell .app-mobile-header')).toHaveCount(0);
    await expect(currentMedal).toBeInViewport();
    const isAboveDock = async (medal: typeof currentMedal) => {
      const marker = (await medal.boundingBox())!;
      const dock = (await page.locator('.adventure-mobile-action').boundingBox())!;
      return marker.y + marker.height <= dock.y;
    };
    if (width < 960) {
      await expect.poll(() => isAboveDock(currentMedal)).toBe(true);
    }
    await expect(currentMedal).toHaveAttribute('aria-current', 'step');
    await expect(currentMedal).toHaveAttribute('aria-pressed', 'true');
    await expect(currentMedal).toHaveText('3');
    await expect(currentMedal).toHaveAttribute('aria-label', /2 dari 3 bintang terakhir/);
    expect((await firstMedal.boundingBox())!.y).toBeGreaterThan(
      (await currentMedal.boundingBox())!.y,
    );
    const { width: medalWidth, height: medalHeight } = (await firstMedal.boundingBox())!;
    expect(Math.min(medalWidth, medalHeight)).toBeGreaterThanOrEqual(44);
    expect(await page.locator('.level-path__step--locked button').count()).toBe(0);
    await expect(page.locator('.adventure-summary')).not.toContainText('80');
    await expect(page.getByText('Standar ketuntasan:', { exact: true })).toHaveCount(0);
    const hideDevIndicator = 'nextjs-portal { visibility: hidden; }';
    await page.screenshot({
      path: resolve(output, `level-map-viewport-${width}.png`),
      style: hideDevIndicator,
    });
    await firstMedal.focus();
    await expect(firstMedal).toHaveCSS('outline-style', 'solid');
    if (width < 960) await expect.poll(() => isAboveDock(firstMedal)).toBe(true);
    await page.keyboard.press('Enter');
    const detail = page.getByRole('dialog');
    await expect(detail.getByRole('heading', { name: 'Level 1' })).toBeVisible();
    await expect(detail.getByText('Pengenalan Suku & Faktor')).toBeVisible();
    await expect(detail.getByText('Subbab 2.1: Faktorisasi & Bentuk Kuadrat')).toBeVisible();
    await expect(detail.getByText('Bab 1 · Aljabar fixture')).toBeVisible();
    const dialogBox = (await detail.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2)).toBeLessThan(12);
    expect(Math.abs(dialogBox.y + dialogBox.height / 2 - viewport.height / 2)).toBeLessThan(3);
    await expect(detail.getByRole('img', { name: 'Bintang terakhir: 0 / 3' })).toBeVisible();
    await expect(detail.getByText('10 soal')).toBeVisible();
    await expect(detail.getByText('Selesai', { exact: true })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Latihan lagi' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/student/learn/${chapterId}/${subchapterId}$`));
    await page.screenshot({
      path: resolve(output, `level-map-detail-${width}.png`),
      style: hideDevIndicator,
    });
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(firstMedal).toBeFocused();
    if (width < 960) {
      const dock = page.locator('.adventure-mobile-action');
      await expect(dock.locator('strong')).toHaveText('Pengenalan Suku & Faktor');
      await expect(dock.locator('small')).toHaveText('Selesai');
      const dockButton = page.getByRole('button', { name: 'Detail level' });
      const dockBox = (await dockButton.boundingBox())!;
      expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(
        (await page.locator('.student-bottom-nav').boundingBox())!.y,
      );
      await dockButton.click();
      await expect(detail.getByRole('heading', { name: 'Level 1' })).toBeVisible();
      await detail.getByRole('button', { name: 'Tutup dialog' }).click();
      await expect(dockButton).toBeFocused();
    }
    await currentMedal.click();
    await expect(detail.getByRole('button', { name: 'Lanjutkan latihan' })).toBeVisible();
    await page.keyboard.press('Escape');
    if (width === 320) await page.setViewportSize({ width, height: 940 });
    await capture('level-map');
    await page.goto(`/student/drill/${attemptId}`);
    await page.getByRole('button', { name: 'Soal 3, terjawab', exact: true }).click();
    await expect(page.getByRole('radio').first()).toBeChecked();
    await capture('drill');
    await page.getByLabel('Tandai Ragu-ragu').check();
    await page.getByRole('button', { name: 'Soal 10, terjawab', exact: true }).click();
    await page.getByRole('button', { name: 'Kirim Drill' }).click();
    const dialog = page.getByRole('dialog', { name: 'Kumpulkan Latihan Sekarang?' });
    await expect(dialog).toBeVisible();
    expect(submits).toBe(0);
    await capture('submit-dialog');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Kirim Drill' })).toBeFocused();
    await page.goto(`/student/drill/${attemptId}/result`);
    await expect(page.getByText('Tuntas', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Lihat pembahasan', exact: true }).click();
    await expect(page).toHaveURL(`/student/drill/${attemptId}/explanation`);
    await page.getByRole('button', { name: /^Pembahasan soal 3,/ }).click();
    await expect(page.getByText('Soal 3 dari 10', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Rekomendasi video' })).toHaveCount(0);
    await expect(page.locator('.result-stars')).toHaveCount(0);
    await capture('result');
    // Explicit server fixture; no star formula is inferred from the score.
    resultStars = 3;
    await page.goto(`/student/drill/${attemptId}/result`);
    await expect(page.getByText('Bintang: 3', { exact: true })).toBeVisible();
    await expect(page.locator('.result-stars svg')).toHaveCount(3);
    await expect(page.locator('.result-stars svg').first()).toHaveCSS('width', '40px');
    await expect(page.locator('.result-stars svg').first()).toHaveCSS('height', '40px');
    await capture('result-stars');
  });
}

for (const width of [320, 360, 390, 393, 430, 768, 1024, 1280, 1440]) {
  test(`Tryout visual evidence at ${width}px keeps package eligibility and released results separate`, async ({
    page,
  }) => {
    await fixtures(page);
    await page.setViewportSize({ width, height: width < 700 ? 1000 : 1040 });
    const folder = resolve(process.cwd(), '../../.tmp/redesign-phase4');
    await mkdir(folder, { recursive: true });
    async function capture(name: string) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const bounds = await page
        .locator('.numora-card, .tryout-catalog-hero')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              className: element.className,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              radius: getComputedStyle(element).borderRadius,
            };
          }),
        );
      await writeFile(
        resolve(folder, `${name}-${width}.json`),
        JSON.stringify({ width, overflow: false, bounds }, null, 2),
      );
      await page.screenshot({
        path: resolve(folder, `${name}-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal { display: none !important; }',
      });
    }
    let state: 'open' | 'inProgress' = 'open';
    let starts = 0;
    let submits = 0;
    let released = false;
    const selected = new Map<string, string | null>();
    const questions = Array.from({ length: 30 }, (_, index) => ({
      questionInstanceId: `99999999-9999-4999-8999-${String(index + 1).padStart(12, '0')}`,
      stem: 'Diketahui $x^2 + 6x + c = (x + 3)^2$. Nilai konstanta $c$ adalah…',
      options: [
        { id: 'A', text: '9' },
        { id: 'B', text: '6' },
        { id: 'C', text: '3' },
        { id: 'D', text: '36' },
      ],
      selectedOptionId: index === 5 ? null : 'A',
    }));
    const serverNow = Date.now();
    const title = 'Tryout TKA Matematika SMP 2026 #04';
    const result = {
      attemptId,
      packageTitle: title,
      score: 85,
      correctCount: 30,
      questionCount: 30,
      explanation: questions.map((question, index) => ({
        questionInstanceId: question.questionInstanceId,
        stem: question.stem,
        options: question.options,
        reviewStatus: index === 2 ? 'incorrect' : 'correct',
        selectedOptionId: index === 2 ? 'C' : 'A',
        correctOptionId: 'A',
        explanation: 'Identitas $(x+p)^2=x^2+2px+p^2$. Untuk $p=3$, konstanta $c=9$.',
      })),
    };
    await page.route('http://localhost:3301/api/v1/tryout/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      if (path === '/tryout/packages/current')
        return route.fulfill({
          json: {
            id: chapterId,
            title,
            releaseAt: '2026-09-27T17:00:00Z',
            state,
            eligible: state === 'open',
            attemptId: state === 'open' ? null : attemptId,
            questionCount: 30,
            durationSeconds: 4800,
          },
        });
      if (path === '/tryout/attempts') {
        starts++;
        state = 'inProgress';
        return route.fulfill({ json: { id: attemptId } });
      }
      if (path === `/tryout/attempts/${attemptId}`)
        return route.fulfill({
          json: {
            id: attemptId,
            packageId: chapterId,
            packageTitle: title,
            status: 'inProgress',
            serverTime: new Date(serverNow).toISOString(),
            deadlineAt: new Date(serverNow + 4800_000).toISOString(),
            questions: questions.map((question) => ({
              ...question,
              selectedOptionId: selected.has(question.questionInstanceId)
                ? selected.get(question.questionInstanceId)
                : question.selectedOptionId,
            })),
          },
        });
      if (path.includes('/answers/')) {
        const id = path.split('/').at(-1)!;
        const payload = route.request().postDataJSON();
        const optionId = payload.answer?.optionId ?? payload.optionId ?? null;
        selected.set(id, optionId);
        return route.fulfill({ json: { questionInstanceId: id, selectedOptionId: optionId } });
      }
      if (path.endsWith('/submit')) {
        submits++;
        return route.fulfill({ json: { state: 'waitingIrt' } });
      }
      if (path.endsWith('/result'))
        return released
          ? route.fulfill({ json: result })
          : route.fulfill({
              status: 409,
              json: { code: 'TRYOUT_RESULT_PENDING', detail: 'Hasil belum dirilis' },
            });
      return route.fallback();
    });
    await page.route('http://localhost:3301/api/v1/students/me/progress', (route) =>
      route.fulfill({ json: { completedLevels: 14, totalLevels: 20, latestScore: 90 } }),
    );
    await page.route('http://localhost:3301/api/v1/students/me/assessment-results*', (route) =>
      route.fulfill({
        json: {
          records: [
            {
              attemptId,
              activity: 'tryout',
              title: 'Tryout Mingguan #03',
              isDemo: false,
              submittedAt: '2026-09-28T02:30:00Z',
              resultState: 'ready',
              score: 85,
              xpState: 'pending',
              starsState: 'notApplicable',
            },
            {
              attemptId: levelId,
              activity: 'tryout',
              title: 'Tryout Mingguan #04',
              isDemo: false,
              submittedAt: '2026-10-04T02:30:00Z',
              resultState: 'waitingIrt',
              score: null,
            },
            {
              attemptId: subchapterId,
              activity: 'drill',
              title: 'Faktorisasi Aljabar Kuadrat',
              chapterTitle: 'Persamaan & Fungsi Kuadrat',
              subchapterTitle: 'Faktorisasi',
              levelTitle: 'Level 3',
              isDemo: false,
              submittedAt: '2026-10-03T02:30:00Z',
              resultState: 'ready',
              score: 90,
              xpState: 'pending',
              starsState: 'pending',
            },
          ],
          nextCursor: null,
        },
      }),
    );
    await page.goto('/student/tryout');
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await capture('catalog');
    await page.getByRole('tab', { name: 'Riwayat', exact: true }).click();
    await expect(page.getByRole('link', { name: /Tryout Mingguan #03/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Tryout Mingguan #04/ })).toHaveCount(0);
    await expect(page.getByText('Faktorisasi Aljabar Kuadrat', { exact: true })).toHaveCount(0);
    await capture('tryout-history');
    await page.getByRole('tab', { name: 'Berlangsung' }).click();
    await page.getByRole('button', { name: 'Detail dan aturan paket' }).click();
    await expect(page.getByRole('button', { name: 'Mulai TryOut' })).toBeDisabled();
    await expect(page.getByText('30 butir', { exact: true })).toBeVisible();
    await expect(page.getByText('80 menit', { exact: true })).toBeVisible();
    await page.getByLabel('Saya memahami aturan pengerjaan.').check();
    await capture('detail');
    await page.getByRole('button', { name: 'Kembali ke katalog Tryout' }).click();
    await expect(page.getByRole('button', { name: 'Detail dan aturan paket' })).toBeFocused();
    await page.getByRole('button', { name: 'Detail dan aturan paket' }).click();
    await expect(page.getByLabel('Saya memahami aturan pengerjaan.')).not.toBeChecked();
    await page.getByLabel('Saya memahami aturan pengerjaan.').check();
    await page.getByRole('button', { name: 'Mulai TryOut' }).click();
    await expect(page).toHaveURL(`/student/tryout/${attemptId}`);
    expect(starts).toBe(1);
    const navigator = page.getByRole('navigation', { name: 'Navigasi soal' });
    await expect(navigator.getByRole('button')).toHaveCount(30);
    await navigator.getByRole('button', { name: /^Soal 3,/ }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await capture('attempt');
    await navigator.getByRole('button', { name: /^Soal 30,/ }).click();
    await page.getByRole('button', { name: 'Kirim TryOut' }).click();
    const dialog = page.getByRole('dialog', { name: 'Kumpulkan Tryout Sekarang?' });
    await expect(dialog).toBeVisible();
    expect(submits).toBe(0);
    await capture('submit-dialog');
    await dialog.getByRole('button', { name: 'Ya, Kumpulkan Jawaban' }).click();
    await expect(page.getByRole('heading', { name: 'Menunggu hasil IRT' })).toBeVisible();
    expect(submits).toBe(1);
    await expect(page.getByText('85', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Jawaban benar:', { exact: false })).toHaveCount(0);
    await capture('waiting');
    released = true;
    await page.getByRole('button', { name: 'Periksa status hasil' }).click();
    await expect(page.getByText('85', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Lihat pembahasan', exact: true }).click();
    await expect(page).toHaveURL(`/student/tryout/${attemptId}/explanation`);
    await page.getByRole('button', { name: /^Pembahasan soal 3,/ }).click();
    await capture('result');
    await page.goto('/student/assessment');
    await expect(page.getByRole('heading', { name: 'Riwayat aktivitas' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Faktorisasi Aljabar Kuadrat/ })).toBeVisible();
    await capture('assessment-history');
  });
}

for (const width of [320, 768, 1280]) {
  test(
    'TEST ONLY PGK save-resume and separate explanation at ' + width + 'px',
    async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await fixtures(page);
      page.on('dialog', (dialog) => void dialog.accept());
      const options = [
        { id: 'A', text: 'Satu' },
        { id: 'B', text: 'Dua' },
      ];
      const questions = [
        {
          questionInstanceId: questionId,
          type: 'SINGLE_CHOICE',
          stem: 'TEST ONLY PG',
          options,
          categories: [],
          selectedOptionId: null,
          answer: null,
        },
        {
          questionInstanceId: chapterId,
          type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
          stem: 'TEST ONLY MCMA',
          options,
          categories: [],
          selectedOptionId: null,
          answer: null,
        },
        {
          questionInstanceId: subchapterId,
          type: 'CATEGORY',
          stem: 'TEST ONLY Kategori',
          options,
          categories: [
            { id: 'Y', text: 'Ya' },
            { id: 'N', text: 'Tidak' },
          ],
          selectedOptionId: null,
          answer: null,
        },
      ];
      const stored = new Map<string, unknown>();
      let submitted = false;
      await page.route('http://localhost:3301/api/v1/assessment-attempts/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.includes('/answers/')) {
          const id = path.split('/').at(-1)!;
          const body = route.request().postDataJSON();
          const answer =
            'answer' in body
              ? body.answer
              : body.optionId == null
                ? null
                : { optionId: body.optionId };
          stored.set(id, answer);
          return route.fulfill({
            json: { questionInstanceId: id, answer, selectedOptionId: answer?.optionId ?? null },
          });
        }
        if (path.endsWith('/submit')) {
          submitted = true;
          return route.fulfill({ json: {} });
        }
        if (path.endsWith('/result'))
          return route.fulfill({
            json: {
              attemptId,
              levelId,
              levelTitle: 'TEST ONLY PGK',
              score: 60,
              correctCount: 1,
              questionCount: 3,
              mastered: false,
              stars: 2,
              unlockedLevelId: null,
              isDemo: true,
              explanationState: 'available',
              recommendations: [],
              reward: null,
              xp: null,
              questions: questions.map((question, index) => ({
                ...question,
                answer: stored.get(question.questionInstanceId) ?? null,
                selectedOptionId: index === 0 ? 'A' : null,
                correctOptionId: index === 0 ? 'A' : null,
                answerKey:
                  index === 0
                    ? { optionId: 'A' }
                    : index === 1
                      ? { optionIds: ['A', 'B'] }
                      : { categoryByStatementId: { A: 'Y', B: 'N' } },
                reviewStatus: index === 0 ? 'correct' : 'partial',
                awardedPoints: index === 0 ? 1 : 0.5,
                maximumPoints: 1,
                correctEquivalent: null,
                optionReview: options.map((o) => ({
                  optionId: o.id,
                  selected: o.id === 'A',
                  isKey: true,
                })),
                statementReview: [
                  { statementId: 'A', status: 'correct' },
                  { statementId: 'B', status: 'unanswered' },
                ],
                explanation: 'TEST ONLY pembahasan $x^2$.\nBukan rubrik produksi.',
              })),
            },
          });
        return route.fulfill({
          json: {
            id: attemptId,
            levelId,
            levelTitle: 'TEST ONLY PGK',
            status: submitted ? 'completed' : 'inProgress',
            isDemo: true,
            startedAt: new Date().toISOString(),
            serverTime: new Date().toISOString(),
            questions: questions.map((q) => ({
              ...q,
              answer: stored.get(q.questionInstanceId) ?? null,
            })),
          },
        });
      });
      await page.goto('/student/drill/' + attemptId);
      await page.getByRole('radio', { name: /^A\s*\./ }).check();
      await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /^Soal 2,/ }).click();
      await page.getByRole('checkbox', { name: /^A\s*\./ }).check();
      await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: /^Soal 2,/ }).click();
      await expect(page.getByRole('checkbox', { name: /^A\s*\./ })).toBeChecked();
      await page.getByRole('button', { name: 'Kosongkan jawaban' }).click();
      await expect(page.getByRole('checkbox', { name: /^A\s*\./ })).not.toBeChecked();
      await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
      await page.getByRole('checkbox', { name: /^A\s*\./ }).check();
      await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /^Soal 3,/ }).click();
      await page
        .getByRole('group', { name: 'Satu', exact: true })
        .getByRole('radio', { name: 'Ya', exact: true })
        .check();
      await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      await page.screenshot({ path: info.outputPath('pgk-category.png'), fullPage: true });
      await page.getByRole('button', { name: 'Kirim Drill' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/belum lengkap/)).toBeVisible();
      await dialog.getByRole('button', { name: 'Ya, Kumpulkan Jawaban' }).click();
      await expect(page).toHaveURL('/student/drill/' + attemptId + '/result');
      await expect(page.getByRole('navigation', { name: 'Navigasi pembahasan' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Pembahasan Numora' })).toHaveCount(0);
      await page.getByRole('link', { name: 'Lihat pembahasan', exact: true }).click();
      await expect(page).toHaveURL('/student/drill/' + attemptId + '/explanation');
      await page.getByRole('button', { name: /^Pembahasan soal 2,/ }).click();
      await expect(page.getByText('Sebagian benar', { exact: true })).toBeVisible();
      await expect(page.getByRole('checkbox').first()).toBeDisabled();
      await page.getByRole('button', { name: /^Pembahasan soal 3,/ }).click();
      await expect(page.getByRole('heading', { name: 'Pembahasan Numora' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      await page.screenshot({ path: info.outputPath('pgk-explanation.png'), fullPage: true });
      await page.getByRole('button', { name: 'Sebelumnya' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'TEST ONLY MCMA' })).toBeVisible();
    },
  );
}

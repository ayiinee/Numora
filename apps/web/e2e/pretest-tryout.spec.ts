import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const student = '11111111-1111-4111-8111-111111111111';
const chapter = '22222222-2222-4222-8222-222222222222';
const attempt = '33333333-3333-4333-8333-333333333333';
const past = '44444444-4444-4444-8444-444444444444';
const sub = '55555555-5555-4555-8555-555555555555';

async function fixture(page: Page, mixedTryout = false, alreadySubmitted = false, longStem = false) {
  const jwt = [
    Buffer.from('{"alg":"HS256"}').toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: student,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.');
  await page.addInitScript(
    ({ jwt, student }) =>
      localStorage.setItem(
        'sb-numora-e2e-auth-token',
        JSON.stringify({
          access_token: jwt,
          refresh_token: 'TEST ONLY',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: student,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'fixture@example.test',
            app_metadata: { provider: 'google' },
            user_metadata: { name: 'TEST ONLY Student' },
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      ),
    { jwt, student },
  );
  await page.route('https://numora-e2e.supabase.co/**', (route) => route.fulfill({ json: {} }));
  const answers = new Map<string, { answer: { optionId: string } | null; revision: number }>();
  let skipped = false,
    started = false,
    completed = false;
  let tryoutSubmitted = alreadySubmitted;
  const rawTryoutAnswers = new Map<string, unknown>();
  const tryoutDeadline = new Date(Date.now() + 600_000).toISOString();
  const tryoutQuestions = () =>
    Array.from({ length: 30 }, (_, index) => ({
      questionInstanceId: `88888888-8888-4888-8888-${String(index + 1).padStart(12, '0')}`,
      type:
        index === 0
          ? 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
          : index === 1
            ? 'CATEGORY'
            : 'SINGLE_CHOICE',
      stem:
        index === 0
          ? `${longStem ? 'Sebuah kelas mengelompokkan bilangan berdasarkan aturan yang digunakan dalam simulasi ini. '.repeat(4) : ''}Pilih bilangan genap yang tidak melebihi sqrt(16).`
          : index === 1
            ? 'kategori bilangan'
            : '1 + 1?',
      options:
        index === 1
          ? [
              { id: 's1', text: 'Dua' },
              { id: 's2', text: 'Tiga' },
            ]
          : [
              { id: 'A', text: index === 0 ? '\\frac{8}{4}' : '2' },
              { id: 'B', text: '4' },
            ],
      ...(index === 1
        ? {
            categories: [
              { id: 'even', text: 'Genap' },
              { id: 'odd', text: 'Ganjil' },
            ],
          }
        : {}),
      selectedOptionId: null,
      answer: rawTryoutAnswers.get(String(index)) ?? null,
    }));
  const questions = () =>
    Array.from({ length: 20 }, (_, index) => ({
      questionInstanceId: `66666666-6666-4666-8666-${String(index + 1).padStart(12, '0')}`,
      type: 'SINGLE_CHOICE',
      stem: `soal ${index + 1}: 1 + 1?`,
      options: [
        { id: 'A', text: '2' },
        { id: 'B', text: '3' },
      ],
      selectedOptionId: null,
      answer: null,
      revision: 0,
    })).map((question) => ({ ...question, ...answers.get(question.questionInstanceId) }));
  const packageData = {
    id: past,
    title: 'Paket lampau belum dikerjakan',
    state: 'unavailable',
    periodState: 'past',
    eligible: false,
    attemptId: null,
    isDemo: true,
    resultPendingReason: 'SCORING_PENDING',
    questionCount: 30,
    durationSeconds: 600,
    releaseAt: '2026-09-27T17:00:00Z',
    closeAt: '2026-10-04T16:59:00Z',
    resultDueAt: '2026-10-07T16:59:00Z',
  };
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    const method = route.request().method();
    let json: unknown = {};
    if (path === 'identity/me')
      json = {
        id: student,
        role: 'STUDENT',
        status: 'ACTIVE',
        displayName: 'TEST ONLY Student',
        email: 'fixture@example.test',
        studentAffiliation: 'MANDIRI',
        teacherVerified: null,
      };
    else if (path === 'students/me/notifications/summary') json = { total: 0, unread: 0 };
    else if (path === 'students/me/dashboard')
      json = {
        displayName: 'TEST ONLY Student',
        affiliation: 'MANDIRI',
        class: null,
        classes: [],
        completedLevels: 0,
        availableLevels: 5,
        latestDrillScore: null,
        bestDrillScore: null,
        activities: [],
        activeDrill: null,
        features: {
          drill: true,
          tryout: true,
          pretest: true,
          pvp: false,
          classLeaderboard: false,
          pendingPolicies: [],
        },
      };
    else if (path === 'students/me/materials')
      json = {
        recentChapterId: chapter,
        chapters: [
          {
            id: chapter,
            title: 'Bab Fixture',
            order: 1,
            category: 'numbers',
            totalLevels: 5,
            completedLevels: 0,
            continueSubchapterId: sub,
            subchapters: [
              {
                id: sub,
                title: 'Subbab Fixture',
                order: 1,
                totalLevels: 5,
                completedLevels: 0,
                availableLevels: 1,
                latestScore: null,
                bestScore: null,
              },
            ],
          },
        ],
      };
    else if (path === 'students/me/learning-interactions') json = { state: 'policyPending' };
    else if (path === 'students/me/assessment-results') json = { records: [], nextCursor: null };
    else if (path === 'tryout/batches') json = { routingActive: false, items: [] };
    else if (path === 'tryout/packages/current')
      json = mixedTryout
        ? {
            ...packageData,
            state: tryoutSubmitted ? 'waitingIrt' : 'open',
            periodState: 'ongoing',
            eligible: !tryoutSubmitted,
            title: 'Tryout PGK',
            closeAt: tryoutDeadline,
            resultDueAt: null,
            attemptId: tryoutSubmitted ? attempt : null,
          }
        : { state: 'unavailable' };
    else if (path === 'tryout/packages') json = { packages: [packageData], nextCursor: null };
    else if (path === `tryout/packages/${past}`) json = packageData;
    else if (path === 'tryout/attempts' || path === `tryout/attempts/${attempt}`)
      json = {
        id: attempt,
        packageId: past,
        packageTitle: 'Tryout PGK',
        isDemo: true,
        resultPendingReason: 'SCORING_PENDING',
        closeAt: tryoutDeadline,
        resultDueAt: null,
        xp: null,
        xpPolicyVersion: null,
        status: tryoutSubmitted ? 'submitted' : 'inProgress',
        deadlineAt: tryoutDeadline,
        serverTime: new Date().toISOString(),
        questions: tryoutSubmitted ? [] : tryoutQuestions(),
      };
    else if (path.startsWith(`tryout/attempts/${attempt}/answers/`)) {
      const questionId = path.split('/').at(-1)!;
      const index = String(Number(questionId.split('-').at(-1)) - 1);
      const input = route.request().postDataJSON();
      rawTryoutAnswers.set(
        index,
        input.answer ?? (input.optionId ? { optionId: input.optionId } : null),
      );
      json = {
        questionInstanceId: questionId,
        answer: rawTryoutAnswers.get(index),
        selectedOptionId: null,
      };
    } else if (path === `tryout/attempts/${attempt}/submit`) {
      tryoutSubmitted = true;
      json = { state: 'waitingIrt', xp: null, xpPolicyVersion: null };
    } else if (path === `tryout/attempts/${attempt}/result`)
      return route.fulfill({
        status: 409,
        json: { code: 'TRYOUT_RESULT_PENDING', detail: 'Hasil belum dirilis.' },
      });
    else if (
      path === `pretest/chapters/${chapter}` ||
      path === `pretest/chapters/${chapter}/skip`
    ) {
      if (path.endsWith('/skip') && method === 'POST') skipped = true;
      json = {
        chapterId: chapter,
        chapterTitle: 'Bab Fixture',
        state: completed ? 'completed' : started ? 'inProgress' : skipped ? 'skipped' : 'available',
        canStart: !completed,
        canSkip: !completed,
        attemptId: started ? attempt : null,
        skipped,
        isDemo: true,
        resultPendingReason: 'SCORING_PENDING',
      };
    } else if (path === 'pretest/attempts' || path === `pretest/attempts/${attempt}`) {
      started = true;
      json = {
        id: attempt,
        chapterId: chapter,
        chapterTitle: 'Bab Fixture',
        isDemo: true,
        resultPendingReason: 'SCORING_PENDING',
        status: completed ? 'completed' : 'inProgress',
        startedAt: '2026-10-06T01:00:00Z',
        questions: completed ? [] : questions(),
      };
    } else if (path.startsWith(`pretest/attempts/${attempt}/answers/`)) {
      const questionId = path.split('/').at(-1)!;
      const input = route.request().postDataJSON();
      const current = answers.get(questionId)?.revision ?? 0;
      if (input.expectedRevision !== current)
        return route.fulfill({
          status: 409,
          json: {
            code: 'ANSWER_REVISION_CONFLICT',
            detail: 'Jawaban diperbarui di perangkat lain.',
          },
        });
      const saved = { answer: input.answer, revision: current + 1 };
      answers.set(questionId, saved);
      json = {
        questionInstanceId: questionId,
        ...saved,
        selectedOptionId: input.answer?.optionId ?? null,
      };
    } else if (
      path === `pretest/attempts/${attempt}/submit` ||
      path === `pretest/attempts/${attempt}/result`
    ) {
      completed = true;
      json = {
        attemptId: attempt,
        chapterId: chapter,
        chapterTitle: 'Bab Fixture',
        isDemo: true,
        resultPendingReason: 'SCORING_PENDING',
        score: 5,
        correctCount: 1,
        questionCount: 20,
        initialLevel: 1,
        mappingStatus: 'applied',
        unlockedLevels: [{ id: sub, title: 'Subbab Fixture · Level 1' }],
      };
    }
    return route.fulfill({ json });
  });
  return rawTryoutAnswers;
}

test('delegated Tryout asks multi-school students to choose one school before starting', async ({
  page,
}) => {
  await fixture(page);
  const schools = [
    { schoolId: chapter, schoolName: 'TEST School A' },
    { schoolId: sub, schoolName: 'TEST School B' },
  ];
  const batches = {
    routingActive: true,
    items: [
      {
        id: past,
        title: 'TEST ONLY delegated batch',
        startsAt: '2026-01-01T00:00:00Z',
        closesAt: '2099-01-01T00:00:00Z',
        resultDueAt: '2099-01-04T00:00:00Z',
        state: 'OPEN',
        schools,
        mandiri: false,
        attemptId: null,
        attemptStatus: null,
      },
    ],
  };
  await page.route('**/api/v1/tryout/batches', (route) => route.fulfill({ json: batches }));
  let selected: unknown;
  await page.route(`**/api/v1/tryout/batches/${past}/attempts`, (route) => {
    selected = route.request().postDataJSON();
    return route.fulfill({
      status: 409,
      json: { detail: 'TEST ONLY batch closed while starting' },
    });
  });
  await page.goto('/student/tryout');
  await expect(page.getByRole('tab', { name: 'Jadwal' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Terlewat' }).click();
  await expect(page.getByText('Belum ada Tryout terlewat')).toBeVisible();
  await page.getByRole('tab', { name: 'Jadwal' }).click();
  await expect(page.getByRole('heading', { name: 'TEST ONLY delegated batch' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Muat ulang', exact: true })).toHaveCount(0);
  await expect(page.getByText('Satu kesempatan, hasil setelah rilis')).toHaveCount(0);
  const openRules = page.getByRole('button', { name: 'Mulai Tryout', exact: true });
  await expect(
    page.getByRole('checkbox', { name: 'Saya memahami aturan pengerjaan.' }),
  ).toHaveCount(0);
  await openRules.click();
  const rules = page.getByRole('dialog', { name: 'Aturan pengerjaan Tryout' });
  await expect(rules).toBeVisible();
  const closeBox = await rules.getByRole('button', { name: 'Tutup dialog' }).boundingBox();
  const dialogBox = await rules.boundingBox();
  expect(closeBox!.x - dialogBox!.x).toBeLessThan(24);
  expect(closeBox!.y - dialogBox!.y).toBeLessThan(24);
  await expect(rules.locator('.numora-dialog__actions button')).toHaveText([
    'Mulai pengerjaan',
    'Batal',
  ]);
  await rules.getByRole('button', { name: 'Batal' }).click();
  await expect(rules).toBeHidden();
  await expect(openRules).toBeFocused();
  expect(selected).toBeUndefined();
  await openRules.click();
  const confirm = rules.getByRole('button', { name: 'Mulai pengerjaan' });
  await rules.getByRole('checkbox', { name: 'Saya memahami aturan pengerjaan.' }).check();
  await expect(confirm).toBeDisabled();
  await rules.getByRole('combobox', { name: 'Sekolah untuk Tryout ini' }).selectOption(sub);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await confirm.click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'TEST ONLY batch closed while starting' }),
  ).toContainText('TEST ONLY batch closed while starting');
  expect(selected).toEqual({ schoolId: sub });
  await expect(page.getByRole('combobox', { name: 'Sekolah untuk Tryout ini' })).toHaveValue(sub);
});

test('Tryout keeps completed batches in Riwayat and shows delayed results consistently', async ({ page }) => {
  await fixture(page, false, true);
  const batch = {
    id: past, title: 'Tryout sudah dikirim', state: 'CLOSED', mandiri: true, schools: [],
    startsAt: '2026-10-01T00:00:00Z', closesAt: '2026-10-08T00:00:00Z',
    resultDueAt: '2026-10-11T00:00:00Z', attemptId: attempt, attemptStatus: 'GRADED',
    resultState: 'waiting',
  };
  await page.route('**/api/v1/tryout/batches', (route) => route.fulfill({
    json: { routingActive: true, items: [batch, {
      ...batch, id: chapter, title: 'Tryout belum dikerjakan', attemptId: null,
      attemptStatus: null, resultState: null,
    }] },
  }));
  await page.route('**/api/v1/students/me/assessment-results?activity=tryout', (route) => route.fulfill({
    json: { records: [{
      attemptId: attempt, activity: 'tryout', title: batch.title,
      resultState: 'waitingIrt', score: null, submittedAt: batch.closesAt,
      xpState: 'ready', xp: 112.5,
    }], nextCursor: null },
  }));
  await page.route(`**/api/v1/tryout/attempts/${attempt}`, (route) => route.fulfill({
    json: { id: attempt, packageTitle: batch.title, status: 'submitted', questions: [],
      resultDueAt: batch.resultDueAt, resultWaitState: 'overdue', deadlineAt: null },
  }));
  await page.goto('/student/tryout');
  await page.getByRole('tab', { name: 'Terlewat' }).click();
  const missedCard = page.locator('.tryout-catalog-card').filter({
    has: page.getByRole('heading', { name: 'Tryout belum dikerjakan' }),
  });
  await expect(missedCard).toBeVisible();
  await expect(missedCard.locator('.tryout-status-badge')).toHaveText('Ditutup');
  await expect(missedCard.locator('.tryout-status-badge')).toHaveClass(/numora-badge--secondary/);
  await expect(missedCard.locator('.tryout-status-badge')).toHaveCSS(
    'background-color',
    'rgb(243, 231, 249)',
  );
  await expect(missedCard.locator('.tryout-card-icon')).toHaveAttribute(
    'src', '/illustrations/tryout-card/missed.webp',
  );
  await expect.poll(() => missedCard.locator('.tryout-card-icon').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: batch.title })).toHaveCount(0);
  await page.goto('/student/tryout/history');
  await expect(page.getByRole('tab', { name: 'Riwayat' })).toHaveAttribute('aria-selected', 'true');
  const card = page.locator('.tryout-catalog-card').filter({
    has: page.getByRole('heading', { name: batch.title }),
  });
  const history = page.getByRole('tabpanel', { name: 'Riwayat' });
  const retry = history.getByRole('button', { name: 'Coba lagi' });
  const recovery = history.getByText('Status hasil belum dapat diperbarui.');
  await expect(history.getByRole('button', { name: 'Periksa status hasil' })).toHaveCount(0);
  await expect(retry).toHaveCount(0);
  await expect(card.locator('.tryout-catalog-card__heading')).toContainText(
    'Jawaban terkirim · Menunggu hasil',
  );
  const statusBadge = card.locator('.tryout-status-badge');
  await expect(statusBadge).toHaveClass(/numora-badge--warning/);
  await expect(statusBadge).toHaveCSS('background-color', 'rgb(255, 248, 230)');
  await expect(statusBadge).toHaveCSS('border-top-color', 'rgb(168, 109, 0)');
  await expect(statusBadge.locator('svg')).toHaveAttribute('width', '12');
  await expect(statusBadge).toHaveCSS('border-radius', '4px');
  expect((await statusBadge.boundingBox())!.height).toBeLessThanOrEqual(22);
  await expect(card.locator('.tryout-catalog-card__heading img')).toHaveAttribute(
    'src', /tryout-record\.webp$/,
  );
  const historyIcon = card.locator('.tryout-card-icon');
  await expect(historyIcon).toHaveAttribute('src', '/illustrations/tryout-card/history.webp');
  await expect.poll(() => historyIcon.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(card.getByText('112,5 XP')).toBeVisible();
  await expect(card.locator('time')).toContainText('WIB');
  await page.reload();
  await expect(card).toBeVisible();
  await expect(history.getByRole('button', { name: /Periksa status hasil|Memeriksa status/ })).toHaveCount(0);
  await expect(card.getByRole('link', { name: /Lihat status hasil/ })).toHaveCount(1);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 740 });
  await screenshot(page, 'tryout-riwayat-1440');
  await page.setViewportSize({ width: 390, height: 740 });
  await screenshot(page, 'tryout-riwayat-390');
  await page.setViewportSize({ width: 1440, height: 740 });
  const batchesPath = '**/api/v1/tryout/batches';
  await page.route(batchesPath, (route) => route.fulfill({ status: 503, json: {} }));
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect(recovery).toBeVisible();
  await expect(card).toBeVisible();
  let releaseRefresh!: () => void;
  const refresh = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  await page.route(batchesPath, async (route) => {
    await refresh;
    await route.fulfill({ json: { routingActive: true, items: [{ ...batch, resultState: 'overdue' }] } });
  });
  await retry.focus();
  try {
    await page.keyboard.press('Enter');
    await expect(history.getByRole('button', { name: /Memuat ulang/ })).toBeDisabled();
  } finally {
    releaseRefresh();
  }
  await expect(card.locator('.tryout-catalog-card__heading')).toContainText(
    'Hasil belum tersedia dan melewati tenggat',
  );
  await expect(recovery).toHaveCount(0);
  await expect(retry).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await statusBadge.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.getByRole('link', { name: /Lihat status hasil/ }).click();
  await expect(page.getByText(/Hasil belum tersedia dan melewati tenggat/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lihat pembahasan' })).toHaveCount(0);
});

test('Tryout delivers 30 items, resumes PGK raw answers and waits for rubric', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const raw = await fixture(page, true);
  await page.goto('/student/tryout');
  await page.getByRole('button', { name: 'Detail dan aturan paket' }).click();
  await page.getByRole('checkbox', { name: 'Saya memahami aturan pengerjaan.' }).check();
  await page.getByRole('button', { name: 'Mulai pengerjaan', exact: true }).click();
  await expect(page.getByText('Soal 1 dari 30', { exact: true })).toBeVisible();
  await expect(page.locator('.practice-stem .katex-html')).toBeVisible();
  await expect(page.locator('.practice-stem math msqrt')).toHaveText('16');
  await expect(page.locator('.practice-option__text math mfrac')).toHaveCount(1);
  await page.getByRole('checkbox', { name: /^A\s*\./ }).check();
  await page.getByRole('checkbox', { name: /^B\s*\./ }).check();
  await expect.poll(() => raw.get('0')).toEqual({ optionIds: ['A', 'B'] });
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /^A\s*\./ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^B\s*\./ })).toBeChecked();
  await screenshot(page, 'tryout-pgk-multiple-390');
  await page.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await page
    .getByRole('group', { name: 'Dua', exact: true })
    .getByRole('radio', { name: 'Genap' })
    .check();
  await expect.poll(() => raw.get('1')).toEqual({ categoryByStatementId: { s1: 'even' } });
  await expect(page.getByRole('progressbar', { name: 'Jawaban tersimpan' })).toHaveAttribute('aria-valuetext', '1 dari 30 soal terisi lengkap dan tersimpan');
  await page.getByLabel('Tandai Ragu-ragu').check();
  await page.reload();
  await expect(page.getByText('Soal 2 dari 30', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Tandai Ragu-ragu')).toBeChecked();
  await expect(
    page.getByRole('group', { name: 'Dua', exact: true }).getByRole('radio', { name: 'Genap' }),
  ).toBeChecked();
  await screenshot(page, 'tryout-pgk-category-390');
  const allQuestions = page.getByRole('button', { name: 'Semua Soal', exact: true });
  await allQuestions.click();
  const map = page.getByRole('dialog', { name: 'Semua Soal' });
  await expect(map.getByRole('navigation').getByRole('button')).toHaveCount(30);
  await expect(map.getByRole('button', { name: 'Soal 2, kategori belum lengkap, ragu-ragu' })).toBeVisible();
  await map.getByRole('button', { name: 'Soal 30, kosong', exact: true }).click();
  await expect(page.getByText('Soal 30 dari 30', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Jawaban tersimpan' })).toHaveAttribute('aria-valuetext', '1 dari 30 soal terisi lengkap dan tersimpan');
  await allQuestions.click();
  await map.getByRole('button', { name: 'Kumpulkan jawaban', exact: true }).click();
  await page.getByRole('button', { name: 'Ke soal belum lengkap' }).click();
  await expect(page.locator('.practice-stem')).toBeFocused();
  await expect(page.getByText('Soal 2 dari 30', { exact: true })).toBeVisible();
  await allQuestions.click();
  await map.getByRole('button', { name: 'Kumpulkan jawaban', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, Kumpulkan Jawaban' }).click();
  await expect(
    page.getByRole('heading', { name: 'Menunggu hasil', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Nilai dan pembahasan tersedia setelah hasil dirilis/)).toBeVisible();
  await expect(page.getByText(/XP sudah tercatat/)).toHaveCount(0);
  await screenshot(page, 'tryout-pgk-waiting-390');
});

test('Tryout keeps a failed answer visible across questions and confirms exit after recovery', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await fixture(page, true, false, true);
  const attemptUrl = `/student/tryout/${attempt}`;
  await page.route('**/api/v1/tryout/attempts/*/answers/*', (route) => route.fulfill({
    status: 503, json: { detail: 'Koneksi terputus.' },
  }), { times: 1 });
  await page.goto('/student/tryout');
  await page.getByRole('button', { name: 'Detail dan aturan paket' }).click();
  await page.getByRole('checkbox', { name: 'Saya memahami aturan pengerjaan.' }).check();
  await page.getByRole('button', { name: 'Mulai pengerjaan' }).click();
  await page.getByRole('checkbox', { name: /^A\s*\./ }).check();
  const progress = page.getByRole('progressbar', { name: 'Jawaban tersimpan' });
  await expect(page.getByText('Jawaban soal 1 belum tersimpan')).toBeInViewport();
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  const allQuestions = page.getByRole('button', { name: 'Semua Soal' });
  await allQuestions.click();
  const map = page.getByRole('dialog', { name: 'Semua Soal' });
  await expect(map.getByRole('button', { name: 'Soal 1, gagal simpan' })).toBeVisible();
  const firstTarget = await map.getByRole('button', { name: 'Soal 1, gagal simpan' }).boundingBox();
  expect(firstTarget?.width).toBeGreaterThanOrEqual(44);
  expect(firstTarget?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(map.getByRole('button', { name: 'Kumpulkan jawaban' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(allQuestions).toBeFocused();
  await page.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page.getByText('Soal 2 dari 30', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coba simpan lagi' })).toBeInViewport();
  await page.getByRole('button', { name: 'Coba simpan lagi' }).click();
  await expect(progress).toHaveAttribute('aria-valuetext', '1 dari 30 soal terisi lengkap dan tersimpan');
  await page.getByRole('link', { name: 'Kembali ke Tryout' }).click();
  const exit = page.getByRole('dialog', { name: 'Keluar dari sesi?' });
  await expect(exit.getByText(/Waktu tetap berjalan/)).toBeVisible();
  await exit.getByRole('button', { name: 'Lanjut mengerjakan' }).click();
  await expect(page).toHaveURL(attemptUrl);
  await page.evaluate(() => history.back());
  await expect(exit).toBeVisible();
  await exit.getByRole('button', { name: 'Ya, keluar dulu' }).click();
  await expect(page).toHaveURL('/student/tryout');
});

async function screenshot(page: Page, name: string) {
  const folder = resolve('../../.tmp/pretest-tryout-evidence');
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: resolve(folder, name + '.png'), fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

test('Tryout Jadwal groups upcoming batches and moves a batch after refreshing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await fixture(page, true);
  const legacyCard = page.locator('.tryout-catalog-card');
  await page.goto('/student/tryout');
  await expect(legacyCard.getByText('Tryout PGK', { exact: true })).toHaveCount(1);
  await expect(legacyCard.locator('.tryout-card-icon')).toHaveAttribute(
    'src', '/illustrations/tryout-card/schedule.webp',
  );
  await expect(legacyCard.locator('dt')).toHaveText(['Dibuka', 'Ditutup']);
  await expect(legacyCard.locator('time').first()).toContainText('28 Sep 2026');
  await page.route('**/api/v1/tryout/packages/current', (route) => route.fulfill({
    json: { id: past, title: 'Paket tanpa tanggal', state: 'open', eligible: true, closeAt: 'invalid' },
  }));
  await page.reload();
  await expect(legacyCard.locator('dd')).toHaveText(['Belum tersedia', 'Belum tersedia']);

  const base = {
    closesAt: '2026-12-19T16:59:00Z',
    resultDueAt: '2026-12-22T16:59:00Z',
    mandiri: true,
    schools: [],
    attemptId: null,
    attemptStatus: null,
  };
  const active = { ...base, id: past, title: 'Sesi aktif', state: 'OPEN',
    startsAt: '2026-11-01T00:00:00Z', attemptId: attempt, attemptStatus: 'IN_PROGRESS', canResume: true };
  const soon = { ...base, id: chapter, title: 'Jadwal terdekat dengan judul paket yang panjang',
    state: 'SCHEDULED', startsAt: '2026-11-14T17:00:00Z' };
  const later = { ...base, id: sub, title: 'Jadwal berikutnya', state: 'SCHEDULED', startsAt: '2026-12-18T17:00:00Z' };
  await page.route('**/api/v1/tryout/batches', (route) => route.fulfill({
    json: { routingActive: true, items: [later, soon, active] },
  }));
  await page.goto('/student/tryout');
  const titles = page.getByRole('tabpanel', { name: 'Jadwal' }).getByRole('heading', { level: 2 });
  await expect(titles).toHaveText([active.title, 'Akan datang', soon.title, later.title]);
  const statusBadges = page.locator('.tryout-student-batch-list .tryout-status-badge');
  await expect(statusBadges).toHaveText(['Sedang dikerjakan', 'Terjadwal', 'Terjadwal']);
  await expect(statusBadges.first()).toHaveClass(/numora-badge--success/);
  await expect(statusBadges.first()).toHaveCSS('background-color', 'rgb(232, 245, 240)');
  await expect(statusBadges.nth(1)).toHaveClass(/numora-badge--secondary/);
  await expect(page.locator('.tryout-card-icon[src$="/schedule.webp"]')).toHaveCount(3);
  await expect.poll(() => page.locator('.tryout-card-icon').first().evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Mulai Tryout' })).toHaveCount(0);
  await expect(page.locator('.tryout-catalog-card time').nth(2)).toContainText('15 Nov 2026');
  await expect(page.locator('.tryout-catalog-card time').nth(2)).toContainText('00.00 WIB');
  await screenshot(page, 'p2-jadwal-320');

  soon.state = 'OPEN';
  const refreshed = page.waitForResponse('**/api/v1/tryout/batches');
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await refreshed;
  await expect(titles).toHaveText([active.title, soon.title, 'Akan datang', later.title]);
  await expect(page.getByRole('button', { name: 'Mulai Tryout' })).toBeVisible();
});

for (const width of [320, 390, 768, 1280, 1440]) {
  test(`Tryout P2 shows results and read-only review at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 480 : 740 });
    await fixture(page, false, true);
    const title = 'Tryout Desimal';
    const explanation = Array.from({ length: 30 }, (_, index) => ({
      questionInstanceId: `review-${index}`,
      stem: index === 1 ? 'Kategori bilangan' : `Soal tinjauan ${index + 1}`,
      type: index === 0 ? 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' : index === 1 ? 'CATEGORY' : 'SINGLE_CHOICE',
      options: index === 1
        ? [{ id: 's1', text: 'Dua' }, { id: 's2', text: 'Tiga' }]
        : [{ id: 'A', text: 'Pilihan $\\frac{8}{4}$' }, { id: 'B', text: 'Empat' }, { id: 'C', text: 'Lima' }],
      categories: index === 1 ? [{ id: 'even', text: 'Genap' }, { id: 'odd', text: 'Ganjil' }] : undefined,
      answer: index === 0 ? { optionIds: ['A', 'C'] } : index === 1 ? { categoryByStatementId: { s1: 'even' } } : index === 2 ? { optionId: 'C' } : index === 3 ? { optionId: 'A' } : null,
      answerKey: index === 0 ? { optionIds: ['A', 'B'] } : index === 1 ? { categoryByStatementId: { s1: 'even', s2: 'odd' } } : { optionId: 'A' },
      selectedOptionId: null,
      correctOptionId: null,
      reviewStatus: ['partial', 'partial', 'incorrect', 'correct', 'unanswered', null][index % 6],
      statementReview: index === 1 ? [{ statementId: 's1', status: 'correct' }, { statementId: 's2', status: 'unanswered' }] : undefined,
      awardedPoints: index === 0 ? 1.5 : null,
      maximumPoints: index === 0 ? 3 : null,
      explanation: 'Pembahasan sintetis.',
      richExplanation: index === 0 ? { text: 'Perhatikan [[asset:sample]] dan $\\sqrt{4}$. ' + 'Kalimat penjelasan yang panjang. '.repeat(16) + '\n\n$$' + Array(20).fill('x^2').join('+') + '$$' } : undefined,
    }));
    await page.route('**/api/v1/students/me/assessment-results?activity=tryout', (route) => route.fulfill({
      json: { records: [{ attemptId: attempt, activity: 'tryout', title, resultState: 'ready', score: 87.5, submittedAt: '2026-11-12T17:00:00Z' }], nextCursor: null },
    }));
    await page.route(`**/api/v1/tryout/attempts/${attempt}/result`, (route) => route.fulfill({
      json: { attemptId: attempt, packageTitle: title, score: 87.5, xp: 0, correctCount: 12, questionCount: 30, explanation },
    }));
    await page.route('**/api/v1/assessment-attempts/**/media**', (route) => route.fulfill({
      json: { media: [{ assetId: 'sample', altText: 'Gambar sintetis', url: '/p2-fixture-image.svg' }] },
    }));
    await page.route('**/p2-fixture-image.svg', (route) => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48"><rect width="96" height="48" fill="purple"/></svg>',
    }));
    await page.goto('/student/tryout/history');
    const historyCard = page.locator('.tryout-catalog-card').filter({
      has: page.getByRole('heading', { name: title }),
    });
    await expect(historyCard.getByText('87,5')).toBeVisible();
    await historyCard.getByRole('link', { name: /Lihat hasil/ }).click();
    await expect(page.locator('.tryout-result-score')).toHaveText('87,5');
    await expect(page.getByText('Skala 0–100')).toBeVisible();
    const entry = page.getByRole('link', { name: 'Lihat pembahasan' });
    if (width === 390) await expect(entry).toBeInViewport();
    await screenshot(page, `p2-hasil-${width}`);
    await entry.click();
    await expect(page.getByRole('heading', { name: 'Pembahasan TryOut' })).toBeVisible();
    const options = page.getByRole('list', { name: 'Pilihan jawaban' }).getByRole('listitem');
    await expect(options.nth(0)).toContainText(/Jawabanmu.*Kunci/);
    await expect(options.nth(1)).toContainText('Kunci');
    await expect(options.nth(1)).not.toContainText('Jawabanmu');
    await expect(options.nth(2)).toContainText('Jawabanmu');
    await expect(options.nth(2)).not.toContainText('Kunci');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Gambar sintetis' })).toBeVisible();
    await expect(page.locator('.drill-review__explanation math msqrt')).toHaveText('4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const open = page.getByRole('button', { name: 'Semua Soal' });
    const map = page.getByRole('navigation', { name: 'Navigasi pembahasan' });
    await expect(page.getByRole('button', { name: 'Sebelumnya' })).toBeDisabled();
    if (width < 960) {
      await open.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Semua Soal' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(open).toBeFocused();
      await open.click();
    } else {
      await expect(open).toBeHidden();
    }
    await expect(map.getByRole('button')).toHaveCount(30);
    for (const [number, state] of [[1, 'sebagian benar'], [3, 'salah'], [4, 'benar'], [5, 'kosong'], [6, 'penilaian tidak tersedia']]) {
      await expect(map.getByRole('button', { name: `Pembahasan soal ${number}, ${state}` })).toBeVisible();
    }
    const target = map.getByRole('button', { name: 'Pembahasan soal 2, sebagian benar' });
    const size = await target.boundingBox();
    expect(size!.width).toBeGreaterThanOrEqual(44);
    expect(size!.height).toBeGreaterThanOrEqual(44);
    if (width === 390) {
      const contrast = await map.getByRole('button').evaluateAll((buttons) => {
        const luminance = (color: string) => {
          const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map((value) => {
            const channel = Number(value) / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
        };
        return Math.min(...buttons.map((button) => {
          const { color, backgroundColor } = getComputedStyle(button);
          const values = [luminance(color), luminance(backgroundColor)];
          return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
        }));
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
    await target.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Kategori bilangan' })).toBeFocused();
    await expect(page.getByText('Jawabanmu:', { exact: true })).toHaveCount(2);
    await expect(page.getByText('Kunci:', { exact: true })).toHaveCount(2);
    await expect(page.locator('.category-review-list section').nth(1)).toContainText('Jawabanmu: Kosong');
    await screenshot(page, `p2-pembahasan-${width}`);
    if (width < 960) await open.click();
    await map.getByRole('button', { name: /^Pembahasan soal 30,/ }).click();
    await expect(page.getByRole('heading', { name: 'Soal tinjauan 30' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Berikutnya' })).toBeDisabled();
    if (width === 1280) {
      // A 1280px browser at 200% zoom lays out 640 CSS px.
      await page.setViewportSize({ width: 640, height: 480 });
      await expect(open).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sebelumnya' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    if (width === 390) {
      // A failed background refresh keeps the released question in view.
      const resultPath = `**/api/v1/tryout/attempts/${attempt}/result`;
      await page.route(resultPath, (route) => route.fulfill({ status: 503, json: {} }));
      await page.evaluate(() => {
        window.dispatchEvent(new Event('offline'));
        window.dispatchEvent(new Event('online'));
      });
      await expect(page.getByText('Pembahasan belum dapat diperbarui.')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Soal tinjauan 30' })).toBeVisible();
      await page.unroute(resultPath);
      await page.route(resultPath, (route) => route.fulfill({
        json: { attemptId: attempt, packageTitle: title, score: 87.5, xp: 0, correctCount: 12, questionCount: 30, explanation },
      }));
      await page.getByRole('button', { name: 'Coba lagi' }).click();
      await expect(page.getByText('Pembahasan belum dapat diperbarui.')).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Soal tinjauan 30' })).toBeVisible();
    }
    await page.getByRole('link', { name: 'Kembali ke hasil' }).click();
    await expect(page).toHaveURL(`/student/tryout/${attempt}/result`);
    await page.getByRole('link', { name: 'Lihat riwayat Tryout' }).click();
    await expect(page.getByRole('tab', { name: 'Riwayat' })).toHaveAttribute('aria-selected', 'true');
  });
}

for (const width of [390, 1280]) {
  test(`Research Tryout keeps release locked and null score readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await fixture(page, false, true);
    await page.goto(`/student/tryout/${attempt}/result`);
    await expect(page.getByRole('heading', { name: 'Menunggu hasil' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lihat pembahasan' })).toHaveCount(0);
    await page.goto(`/student/tryout/${attempt}/explanation`);
    await expect(page.getByRole('heading', { name: 'Pembahasan belum dirilis' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigasi pembahasan' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Lihat status hasil' }).click();
    await expect(page).toHaveURL(`/student/tryout/${attempt}/result`);
    // Contractual reader fixture; backend publication is verified by the disposable pipeline.
    await page.route(`http://localhost:3301/api/v1/tryout/attempts/${attempt}/result`, (route) =>
      route.fulfill({
        json: {
          attemptId: attempt,
          packageTitle: 'SYNTHETIC release',
          score: null,
          mode: 'UNSCORABLE',
          publicationVersion: 1,
          resultMethod: null,
          resultMethodReason: null,
          xp: 0,
          correctCount: 0,
          questionCount: 30,
          explanation: [],
        },
      }),
    );
    await page.reload();
    await expect(page.getByText('Nilai tidak tersedia', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Nilai tidak tersedia karena tidak ada poin maksimum valid.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lihat pembahasan' })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
  test(`Pretest Skip/start/save/reload/resume/submit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await fixture(page);
    await page.goto('/student/learn');
    await expect(page.locator('.pretest-card')).toHaveCount(0);
    await page.locator(`a[href="/student/learn/${chapter}"]`).click();
    await expect(page).toHaveURL(`/student/learn/${chapter}`);
    await page.getByRole('button', { name: 'Cek kemampuanmu' }).click();
    await page.getByRole('button', { name: 'Skip Pretest', exact: true }).click();
    await expect(page.getByText('Dilewati', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cek kemampuanmu' }).click();
    await page.getByRole('button', { name: 'Mulai Pretest', exact: true }).click();
    await page.getByRole('radio', { name: /^A\s*\./ }).check();
    await expect(
      page.getByRole('status', { name: '' }).filter({ hasText: 'Tersimpan' }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('radio', { name: /^A\s*\./ })).toBeChecked();
    await expect(page.getByText('Tanpa batas waktu', { exact: true })).toBeVisible();
    await screenshot(page, `pretest-attempt-${width}`);
    await page.getByRole('link', { name: 'Kembali ke materi' }).click();
    await expect(page).toHaveURL('/student/learn');
    await page.locator(`a[href="/student/learn/${chapter}"]`).click();
    await page.getByRole('button', { name: 'Skip untuk sekarang', exact: true }).click();
    await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
    await expect(page.getByRole('radio', { name: /^A\s*\./ })).toBeChecked();
    await page.getByRole('button', { name: 'Soal 20, kosong', exact: true }).click();
    await page.getByRole('button', { name: 'Kirim Pretest', exact: true }).click();
    await page.getByRole('button', { name: 'Ya, Kumpulkan Jawaban' }).click();
    await expect(page.getByRole('heading', { name: 'Hasil Pretest Bab Fixture' })).toBeVisible();
    await expect(
      page.getByText('tidak memberikan XP atau kontribusi leaderboard.', { exact: false }),
    ).toBeVisible();
    await screenshot(page, `pretest-result-${width}`);
    await page.getByRole('link', { name: 'Lanjut Drill', exact: true }).click();
    await expect(page).toHaveURL(`/student/learn/${chapter}`);
    await expect(
      page.getByText('Pretest bab ini sudah selesai dan tidak dapat diulang.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cek kemampuanmu' })).toHaveCount(0);
  });
  test(`Past Tryout is visible with no Start/payment at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await fixture(page);
    await page.goto('/student/tryout');
    await page.getByRole('tab', { name: 'Terlewat' }).click();
    await expect(
      page.getByRole('heading', { name: 'Paket lampau belum dikerjakan' }),
    ).toBeVisible();
    await expect(page.getByText('Terkunci · Belum dikerjakan', { exact: true })).toBeVisible();
    await screenshot(page, `tryout-past-${width}`);
    await page.getByRole('link', { name: 'Lihat detail paket' }).click();
    await expect(page.getByRole('heading', { name: 'Paket terlewat', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Mulai/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /beli|bayar|checkout/i })).toHaveCount(0);
    await screenshot(page, `tryout-past-detail-${width}`);
  });
}

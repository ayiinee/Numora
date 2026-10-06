import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const student = '11111111-1111-4111-8111-111111111111';
const chapter = '22222222-2222-4222-8222-222222222222';
const attempt = '33333333-3333-4333-8333-333333333333';
const past = '44444444-4444-4444-8444-444444444444';
const sub = '55555555-5555-4555-8555-555555555555';

async function fixture(page: Page, mixedTryout = false) {
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
  let tryoutSubmitted = false;
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
      stem: index === 0 ? 'pilih bilangan genap' : index === 1 ? 'kategori bilangan' : '1 + 1?',
      options:
        index === 1
          ? [
              { id: 's1', text: 'Dua' },
              { id: 's2', text: 'Tiga' },
            ]
          : [
              { id: 'A', text: '2' },
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

test('Tryout delivers 30 items, resumes PGK raw answers and waits for rubric', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const raw = await fixture(page, true);
  await page.goto('/student/tryout');
  await page.getByRole('button', { name: 'Detail dan aturan paket' }).click();
  await page.getByRole('checkbox', { name: 'Saya memahami aturan pengerjaan.' }).check();
  await page.getByRole('button', { name: 'Mulai TryOut', exact: true }).click();
  await expect(page.getByText('Soal 1 dari 30', { exact: true })).toBeVisible();
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
  await page.reload();
  await page.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Dua', exact: true }).getByRole('radio', { name: 'Genap' }),
  ).toBeChecked();
  await screenshot(page, 'tryout-pgk-category-390');
  await page.getByRole('button', { name: 'Soal 30, kosong', exact: true }).click();
  await page.getByRole('button', { name: 'Kirim TryOut', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, Kumpulkan Jawaban' }).click();
  await expect(
    page.getByRole('heading', { name: 'Menunggu hasil IRT', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/hasil dan pembahasan menunggu/)).toBeVisible();
  await expect(page.getByText(/XP sudah tercatat/)).toHaveCount(0);
  await screenshot(page, 'tryout-pgk-waiting-390');
});
async function screenshot(page: Page, name: string) {
  const folder = resolve('../../.tmp/pretest-tryout-evidence');
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: resolve(folder, name + '.png'), fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

for (const width of [390, 1280]) {
  test(`Pretest Skip/start/save/reload/resume/submit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await fixture(page);
    await page.goto('/student/learn');
    await page.getByRole('button', { name: 'Lihat informasi' }).click();
    await page.getByRole('button', { name: 'Skip Pretest', exact: true }).click();
    await expect(page.getByText('Dilewati', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Lihat informasi' }).click();
    await page.getByRole('button', { name: 'Mulai Pretest', exact: true }).click();
    await page.getByRole('radio', { name: /^A\s*\./ }).check();
    await expect(
      page.getByRole('status', { name: '' }).filter({ hasText: 'Tersimpan' }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('radio', { name: /^A\s*\./ })).toBeChecked();
    await expect(page.getByText('Tanpa batas waktu', { exact: true })).toBeVisible();
    await screenshot(page, `pretest-attempt-${width}`);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Skip untuk sekarang', exact: true }).click();
    await expect(page).toHaveURL(/student\/learn/);
    await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
    await expect(page.getByRole('radio', { name: /^A\s*\./ })).toBeChecked();
    await page.getByRole('button', { name: 'Soal 20, kosong', exact: true }).click();
    await page.getByRole('button', { name: 'Kirim Pretest', exact: true }).click();
    await page.getByRole('button', { name: 'Ya, Kumpulkan Jawaban' }).click();
    await expect(page.getByRole('heading', { name: 'Hasil Pretest Bab Fixture' })).toBeVisible();
    await expect(
      page.getByText('Tidak ada XP atau kontribusi leaderboard.', { exact: false }),
    ).toBeVisible();
    await screenshot(page, `pretest-result-${width}`);
    await page.getByRole('link', { name: 'Lanjut Drill', exact: true }).click();
    await expect(
      page.getByText('Pretest bab ini sudah selesai dan tidak dapat diulang.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lihat informasi' })).toHaveCount(0);
  });
  test(`Past Tryout is visible with no Start/payment at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await fixture(page);
    await page.goto('/student/tryout');
    await page.getByRole('tab', { name: 'Paket Lampau' }).click();
    await expect(
      page.getByRole('heading', { name: 'Paket lampau belum dikerjakan' }),
    ).toBeVisible();
    await expect(page.getByText('Terkunci · Belum dikerjakan', { exact: true })).toBeVisible();
    await screenshot(page, `tryout-past-${width}`);
    await page.getByRole('link', { name: 'Lihat detail paket' }).click();
    await expect(page.getByRole('heading', { name: 'Paket lampau', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Mulai/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /beli|bayar|checkout/i })).toHaveCount(0);
    await screenshot(page, `tryout-past-detail-${width}`);
  });
}

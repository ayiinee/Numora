import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type BrowserContext,
  type Browser,
} from '@playwright/test';
import type { Session } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  DrillAttemptDto,
  TryoutAttemptDto,
  CurrentTryoutDto,
  TryoutResultDto,
  DrillResultDto,
  StudentDashboardDto,
  SubchapterDetailDto,
  AssessmentHistoryDto,
  PvpAvailabilityDto,
  LeaderboardDto,
} from '../src/features/core-learning/generated-types';
import type {
  TeacherStudentProgressDto,
  CreatedClassDto,
  AdminSchoolDto,
  TokenDto,
  IdentityProfileDto,
} from '../src/lib/generated-api-types';
import type { ImportReportDto, PreviewSessionDto } from '../src/features/admin/generated-types';

// Auth is an explicitly isolated email fixture. No product API route mocks or service overrides.
type Actor = { profileId: string; session: Session };
type Fixtures = { sha: string; actors: Record<string, Actor> };
const apiBase = 'http://localhost:3401/api/v1';
const fixtureBase = 'http://localhost:3402';
const root = resolve(__dirname, '../../..');
const levelOne = '00000000-0000-4000-8000-000000000102';
const levelTwo = '00000000-0000-4000-8000-000000000103';
const subchapter = '00000000-0000-4000-8000-000000000101';
const chapter = '00000000-0000-4000-8000-000000000100';
let fixtures: Fixtures;
let school: AdminSchoolDto;
let cls: CreatedClassDto;
const checks: string[] = [];
const requiredChecks = [
  'connected-role-chain-save-refresh-reauth-submit-monitor-retry-unlock-level2-persistence',
  'drill-v06-xp-ledger-replay-single-package-latest-stars-exit-confirmation-level-history',
  'real-http-token-ttl-revoke-reissue-expiry-races-multi-class-ownership-auth',
  'direct-url-role-refresh-logout-reauth-mandiri-drill',
  'tryout-mandiri-school-snapshot-idempotency-xp-at-submit-irt-privacy-level-and-teacher-history',
  'draft-content-import-ten-items-pg-mcma-category-media-save-resume-null-review',
  'five-class-cap-ban-unban-leave-teacherless-takeover-preserved-progress',
];
const contexts: BrowserContext[] = [];

async function call(
  request: APIRequestContext,
  actor: string | null,
  path: string,
  method = 'GET',
  data?: unknown,
  status = 200,
) {
  const response = await request.fetch(`${apiBase}/${path}`, {
    method,
    headers: actor
      ? { Authorization: `Bearer ${fixtures.actors[actor]!.session.access_token}` }
      : {},
    ...(data === undefined ? {} : { data }),
  });
  // Status-only diagnostics avoid printing credentials or personal response bodies.
  expect(response.status(), `${method} ${path}`).toBe(status);
  return response;
}
async function body<T>(...args: Parameters<typeof call>): Promise<T> {
  return (await call(...args)).json();
}
async function login(browser: Browser, alias: string) {
  const session = fixtures.actors[alias]!.session;
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3400',
          localStorage: [{ name: 'sb-localhost-auth-token', value: JSON.stringify(session) }],
        },
      ],
    },
  });
  // Explicitly accept browser-native unload prompts; exit-specific assertions opt out below.
  context.on('page', (page) => page.on('dialog', (dialog) => void dialog.accept()));
  contexts.push(context);
  const page = await context.newPage();
  return page;
}
function option(page: Page, id: 'A' | 'B') {
  // The fixture's canonical option ID is stable across visual label punctuation.
  return page.getByRole('radio').and(page.locator(`input[value="${id}"]`));
}
async function answer(page: Page, count: number) {
  for (let i = 1; i <= 10; i++) {
    await page.getByRole('button', { name: new RegExp(`^Soal ${i},`) }).click();
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' && r.url().includes('/answers/') && r.status() === 200,
    );
    await option(page, i <= count ? 'B' : 'A').check();
    await saved;
    await expect(page.getByRole('status').filter({ hasText: /^Tersimpan$/ })).toBeVisible();
  }
}
async function submit(page: Page) {
  const sent = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/submit') && r.status() === 201,
  );
  await page.getByRole('button', { name: 'Kirim Drill', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Kumpulkan Latihan Sekarang?', exact: true })
    .getByRole('button', { name: 'Ya, Kumpulkan Jawaban', exact: true })
    .click();
  const result = (await (await sent).json()) as DrillResultDto;
  await expect(page).toHaveURL(new RegExp(`/student/drill/${result.attemptId}/result$`));
  return result;
}

test.describe.serial('JOB-06 connected release chain', () => {
  test.beforeAll(async ({ request }) => {
    fixtures = (await (await request.get(`${fixtureBase}/fixtures`)).json()) as Fixtures;
    expect(fixtures.sha).toBe(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    );
  });
  test.afterAll(async () => {
    await Promise.all(contexts.map((context) => context.close()));
    const unchanged =
      fixtures?.sha ===
        execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() &&
      execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() === '';
    const dir = resolve(root, '.tmp/job06-evidence');
    const complete =
      checks.length === requiredChecks.length &&
      requiredChecks.every((check) => checks.includes(check));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, 'connected.json'),
      JSON.stringify(
        {
          releaseSha: fixtures?.sha,
          collectedAt: new Date().toISOString(),
          status: unchanged && complete ? 'PASS' : 'FAIL',
          environment: 'isolated-local-postgresql-redis-chromium',
          authMode: 'email-fixture-boundary',
          productApiMocks: false,
          content: 'TEST_ONLY_DEMO',
          irtRelease: 'TEST_ONLY_SYNTHETIC_RELEASE_NO_MODEL_EXECUTION',
          checks,
          acceptance: {
            google: 'NOT_RUN',
            reviewedCurriculum: 'NOT_PROVIDED',
            staging: 'NOT_RUN',
            independentQa: 'PENDING',
          },
        },
        null,
        2,
      ) + '\n',
    );
    expect(unchanged, 'The entire run must retain one clean release SHA').toBe(true);
    expect(complete, 'Every required connected acceptance check must be recorded').toBe(true);
  });

  test('Admin → Teacher → Student → saved/resumed Drill → monitoring → retry → Level 2', async ({
    browser,
    request,
  }) => {
    const admin = await login(browser, 'admin');
    await admin.goto('/admin/schools');
    await admin
      .getByRole('textbox', { name: 'Kode sekolah', exact: true })
      .fill(`JOB06-${Date.now()}`);
    await admin
      .getByRole('textbox', { name: 'Nama sekolah', exact: true })
      .fill('JOB06 Test School');
    const created = admin.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/admin/schools'),
    );
    await admin.getByRole('button', { name: 'Simpan sekolah', exact: true }).click();
    school = (await (await created).json()) as AdminSchoolDto;
    const issued = admin.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/teacher-tokens'),
    );
    await admin.getByRole('button', { name: 'Terbitkan token', exact: true }).click();
    const token = (await (await issued).json()) as TokenDto;
    expect(Date.parse(token.expiresAt) - Date.now()).toBeGreaterThan(71 * 3600_000);
    expect(Date.parse(token.expiresAt) - Date.now()).toBeLessThanOrEqual(72 * 3600_000);

    const teacher = await login(browser, 'teacher');
    await teacher.goto('/teacher');
    await expect(teacher).toHaveURL(/verification-required/);
    await teacher.getByRole('combobox', { name: 'Sekolah', exact: true }).selectOption(school.id);
    await teacher.getByRole('textbox', { name: 'Token verifikasi', exact: true }).fill(token.token);
    await teacher.getByRole('button', { name: 'Verifikasi dan lanjutkan', exact: true }).click();
    await expect(teacher).toHaveURL(/\/teacher$/);
    await teacher.getByText('Buat kelas baru', { exact: false }).click();
    await teacher.getByLabel(/^Nama kelas/).fill('JOB06 IX Test');
    const made = teacher.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/classes'),
    );
    await teacher.getByRole('button', { name: 'Buat kelas', exact: true }).click();
    cls = (await (await made).json()) as CreatedClassDto;
    await teacher.goto(`/teacher/classes/${cls.id}`);
    await expect(teacher.getByText('Belum ada siswa', { exact: true })).toBeVisible();

    const student = await login(browser, 'student');
    const mandiri = await body<StudentDashboardDto>(request, 'student', 'students/me/dashboard');
    expect(mandiri.affiliation).toBe('MANDIRI');
    expect(mandiri.features.drill).toBe(true);
    await student.goto('/student/profile');
    await student.getByLabel(/^Kode kelas/).fill(cls.joinCode);
    await student.getByRole('button', { name: 'Gabung kelas', exact: true }).click();
    await expect(student.getByText('TERAFILIASI SEKOLAH', { exact: true })).toBeVisible();
    await expect(
      student
        .getByRole('region', { name: 'Profil dan progres' })
        .getByText(cls.name, { exact: true }),
    ).toBeVisible();
    await student.reload();
    await expect(student.getByText('TERAFILIASI SEKOLAH', { exact: true })).toBeVisible();
    await expect(
      student
        .getByRole('region', { name: 'Profil dan progres' })
        .getByText(cls.name, { exact: true }),
    ).toBeVisible();
    expect(
      (await body<StudentDashboardDto>(request, 'student', 'students/me/dashboard')).class?.id,
    ).toBe(cls.id);
    await call(
      request,
      'student',
      'assessments/drill/attempts',
      'POST',
      { levelId: levelTwo },
      403,
    );
    await student.goto(`/student/learn/${chapter}/${subchapter}`);
    const started = student.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/assessments/drill/attempts'),
    );
    await student
      .getByRole('list', { name: 'Pilih level latihan' })
      .getByRole('button', { name: 'Mulai latihan', exact: true })
      .click();
    const attempt = (await (await started).json()) as DrillAttemptDto;
    expect(attempt.questions).toHaveLength(10);
    expect(attempt.isDemo).toBe(true);
    expect(JSON.stringify(attempt)).not.toMatch(/correctOptionId|answerKey|explanation/);
    await call(
      request,
      'student',
      `assessment-attempts/${attempt.id}/result`,
      'GET',
      undefined,
      409,
    );
    // A real browser network outage must never present an unacknowledged answer as saved.
    await expect(student).toHaveURL(new RegExp(`/student/drill/${attempt.id}$`));
    await expect(option(student, 'B')).toBeVisible();
    await student.context().setOffline(true);
    await option(student, 'B').check();
    await expect(
      student.getByRole('status').filter({ hasText: /^Belum tersimpan$/ }),
    ).toBeVisible();
    await student.context().setOffline(false);
    const saved = student.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.status() === 200,
    );
    await student.getByRole('button', { name: 'Coba simpan lagi', exact: true }).click();
    await saved;
    student.removeAllListeners('dialog');
    student.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Timer tetap berjalan');
      await dialog.dismiss();
    });
    await student.getByRole('link', { name: 'Kembali ke materi', exact: true }).click();
    await expect(student).toHaveURL(new RegExp(`/student/drill/${attempt.id}$`));
    student.on('dialog', (dialog) => void dialog.accept());
    await student.reload();
    await expect(option(student, 'B')).toBeChecked();
    // A new auth/browser context also resumes the same persisted answers.
    const resumed = await login(browser, 'student');
    await resumed.goto(`/student/drill/${attempt.id}`);
    await expect(option(resumed, 'B')).toBeChecked();
    // First answer is already persisted: clear then exercise all ten real saves.
    const cleared = resumed.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.status() === 200,
    );
    await resumed.getByRole('button', { name: 'Kosongkan jawaban' }).click();
    await cleared;
    await answer(resumed, 8);
    const result = await submit(resumed);
    expect(result.score).toBe(80);
    expect(result.reward).toMatchObject({ baseXp: 80, policyVersion: 2 });
    await expect(resumed.getByText(`${result.reward!.totalXp} XP`, { exact: true })).toBeVisible();
    expect(result.unlockedLevelId).toBe(levelTwo);
    expect(
      result.questions.every((q) => q.type === 'SINGLE_CHOICE' && q.reviewStatus !== null),
    ).toBe(true);
    await expect(resumed.getByRole('navigation', { name: 'Navigasi pembahasan' })).toHaveCount(0);
    await resumed.getByRole('link', { name: 'Lihat pembahasan', exact: true }).click();
    await expect(resumed).toHaveURL(new RegExp('/student/drill/' + attempt.id + '/explanation$'));
    await expect(resumed.getByRole('navigation', { name: 'Navigasi pembahasan' })).toBeVisible();
    await expect(resumed.getByRole('heading', { name: 'Pembahasan Numora' })).toBeVisible();
    await expect(option(resumed, 'A')).toBeDisabled();
    await resumed.getByRole('link', { name: 'Kembali ke hasil', exact: true }).click();
    const duplicates = await Promise.all(
      [1, 2].map(() =>
        body<DrillResultDto>(
          request,
          'student',
          `assessment-attempts/${attempt.id}/submit`,
          'POST',
          undefined,
          201,
        ),
      ),
    );
    expect(duplicates.map((r) => r.score)).toEqual([80, 80]);
    expect(duplicates.map((r) => r.reward)).toEqual([result.reward, result.reward]);
    await call(
      request,
      'student',
      `assessment-attempts/${attempt.id}/answers/${attempt.questions[0]!.questionInstanceId}`,
      'PATCH',
      { optionId: 'A' },
      409,
    );
    await teacher.goto(`/teacher/classes/${cls.id}`);
    await teacher.getByRole('link', { name: /JOB06 student/ }).click();
    await expect(teacher.getByText('Nilai Drill terakhir', { exact: true })).toBeVisible();
    const card = teacher.locator('.level-card').filter({ hasText: 'Level 1' });
    await expect(card.locator('dd')).toHaveText(['80', '80']);

    await resumed.getByRole('button', { name: 'Ulangi level ini', exact: true }).click();
    await expect(resumed).toHaveURL(/\/student\/drill\/[\w-]+$/);
    const retryId = resumed.url().split('/').at(-1)!;
    expect(retryId).not.toBe(attempt.id);
    const retry = await body<DrillAttemptDto>(request, 'student', `assessment-attempts/${retryId}`);
    expect(retry.questions.map((q) => q.stem)).toEqual(attempt.questions.map((q) => q.stem));
    await answer(resumed, 7);
    expect((await submit(resumed)).score).toBe(70);
    await teacher.reload();
    await expect(card.locator('dd')).toHaveText(['70', '80']);
    const history = await body<AssessmentHistoryDto>(
      request,
      'student',
      'students/me/assessment-results',
    );
    expect(history.records.map((r) => r.score)).toEqual([70, 80]);
    const levels = await body<SubchapterDetailDto>(request, 'student', `subchapters/${subchapter}`);
    expect(levels.levels.find((l) => l.id === levelOne)).toMatchObject({
      latestScore: 70,
      bestScore: 80,
      latestStars: 2,
    });
    expect(levels.levels.find((l) => l.id === levelTwo)?.status).toBe('open');
    // Start and finish Level 2 through the existing Student UI on the same SHA.
    await resumed.goto(`/student/learn/${chapter}/${subchapter}`);
    await resumed
      .getByRole('list', { name: 'Pilih level latihan' })
      .getByRole('button', { name: 'Mulai latihan', exact: true })
      .click();
    await answer(resumed, 0);
    const zeroResult = await submit(resumed);
    expect(zeroResult.score).toBe(0);
    expect(zeroResult.stars).toBe(0);
    await teacher.reload();
    await expect(
      teacher.locator('.level-card').filter({ hasText: 'Level 2' }).locator('dd'),
    ).toHaveText(['0', '0']);
    const persisted = (await (await request.get(`${fixtureBase}/persistence`)).json()) as {
      attempts: {
        id: string;
        package_id: string;
        class_id_at_start: string;
        scoring_policy_version_id: string;
        score_0_100: string;
      }[];
      events: { entity_id: string; event_name: string }[];
      pins: { attempt_id: string; question_version_id: string }[];
      rewards: {
        attempt_id: string;
        xp_amount: string | number;
        base_xp: number;
        policy_version: number;
      }[];
    };
    expect(persisted.attempts).toHaveLength(3);
    expect(persisted.events).toHaveLength(3);
    expect(new Set(persisted.events.map((e) => e.entity_id)).size).toBe(3);
    expect(persisted.pins).toHaveLength(30);
    expect(
      persisted.attempts.every(
        (a) => a.class_id_at_start === cls.id && !!a.scoring_policy_version_id,
      ),
    ).toBe(true);
    expect(new Set(persisted.attempts.map((a) => a.package_id)).size).toBe(2);
    expect(persisted.rewards).toHaveLength(3);
    expect(new Set(persisted.rewards.map((r) => r.attempt_id)).size).toBe(3);
    const persistedReward = persisted.rewards.find((r) => r.attempt_id === attempt.id)!;
    expect(persistedReward).toMatchObject({ base_xp: 80, policy_version: 2 });
    expect(Number(persistedReward.xp_amount)).toBe(result.reward!.totalXp);
    await resumed.goto(`/student/assessment?levelId=${levelOne}`);
    await expect(
      resumed.getByRole('heading', { name: 'Riwayat level', exact: true }),
    ).toBeVisible();
    await expect(resumed.locator('.activity-row')).toHaveCount(2);
    await expect(resumed.getByText(`${result.reward!.totalXp} XP`, { exact: true })).toBeVisible();
    expect(
      (await body<DrillResultDto>(request, 'student', `assessment-attempts/${attempt.id}/result`))
        .score,
    ).toBe(80);
    checks.push(
      'connected-role-chain-save-refresh-reauth-submit-monitor-retry-unlock-level2-persistence',
      'drill-v06-xp-ledger-replay-single-package-latest-stars-exit-confirmation-level-history',
    );
  });

  test('token lifecycle, single-use race, concurrent multi-class joins and authorization at real HTTP boundary', async ({
    request,
  }) => {
    const tokensPath = `admin/schools/${school.id}/teacher-tokens`;
    const verifyPath = `schools/${school.id}/teacher-verifications`;
    const issue = () => body<TokenDto>(request, 'admin', tokensPath, 'POST', undefined, 201);
    const used = (
      await body<{ items: { id: string; usedAt: string | null }[] }>(request, 'admin', tokensPath)
    ).items.find((t) => t.usedAt)!;
    await call(request, 'admin', `${tokensPath}/${used.id}/revoke`, 'POST', undefined, 409);
    const revoked = await issue();
    await call(request, 'admin', `${tokensPath}/${revoked.id}/revoke`, 'POST', undefined, 201);
    await call(request, 'unverified', verifyPath, 'POST', { token: revoked.token }, 403);
    const old = await issue();
    const reissued = await body<TokenDto>(
      request,
      'admin',
      `${tokensPath}/${old.id}/reissue`,
      'POST',
      undefined,
      201,
    );
    expect(reissued.id).not.toBe(old.id);
    await call(request, 'unverified', verifyPath, 'POST', { token: old.token }, 403);
    const expired = await issue();
    expect(
      (await request.post(`${fixtureBase}/expire-token`, { data: { id: expired.id } })).status(),
    ).toBe(200);
    await call(request, 'unverified', verifyPath, 'POST', { token: expired.token }, 403);
    const race = await issue();
    const racing = await Promise.all(
      ['unverified', 'raceTeacher'].map((actor) =>
        request.post(`${apiBase}/${verifyPath}`, {
          headers: { Authorization: `Bearer ${fixtures.actors[actor]!.session.access_token}` },
          data: { token: race.token },
        }),
      ),
    );
    expect(racing.map((r) => r.status()).sort()).toEqual([201, 403]);
    await call(request, 'foreignTeacher', verifyPath, 'POST', { token: reissued.token }, 201);
    const foreign = await body<CreatedClassDto>(
      request,
      'foreignTeacher',
      'classes',
      'POST',
      { name: 'JOB06 foreign class' },
      201,
    );
    await call(request, 'student', 'classes/join', 'POST', { joinCode: cls.joinCode }, 201);
    await call(request, 'student', 'classes/join', 'POST', { joinCode: foreign.joinCode }, 201);
    expect(
      (await body<StudentDashboardDto>(request, 'student', 'students/me/dashboard')).classes,
    ).toHaveLength(2);
    await call(request, 'student', `classes/${foreign.id}/leave`, 'POST', undefined, 201);
    expect(
      (await body<StudentDashboardDto>(request, 'student', 'students/me/dashboard')).classes,
    ).toHaveLength(1);
    await call(request, 'otherStudent', 'classes/join', 'POST', { joinCode: 'BAD234' }, 404);
    const joins = await Promise.all(
      [cls.joinCode, foreign.joinCode].map((joinCode) =>
        request.post(`${apiBase}/classes/join`, {
          headers: { Authorization: `Bearer ${fixtures.actors.raceStudent!.session.access_token}` },
          data: { joinCode },
        }),
      ),
    );
    expect(joins.map((r) => r.status()).sort()).toEqual([201, 201]);
    const progressPath = `classes/${cls.id}/students/${fixtures.actors.student!.profileId}/progress`;
    await call(request, 'foreignTeacher', progressPath, 'GET', undefined, 403);
    await call(request, 'student', progressPath, 'GET', undefined, 403);
    await call(request, 'otherStudent', progressPath, 'GET', undefined, 403);
    await call(request, null, progressPath, 'GET', undefined, 401);
    await call(request, 'disabled', 'students/me/dashboard', 'GET', undefined, 403);
    await call(request, 'student', 'admin/schools', 'GET', undefined, 403);
    await call(
      request,
      'teacher',
      'assessments/drill/attempts',
      'POST',
      { levelId: levelOne },
      403,
    );
    const history = await body<AssessmentHistoryDto>(
      request,
      'student',
      'students/me/assessment-results',
    );
    await call(
      request,
      'otherStudent',
      `assessment-attempts/${history.records[0]!.attemptId}`,
      'GET',
      undefined,
      404,
    );
    expect(
      (
        await request.get(`${apiBase}/identity/me`, {
          headers: { Authorization: 'Bearer expired.fixture.token' },
        })
      ).status(),
    ).toBe(401);
    const progress = await body<TeacherStudentProgressDto>(request, 'teacher', progressPath);
    expect(progress.levels.find((l) => l.levelId === levelOne)).toMatchObject({
      latestDrillScore: 70,
      bestDrillScore: 80,
      accessStatus: 'UNLOCKED',
    });
    checks.push('real-http-token-ttl-revoke-reissue-expiry-races-multi-class-ownership-auth');
  });

  test('direct URL role guards, refresh, logout/re-auth and independent Mandiri persistence', async ({
    browser,
    request,
  }) => {
    const anonymous = await browser.newPage();
    await anonymous.goto('http://localhost:3400/teacher');
    await expect(anonymous).toHaveURL('http://localhost:3400/');
    await anonymous.close();
    const student = await login(browser, 'otherStudent');
    await student.goto('/admin/schools');
    await expect(student).toHaveURL(/\/student$/);
    await student.goto('/teacher');
    await expect(student).toHaveURL(/\/student$/);
    await student.goto(`/student/learn/${chapter}/${subchapter}`);
    const started = student.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/assessments/drill/attempts'),
    );
    await student
      .getByRole('list', { name: 'Pilih level latihan' })
      .getByRole('button', { name: 'Mulai latihan', exact: true })
      .click();
    const attempt = (await (await started).json()) as DrillAttemptDto;
    await expect(student).toHaveURL(new RegExp(`/student/drill/${attempt.id}$`));
    await student.reload();
    await expect(option(student, 'B')).toBeVisible();
    const resumed = await body<DrillAttemptDto>(
      request,
      'otherStudent',
      `assessment-attempts/${attempt.id}`,
    );
    expect(resumed.id).toBe(attempt.id);
    expect(
      (await body<IdentityProfileDto>(request, 'otherStudent', 'identity/me')).studentAffiliation,
    ).toBe('MANDIRI');
    const teacher = await login(browser, 'teacher');
    await teacher.goto('/teacher/profile');
    await teacher.getByRole('button', { name: 'Keluar dari akun', exact: true }).click();
    await expect(teacher).toHaveURL('http://localhost:3400/');
    await teacher.goto('/teacher');
    await expect(teacher).toHaveURL('http://localhost:3400/');
    const signedInAgain = await login(browser, 'teacher');
    await signedInAgain.goto('/teacher');
    await expect(signedInAgain.getByRole('link', { name: /JOB06 IX Test/ })).toBeVisible();
    await signedInAgain.reload();
    await expect(signedInAgain.getByRole('link', { name: /JOB06 IX Test/ })).toBeVisible();
    await signedInAgain.goto('/admin/schools');
    await expect(signedInAgain).toHaveURL(/\/teacher$/);
    await signedInAgain.goto('/student/learn');
    await expect(signedInAgain).toHaveURL(/\/teacher$/);
    const admin = await login(browser, 'admin');
    await admin.goto('/teacher');
    await expect(admin).toHaveURL(/\/admin$/);
    await admin.goto('/student/learn');
    await expect(admin).toHaveURL(/\/admin$/);
    const foreign = await login(browser, 'foreignTeacher');
    await foreign.goto(`/teacher/classes/${cls.id}`);
    await expect(
      foreign.getByRole('heading', { name: 'Akses ditolak', exact: true }),
    ).toBeVisible();
    await expect(foreign.getByRole('button', { name: 'Coba lagi', exact: true })).toBeVisible();
    for (const alias of ['unverified', 'raceTeacher']) {
      const profile = await body<IdentityProfileDto>(request, alias, 'identity/me');
      if (!profile.teacherVerified) {
        const teacher = await login(browser, alias);
        await teacher.goto(`/teacher/classes/${cls.id}`);
        await expect(teacher).toHaveURL(/verification-required/);
        await teacher.reload();
        await expect(teacher).toHaveURL(/verification-required/);
        await call(request, alias, 'classes', 'GET', undefined, 403);
      }
    }
    for (const alias of ['student', 'otherStudent']) {
      expect(await body<PvpAvailabilityDto>(request, alias, 'pvp/availability')).toMatchObject({
        available: false,
        reasonCode: 'PVP_POLICY_OPEN',
      });
      expect(
        await body<LeaderboardDto>(request, alias, 'leaderboards/pvp?difficulty=easy'),
      ).toMatchObject({ policyPending: true, reasonCode: 'PVP_RUNTIME_ACTIVATION' });
      expect(await body<LeaderboardDto>(request, alias, 'leaderboards/activity')).toMatchObject({
        policyPending: false,
        available: false,
        reasonCode: 'PROJECTION_PENDING',
        updatedAt: null,
        entries: [],
        unit: 'xp',
        className: null,
      });
    }
    expect(await body<LeaderboardDto>(request, 'student', 'leaderboards/class')).toMatchObject({
      policyPending: false,
      available: false,
      reasonCode: 'PROJECTION_PENDING',
      updatedAt: null,
      entries: [],
      unit: 'xp',
      className: cls.name,
    });
    await call(request, 'otherStudent', 'leaderboards/class', 'GET', undefined, 403);
    // A signed SDK session rejected by the auth boundary must be cleared by the existing auth flow.
    const invalid = await login(browser, 'teacher');
    await invalid.goto('/teacher');
    await invalid.evaluate(() => {
      const session = JSON.parse(localStorage.getItem('sb-localhost-auth-token')!);
      session.access_token = session.access_token.replace(/\.[^.]+$/, '.invalid-fixture-signature');
      localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session));
    });
    await invalid.reload();
    await expect(invalid).toHaveURL('http://localhost:3400/');
    expect(
      await invalid.evaluate(() => localStorage.getItem('sb-localhost-auth-token')),
    ).toBeNull();
    checks.push('direct-url-role-refresh-logout-reauth-mandiri-drill');
  });
  test('reconciled TryOut access and history retain class privacy through real browser/API/persistence', async ({
    browser,
    request,
  }) => {
    const mandiri = await login(browser, 'otherStudent');
    await mandiri.goto('/student/tryout');
    await expect(
      mandiri.getByRole('heading', { name: 'Paket belum tersedia', exact: true }),
    ).toBeVisible();
    await expect(mandiri.getByRole('link', { name: 'Latihan dulu' })).toBeVisible();
    const { packageId } = await (await request.get(`${fixtureBase}/tryout-fixture`)).json();
    expect((await request.post(`${fixtureBase}/tryout-fixture/publish`)).status()).toBe(200);
    for (const alias of ['student', 'otherStudent']) {
      expect(await body<CurrentTryoutDto>(request, alias, 'tryout/packages/current')).toMatchObject(
        { id: packageId, state: 'open', eligible: true },
      );
      expect(
        (await body<StudentDashboardDto>(request, alias, 'students/me/dashboard')).features.tryout,
      ).toBe(true);
    }
    await call(request, null, 'tryout/packages/current', 'GET', undefined, 401);
    for (const alias of ['teacher', 'admin'])
      await call(request, alias, 'tryout/attempts', 'POST', { packageId }, 403);
    await mandiri.reload();
    await mandiri.getByRole('button', { name: 'Detail dan aturan paket' }).click();
    await mandiri.getByLabel('Saya memahami aturan pengerjaan.').check();
    const started = mandiri.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/tryout/attempts'),
    );
    await mandiri.getByRole('button', { name: 'Mulai TryOut', exact: true }).click();
    const startResponse = await started;
    expect(startResponse.status()).toBe(201);
    const independent = (await startResponse.json()) as TryoutAttemptDto;
    await expect(mandiri).toHaveURL(new RegExp(`/student/tryout/${independent.id}$`));
    expect(independent.serverTime).toBeTruthy();
    expect(independent.deadlineAt).toBeTruthy();
    expect(JSON.stringify(independent)).not.toMatch(/correctOptionId|answerKey|explanation/);
    const repeats = await Promise.all(
      Array.from({ length: 6 }, () =>
        body<TryoutAttemptDto>(
          request,
          'otherStudent',
          'tryout/attempts',
          'POST',
          { packageId },
          201,
        ),
      ),
    );
    expect(new Set(repeats.map((a) => a.id))).toEqual(new Set([independent.id]));
    const schoolStarts = await Promise.all(
      Array.from({ length: 6 }, () =>
        body<TryoutAttemptDto>(request, 'student', 'tryout/attempts', 'POST', { packageId }, 201),
      ),
    );
    const affiliated = schoolStarts[0]!;
    expect(new Set(schoolStarts.map((a) => a.id))).toEqual(new Set([affiliated.id]));
    await call(request, 'student', `tryout/attempts/${independent.id}`, 'GET', undefined, 404);
    await call(request, 'otherStudent', `tryout/attempts/${affiliated.id}`, 'GET', undefined, 404);
    const saved = mandiri.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' && r.url().includes('/answers/') && r.status() === 200,
    );
    await option(mandiri, 'B').check();
    await saved;
    await mandiri.reload();
    await expect(option(mandiri, 'B')).toBeChecked();
    await call(request, 'otherStudent', 'classes/join', 'POST', { joinCode: cls.joinCode }, 201);
    expect(
      (
        await body<TryoutAttemptDto>(
          request,
          'otherStudent',
          'tryout/attempts',
          'POST',
          { packageId },
          201,
        )
      ).id,
    ).toBe(independent.id);
    const submissions = await Promise.all(
      Array.from({ length: 3 }, () =>
        body<{ state: string; xp: number }>(
          request,
          'student',
          `tryout/attempts/${affiliated.id}/submit`,
          'POST',
          undefined,
          201,
        ),
      ),
    );
    expect(submissions).toEqual(Array(3).fill({ state: 'waitingIrt', xp: 0, xpPolicyVersion: 1 }));
    await mandiri.getByRole('button', { name: /^Soal 30,/ }).click();
    await mandiri.getByRole('button', { name: 'Kirim TryOut', exact: true }).click();
    await mandiri
      .getByRole('dialog', { name: 'Kumpulkan Tryout Sekarang?', exact: true })
      .getByRole('button', { name: 'Ya, Kumpulkan Jawaban', exact: true })
      .click();
    await expect(mandiri).toHaveURL(new RegExp(`/student/tryout/${independent.id}/result$`));
    await expect(
      mandiri.getByRole('heading', { name: 'Menunggu hasil IRT', exact: true }),
    ).toBeVisible();
    await expect(mandiri.getByText('10 XP', { exact: true })).toBeVisible();
    for (const [alias, attempt] of [
      ['student', affiliated],
      ['otherStudent', independent],
    ] as const) {
      const pending = await call(
        request,
        alias,
        `tryout/attempts/${attempt.id}/result`,
        'GET',
        undefined,
        409,
      );
      expect(JSON.stringify(await pending.json())).not.toMatch(
        /correctOptionId|answerKey|explanation|"score"/,
      );
      const records = (
        await body<AssessmentHistoryDto>(request, alias, 'students/me/assessment-results')
      ).records;
      expect(records.find((r) => r.attemptId === attempt.id)).toMatchObject({
        score: null,
        resultState: 'waitingIrt',
        xpState: 'ready',
        tryoutXpPolicyVersion: 1,
      });
      const persisted = await body<TryoutAttemptDto>(
        request,
        alias,
        `tryout/attempts/${attempt.id}`,
      );
      expect(persisted.xp).toBeGreaterThanOrEqual(0);
      expect(persisted.questions).toEqual([]);
      expect(persisted).not.toHaveProperty('score');
      expect(await body<CurrentTryoutDto>(request, alias, 'tryout/packages/current')).toMatchObject(
        { eligible: false, state: 'waitingIrt' },
      );
    }
    await mandiri.goto('/student/assessment');
    await expect(mandiri.getByRole('link', { name: /Tryout Mingguan/ })).toHaveCount(0);
    const teacherPath = `classes/${cls.id}/students/${fixtures.actors.student!.profileId}/assessment-results`;
    const teacherHistory = await body<AssessmentHistoryDto>(request, 'teacher', teacherPath);
    expect(teacherHistory.records.find((r) => r.attemptId === affiliated.id)).toMatchObject({
      score: null,
      resultState: 'waitingIrt',
    });
    await call(request, 'foreignTeacher', teacherPath, 'GET', undefined, 404);
    expect(
      (
        await body<AssessmentHistoryDto>(
          request,
          'teacher',
          `classes/${cls.id}/students/${fixtures.actors.otherStudent!.profileId}/assessment-results`,
        )
      ).records,
    ).toEqual([]);
    await call(
      request,
      'teacher',
      `${teacherPath}?cursor=${independent.id}`,
      'GET',
      undefined,
      404,
    );
    const levelHistory = await body<AssessmentHistoryDto>(
      request,
      'student',
      `students/me/assessment-results?levelId=${levelOne}`,
    );
    expect(levelHistory.records.map((r) => r.score).sort()).toEqual([70, 80]);
    expect(levelHistory.records.every((r) => r.levelId === levelOne)).toBe(true);
    await call(
      request,
      'student',
      `students/me/assessment-results?levelId=${levelOne}&cursor=${affiliated.id}`,
      'GET',
      undefined,
      404,
    );
    expect((await request.post(`${fixtureBase}/tryout-fixture/release`)).status()).toBe(200);
    await mandiri.reload();
    await mandiri.getByRole('link', { name: /Tryout Mingguan/ }).click();
    await expect(mandiri).toHaveURL(new RegExp(`/student/tryout/${independent.id}/result$`));
    const result = await body<TryoutResultDto>(
      request,
      'otherStudent',
      `tryout/attempts/${independent.id}/result`,
    );
    expect(result.score).toBe(3);
    expect(result.explanation).toHaveLength(30);
    expect(result.resultMethod).toBeNull();
    await mandiri.getByRole('link', { name: 'Lihat pembahasan', exact: true }).click();
    await expect(mandiri).toHaveURL(
      new RegExp('/student/tryout/' + independent.id + '/explanation$'),
    );
    await expect(mandiri.getByRole('heading', { name: 'Pembahasan Numora' })).toBeVisible();
    await expect(option(mandiri, 'A')).toBeDisabled();
    await mandiri.getByRole('link', { name: 'Kembali ke hasil', exact: true }).click();
    const persistence = await (
      await request.get(`${fixtureBase}/tryout-fixture/persistence`)
    ).json();
    expect(persistence.attempts).toHaveLength(2);
    expect(
      persistence.events.filter((e: { event_name: string }) => e.event_name === 'tryout_started'),
    ).toHaveLength(2);
    expect(
      persistence.events.filter((e: { event_name: string }) => e.event_name === 'tryout_completed'),
    ).toHaveLength(2);
    expect(persistence.pins).toHaveLength(60);
    expect(persistence.rewards).toHaveLength(2);
    const independentReward = persistence.rewards.find(
      (r: { attempt_id: string }) => r.attempt_id === independent.id,
    );
    const affiliatedReward = persistence.rewards.find(
      (r: { attempt_id: string }) => r.attempt_id === affiliated.id,
    );
    expect(independentReward).toMatchObject({ policy_code: 'TRYOUT_PRD_V06', policy_version: 1 });
    expect(affiliatedReward).toMatchObject({ policy_code: 'TRYOUT_PRD_V06', policy_version: 1 });
    expect(Number(independentReward.xp_amount)).toBe(10);
    expect(Number(affiliatedReward.xp_amount)).toBe(0);
    expect(
      persistence.attempts.find((a: { id: string }) => a.id === independent.id).class_id_at_start,
    ).toBeNull();
    expect(
      persistence.attempts.find((a: { id: string }) => a.id === affiliated.id).class_id_at_start,
    ).toBe(cls.id);
    expect(
      (await body<AssessmentHistoryDto>(request, 'teacher', teacherPath)).records.find(
        (r) => r.attemptId === affiliated.id,
      ),
    ).toMatchObject({ score: 0, resultState: 'ready' });
    checks.push(
      'tryout-mandiri-school-snapshot-idempotency-xp-at-submit-irt-privacy-level-and-teacher-history',
    );
  });

  test('DRAFT JSON importer -> ten three-format previews -> server save/resume -> unscored review', async ({
    browser,
    request,
  }) => {
    const admin = await login(browser, 'admin');
    const token = fixtures.actors.admin!.session.access_token;
    async function content<T>(path: string, data: object, key?: string, status = 201): Promise<T> {
      const response = await request.post(`${apiBase}/admin/content/${path}`, {
        headers: { Authorization: `Bearer ${token}`, ...(key ? { 'Idempotency-Key': key } : {}) },
        data,
      });
      expect(response.status(), path).toBe(status);
      return response.json();
    }
    const source = resolve(root, 'docs/data/samples/2026-10-03');
    const masters = JSON.parse(readFileSync(resolve(source, 'master-data.proposed.json'), 'utf8'));
    const samples = JSON.parse(readFileSync(resolve(source, 'questions.draft.json'), 'utf8'));
    const curriculum = await (await call(request, 'admin', 'admin/content/curriculum')).json();
    const chapters = new Map<string, string>();
    const subs = new Map<string, string>();
    let chapterOrder = Math.max(
      0,
      ...curriculum.items
        .filter((i: { kind: string }) => i.kind === 'CHAPTER')
        .map((i: { displayOrder: number }) => i.displayOrder),
    );
    for (const ch of masters.chapters)
      chapters.set(
        ch.code,
        (
          await content<{ id: string }>('chapters', {
            code: ch.code,
            name: ch.name,
            displayOrder: ++chapterOrder,
          })
        ).id,
      );
    for (const [i, sub] of masters.subchapters.entries()) {
      const id = (
        await content<{ id: string }>('subchapters', {
          chapterId: chapters.get(sub.chapterCode),
          code: sub.code,
          name: sub.name,
          displayOrder: i + 1,
        })
      ).id;
      subs.set(sub.code, id);
      await content('levels', {
        subchapterId: id,
        levelNumber: 1,
        description: 'TEST ONLY DRAFT sample level',
      });
    }
    for (const c of masters.competencies)
      await content('competencies', {
        subchapterId: subs.get(c.subchapterCode),
        code: c.code,
        description: c.description,
      });
    for (const q of samples)
      for (const asset of q.metadata.assetManifest) {
        const reservation = await content<{
          uploadId: string;
          uploadUrl: string;
          headers: Record<string, string>;
        }>(
          'media/uploads',
          {
            externalId: q.externalId,
            assetId: asset.assetId,
            contentVersion: 1,
            contentType: asset.contentType,
            byteLength: asset.byteLength,
            sha256: asset.sha256,
          },
          crypto.randomUUID(),
        );
        const put = await request.put(reservation.uploadUrl, {
          headers: reservation.headers,
          data: readFileSync(resolve(source, asset.fileReference)),
        });
        expect(put.status()).toBe(200);
        const receipt = await content<{ objectKey: string }>(
          `media/uploads/${reservation.uploadId}/complete`,
          {},
          undefined,
          200,
        );
        asset.objectKey = receipt.objectKey;
      }
    const targetPackage = await content<{ id: string }>('packages', {
      familyCode: `TEST-PREVIEW-${crypto.randomUUID()}`,
      packageVersion: 1,
      name: 'TEST ONLY mixed-format DRAFT preview',
      assessmentType: 'TRYOUT',
      isDemo: true,
      source: {
        sourceNamespace: 'CURRICULUM_SHEETS_SAMPLE',
        sourceName: 'TEST ONLY Curriculum sample',
        sourceReference: 'docs/data/samples/2026-10-03',
      },
    });
    await admin.goto('/admin/content/imports');
    await admin.getByLabel('Tujuan unggah').selectOption('TRYOUT');
    await admin.getByLabel('Paket tujuan').selectOption(targetPackage.id);
    await expect(
      admin.getByRole('heading', { name: /TEST ONLY mixed-format DRAFT preview/ }),
    ).toBeVisible();
    await admin.getByLabel('File soal JSON').setInputFiles({
      name: 'questions.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(samples)),
    });
    await admin.getByRole('button', { name: 'Konversi ke paket terpilih', exact: true }).click();
    await admin.getByRole('button', { name: 'Validasi JSON', exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Laporan validasi' })).toBeVisible();
    const imported = admin.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/admin/content/imports'),
    );
    await admin.getByRole('button', { name: 'Impor sebagai DRAFT', exact: true }).click();
    const report = (await (await imported).json()) as ImportReportDto;
    expect(report.items).toHaveLength(10);
    expect(report.items.every((i) => i.canPreview)).toBe(true);
    await admin.getByRole('button', { name: 'Preview soal siap (10)', exact: true }).click();
    await admin.getByRole('link', { name: 'Buka sesi preview', exact: true }).click();
    await expect(admin).toHaveURL(/\/admin\/content\/preview-sessions\/[0-9a-f-]{36}$/);
    await expect(admin.getByText(/DRAFT.*preview internal/, { exact: true })).toBeVisible();
    const sessionId = new URL(admin.url()).pathname.split('/').at(-1)!;
    for (let i = 0; i < 10; i++) {
      await expect(admin.getByText(new RegExp(`Soal ${i + 1}/10`))).toBeVisible();
      const controls = admin.getByRole('checkbox').or(admin.getByRole('radio'));
      await controls.first().check();
      await admin.getByRole('button', { name: 'Simpan jawaban', exact: true }).click();
      await expect(admin.getByText(/Tersimpan di server.*revisi 1/)).toBeVisible();
      await admin.reload();
      await expect(controls.first()).toBeChecked();
      if (await admin.locator('.content-preview-image').count())
        await expect
          .poll(() =>
            admin
              .locator('.content-preview-image')
              .first()
              .evaluate((img: HTMLImageElement) => img.naturalWidth),
          )
          .toBeGreaterThan(0);
      if (i < 9) await admin.getByRole('button', { name: 'Berikutnya', exact: true }).click();
    }
    await admin.getByRole('button', { name: 'Submit & review', exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Review tanpa scoring' })).toBeVisible();
    const result = await body<PreviewSessionDto>(
      request,
      'admin',
      `admin/content/preview-sessions/${sessionId}/result`,
    );
    expect(result.items).toHaveLength(10);
    expect(result.items.every((i) => i.score === null && i.answerKey && i.explanation)).toBe(true);
    expect(result.score).toBe(null);
    expect(result.media).toHaveLength(6);
    let renderedImages = 0;
    for (let position = 9; position >= 0; position--) {
      await expect(admin.getByText(new RegExp(`Soal ${position + 1}/10`))).toBeVisible();
      const images = admin.locator('.content-preview-image');
      for (let index = 0; index < (await images.count()); index++) {
        await expect
          .poll(() => images.nth(index).evaluate((img: HTMLImageElement) => img.naturalWidth))
          .toBeGreaterThan(0);
        renderedImages++;
      }
      if (position > 0)
        await admin.getByRole('button', { name: 'Sebelumnya', exact: true }).click();
    }
    expect(renderedImages).toBe(6);
    await admin.setViewportSize({ width: 390, height: 844 });
    await expect(admin.getByRole('heading', { name: 'Review tanpa scoring' })).toBeVisible();
    expect(
      await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await call(
      request,
      'student',
      `admin/content/preview-sessions/${sessionId}`,
      'GET',
      undefined,
      403,
    );
    checks.push('draft-content-import-ten-items-pg-mcma-category-media-save-resume-null-review');
  });

  test('five-class limit, teacher ban/unban and teacherless takeover preserve account progress', async ({
    request,
  }) => {
    const extras: CreatedClassDto[] = [];
    for (let i = 0; i < 4; i++) {
      extras.push(
        await body<CreatedClassDto>(
          request,
          'teacher',
          'classes',
          'POST',
          { name: `JOB06 membership ${i}`, schoolId: school.id },
          201,
        ),
      );
    }
    for (const extra of extras.slice(0, 3))
      await call(request, 'raceStudent', 'classes/join', 'POST', { joinCode: extra.joinCode }, 201);
    expect(
      (await body<StudentDashboardDto>(request, 'raceStudent', 'students/me/dashboard')).classes,
    ).toHaveLength(5);
    await call(
      request,
      'raceStudent',
      'classes/join',
      'POST',
      { joinCode: extras[3]!.joinCode },
      409,
    );

    const banPath = `classes/${cls.id}/students/${fixtures.actors.raceStudent!.profileId}`;
    await call(request, 'admin', `${banPath}/ban`, 'POST', undefined, 403);
    await call(request, 'foreignTeacher', `${banPath}/ban`, 'POST', undefined, 403);
    await call(request, 'teacher', `${banPath}/ban`, 'POST', undefined, 201);
    expect(
      (await body<StudentDashboardDto>(request, 'raceStudent', 'students/me/dashboard')).classes,
    ).toHaveLength(4);
    await call(request, 'raceStudent', 'classes/join', 'POST', { joinCode: cls.joinCode }, 403);
    await call(request, 'teacher', `${banPath}/unban`, 'POST', undefined, 201);
    expect(
      (await body<StudentDashboardDto>(request, 'raceStudent', 'students/me/dashboard')).classes,
    ).toHaveLength(4);
    await call(request, 'raceStudent', 'classes/join', 'POST', { joinCode: cls.joinCode }, 201);
    await call(request, 'raceStudent', `classes/${extras[0]!.id}/leave`, 'POST', undefined, 201);

    const foreign = (await body<{ items: CreatedClassDto[] }>(request, 'foreignTeacher', 'classes'))
      .items[0]!;
    await call(request, 'teacher', 'classes/takeover', 'POST', { joinCode: foreign.joinCode }, 409);
    await call(request, 'foreignTeacher', `schools/${school.id}/leave`, 'POST', undefined, 201);
    await call(request, 'teacher', 'classes/takeover', 'POST', { joinCode: foreign.joinCode }, 201);
    await call(request, 'foreignTeacher', `classes/${foreign.id}/students`, 'GET', undefined, 403);
    const progress = await body<SubchapterDetailDto>(
      request,
      'student',
      `subchapters/${subchapter}`,
    );
    expect(progress.levels.find((level) => level.id === levelOne)).toMatchObject({
      latestScore: 70,
      bestScore: 80,
      latestStars: 2,
    });
    checks.push('five-class-cap-ban-unban-leave-teacherless-takeover-preserved-progress');
  });
});

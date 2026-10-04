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
import { mkdirSync, writeFileSync } from 'node:fs';
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
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, 'connected.json'),
      JSON.stringify(
        {
          releaseSha: fixtures?.sha,
          collectedAt: new Date().toISOString(),
          status: unchanged && checks.length === 4 ? 'PASS' : 'FAIL',
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
    expect(result.unlockedLevelId).toBe(levelTwo);
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
    expect(retry.questions.map((q) => q.stem)).not.toEqual(attempt.questions.map((q) => q.stem));
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
    });
    expect(levels.levels.find((l) => l.id === levelTwo)?.status).toBe('open');
    // Start and finish Level 2 through the existing Student UI on the same SHA.
    await resumed.goto(`/student/learn/${chapter}/${subchapter}`);
    await resumed
      .getByRole('list', { name: 'Pilih level latihan' })
      .getByRole('button', { name: 'Mulai latihan', exact: true })
      .click();
    await answer(resumed, 0);
    expect((await submit(resumed)).score).toBe(0);
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
    expect(new Set(persisted.attempts.map((a) => a.package_id)).size).toBe(3);
    expect(
      (await body<DrillResultDto>(request, 'student', `assessment-attempts/${attempt.id}/result`))
        .score,
    ).toBe(80);
    checks.push(
      'connected-role-chain-save-refresh-reauth-submit-monitor-retry-unlock-level2-persistence',
    );
  });

  test('token lifecycle, single-use race, join race, one-class and authorization at real HTTP boundary', async ({
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
    await call(request, 'student', 'classes/join', 'POST', { joinCode: foreign.joinCode }, 409);
    await call(request, 'otherStudent', 'classes/join', 'POST', { joinCode: 'BAD234' }, 404);
    const joins = await Promise.all(
      [cls.joinCode, foreign.joinCode].map((joinCode) =>
        request.post(`${apiBase}/classes/join`, {
          headers: { Authorization: `Bearer ${fixtures.actors.raceStudent!.session.access_token}` },
          data: { joinCode },
        }),
      ),
    );
    expect(joins.map((r) => r.status()).sort()).toEqual([201, 409]);
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
    checks.push('real-http-token-ttl-revoke-reissue-expiry-races-one-class-ownership-auth');
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
    await teacher.getByRole('button', { name: /Keluar/ }).click();
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
    await expect(admin).toHaveURL(/\/admin\/schools$/);
    await admin.goto('/student/learn');
    await expect(admin).toHaveURL(/\/admin\/schools$/);
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
      ).toMatchObject({ policyPending: true, reasonCode: 'OPEN-07' });
    }
    expect(await body<LeaderboardDto>(request, 'student', 'leaderboards/class')).toMatchObject({
      policyPending: true,
      reasonCode: 'OPEN-11',
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
        body<{ state: string }>(
          request,
          'student',
          `tryout/attempts/${affiliated.id}/submit`,
          'POST',
          undefined,
          201,
        ),
      ),
    );
    expect(submissions).toEqual(Array(3).fill({ state: 'waitingIrt' }));
    await mandiri.getByRole('button', { name: /^Soal 2,/ }).click();
    await mandiri.getByRole('button', { name: 'Kirim TryOut', exact: true }).click();
    await mandiri
      .getByRole('dialog', { name: 'Kumpulkan Tryout Sekarang?', exact: true })
      .getByRole('button', { name: 'Ya, Kumpulkan Jawaban', exact: true })
      .click();
    await expect(mandiri).toHaveURL(new RegExp(`/student/tryout/${independent.id}/result$`));
    await expect(
      mandiri.getByRole('heading', { name: 'Menunggu hasil IRT', exact: true }),
    ).toBeVisible();
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
      });
      expect(await body<CurrentTryoutDto>(request, alias, 'tryout/packages/current')).toMatchObject(
        { eligible: false, state: 'waitingIrt' },
      );
    }
    await mandiri.goto('/student/assessment');
    await expect(mandiri.getByRole('link', { name: /JOB06 TEST ONLY DEMO TryOut/ })).toHaveCount(0);
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
    await mandiri.getByRole('link', { name: /JOB06 TEST ONLY DEMO TryOut/ }).click();
    await expect(mandiri).toHaveURL(new RegExp(`/student/tryout/${independent.id}/result$`));
    const result = await body<TryoutResultDto>(
      request,
      'otherStudent',
      `tryout/attempts/${independent.id}/result`,
    );
    expect(result.score).toBe(50);
    expect(result.explanation).toHaveLength(2);
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
    expect(persistence.pins).toHaveLength(4);
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
    checks.push('tryout-mandiri-school-snapshot-idempotency-irt-privacy-level-and-teacher-history');
  });
});

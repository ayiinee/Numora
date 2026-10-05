import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import postgres from '../../../packages/database/node_modules/postgres';

const root = resolve(__dirname, '../../..');
const evidence = join(root, '.qa-seed/teacher-demo/browser-evidence');
const classId = '04000000-0000-4000-8000-000000000010';
const studentId = (index: number) =>
  `04000000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`;
let context: BrowserContext;
let auth: SupabaseClient;
let sql: ReturnType<typeof postgres> | undefined;
let before: unknown;
let page: Page;
const errors: string[] = [];
const results: { name: string; status: string | undefined; browser: string }[] = [];

async function snapshot() {
  if (!sql) throw new Error('Development database verification is not initialized.');
  const rows = [];
  // Includes demo rows, unlike the seed's existing-data fingerprint.
  for (const table of [
    'users',
    'classes',
    'class_memberships',
    'assessment_attempts',
    'attempt_items',
    'attempt_answers',
    'level_progress',
    'feedback',
    'xp_ledger',
    'analytics_outbox',
    'audit_logs',
  ]) {
    const [row] = await sql.unsafe(
      `SELECT count(*)::int count, md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) digest FROM public.${table} t`,
    );
    rows.push({ table, ...row });
  }
  return rows;
}

async function capture(name: string) {
  const geometry = [];
  for (const width of [320, 360, 375, 390, 393, 430, 768, 834, 960, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.teacher-sidebar')).toBeVisible({ visible: width >= 960 });
    await expect(page.locator('.teacher-bottom-nav')).toBeVisible({ visible: width < 960 });
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth <= dimensions.viewportWidth).toBe(true);
    geometry.push({ width, ...dimensions });
    if (width === 390 || width === 1280)
      await page.screenshot({ path: join(evidence, `${name}-${width}.png`), fullPage: true });
  }
  await writeFile(join(evidence, `${name}-geometry.json`), JSON.stringify(geometry, null, 2));
}

test.describe.serial('Teacher connected development dataset', () => {
  test.beforeAll(async ({ browser }) => {
    // Explicit environment opt-in; import the same target guard used by the seed.
    expect(process.env.ALLOW_TEACHER_DEMO_BROWSER_QA).toBe('true');
    const safetyModule = '../../../apps/api/scripts/teacher-demo-accounts.mjs';
    const safety = await import(safetyModule);
    const target = safety.requireDemoTarget(process.env);
    const vault = JSON.parse(
      await readFile(join(root, '.qa-seed/teacher-demo/accounts.json'), 'utf8'),
    );
    expect(vault.projectRef).toBe(safety.projectRef);
    expect(vault.scenario).toBe(safety.scenario);
    const teacher = vault.accounts[0];
    expect(teacher.email).toBe('budi.hartono.teacher@numora.test');
    expect(teacher.profileId).toBe('04000000-0000-4000-8000-000000000001');
    auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await auth.auth.signInWithPassword({
      email: teacher.email,
      password: teacher.password,
    });
    // Do not include provider payloads, tokens or passwords in assertion messages.
    expect(Boolean(!login.error && login.data.user?.id === teacher.id)).toBe(true);
    safety.assertDemoAuth(login.data.user, teacher);
    sql = postgres(target, { max: 1 });
    before = await snapshot();
    context = await browser.newContext({
      viewport: { width: 390, height: 900 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: 'http://localhost:3700',
            localStorage: [
              {
                name: `sb-${safety.projectRef}-auth-token`,
                value: JSON.stringify(login.data.session),
              },
            ],
          },
        ],
      },
    });
    page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.name));
    // Reading Teacher pages is allowed; the test must never mutate business data.
    await context.route('http://localhost:3701/api/v1/**', async (route) => {
      if (route.request().method() !== 'GET' && route.request().method() !== 'OPTIONS')
        throw new Error('Connected Teacher QA refuses product data mutations.');
      await route.continue();
    });
    await mkdir(evidence, { recursive: true });
  });

  test.afterAll(async () => {
    try {
      if (sql) {
        expect(await snapshot()).toEqual(before);
        await writeFile(
          join(evidence, 'verification.json'),
          JSON.stringify(
            {
              checkedAt: new Date().toISOString(),
              testsPassed:
                results.length === 5 && results.every((result) => result.status === 'passed'),
              results,
              businessRowsUnchanged: true,
              javascriptErrors: errors,
              testData: 'synthetic teacher-demo-2026-v1',
              api: 'real NestJS / Supabase Development',
            },
            null,
            2,
          ),
        );
      }
      expect(errors).toEqual([]);
    } finally {
      await context?.close();
      await auth?.auth.signOut({ scope: 'local' });
      await sql?.end();
    }
  });

  test.afterEach(async ({ browserName }, info) => {
    results.push({ name: info.title, status: info.status, browser: browserName });
  });

  test('dashboard and class roster derive 98 and 34 from real memberships', async () => {
    await page.goto('/teacher');
    await expect(page.locator('.teacher-class-card')).toHaveCount(3);
    await expect(
      page.locator('.teacher-metric').filter({ hasText: 'Total siswa' }).locator('strong'),
    ).toHaveText('98');
    await expect(page.getByText('NUM-9A26', { exact: true })).toBeVisible();
    await capture('dashboard');
    await page.goto(`/teacher/classes/${classId}`);
    await expect(page.locator('.teacher-student-record')).toHaveCount(34);
    await capture('class-roster');
    await page.getByLabel('Cari siswa').fill('Siti Rahma');
    await expect(page.locator('.teacher-student-record')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Lihat progres Siti Rahma' })).toBeVisible();
  });

  test('invite and read-only settings use the actual canonical class code', async () => {
    await page.goto(`/teacher/classes/${classId}/invite`);
    await expect(page.getByRole('img', { name: /QR kode kelas/ })).toBeVisible();
    await expect(page.locator('.teacher-code-panel strong')).toHaveText('NUM-9A26');
    await expect(page.getByRole('link', { name: 'Unduh PNG QR' })).toHaveAttribute(
      'href',
      /^data:image\/png/,
    );
    await capture('invite');
    await page.goto(`/teacher/classes/${classId}/settings`);
    await expect(page.getByText('34 siswa', { exact: true })).toBeVisible();
    await expect(page.getByText('Informasi hanya baca', { exact: true })).toBeVisible();
    await capture('class-settings');
  });

  test('monitoring shows the real 34-student cohort and honest unavailable features', async () => {
    await page.goto(`/teacher/monitoring?classId=${classId}`);
    await expect(page.locator('.teacher-progress-row')).toHaveCount(34);
    await expect(page.getByRole('link', { name: 'Alya Nurhaliza', exact: true })).toBeVisible();
    await capture('monitoring');
    await page.getByRole('tab', { name: 'Tryout', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Monitoring Tryout belum tersedia', exact: true }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Leaderboard', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Leaderboard guru belum tersedia', exact: true }),
    ).toBeVisible();
  });

  test('student history preserves regression, released scores and pending IRT', async () => {
    await page.goto(`/teacher/classes/${classId}/students/${studentId(7)}`);
    await expect(
      page
        .locator('.teacher-level-card')
        .filter({ hasText: 'Persamaan & Fungsi Kuadrat' })
        .filter({ hasText: 'Level 1' })
        .first(),
    ).toContainText('70');
    await expect(
      page
        .locator('.teacher-level-card')
        .filter({ hasText: 'Persamaan & Fungsi Kuadrat' })
        .filter({ hasText: 'Level 1' })
        .first(),
    ).toContainText('90');
    await capture('regression');
    await page.goto(`/teacher/classes/${classId}/students/${studentId(1)}`);
    const past = page.locator('.teacher-assessment-record').filter({ hasText: 'Batch #01' });
    await expect(past.locator('.teacher-assessment-record__result strong')).toHaveText('97');
    const active = page.locator('.teacher-assessment-record').filter({ hasText: 'Batch #02' });
    await expect(active).toContainText('Menunggu IRT');
    await expect(active.locator('.teacher-assessment-record__result strong')).toHaveCount(0);
    await capture('alya-progress');
    await page.goto(`/teacher/classes/${classId}/students/${studentId(12)}`);
    await expect(
      page.getByRole('heading', { name: 'Belum ada latihan', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Belum ada riwayat asesmen', exact: true }),
    ).toBeVisible();
    await capture('new-student');
  });

  test('feedback, notifications and profile render real read states without fabricated identity claims', async () => {
    await page.goto(`/teacher/feedback?classId=${classId}&studentId=${studentId(5)}`);
    await expect(page.locator('.teacher-feedback-entry')).toHaveCount(3);
    await expect(page.locator('.teacher-feedback-entry').first()).toContainText('Remedial Drill');
    await capture('feedback-siti');
    await page.getByLabel('Status baca').selectOption('unread');
    await expect(page.locator('.teacher-feedback-entry')).toHaveCount(1);
    await page.goto('/teacher/notifications');
    await expect(
      page.getByRole('heading', { name: 'Notifikasi guru belum tersedia', exact: true }),
    ).toBeVisible();
    await capture('notifications');
    await page.goto('/teacher/profile');
    await expect(page.locator('.teacher-profile-class')).toHaveCount(3);
    await expect(
      page.getByText('budi.hartono.teacher@numora.test', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('Google terhubung', { exact: false })).toHaveCount(0);
    await capture('profile');
  });
});

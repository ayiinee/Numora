import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { loadAdminWorkbench } from '../src/features/admin/content-api';
import type { AdminSchool, TeacherTokenSummary } from '../src/lib/api';

// Synthetic browser fixtures: real AuthProvider/REST clients, no database writes or auth bypass.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function workbench(): Awaited<ReturnType<typeof loadAdminWorkbench>> {
  return {
    curriculum: {
      items: [
        {
          id: id(1),
          kind: 'CHAPTER',
          parentId: null,
          code: 'BAB-02',
          name: 'Persamaan & Fungsi Kuadrat',
          displayOrder: 2,
          status: 'READY',
        },
        {
          id: id(2),
          kind: 'SUBCHAPTER',
          parentId: id(1),
          code: 'SUB-21',
          name: 'Faktorisasi & Bentuk Kuadrat',
          displayOrder: 1,
          status: 'READY',
        },
        {
          id: id(3),
          kind: 'COMPETENCY',
          parentId: id(2),
          code: 'ALG-01',
          name: 'Mengidentifikasi bentuk kuadrat sempurna',
          displayOrder: 1,
          status: 'READY',
        },
        {
          id: id(4),
          kind: 'LEVEL',
          parentId: id(2),
          code: 'DEMO-L1',
          name: 'Level 1 — Pengenalan bentuk kuadrat',
          displayOrder: 1,
          status: 'READY',
        },
      ],
    },
    versions: {
      items: [
        {
          id: id(10),
          questionId: id(11),
          primaryCompetencyId: id(3),
          variantId: id(12),
          variantCode: 'DEMO-ALG-01',
          variantKind: 'ORIGINAL',
          originalVariantId: null,
          versionNumber: 1,
          questionType: 'SINGLE_CHOICE',
          stem: 'DEMO: Bentuk setara dari $x^2+6x+9$ adalah…',
          options: [
            { id: 'A', text: '$(x+3)^2$' },
            { id: 'B', text: '$(x-3)^2$' },
            { id: 'C', text: '$x^2+3$' },
            { id: 'D', text: '$x(x+6)$' },
          ],
          answerOptionId: 'A',
          explanation: 'DEMO: Bentuk kuadrat sempurna mengikuti $(a+b)^2=a^2+2ab+b^2$.',
          difficulty: 'DEMO',
          contentStatus: 'READY',
          questionStatus: 'READY',
          reviewedByUserId: id(100),
          reviewedAt: '2026-10-03T02:00:00Z',
        },
      ],
    },
    videos: {
      items: [
        {
          id: id(13),
          mappingId: id(14),
          subchapterId: id(2),
          title: 'DEMO — Mengenali bentuk kuadrat sempurna',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          source: 'YouTube',
          recommendationOrder: 1,
          status: 'READY',
        },
      ],
    },
    reports: {
      items: [
        {
          id: id(15),
          kind: 'QUESTION',
          referenceId: id(10),
          category: 'EXPLANATION',
          details: 'DEMO: Mohon periksa urutan langkah pada pembahasan.',
          status: 'OPEN',
          followUp: null,
          reportedAt: '2026-10-04T02:30:00Z',
        },
      ],
    },
    irt: {
      items: [
        {
          id: id(22),
          batchId: id(16),
          questionVersionId: id(10),
          modelVersion: 'DEMO-MODEL',
          batchStatus: 'SUCCEEDED',
          sampleSize: 0,
          dataStatus: 'NOT_ENOUGH_DATA',
          difficultyB: null,
          discriminationA: null,
          guessingC: null,
        },
      ],
    },
    irtBatches: {
      items: [
        {
          id: id(16),
          packageId: id(18),
          batchKind: 'TRYOUT',
          modelVersion: 'DEMO-MODEL',
          status: 'SUCCEEDED',
          startedAt: '2026-10-04T00:00:00Z',
          finishedAt: '2026-10-04T01:00:00Z',
          resultReleasedAt: null,
          failureCode: null,
        },
      ],
    },
    audit: {
      items: [
        {
          id: id(17),
          actorUserId: id(100),
          action: 'question_version_reviewed',
          entityType: 'question_version',
          entityId: id(10),
          createdAt: '2026-10-03T02:00:00Z',
        },
      ],
    },
    dashboard: { schools: 3, chapters: 1, questions: 1, readyVersions: 1, openReports: 1 },
    packages: {
      items: [
        {
          id: id(18),
          familyCode: 'DEMO-TRYOUT',
          packageVersion: 1,
          name: 'DEMO — Draf Tryout Matematika',
          status: 'DRAFT',
          questionVersionIds: [id(10), id(21)],
        },
      ],
    },
    drillPackages: {
      items: [
        {
          id: id(19),
          familyCode: 'DEMO-DRILL',
          packageVersion: 1,
          name: 'DEMO — Paket Latihan Aljabar',
          levelId: id(4),
          variantIndex: 1,
          scoringPolicyVersionId: id(20),
          status: 'DRAFT',
          releaseAt: null,
          questionVersionIds: [id(10)],
        },
      ],
    },
  };
}
async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: id(100),
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.');
  await page.addInitScript(
    ({ jwt, userId }) => {
      if (!localStorage.getItem('admin-fixture-initialized')) {
        localStorage.setItem('admin-fixture-initialized', 'yes');
        localStorage.setItem(
          'sb-numora-e2e-auth-token',
          JSON.stringify({
            access_token: jwt,
            refresh_token: 'fixture-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: userId,
              aud: 'authenticated',
              role: 'authenticated',
              email: 'admin@example.test',
              app_metadata: { provider: 'google' },
              user_metadata: { name: 'Admin DEMO' },
              created_at: '2026-01-01T00:00:00Z',
            },
          }),
        );
      }
    },
    { jwt, userId: id(100) },
  );
  const state = {
    role: 'ADMIN' as 'ADMIN' | 'STUDENT' | 'TEACHER',
    schools: [
      { id: id(101), code: 'SMP-TEST-JKT', name: 'SMPN 1 Jakarta — DEMO', status: 'ACTIVE' },
      {
        id: id(102),
        code: 'DEMO-SCH-02',
        name: 'Sekolah Pendampingan Matematika Dengan Nama Panjang Untuk Pemeriksaan Tata Letak',
        status: 'INACTIVE',
      },
    ] as AdminSchool[],
    tokens: [
      { id: id(110), expiresAt: '2099-01-01T00:00:00Z', usedAt: null, revokedAt: null },
      {
        id: id(111),
        expiresAt: '2099-01-01T00:00:00Z',
        usedAt: '2026-10-03T00:00:00Z',
        revokedAt: null,
      },
      { id: id(112), expiresAt: '2026-01-01T00:00:00Z', usedAt: null, revokedAt: null },
    ] as TeacherTokenSummary[],
    data: workbench(),
    failPath: '',
    failStatus: 503,
    failMutation: false,
    wait: null as Promise<void> | null,
    mutations: [] as { method: string; path: string; body: Record<string, unknown> }[],
    offsets: [] as string[],
  };
  await page.route('https://numora-e2e.supabase.co/**', (route) => route.fulfill({ json: {} }));
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace('/api/v1', '');
    const fail = () =>
      route.fulfill({
        status: state.failStatus,
        contentType: 'application/problem+json',
        json: {
          status: state.failStatus,
          code: 'FIXTURE_ERROR',
          detail:
            state.failStatus === 403
              ? 'Akses Admin ditolak.'
              : state.failStatus === 401
                ? 'Sesi berakhir.'
                : 'Permintaan DEMO gagal. Coba lagi.',
        },
      });
    if (path === '/identity/me')
      return route.fulfill({
        json: {
          id: id(100),
          role: state.role,
          status: 'ACTIVE',
          displayName: 'Admin DEMO',
          email: 'admin@example.test',
          teacherVerified: state.role === 'TEACHER' ? true : null,
          studentAffiliation: state.role === 'STUDENT' ? 'MANDIRI' : null,
        },
      });
    if (state.wait) await state.wait;
    if (state.failPath && path.includes(state.failPath)) return fail();
    if (request.method() !== 'GET') {
      const body = (request.postData() ? request.postDataJSON() : {}) as Record<string, unknown>;
      state.mutations.push({ method: request.method(), path, body });
      if (state.failMutation) return fail();
      let result: unknown = { id: id(200) };
      if (path === '/admin/schools') {
        const school = {
          id: id(103),
          code: String(body.code),
          name: String(body.name),
          status: 'ACTIVE' as const,
        };
        state.schools.push(school);
        result = school;
      } else if (path.endsWith('/teacher-tokens') || path.endsWith('/reissue')) {
        if (path.endsWith('/reissue')) {
          const previous = state.tokens.find((t) => path.includes(t.id));
          if (previous) previous.revokedAt = '2026-10-04T00:00:00Z';
        }
        const issued = {
          id: id(110 + state.tokens.length),
          token: 'DEMO-ONE-TIME',
          expiresAt: '2099-01-01T00:00:00Z',
        };
        state.tokens.push({ ...issued, usedAt: null, revokedAt: null });
        result = issued;
      } else if (path.endsWith('/revoke')) {
        const previous = state.tokens.find((t) => path.includes(t.id));
        if (previous) previous.revokedAt = '2026-10-04T00:00:00Z';
        result = { revoked: true };
      } else if (path.startsWith('/admin/schools/')) {
        const school = state.schools.find((s) => path.endsWith(s.id))!;
        Object.assign(school, body);
        result = school;
      } else if (path.startsWith('/admin/content/chapters/')) {
        Object.assign(state.data.curriculum.items.find((chapter) => path.endsWith(chapter.id))!, body);
      } else if (path.startsWith('/admin/content/tryout-packages/')) {
        Object.assign(state.data.packages.items[0]!, body);
        result = { id: id(18) };
      } else if (path.startsWith('/admin/reports/')) {
        Object.assign(state.data.reports.items[0]!, body);
        result = { id: id(15) };
      }
      return route.fulfill({ json: result });
    }
    let data: unknown = { items: [] };
    if (path === '/admin/schools') data = { items: state.schools };
    else if (path.endsWith('/teacher-tokens')) data = { items: state.tokens };
    else {
      const mapping: Record<string, unknown> = {
        '/admin/content/curriculum': state.data.curriculum,
        '/admin/content/versions': state.data.versions,
        '/admin/content/videos': state.data.videos,
        '/admin/reports': state.data.reports,
        '/admin/irt': state.data.irt,
        '/admin/irt/batches': state.data.irtBatches,
        '/admin/audit-logs': state.data.audit,
        '/admin/dashboard': state.data.dashboard,
        '/admin/content/tryout-packages': state.data.packages,
        '/admin/content/drill-packages': state.data.drillPackages,
      };
      if (path === '/admin/content/versions')
        state.offsets.push(url.searchParams.get('offset') ?? '0');
      data = mapping[path] ?? data;
    }
    await route.fulfill({ json: data });
  });
  return { state, errors };
}
async function capture(page: Page, name: string, width: number) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    outside: [...document.querySelectorAll('main *')]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 25)
      .map((el) => ({
        tag: el.tagName,
        className: el.className,
        width: el.getBoundingClientRect().width,
        right: el.getBoundingClientRect().right,
      })),
    bounds: [
      ...document.querySelectorAll(
        '.admin-page-header,.admin-stat,.admin-card,.admin-content-form,.admin-content-row',
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
  const out = resolve('../../.tmp/redesign-phase9');
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, `${name}-${width}.json`), JSON.stringify(geometry, null, 2));
  expect(geometry.overflow, `${name}: ${JSON.stringify(geometry.outside)}`).toBe(false);
  await page.screenshot({
    path: resolve(out, `${name}-${width}.png`),
    fullPage: true,
    animations: 'disabled',
    style: 'nextjs-portal {visibility:hidden !important;}',
  });
}
const panels = [
  ['Materi', 'curriculum'],
  ['Soal', 'questions'],
  ['Verifikasi & riwayat', 'verification'],
  ['Video', 'videos'],
  ['Draf Tryout', 'tryout'],
  ['Paket Drill', 'drill'],
  ['Laporan', 'reports'],
  ['IRT', 'irt'],
  ['Audit', 'audit'],
] as const;
for (const width of [320, 360, 390, 393, 430, 768, 1024, 1280, 1440]) {
  test(`Admin schools and all workbench panels at ${width}px keep server data and navigation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state, errors } = await setup(page);
    await page.goto('/admin/schools');
    await expect(page.getByRole('button', { name: /SMPN 1 Jakarta/ })).toBeVisible();
    await capture(page, 'schools', width);
    await page.getByRole('button', { name: /SMPN 1 Jakarta/ }).click();
    await expect(page.getByText('Terpakai', { exact: true })).toBeVisible();
    await capture(page, 'school-tokens', width);
    const menu = page.getByRole('button', { name: 'Menu navigasi' });
    if (width < 960) {
      await menu.focus();
      await page.keyboard.press('Enter');
      const nav = page.locator('#mobile-menu');
      await expect(nav).toBeVisible();
      await nav.getByRole('link', { name: 'Konten & operasional' }).focus();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
    }
    await page.goto('/admin/content');
    await expect(page.getByRole('combobox', { name: 'Kompetensi', exact: true })).toBeVisible();
    for (const [label, name] of panels) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await capture(page, name, width);
    }
    await expect(page.getByText('question_version_reviewed', { exact: true })).toBeVisible();
    expect(state.mutations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test('School lifecycle preserves input, code case, one-time token and inactive eligibility', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  await page.goto('/admin/schools');
  await page.getByRole('textbox', { name: 'Kode sekolah', exact: true }).fill('Test-Ab');
  await page.getByRole('textbox', { name: 'Nama sekolah', exact: true }).fill('Sekolah DEMO Baru');
  state.failMutation = true;
  await page.getByRole('button', { name: 'Simpan sekolah', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Kode sekolah', exact: true })).toHaveValue(
    'Test-Ab',
  );
  await capture(page, 'school-mutation-error', 390);
  state.failMutation = false;
  await page.getByRole('button', { name: 'Simpan sekolah', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ubah nama', exact: true })).toHaveValue(
    'Sekolah DEMO Baru',
  );
  await page.getByRole('textbox', { name: 'Ubah nama', exact: true }).fill('Sekolah DEMO Direvisi');
  await page.getByRole('button', { name: 'Simpan nama', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sekolah DEMO Direvisi' })).toBeVisible();
  await page.getByRole('button', { name: 'Terbitkan token', exact: true }).click();
  await expect(page.getByText('DEMO-ONE-TIME', { exact: true })).toBeVisible();
  await capture(page, 'school-issued-token', 390);
  await page.getByRole('button', { name: /SMPN 1 Jakarta/ }).click();
  await expect(page.getByText('DEMO-ONE-TIME', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Terbit ulang', exact: true }).first().click();
  await expect(page.getByText('DEMO-ONE-TIME', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cabut', exact: true }).first().click();
  await expect(page.getByText('DEMO-ONE-TIME', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Nonaktifkan sekolah', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Terbitkan token', exact: true })).toBeDisabled();
  await capture(page, 'school-inactive', 390);
  expect(state.mutations[0]?.body).toEqual({ code: 'Test-Ab', name: 'Sekolah DEMO Baru' });
  expect(state.mutations.some((r) => r.path.endsWith('/reissue'))).toBe(true);
  expect(state.mutations.some((r) => r.path.endsWith('/revoke'))).toBe(true);
  expect(errors).toEqual([]);
});
test('Development preview remains local and QA login remains gated for the fixture project', async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  const preview = await page.goto('/admin/preview');
  if (process.env.NUMORA_E2E_PRODUCTION === 'true') {
    expect(preview?.status()).toBe(404);
  } else {
    await expect(page.getByText(/Hanya tersedia saat development/)).toBeVisible();
    await page.getByRole('button', { name: /Lihat pratinjau bank soal/ }).click();
    await expect(page.getByRole('heading', { name: 'Bank soal', exact: true })).toBeVisible();
    await expect(
      page.getByText('Simulasi tampilan bank soal. Tidak terhubung ke API atau penyimpanan.'),
    ).toBeVisible();
  }
  expect(state.mutations).toEqual([]);
  const response = await page.goto('/qa/login');
  expect(response?.status()).toBe(404);
  expect(errors).toEqual([]);
});
test('Admin category changes preserve the server value on failure and allow a null reset', async ({ page }) => {
  const { state } = await setup(page);
  await page.goto('/admin/content');
  await page.getByRole('button', { name: 'Materi', exact: true }).click();
  const category = page.getByRole('combobox', { name: 'Kategori bab: Persamaan & Fungsi Kuadrat', exact: true });
  await expect(category).toHaveValue('');
  state.failMutation = true;
  await category.selectOption('algebra');
  await expect(page.locator('.form-error')).toContainText('Permintaan DEMO gagal');
  await expect(category).toHaveValue('');
  state.failMutation = false;
  await category.selectOption('geometry');
  await expect(category).toHaveValue('geometry');
  await category.selectOption('');
  await expect(category).toHaveValue('');
  expect(state.mutations.map((mutation) => mutation.body)).toEqual([
    { materialCategory: 'algebra' }, { materialCategory: 'geometry' }, { materialCategory: null },
  ]);
});
test('Admin list/token errors, empty schools and expired access provide recovery', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  state.failPath = '/admin/schools';
  await page.goto('/admin/schools');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await capture(page, 'schools-error', 390);
  state.failPath = '';
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await page.getByRole('button', { name: /SMPN 1 Jakarta/ }).click();
  state.failPath = 'teacher-tokens';
  await page.getByRole('button', { name: /Sekolah Pendampingan/ }).click();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await capture(page, 'tokens-error', 390);
  state.failPath = '';
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.getByText('Terpakai', { exact: true })).toBeVisible();
  state.failPath = 'teacher-tokens';
  state.failStatus = 401; // Inactive school must keep issuance disabled before a 401 token-list retry.
  await expect(page.getByRole('button', { name: 'Terbitkan token' })).toBeDisabled();
  await page.getByRole('button', { name: /SMPN 1 Jakarta/ }).click();
  await expect(page.getByRole('link', { name: 'Ke halaman masuk' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Ubah nama', exact: true })).toHaveCount(0);
  await capture(page, 'schools-session-expired', 390);
  state.failPath = '';
  state.schools = [];
  await page.goto('/admin/schools');
  await expect(page.getByRole('heading', { name: 'Belum ada sekolah.' })).toBeVisible();
  await capture(page, 'schools-empty', 390);
  expect(errors).toEqual([]);
});
test('Workbench retry, denied access, empty panels and page boundaries retain domain states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  state.failPath = '/admin/content/curriculum';
  await page.goto('/admin/content');
  await expect(page.getByText('Permintaan DEMO gagal. Coba lagi.')).toBeVisible();
  await capture(page, 'content-error', 390);
  state.failPath = '';
  await page.getByRole('button', { name: 'Muat ulang data' }).click();
  await expect(page.getByRole('combobox', { name: 'Kompetensi', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'IRT', exact: true }).click();
  await expect(page.getByText('TRYOUT · SUCCEEDED', { exact: true })).toBeVisible();
  await expect(page.getByText(/Rilis belum tercatat/)).toBeVisible();
  await expect(page.getByText('0 respons · NOT_ENOUGH_DATA', { exact: true })).toBeVisible();
  await expect(
    page.getByText('a: Belum tersedia · b: Belum tersedia · c: Belum tersedia', { exact: true }),
  ).toBeVisible();
  state.data.versions.items = Array.from({ length: 20 }, (_, n) => ({
    ...state.data.versions.items[0]!,
    id: id(300 + n),
  }));
  await page.goto('/admin/content');
  await page.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(page.getByText('Halaman 2', { exact: true })).toBeVisible();
  expect(state.offsets).toContain('20');
  await page.getByRole('button', { name: 'Sebelumnya', exact: true }).click();
  await expect(page.getByText('Halaman 1', { exact: true })).toBeVisible();
  for (const list of [
    state.data.curriculum,
    state.data.versions,
    state.data.videos,
    state.data.packages,
    state.data.drillPackages,
    state.data.reports,
    state.data.irt,
    state.data.irtBatches,
    state.data.audit,
  ])
    list.items = [];
  await page.goto('/admin/content');
  await expect(page.getByRole('button', { name: 'Simpan versi DRAFT' })).toBeDisabled();
  for (const [label, name] of panels) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await capture(page, `empty-${name}`, 390);
  }
  state.failPath = '/admin/content/curriculum';
  state.failStatus = 403;
  await page.goto('/admin/content');
  await expect(page.getByText('Akses Admin ditolak.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Kompetensi', exact: true })).toHaveCount(0);
  await capture(page, 'content-forbidden', 390);
  expect(errors).toEqual([]);
});
test('Admin loading, pinned Tryout edits, report follow-up and logout remain explicit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { state, errors } = await setup(page);
  let release!: () => void;
  state.wait = new Promise<void>((r) => {
    release = r;
  });
  await page.goto('/admin/content');
  await expect(page.getByText('Memuat data Admin…')).toBeVisible();
  await capture(page, 'content-loading', 390);
  release();
  state.wait = null;
  await expect(page.getByRole('combobox', { name: 'Kompetensi', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Draf Tryout', exact: true }).click();
  await page.getByRole('button', { name: 'Edit draf', exact: true }).click();
  await page.getByLabel('Nama paket', { exact: true }).fill('DEMO Draf Revisi');
  await page.getByRole('button', { name: 'Simpan draf paket', exact: true }).click();
  await expect(page.getByText('DEMO Draf Revisi', { exact: true })).toBeVisible();
  expect(state.mutations.at(-1)?.body.questionVersionIds).toEqual([id(10), id(21)]);
  await page.getByRole('button', { name: 'Laporan', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Status tindak lanjut', exact: true })
    .selectOption('RESOLVED');
  await page
    .getByLabel('Catatan tindak lanjut', { exact: true })
    .fill('DEMO: Curriculum akan memeriksa langkah pembahasan.');
  await page.getByRole('button', { name: 'Simpan status dan tindak lanjut' }).click();
  await expect(page.getByTestId(`report-${id(15)}`).locator('.status-badge')).toHaveText(
    'Selesai ditindaklanjuti',
  );
  await expect(page.getByText('Tindak lanjut tersimpan:', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeVisible();
  await page.goto('/admin/content');
  await expect(page.getByRole('combobox', { name: 'Kompetensi', exact: true })).toHaveCount(0);
  await expect(page.getByText('Halaman ini hanya tersedia untuk Admin yang aktif.')).toBeVisible();
  await page.getByRole('link', { name: 'Ke halaman masuk' }).click();
  await expect(page).toHaveURL('http://localhost:3300/');
  expect(errors).toEqual([]);
});

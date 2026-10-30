import { type Page } from '@playwright/test';
import type { AdminClassDto } from '../../src/features/admin/generated-types';
import type { AdminSchool, TeacherTokenSummary } from '../../src/lib/api';
import fixture from './admin-workbench.json';

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export async function selectContentSection(page: Page, label: string) {
  const select = page.getByRole('combobox', {
    name: 'Bagian konten',
    exact: true,
    includeHidden: true,
  });
  await select.waitFor({ state: 'attached' });
  if (await select.isVisible()) await select.selectOption({ label });
  else
    await page
      .getByRole('navigation', { name: 'Pengelolaan Admin' })
      .getByRole('button', { name: label, exact: true })
      .click();
}

// Isolated synthetic snapshot: leave the PR #100 / RY-03 suite untouched.
export async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
              user_metadata: { name: 'Admin TEST' },
              created_at: '2026-01-01T00:00:00Z',
            },
          }),
        );
      }
    },
    { jwt, userId: id(100) },
  );
  const state = {
    adminRole: 'SUPER_ADMIN' as 'SUPER_ADMIN' | 'OPERATIONS' | 'CONTENT_DATA_MODERATION' | null,
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
      {
        id: id(110),
        expiresAt: '2099-01-01T00:00:00Z',
        usedAt: null,
        revokedAt: null,
        createdAt: '2026-10-01T00:00:00Z',
        usedByUserId: null,
        usedByName: null,
        status: 'AVAILABLE',
      },
    ] as TeacherTokenSummary[],
    classes: [
      {
        id: id(700),
        name: 'Kelas TEST 1',
        schoolId: id(101),
        schoolName: 'Sekolah TEST',
        teacherId: id(800),
        teacherName: 'Guru TEST',
        teacherActive: true,
        studentCount: 6,
        createdAt: '2026-10-01T00:00:00Z',
        archivedAt: null,
      },
    ] as AdminClassDto[],
    data: structuredClone(fixture),
    failMutation: false,
    failStatus: 403,
  };
  await page.route('https://numora-e2e.supabase.co/**', (route) => route.fulfill({ json: {} }));
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/identity/me')
      return route.fulfill({
        json: {
          id: id(100),
          role: 'ADMIN',
          status: 'ACTIVE',
          adminRole: state.adminRole,
          capabilities:
            state.adminRole === 'SUPER_ADMIN'
              ? [
                  'CONTENT_MANAGE',
                  'OPERATIONS_MANAGE',
                  'OPERATIONS_LIMITED_READ',
                  'AUDIT_READ',
                  'ADMIN_ACCOUNTS_MANAGE',
                  'ANALYTICS_OPERATIONS',
                  'ANALYTICS_CONTENT',
                ]
              : state.adminRole === 'OPERATIONS'
                ? [
                    'OPERATIONS_MANAGE',
                    'OPERATIONS_LIMITED_READ',
                    'ANALYTICS_OPERATIONS',
                    'AUDIT_READ',
                  ]
                : state.adminRole === 'CONTENT_DATA_MODERATION'
                  ? ['CONTENT_MANAGE', 'OPERATIONS_LIMITED_READ', 'ANALYTICS_CONTENT', 'AUDIT_READ']
                  : [],
          displayName: 'Admin DEMO',
          email: 'admin@example.test',
          teacherVerified: null,
          studentAffiliation: null,
        },
      });
    if (request.method() !== 'GET') {
      if (state.failMutation)
        return route.fulfill({
          status: state.failStatus,
          contentType: 'application/problem+json',
          json: { code: 'FIXTURE_ERROR', detail: 'Akses Admin ditolak.' },
        });
      if (path.endsWith('/teacher-tokens')) {
        const issued = { id: id(120), token: 'DEMO-ONE-TIME', expiresAt: '2099-01-01T00:00:00Z' };
        state.tokens.push({
          id: issued.id,
          expiresAt: issued.expiresAt,
          createdAt: new Date().toISOString(),
          usedAt: null,
          revokedAt: null,
          usedByUserId: null,
          usedByName: null,
          status: 'AVAILABLE',
        });
        return route.fulfill({ json: issued });
      }
      const school = state.schools.find((item) => path === `/admin/schools/${item.id}`);
      if (school) {
        Object.assign(school, request.postDataJSON());
        return route.fulfill({ json: school });
      }
      return route.fulfill({ json: { id: id(200) } });
    }
    if (path === '/admin/schools') {
      const params = new URL(request.url()).searchParams;
      const search = (params.get('search') ?? '').toLowerCase();
      const offset = Number(params.get('offset') ?? 0);
      const schools = state.schools.filter((item) =>
        `${item.code} ${item.name}`.toLowerCase().includes(search),
      );
      return route.fulfill({
        json: {
          items: schools.slice(offset, offset + 5),
          nextOffset: schools.length > offset + 5 ? offset + 5 : null,
        },
      });
    }
    const detailSchool = state.schools.find((item) => path === `/admin/schools/${item.id}`);
    if (detailSchool) return route.fulfill({ json: detailSchool });
    if (path.endsWith('/teacher-tokens'))
      return route.fulfill({ json: { items: state.tokens, nextOffset: null } });
    if (path === '/admin/classes')
      return route.fulfill({ json: { items: state.classes, nextOffset: null } });
    if (path === `/admin/classes/${id(700)}`) return route.fulfill({ json: state.classes[0] });
    const data: Record<string, unknown> = {
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
    return route.fulfill({ json: data[path] ?? { items: [] } });
  });
  return { state, errors };
}

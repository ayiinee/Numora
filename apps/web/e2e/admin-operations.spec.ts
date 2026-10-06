import { expect, test, type Page } from '@playwright/test';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function fixture(page: Page, role: 'OPERATIONS' | 'CONTENT_DATA_MODERATION') {
  const now = Math.floor(Date.now() / 1000),
    user = {
      id: id(1),
      aud: 'authenticated',
      email: 'admin@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-05T00:00:00Z',
    };
  const session = {
    access_token: [
      Buffer.from('{"alg":"HS256"}').toString('base64url'),
      Buffer.from(
        JSON.stringify({ sub: user.id, exp: now + 3600, role: 'authenticated' }),
      ).toString('base64url'),
      'fixture-signature',
    ].join('.'),
    refresh_token: 'TEST ONLY',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user,
  };
  await page.addInitScript(
    (value) => localStorage.setItem('sb-numora-e2e-auth-token', JSON.stringify(value)),
    session,
  );
  const student = {
    id: id(2),
    displayName: 'Siswa Fixture',
    role: 'STUDENT',
    status: 'ACTIVE',
    createdAt: '2026-10-05T00:00:00Z',
  };
  const classroom = {
    id: id(3),
    name: 'Kelas Fixture',
    schoolId: id(4),
    schoolName: 'Sekolah Fixture',
    teacherId: id(5),
    teacherName: 'Guru Tercatat',
    teacherActive: false,
    studentCount: 1,
    createdAt: '2026-10-05T00:00:00Z',
    archivedAt: null,
  };
  const requests: string[] = [];
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    requests.push(path);
    const responses: Record<string, unknown> = {
      'identity/me': {
        id: user.id,
        role: 'ADMIN',
        status: 'ACTIVE',
        displayName: 'Admin Fixture',
        adminRole: role,
        capabilities:
          role === 'OPERATIONS'
            ? ['OPERATIONS_MANAGE', 'OPERATIONS_LIMITED_READ']
            : ['CONTENT_MANAGE', 'OPERATIONS_LIMITED_READ'],
      },
      'admin/users': { items: [student], nextOffset: null },
      [`admin/users/${student.id}`]: {
        ...student,
        email: 'student@example.test',
        affiliation: 'SCHOOL',
        teacherVerified: null,
      },
      [`admin/users/${student.id}/memberships`]: {
        items: [
          {
            id: id(6),
            schoolId: classroom.schoolId,
            schoolName: classroom.schoolName,
            classId: classroom.id,
            className: classroom.name,
            startedAt: '2026-10-05T00:00:00Z',
            endedAt: null,
            active: true,
          },
        ],
        nextOffset: null,
      },
      'admin/classes': { items: [classroom], nextOffset: null },
      [`admin/classes/${classroom.id}`]: classroom,
      [`admin/classes/${classroom.id}/roster`]: {
        items: [
          { ...student, membershipId: id(6), joinedAt: '2026-10-05T00:00:00Z', leftAt: null },
        ],
        nextOffset: null,
      },
      'admin/structures/schools': {
        items: [
          {
            id: classroom.schoolId,
            name: classroom.schoolName,
            code: 'FIXTURE',
            status: 'ACTIVE',
            classCount: 1,
            activeTeacherCount: 0,
            availableCredentialCount: 2,
            usedCredentialCount: 1,
            expiredCredentialCount: 0,
            revokedCredentialCount: 0,
            studentCount: 1,
          },
        ],
        nextOffset: null,
      },
      'admin/structures/classes': {
        items: [
          {
            id: classroom.id,
            name: classroom.name,
            schoolId: classroom.schoolId,
            schoolName: classroom.schoolName,
            teacherActive: false,
            studentCount: 1,
            createdAt: classroom.createdAt,
            archivedAt: null,
          },
        ],
        nextOffset: null,
      },
    };
    await route.fulfill({ json: responses[path] ?? { items: [], nextOffset: null } });
  });
  return requests;
}
test('Operations reads student affiliation, membership and roster without an active teacher', async ({
  page,
}) => {
  await fixture(page, 'OPERATIONS');
  await page.goto('/admin/operations');
  await page.getByRole('button', { name: 'Lihat detail', exact: true }).click();
  await expect(page.getByText('student@example.test')).toBeVisible();
  await expect(page.getByText('Sekolah Fixture · Kelas Fixture')).toBeVisible();
  await page.getByRole('button', { name: 'Kelas', exact: true }).click();
  await page.getByRole('button', { name: 'Lihat detail', exact: true }).click();
  await expect(page.getByText('Tanpa Guru aktif', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Roster kelas' })).toBeVisible();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
test('Content only loads limited structure with counts and no individual records', async ({
  page,
}) => {
  const requests = await fixture(page, 'CONTENT_DATA_MODERATION');
  await page.goto('/admin/structures');
  await expect(page.getByRole('heading', { name: 'Sekolah dan kelas — baca saja' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Akses baca saja');
  await expect(page.getByText(/Credential: 2 tersedia/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /buat|edit|generate|regenerate|ban/i }),
  ).toHaveCount(0);
  await page.screenshot({ path: '../../.tmp/admin-content-permissions.png', fullPage: true });
  await page.getByRole('button', { name: 'Lihat kelas sekolah' }).click();
  await expect(page.getByText(/Tanpa Guru aktif/)).toBeVisible();
  expect(
    requests.every((path) => path === 'identity/me' || path.startsWith('admin/structures/')),
  ).toBe(true);
  await expect(page.getByText('student@example.test')).toHaveCount(0);
  await expect(page.getByText('Guru Tercatat')).toHaveCount(0);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.goto('/admin/operations');
  await expect(
    page.getByText('Halaman ini hanya tersedia untuk Admin Operasional dan Super Admin.'),
  ).toBeVisible();
  expect(
    requests.some((path) => path.startsWith('admin/users') || path.startsWith('admin/classes')),
  ).toBe(false);
  await page.goto('/admin/schools');
  await expect(
    page.getByText('Halaman ini hanya tersedia untuk Admin Operasional dan Super Admin.'),
  ).toBeVisible();
  expect(requests.some((path) => path.startsWith('admin/schools'))).toBe(false);
});

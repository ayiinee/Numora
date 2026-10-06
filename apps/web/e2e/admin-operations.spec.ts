import { expect, test, type Page } from '@playwright/test';
async function captureOperations(page: Page, name: string, width: number) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `../../.tmp/admin-operations-${name}-${width}.png`,
    fullPage: true,
    animations: 'disabled',
    style: 'nextjs-portal {visibility:hidden !important;}',
  });
}
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

test('Operations deep links restore filters on reload and browser history', async ({ page }) => {
  const requests = await fixture(page, 'OPERATIONS');
  const classQueries: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/admin/classes') classQueries.push(url.search);
  });
  await page.goto(`/admin/operations?view=classes&schoolId=${id(4)}`);
  await expect(page.getByLabel('ID sekolah (opsional)')).toHaveValue(id(4));
  await expect(page.getByText('Kelas Fixture', { exact: true })).toBeVisible();
  expect(requests).not.toContain('admin/users');
  expect(classQueries.every((query) => new URLSearchParams(query).get('schoolId') === id(4))).toBe(
    true,
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Kelas', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: 'Pengguna', exact: true }).click();
  await expect(page).toHaveURL(/view=users/);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Kelas', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.goForward();
  await expect(page.getByRole('button', { name: 'Pengguna', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.goto('/admin/operations?role=TEACHER');
  await expect(page.getByRole('combobox', { name: 'Role', exact: true })).toHaveValue('TEACHER');
});

for (const target of ['memberships', 'roster'] as const) {
  test(`Operations clears individual records after ${target} access is revoked`, async ({
    page,
  }) => {
    await fixture(page, 'OPERATIONS');
    await page.route(`**/api/v1/admin/**/${target}?*`, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        json: { status: 403, title: 'Forbidden', detail: 'Akses operasional dicabut.' },
      });
    });
    await page.goto(`/admin/operations?view=${target === 'roster' ? 'classes' : 'users'}`);
    await page.getByRole('button', { name: 'Lihat detail', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Ke halaman masuk' })).toBeVisible();
    await expect(page.getByText('student@example.test')).toHaveCount(0);
    await expect(page.getByText('Siswa Fixture', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Kelas Fixture', { exact: true })).toHaveCount(0);
  });
}

test('Operations roster retries, filters and pages without losing the class detail', async ({
  page,
}) => {
  await fixture(page, 'OPERATIONS');
  let fail = true;
  const queries: URLSearchParams[] = [];
  await page.route(`**/api/v1/admin/classes/${id(3)}/roster?*`, async (route) => {
    if (fail)
      return route.fulfill({
        status: 503,
        json: { status: 503, detail: 'Roster sementara gagal.' },
      });
    const query = new URL(route.request().url()).searchParams;
    queries.push(query);
    const offset = Number(query.get('offset'));
    const former = query.get('state') === 'former';
    const searching = query.has('search');
    await route.fulfill({
      json: {
        items: [
          {
            id: id(2),
            membershipId: id(offset + 6),
            displayName: searching
              ? 'Nama Dicari'
              : former
                ? 'Mantan Anggota'
                : `Anggota Halaman ${offset ? 2 : 1}`,
            role: 'STUDENT',
            status: 'ACTIVE',
            createdAt: '2026-10-05T00:00:00Z',
            joinedAt: '2026-10-05T00:00:00Z',
            leftAt: former ? '2026-10-06T00:00:00Z' : null,
          },
        ],
        nextOffset: !offset && !former && !searching ? 20 : null,
      },
    });
  });
  await page.goto('/admin/operations?view=classes');
  await page.getByRole('button', { name: 'Lihat detail', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Roster sementara gagal');
  await expect(page.getByRole('heading', { name: 'Kelas Fixture' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.getByText('Anggota Halaman 1', { exact: true })).toBeVisible();
  const roster = page.getByRole('heading', { name: 'Roster kelas' }).locator('..');
  await roster.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(page.getByText('Anggota Halaman 2', { exact: true })).toBeVisible();
  expect(queries.at(-1)?.get('offset')).toBe('20');
  await roster.getByRole('button', { name: 'Sebelumnya', exact: true }).click();
  await expect(page.getByText('Anggota Halaman 1', { exact: true })).toBeVisible();
  await page.getByLabel('Status membership').selectOption('former');
  await expect(page.getByText('Mantan Anggota', { exact: true })).toBeVisible();
  expect(queries.at(-1)?.get('offset')).toBe('0');
  expect(queries.at(-1)?.get('state')).toBe('former');
  await page.getByLabel('Status membership').selectOption('');
  await expect(page.getByText('Anggota Halaman 1', { exact: true })).toBeVisible();
  expect(queries.at(-1)?.has('state')).toBe(false);
  await page.getByLabel('Cari anggota').fill('Nama Dicari');
  await page.getByRole('button', { name: 'Cari anggota', exact: true }).click();
  await expect(page.getByText('Nama Dicari', { exact: true })).toBeVisible();
  expect(queries.at(-1)?.get('search')).toBe('Nama Dicari');
  await expect(roster.getByRole('button', { name: 'Berikutnya', exact: true })).toBeDisabled();
});
for (const width of [320, 768, 1440]) {
  test(`Operations removes retired pages and banners at ${width}px`, async ({ page }) => {
    const requests = await fixture(page, 'OPERATIONS');
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/schools$/);
    await expect(page.locator('.admin-operations-shell')).toBeVisible();
    await expect(page.locator('.admin-page-header')).toHaveCount(0);
    expect(
      await page
        .locator('.admin-operations-shell')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--color-bg').trim()),
    ).toBe('#f7f8fa');
    expect(
      await page.locator('.app-topbar').evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(255, 255, 255)');
    await expect(
      page.getByRole('textbox', { name: 'Kode sekolah', exact: true }),
    ).not.toBeVisible();
    const createSchool = page.locator('.operations-create-disclosure > summary');
    await createSchool.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Kode sekolah', exact: true })).toBeVisible();
    await createSchool.click();
    if (width < 960) await page.getByRole('button', { name: 'Menu navigasi' }).click();
    const navigation =
      width < 960
        ? page.locator('#mobile-menu')
        : page.getByRole('navigation', { name: 'Navigasi Ruang admin' });
    for (const name of ['Ringkasan', 'Analytics'])
      await expect(navigation.getByRole('link', { name, exact: true })).toHaveCount(0);
    for (const name of ['Sekolah & credential', 'Pengguna & kelas'])
      await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
    if (width < 960) {
      await navigation.getByRole('link', { name: 'Pengguna & kelas', exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(page.locator('#mobile-menu')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Menu navigasi' })).toBeFocused();
    }
    await page.goto('/admin/analytics');
    await expect(page).toHaveURL(/\/admin\/schools$/);
    expect(requests.some((path) => path === 'admin/analytics')).toBe(false);
    await page.goto('/admin/operations');
    await expect(page.getByRole('button', { name: 'Lihat detail', exact: true })).toBeVisible();
    await expect(page.locator('.admin-page-header')).toHaveCount(0);
    await expect(page.locator('h1.sr-only')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await captureOperations(page, 'clean', width);
    await page.getByRole('button', { name: 'Lihat detail', exact: true }).click();
    await expect(page.getByText('student@example.test')).toBeVisible();
    await captureOperations(page, 'user', width);
    await page.getByRole('button', { name: 'Kelas', exact: true }).click();
    await page.getByRole('button', { name: 'Lihat detail', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Roster kelas' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await captureOperations(page, 'class', width);
  });
}
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

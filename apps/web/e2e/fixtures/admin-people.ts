import type { Page } from '@playwright/test';
import { id, setup } from './admin';
import type {
  AdminUserDetailDto,
  AdminClassDto,
  AdminMembershipDto,
  AdminRosterMemberDto,
} from '../../src/features/admin/generated-types';

export async function setupPeople(
  page: Page,
  role: 'SUPER_ADMIN' | 'OPERATIONS' | 'CONTENT_DATA_MODERATION' | null = 'SUPER_ADMIN',
) {
  const base = await setup(page);
  base.state.adminRole = role;
  const users: AdminUserDetailDto[] = Array.from({ length: 18 }, (_, i) => ({
    id: id(200 + i),
    displayName:
      i === 0
        ? 'Nadia Siswa Fixture'
        : i === 1
          ? 'Raka Guru Fixture'
          : i === 2
            ? 'Alya Dengan Nama Panjang Untuk Pemeriksaan Tata Letak'
            : `Pengguna Fixture ${i + 1}`,
    role: i % 3 === 1 ? 'TEACHER' : 'STUDENT',
    status: i === 2 ? 'DISABLED' : 'ACTIVE',
    createdAt: '2026-10-01T01:00:00Z',
    email: `user${i}@example.test`,
    affiliation: i % 3 === 1 ? null : i % 2 === 0 ? 'SCHOOL' : 'MANDIRI',
    teacherVerified: i % 3 === 1 ? i !== 4 : null,
  }));
  const classes: AdminClassDto[] = Array.from({ length: 7 }, (_, i) => ({
    id: id(400 + i),
    name: i === 0 ? 'Kelas IX-A Fixture' : `Kelas IX-${i + 1} Fixture`,
    schoolId: id(101),
    schoolName: base.state.schools[0]!.name,
    teacherId: i === 1 ? null : id(201),
    teacherName: i === 1 ? null : 'Raka Guru Fixture',
    teacherActive: i !== 1,
    studentCount: 7,
    createdAt: '2026-10-01T01:00:00Z',
    archivedAt: i === 2 ? '2026-10-20T01:00:00Z' : null,
  }));
  const memberships: AdminMembershipDto[] = Array.from({ length: 7 }, (_, i) => ({
    id: id(600 + i),
    schoolId: id(101),
    schoolName: base.state.schools[0]!.name,
    classId: i === 2 ? null : id(400 + i),
    className: i === 2 ? null : `Kelas IX-${i + 1} Fixture`,
    startedAt: '2026-10-01T01:00:00Z',
    endedAt: i === 1 ? '2026-10-10T01:00:00Z' : null,
    active: i !== 1,
  }));
  const roster: AdminRosterMemberDto[] = users
    .filter((user) => user.role === 'STUDENT')
    .slice(0, 8)
    .map((entry, i) => ({
      id: entry.id,
      displayName: entry.displayName,
      role: 'STUDENT',
      status: entry.status,
      createdAt: entry.createdAt,
      membershipId: id(700 + i),
      joinedAt: '2026-10-02T01:00:00Z',
      leftAt: i === 3 ? '2026-10-12T01:00:00Z' : null,
    }));
  const state = {
    users,
    classes,
    memberships,
    roster,
    calls: [] as { path: string; query: string; method: string }[],
    failPath: '',
    failStatus: 503,
  };
  await page.route(
    /http:\/\/localhost:3301\/api\/v1\/admin\/(users|classes)(?:[/?]|$)/,
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname.replace('/api/v1/', '');
      state.calls.push({ path, query: url.search, method: req.method() });
      if (state.failPath && path.includes(state.failPath))
        return route.fulfill({
          status: state.failStatus,
          json: {
            detail:
              state.failStatus === 401 || state.failStatus === 403
                ? 'Akses data operasional dicabut.'
                : 'Data sementara belum dapat dimuat.',
          },
        });
      if (req.method() !== 'GET')
        return route.fulfill({ status: 405, json: { detail: 'Read-only fixture' } });
      const q = url.searchParams,
        offset = Number(q.get('offset') ?? 0),
        search = (q.get('search') ?? '').toLowerCase();
      const pageOf = (rows: unknown[]) => ({
        items: rows.slice(offset, offset + 5),
        nextOffset: offset + 5 < rows.length ? offset + 5 : null,
      });
      if (path.endsWith('/memberships')) {
        const teacher =
          state.users.find((user) => user.id === path.split('/')[2])?.role === 'TEACHER';
        return route.fulfill({
          json: pageOf(
            state.memberships.filter((item) => (teacher ? !item.classId : Boolean(item.classId))),
          ),
        });
      }
      if (path.endsWith('/roster')) {
        const rows = state.roster.filter(
          (r) =>
            (!q.get('state') || (q.get('state') === 'former' ? Boolean(r.leftAt) : !r.leftAt)) &&
            r.displayName.toLowerCase().includes(search),
        );
        return route.fulfill({ json: pageOf(rows) });
      }
      if (path === 'admin/users')
        return route.fulfill({
          json: pageOf(
            state.users
              .filter(
                (u) =>
                  u.displayName.toLowerCase().includes(search) &&
                  (!q.get('role') || u.role === q.get('role')) &&
                  (!q.get('status') || u.status === q.get('status')) &&
                  (!q.get('affiliation') || u.affiliation === q.get('affiliation')),
              )
              .map(({ id, displayName, role, status, createdAt }) => ({
                id,
                displayName,
                role,
                status,
                createdAt,
              })),
          ),
        });
      if (path === 'admin/classes')
        return route.fulfill({
          json: pageOf(
            state.classes.filter(
              (c) =>
                c.name.toLowerCase().includes(search) &&
                (!q.get('schoolId') || c.schoolId === q.get('schoolId')) &&
                (!q.get('teacherId') || c.teacherId === q.get('teacherId')) &&
                (!q.get('state') ||
                  (q.get('state') === 'archived' ? Boolean(c.archivedAt) : !c.archivedAt)),
            ),
          ),
        });
      const record = path.startsWith('admin/users/')
        ? state.users.find((u) => u.id === path.split('/')[2])
        : state.classes.find((c) => c.id === path.split('/')[2]);
      return route.fulfill(
        record ? { json: record } : { status: 404, json: { detail: 'Data tidak ditemukan.' } },
      );
    },
  );
  return { state, errors: base.errors };
}

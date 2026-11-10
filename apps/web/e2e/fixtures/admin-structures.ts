import type { Page } from '@playwright/test';
import { id, setup } from './admin';
import type {
  AdminStructureClassDto,
  AdminStructureSchoolDto,
} from '../../src/features/admin/generated-types';

export async function setupStructures(page: Page) {
  const base = await setup(page);
  base.state.adminRole = 'CONTENT_DATA_MODERATION';
  const state = {
    schools: Array.from({ length: 12 }, (_, n): AdminStructureSchoolDto => ({
      id: id(101 + n),
      name:
        n === 0
          ? 'SMP Tunas Bangsa'
          : n === 1
            ? 'Sekolah Pendampingan Matematika Dengan Nama Panjang Untuk Audit Tampilan'
            : `Sekolah Fixture ${n + 1}`,
      code: `SMP-TEST-${n + 1}`,
      status: n === 1 ? 'INACTIVE' : 'ACTIVE',
      classCount: n + 1,
      activeTeacherCount: n,
      studentCount: (n + 1) * 10,
      availableCredentialCount: 2,
      usedCredentialCount: 1,
      expiredCredentialCount: 3,
      revokedCredentialCount: 0,
    })),
    classes: Array.from({ length: 13 }, (_, n): AdminStructureClassDto => ({
      id: id(700 + n),
      name: `Kelas IX-${n + 1} Fixture`,
      schoolId: id(n < 11 ? 101 : 102),
      schoolName: n < 11 ? 'SMP Tunas Bangsa' : 'Sekolah Pendampingan Matematika',
      studentCount: 10 + n,
      teacherActive: n % 2 === 0,
      createdAt: '2026-10-01T00:00:00Z',
      archivedAt: n === 2 ? '2026-11-01T00:00:00Z' : null,
    })),
    failStatus: 0,
    calls: [] as { path: string; method: string; query: Record<string, string> }[],
  };
  await page.route('**/api/v1/admin/structures/**', async (route) => {
    const url = new URL(route.request().url());
    state.calls.push({
      path: url.pathname,
      method: route.request().method(),
      query: Object.fromEntries(url.searchParams),
    });
    if (state.failStatus)
      return route.fulfill({
        status: state.failStatus,
        json: {
          title: 'TEST ONLY',
          status: state.failStatus,
          detail:
            state.failStatus === 403
              ? 'Akses struktur dicabut.'
              : 'Struktur sementara belum dapat dimuat.',
        },
      });
    const schools = url.pathname.endsWith('/schools');
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const schoolId = url.searchParams.get('schoolId');
    const items = (schools ? state.schools : state.classes).filter(
      (item) =>
        (!search ||
          `${item.name} ${'code' in item ? item.code : ''}`.toLowerCase().includes(search)) &&
        (!schoolId || !('schoolId' in item) || item.schoolId === schoolId),
    );
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return route.fulfill({
      json: {
        items: items.slice(offset, offset + 10),
        nextOffset: offset + 10 < items.length ? offset + 10 : null,
      },
    });
  });
  return { ...base, structures: state };
}

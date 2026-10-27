import type { Page } from '@playwright/test';
import { id, setup } from './admin';
import type { TeacherTokenSummary } from '../../src/lib/api';

export async function setupSchools(
  page: Page,
  role: 'SUPER_ADMIN' | 'OPERATIONS' | 'CONTENT_DATA_MODERATION' | null = 'SUPER_ADMIN',
) {
  const base = await setup(page);
  base.state.adminRole = role;
  base.state.schools = Array.from({ length: 7 }, (_, index) => ({
    id: id(101 + index),
    code: `SMP-TEST-${index + 1}`,
    name:
      index === 0
        ? 'SMP Tunas Bangsa'
        : index === 1
          ? 'Sekolah Pendampingan Matematika Dengan Nama Panjang'
          : `SMP Negeri Fixture ${index + 1}`,
    status: index === 1 ? 'INACTIVE' : 'ACTIVE',
    address:
      index === 0
        ? 'Jl. Pendidikan No. 12, Kecamatan Sukamaju'
        : index === 1
          ? 'Jl. Ilmu Pengetahuan dan Pembelajaran Matematika, Kabupaten Contoh'
          : null,
  }));
  const row = (index: number, status: TeacherTokenSummary['status']): TeacherTokenSummary => ({
    id: id(300 + index),
    createdAt: status === 'AVAILABLE' ? '2026-10-27T01:00:00Z' : '2026-10-24T01:00:00Z',
    expiresAt: status === 'AVAILABLE' ? '2026-10-30T01:00:00Z' : '2026-10-27T01:00:00Z',
    status,
    usedAt: status === 'USED' ? '2026-10-24T06:00:00Z' : null,
    revokedAt: status === 'REVOKED' ? '2026-10-24T08:00:00Z' : null,
    usedByUserId: status === 'USED' ? id(800) : null,
    usedByName: status === 'USED' ? 'Guru Fixture' : null,
  });
  const state = {
    schools: base.state.schools,
    tokens: {
      [id(101)]: [
        row(0, 'AVAILABLE'),
        row(1, 'USED'),
        row(2, 'EXPIRED'),
        row(3, 'REVOKED'),
        row(4, 'AVAILABLE'),
        row(5, 'EXPIRED'),
        row(6, 'AVAILABLE'),
      ],
      [id(102)]: [row(7, 'AVAILABLE')],
    } as Record<string, TeacherTokenSummary[]>,
    calls: [] as { path: string; query: string; method: string; body: unknown }[],
    failPath: '',
    failStatus: 503,
    failMutation: false,
    mutationDelay: 0,
    sequence: 900,
  };
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as unknown as { fixtureClipboard: string }).fixtureClipboard = value;
        },
      },
    });
  });
  await page.route(/http:\/\/localhost:3301\/api\/v1\/admin\/schools(?:[/?]|$)/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = req.method();
    state.calls.push({
      path,
      query: url.search,
      method,
      body: req.postData() ? req.postDataJSON() : null,
    });
    if (
      (state.failPath && path.includes(state.failPath)) ||
      (state.failMutation && method !== 'GET')
    )
      return route.fulfill({
        status: state.failStatus,
        json: {
          code: 'TEST_SCHOOL_FAILURE',
          detail:
            state.failStatus === 401 || state.failStatus === 403
              ? 'Akses sekolah telah dicabut.'
              : 'Permintaan belum berhasil. Coba lagi.',
        },
      });
    if (method !== 'GET' && state.mutationDelay)
      await new Promise((resolve) => setTimeout(resolve, state.mutationDelay));
    if (path === '/admin/schools') {
      if (method === 'POST') {
        const input = req.postDataJSON();
        const created = {
          ...input,
          id: id(state.sequence++),
          code: input.code.toUpperCase(),
          status: 'ACTIVE',
        };
        state.schools.unshift(created);
        return route.fulfill({ json: created });
      }
      const filter = (url.searchParams.get('search') ?? '').toLowerCase();
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const rows = state.schools.filter((s) =>
        `${s.name} ${s.code}`.toLowerCase().includes(filter),
      );
      return route.fulfill({
        json: {
          items: rows.slice(offset, offset + 5),
          nextOffset: offset + 5 < rows.length ? offset + 5 : null,
        },
      });
    }
    const schoolId = path.split('/')[3]!;
    const school = state.schools.find((s) => s.id === schoolId);
    if (!school)
      return route.fulfill({ status: 404, json: { detail: 'Sekolah tidak ditemukan.' } });
    if (path === `/admin/schools/${schoolId}`) {
      if (method === 'PATCH') Object.assign(school, req.postDataJSON());
      return route.fulfill({ json: school });
    }
    const tokens = state.tokens[schoolId] ?? (state.tokens[schoolId] = []);
    if (method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return route.fulfill({
        json: {
          items: tokens.slice(offset, offset + 5),
          nextOffset: offset + 5 < tokens.length ? offset + 5 : null,
        },
      });
    }
    const previous = tokens.find((t) => t.id === path.split('/')[5]);
    if (path.endsWith('/revoke')) {
      previous!.revokedAt = new Date().toISOString();
      previous!.status = 'REVOKED';
      return route.fulfill({ json: { revoked: true } });
    }
    if (school.status !== 'ACTIVE')
      return route.fulfill({ status: 409, json: { detail: 'Sekolah harus aktif.' } });
    if (previous) {
      previous.revokedAt = new Date().toISOString();
      previous.status = 'REVOKED';
    }
    const issued = {
      id: id(state.sequence++),
      token: `SYNTHETIC-ONLY-${state.sequence}`,
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    };
    tokens.unshift({
      ...row(state.sequence, 'AVAILABLE'),
      id: issued.id,
      createdAt: new Date().toISOString(),
      expiresAt: issued.expiresAt,
    });
    return route.fulfill({ json: issued });
  });
  return { state, identity: base.state, errors: base.errors };
}

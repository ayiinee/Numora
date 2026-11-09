import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { IdentityProfile } from '@/lib/api';
import { activeAdminHref, adminNavigation, adminNavigationLinks } from './navigation';
import { adminNavigationStorageKey, useAdminNavigation } from './use-admin-navigation';

const profile = {
  id: 'sidebar-test-only',
  role: 'ADMIN',
  status: 'ACTIVE',
  adminRole: 'SUPER_ADMIN',
  capabilities: [
    'CONTENT_MANAGE',
    'OPERATIONS_MANAGE',
    'ADMIN_ACCOUNTS_MANAGE',
    'ANALYTICS_CONTENT',
    'AUDIT_READ',
  ],
} as IdentityProfile;
beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  ['/admin/content', '/admin/content?view=questions'],
  ['/admin/content?view=videos&search=test&offset=5', '/admin/content?view=videos'],
  ['/admin/content?view=curriculum', '/admin/content?view=curriculum'],
  ['/admin/content?view=verification', '/admin/content?view=verification'],
  ['/admin/content?view=audit', '/admin/content?view=audit'],
  ['/admin/content?view=reports', '/admin/content?view=reports'],
  ['/admin/content?view=drillPackages', '/admin/assessments/drill'],
  ['/admin/content?view=directedPackages', '/admin/assessments/pretest'],
  ['/admin/content?view=packages', '/admin/assessments/tryout'],
  ['/admin/content/pretest?packageId=test', '/admin/assessments/pretest'],
  ['/admin/content/imports/json', '/admin/content/imports'],
  ['/admin/content/generator/results/test', '/admin/content/imports'],
  ['/admin/content/preview-sessions/test', '/admin/content/imports'],
  ['/admin/content/versions/test', '/admin/content?view=verification'],
  ['/admin/reports/VIDEO/test', '/admin/content?view=reports'],
  ['/admin/assessments?type=TRYOUT&package=test', '/admin/assessments/tryout'],
  ['/admin/assessments?type=DRILL', '/admin/assessments/drill'],
  ['/admin/assessments?type=unknown', '/admin/assessments/pretest'],
  ['/admin/assessments/pretest/test?offset=5', '/admin/assessments/pretest'],
  ['/admin/assessments/drill/new', '/admin/assessments/drill'],
  ['/admin/assessments/tryout/test', '/admin/assessments/tryout'],
  ['/admin/operations', '/admin/operations?view=users'],
  ['/admin/operations?view=classes&classId=test', '/admin/operations?view=classes'],
  ['/admin/accounts', '/admin/accounts?view=accounts'],
  ['/admin/accounts?view=invitations', '/admin/accounts?view=invitations'],
  ['/admin/irt', '/admin/irt?view=batches'],
  ['/admin/irt?view=requests&requestId=test', '/admin/irt?view=requests'],
])('selects one authorized destination for %s', (route, target) => {
  expect(activeAdminHref(route, adminNavigation(profile))).toBe(target);
  expect(activeAdminHref(route, [])).toBeUndefined();
});

it('filters the common hierarchy by assignment, status and existing capabilities', () => {
  expect(adminNavigation(profile).map((group) => group.label)).toEqual([
    'Pemantauan',
    'Operasional',
    'Konten & asesmen',
    'Administrasi',
  ]);
  for (const changed of [{ adminRole: null }, { status: 'DISABLED' }, { role: 'STUDENT' }])
    expect(adminNavigation({ ...profile, ...changed } as IdentityProfile)).toEqual([]);
  const operations = adminNavigation({
    ...profile,
    adminRole: 'OPERATIONS',
    capabilities: ['OPERATIONS_MANAGE', 'ANALYTICS_OPERATIONS'],
  });
  expect(adminNavigationLinks(operations).map((link) => link.label)).toEqual([
    'Dashboard',
    'Sekolah & verifikasi guru',
    'Pengguna',
    'Kelas',
  ]);
  const content = adminNavigation({
    ...profile,
    adminRole: 'CONTENT_DATA_MODERATION',
    capabilities: ['CONTENT_MANAGE', 'OPERATIONS_LIMITED_READ', 'ANALYTICS_CONTENT'],
  });
  const labels = adminNavigationLinks(content).map((link) => link.label);
  expect(labels).toContain('Sekolah & kelas (baca saja)');
  for (const label of ['Pengguna', 'Kelas', 'Daftar Admin', 'Undangan', 'Riwayat aktivitas'])
    expect(labels).not.toContain(label);
  expect(activeAdminHref('/admin/content?view=audit', content)).toBeUndefined();
});

it('keeps multiple parents open, allows closing the active parent, and opens a new destination', () => {
  const { result, rerender, unmount } = renderHook(
    ({ route }) => {
      const groups = adminNavigation(profile);
      return useAdminNavigation(profile, groups, activeAdminHref(route, groups), route);
    },
    { initialProps: { route: '/admin/content' } },
  );
  expect(result.current.openIds).toEqual(['bank']);
  act(() => result.current.toggle('review'));
  expect(result.current.openIds).toEqual(['bank', 'review']);
  act(() => result.current.toggle('bank'));
  expect(result.current.openIds).toEqual(['review']);
  rerender({ route: '/admin/content' });
  expect(result.current.openIds).toEqual(['review']);
  rerender({ route: '/admin/assessments?type=DRILL' });
  expect(result.current.openIds).toEqual(['review', 'assessments']);
  unmount();
  const restored = renderHook(() =>
    useAdminNavigation(profile, adminNavigation(profile), undefined, '/admin/analytics'),
  );
  expect(restored.result.current.openIds).toEqual(['review', 'assessments']);
});

it('isolates account and assignment preferences and clears the active account on logout', () => {
  const { result, rerender } = renderHook(
    ({ account }) =>
      useAdminNavigation(account, adminNavigation(account), undefined, '/admin/analytics'),
    { initialProps: { account: profile as IdentityProfile | null } },
  );
  act(() => result.current.toggle('review'));
  rerender({ account: { ...profile, id: 'another-test-only' } });
  expect(result.current.openIds).toEqual([]);
  rerender({ account: { ...profile, adminRole: 'CONTENT_DATA_MODERATION' } });
  expect(result.current.openIds).toEqual([]);
  rerender({ account: null });
  expect(result.current.openIds).toEqual([]);
  rerender({ account: profile });
  expect(result.current.openIds).toEqual(['review']);
  act(() => result.current.clear());
  expect(sessionStorage.getItem(adminNavigationStorageKey(profile)!)).toBeNull();
  expect(result.current.openIds).toEqual([]);
  expect(
    adminNavigationStorageKey({ ...profile, capabilities: [...profile.capabilities!].reverse() }),
  ).toBe(adminNavigationStorageKey(profile));
});

it('falls back to memory across remounts when browser storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const account = { ...profile, id: 'storage-denied-test-only' };
  const hook = () =>
    useAdminNavigation(account, adminNavigation(account), undefined, '/admin/analytics');
  const first = renderHook(hook);
  act(() => first.result.current.toggle('bank'));
  first.unmount();
  const second = renderHook(hook);
  expect(second.result.current.openIds).toEqual(['bank']);
  act(() => second.result.current.clear());
  expect(second.result.current.openIds).toEqual([]);
});

it('ignores malformed or unauthorized saved parent IDs', () => {
  const key = adminNavigationStorageKey(profile)!;
  sessionStorage.setItem(key, '["unknown", "review"]');
  const first = renderHook(() =>
    useAdminNavigation(profile, adminNavigation(profile), undefined, '/admin/analytics'),
  );
  expect(first.result.current.openIds).toEqual(['review']);
  first.unmount();
  sessionStorage.setItem(key, '{invalid');
  const second = renderHook(() =>
    useAdminNavigation(profile, adminNavigation(profile), undefined, '/admin/analytics'),
  );
  expect(second.result.current.openIds.every((id) => id === 'review')).toBe(true);
});

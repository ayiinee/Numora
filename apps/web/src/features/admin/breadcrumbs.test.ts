import { describe, expect, it } from 'vitest';
import { adminBreadcrumbs } from './breadcrumbs';
import type { AdminNavigationGroup } from './navigation';
const groups: AdminNavigationGroup[] = [
  {
    id: 'content',
    label: 'Konten',
    items: [
      {
        id: 'assessments',
        label: 'Paket asesmen',
        icon: 'target',
        children: [
          { label: 'Pretest', href: '/admin/assessments/pretest' },
          { label: 'Drill', href: '/admin/assessments/drill' },
          { label: 'Tryout', href: '/admin/assessments/tryout' },
        ],
      },
      {
        id: 'bank',
        label: 'Bank konten',
        icon: 'book',
        children: [{ label: 'Soal', href: '/admin/content?view=questions' }],
      },
    ],
  },
];
describe('admin breadcrumbs', () => {
  it('links ancestors and retains list context without leaking unknown query parameters', () => {
    expect(
      adminBreadcrumbs(
        '/admin/assessments/pretest/test-id',
        'search=Bab&offset=5&status=DRAFT&secret=ignored',
        groups,
      ),
    ).toEqual([
      { label: 'Ruang admin', href: '/admin' },
      { label: 'Pretest', href: '/admin/assessments/pretest?search=Bab&status=DRAFT&offset=5' },
      { label: 'Detail paket' },
    ]);
  });
  it('distinguishes add, list and deep question routes', () => {
    expect(adminBreadcrumbs('/admin/assessments/drill/new', '', groups).at(-1)).toEqual({
      label: 'Tambah paket',
    });
    expect(adminBreadcrumbs('/admin/assessments/tryout', '', groups).at(-1)).toEqual({
      label: 'Tryout',
    });
    expect(adminBreadcrumbs('/admin/content/versions/id', '', groups).slice(1)).toEqual([
      { label: 'Soal', href: '/admin/content?view=questions' },
      { label: 'Tinjau soal' },
    ]);
  });
  it('keeps root current and does not expose capability-filtered menu parents', () => {
    expect(adminBreadcrumbs('/admin', '', groups)).toEqual([{ label: 'Ruang admin' }]);
    expect(adminBreadcrumbs('/admin/assessments/pretest/id', '', [], 'Akses ditolak')).toEqual([
      { label: 'Ruang admin', href: '/admin' },
      { label: 'Akses ditolak' },
    ]);
  });
});

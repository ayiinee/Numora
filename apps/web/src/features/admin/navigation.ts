import type { IconName } from '@tka/ui';
import type { IdentityProfile } from '@/lib/api';
import { adminCanAccess, adminCanReadAnalytics } from './admin-access';

export function adminRoleLabel(role: IdentityProfile['adminRole']) {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'OPERATIONS':
      return 'Admin Operasional';
    case 'CONTENT_DATA_MODERATION':
      return 'Admin Content, Data & Moderation';
    default:
      return 'Admin tanpa assignment';
  }
}

export type AdminNavigationLink = { href: string; label: string };
export type AdminNavigationItem = { id: string; label: string; icon: IconName } & (
  { href: string; children?: never } | { children: AdminNavigationLink[]; href?: never }
);
export type AdminNavigationGroup = { id: string; label: string; items: AdminNavigationItem[] };

// Presentation only. Existing capabilities and API guards remain authoritative.
export function adminNavigation(profile: IdentityProfile | null): AdminNavigationGroup[] {
  if (profile?.role !== 'ADMIN' || profile.status !== 'ACTIVE' || !profile.adminRole) return [];
  const operations: AdminNavigationItem[] = [];
  if (adminCanAccess(profile, 'operations'))
    operations.push(
      { id: 'schools', label: 'Sekolah & verifikasi guru', href: '/admin/schools', icon: 'school' },
      {
        id: 'operations',
        label: 'Pengguna & kelas',
        icon: 'users',
        children: [
          { href: '/admin/operations?view=users', label: 'Pengguna' },
          { href: '/admin/operations?view=classes', label: 'Kelas' },
        ],
      },
    );
  if (
    profile.capabilities?.includes('OPERATIONS_LIMITED_READ') &&
    !profile.capabilities.includes('OPERATIONS_MANAGE')
  )
    operations.push({
      id: 'structures',
      label: 'Sekolah & kelas (baca saja)',
      href: '/admin/structures',
      icon: 'school',
    });
  if (adminCanAccess(profile, 'tryoutRead') && !adminCanAccess(profile, 'content'))
    operations.push({
      id: 'tryout',
      label: 'Batch Tryout',
      href: '/admin/tryout-batches',
      icon: 'target',
    });
  const content: AdminNavigationItem[] = adminCanAccess(profile, 'content')
    ? [
        {
          id: 'bank',
          label: 'Bank konten',
          icon: 'book',
          children: [
            { href: '/admin/content?view=questions', label: 'Soal' },
            { href: '/admin/content?view=curriculum', label: 'Struktur materi' },
            { href: '/admin/content?view=videos', label: 'Video' },
            { href: '/admin/content/imports', label: 'Tambah konten' },
          ],
        },
        {
          id: 'review',
          label: 'Review & laporan',
          icon: 'clipboard',
          children: [
            { href: '/admin/content?view=verification', label: 'Status review' },
            { href: '/admin/content?view=reports', label: 'Laporan masalah' },
            ...(profile.capabilities?.includes('AUDIT_READ')
              ? [{ href: '/admin/content?view=audit', label: 'Riwayat aktivitas' }]
              : []),
          ],
        },
        {
          id: 'assessments',
          label: 'Paket asesmen',
          icon: 'target',
          children: [
            { href: '/admin/assessments/pretest', label: 'Pretest' },
            { href: '/admin/assessments/drill', label: 'Drill' },
          ],
        },
        {
          id: 'tryout',
          label: 'Tryout',
          icon: 'target',
          children: [
            { href: '/admin/tryout-batches', label: 'Batch Tryout' },
            { href: '/admin/assessments/tryout', label: 'Bank paket Tryout' },
          ],
        },
        {
          id: 'results',
          label: 'Hasil Tryout',
          icon: 'chart-box',
          children: [
            { href: '/admin/irt?view=batches', label: 'Batch & rilis hasil' },
            { href: '/admin/irt?view=requests', label: 'Proses IRT' },
          ],
        },
      ]
    : [];
  const groups: AdminNavigationGroup[] = [
    {
      id: 'monitoring',
      label: 'Pemantauan',
      items: adminCanReadAnalytics(profile)
        ? [{ id: 'analytics', label: 'Dashboard', href: '/admin/analytics', icon: 'chart' }]
        : [],
    },
    { id: 'operations', label: 'Operasional', items: operations },
    { id: 'content', label: 'Konten & asesmen', items: content },
    {
      id: 'administration',
      label: 'Administrasi',
      items: adminCanAccess(profile, 'accounts')
        ? [
            {
              id: 'accounts',
              label: 'Akun Admin',
              icon: 'lock',
              children: [
                { href: '/admin/accounts?view=accounts', label: 'Daftar Admin' },
                { href: '/admin/accounts?view=invitations', label: 'Undangan' },
              ],
            },
          ]
        : [],
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

export function adminNavigationLinks(groups: AdminNavigationGroup[]): AdminNavigationLink[] {
  return groups.flatMap(({ items }) =>
    items.flatMap((item) => item.children ?? [{ href: item.href, label: item.label }]),
  );
}

/** Resolve canonical destinations first, then intersect with authorized links. */
export function activeAdminHref(pathname: string, groups: AdminNavigationGroup[], search = '') {
  const url = new URL(pathname, 'https://numora.local');
  const params = new URLSearchParams(search || url.search);
  const path = url.pathname.replace(/\/$/, '');
  let target: string | undefined;
  if (/^\/admin\/content\/(imports|generator|preview-sessions)(\/|$)/.test(path))
    target = '/admin/content/imports';
  else if (/^\/admin\/content\/versions\//.test(path)) target = '/admin/content?view=verification';
  else if (/^\/admin\/reports\/(QUESTION|VIDEO)\//.test(path))
    target = '/admin/content?view=reports';
  else if (path === '/admin/content/pretest') target = '/admin/assessments/pretest';
  else if (path === '/admin/content') {
    const view = params.get('view');
    const legacy: Record<string, string> = {
      packages: 'TRYOUT',
      drillPackages: 'DRILL',
      drill: 'DRILL',
      directedPackages: 'PRETEST',
    };
    target =
      view && legacy[view]
        ? `/admin/assessments/${legacy[view]!.toLowerCase()}`
        : view === 'irt'
          ? '/admin/irt?view=batches'
          : `/admin/content?view=${['curriculum', 'videos', 'verification', 'reports', 'audit'].includes(view ?? '') ? view : 'questions'}`;
  } else if (path === '/admin/assessments')
    target = `/admin/assessments/${['DRILL', 'TRYOUT'].includes(params.get('type') ?? '') ? params.get('type')!.toLowerCase() : 'pretest'}`;
  else if (path === '/admin/operations')
    target = `/admin/operations?view=${params.get('view') === 'classes' ? 'classes' : 'users'}`;
  else if (path === '/admin/accounts')
    target = `/admin/accounts?view=${params.get('view') === 'invitations' ? 'invitations' : 'accounts'}`;
  else if (path === '/admin/irt')
    target = `/admin/irt?view=${params.get('view') === 'requests' ? 'requests' : 'batches'}`;
  else
    target = adminNavigationLinks(groups).find(
      ({ href }) => !href.includes('?') && (path === href || path.startsWith(`${href}/`)),
    )?.href;
  return adminNavigationLinks(groups).find(({ href }) => href === target)?.href;
}

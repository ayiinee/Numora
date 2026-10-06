import type { IconName } from '@tka/ui';
import type { IdentityProfile } from '@/lib/api';

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

export type AdminNavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: IconName;
};

// Presentation only. API guards remain authoritative for each operation.
export function adminNavigation(profile: IdentityProfile | null): AdminNavigationItem[] {
  const items: AdminNavigationItem[] = [
    {
      href: '/admin',
      label: 'Ringkasan',
      description: 'Pilih modul sesuai akses akun.',
      icon: 'chart',
    },
  ];
  if (profile?.role !== 'ADMIN' || profile.status !== 'ACTIVE') return items;
  if (profile.capabilities?.includes('ADMIN_ACCOUNTS_MANAGE'))
    items.push({
      href: '/admin/accounts',
      label: 'Akun Admin',
      description: 'Invite internal dan kelola assignment serta status akun.',
      icon: 'users',
    });
  if (profile.capabilities?.includes('OPERATIONS_MANAGE')) {
    items.push(
      {
        href: '/admin/schools',
        label: 'Sekolah & credential',
        description: 'Kelola sekolah dan token verifikasi Guru.',
        icon: 'school',
      },
      {
        href: '/admin/operations',
        label: 'Pengguna & kelas',
        description: 'Lihat data operasional pengguna dan kelas.',
        icon: 'users',
      },
    );
  }
  if (
    profile.capabilities?.includes('OPERATIONS_LIMITED_READ') &&
    !profile.capabilities.includes('OPERATIONS_MANAGE')
  )
    items.push({
      href: '/admin/structures',
      label: 'Struktur sekolah & kelas',
      description: 'Lihat struktur serta aggregate anggota tanpa data individual.',
      icon: 'school',
    });
  if (profile.capabilities?.includes('CONTENT_MANAGE')) {
    items.push(
      {
        href: '/admin/content',
        label: 'Konten & assessment',
        description: 'Kelola kurikulum, soal, paket, video, laporan, IRT, dan riwayat.',
        icon: 'book',
      },
      {
        href: '/admin/content/pretest',
        label: 'Pretest authoring',
        description: 'Draf, review, dan versi paket sebelum consumer Student tersedia.',
        icon: 'book',
      },
      {
        href: '/admin/content/imports',
        label: 'Impor JSON',
        description: 'Validasi JSON, impor DRAFT, lalu tinjau soal dalam sesi internal.',
        icon: 'clipboard',
      },
    );
  }
  return items;
}

export function activeAdminHref(pathname: string, items: AdminNavigationItem[]) {
  return items
    .filter(
      ({ href }) => pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`)),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

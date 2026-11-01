'use client';

import Link from 'next/link';
import { Icon } from '@tka/ui';
import type { IdentityProfile } from '@/lib/api';
import { adminRoleLabel, type AdminNavigationItem } from '@/features/admin/navigation';

const sections = [
  { key: 'overview', label: null },
  { key: 'administration', label: 'Administrasi' },
  { key: 'content', label: 'Konten & publikasi' },
] as const;

function sectionFor(href: string) {
  if (href === '/admin/analytics') return 'overview';
  return href.startsWith('/admin/content') || href === '/admin/irt' ? 'content' : 'administration';
}

/** Present the already-authorized links; capability decisions stay in adminNavigation. */
export function AdminNavigation({
  items,
  activeHref,
  onNavigate,
  mobile = false,
}: {
  items: AdminNavigationItem[];
  activeHref: string | undefined;
  onNavigate: () => void;
  mobile?: boolean;
}) {
  const orderedSections = [...sections].sort(
    (a, b) =>
      items.findIndex((item) => sectionFor(item.href) === a.key) -
      items.findIndex((item) => sectionFor(item.href) === b.key),
  );
  return (
    <nav
      id={mobile ? 'mobile-menu' : undefined}
      className="admin-navigation"
      aria-label={mobile ? 'Menu navigasi' : 'Navigasi Ruang admin'}
    >
      {items.length === 0 && (
        <p className="admin-navigation-empty">Belum ada menu yang tersedia.</p>
      )}
      {orderedSections.map((section) => {
        const links = items.filter((item) => sectionFor(item.href) === section.key);
        if (links.length === 0) return null;
        return (
          <div
            key={section.key}
            className="admin-navigation-group"
            role="group"
            aria-label={section.label ?? 'Pemantauan'}
          >
            {section.label && <p className="admin-navigation-heading">{section.label}</p>}
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.href === activeHref ? 'page' : undefined}
                onClick={onNavigate}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

export function AdminAccount({ profile }: { profile: IdentityProfile | null }) {
  return (
    <div className="sidebar-account admin-sidebar-account">
      <span className="account-avatar" aria-hidden="true">
        {profile?.displayName.slice(0, 1).toUpperCase() || 'N'}
      </span>
      <div>
        <strong>{profile?.displayName || 'NUMORA'}</strong>
        <small>{profile ? adminRoleLabel(profile.adminRole) : 'Ruang admin'}</small>
      </div>
    </div>
  );
}

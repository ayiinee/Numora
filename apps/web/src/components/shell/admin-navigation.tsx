'use client';

import Link from 'next/link';
import { useId } from 'react';
import { Icon } from '@tka/ui';
import type { IdentityProfile } from '@/lib/api';
import { adminRoleLabel, type AdminNavigationGroup } from '@/features/admin/navigation';

/** Present the already-authorized links; capability decisions stay in adminNavigation. */
export function AdminNavigation({
  items,
  activeHref,
  openIds,
  onToggle,
  onNavigate,
  mobile = false,
}: {
  items: AdminNavigationGroup[];
  activeHref: string | undefined;
  openIds: string[];
  onToggle: (id: string) => void;
  onNavigate: () => void;
  mobile?: boolean;
}) {
  const id = useId();
  return (
    <nav
      id={mobile ? 'mobile-menu' : undefined}
      className="admin-navigation"
      aria-label={mobile ? 'Menu navigasi' : 'Navigasi Ruang admin'}
    >
      {items.length === 0 && (
        <p className="admin-navigation-empty">Belum ada menu yang tersedia.</p>
      )}
      {items.map((section) => {
        return (
          <div
            key={section.id}
            className="admin-navigation-group"
            role="group"
            aria-label={section.label}
          >
            {section.label && <p className="admin-navigation-heading">{section.label}</p>}
            {section.items.map((item) =>
              item.children ? (
                <div key={item.id} className="admin-navigation-branch">
                  <button
                    type="button"
                    className="admin-navigation-parent"
                    aria-expanded={openIds.includes(item.id)}
                    aria-controls={`${id}-${item.id}`}
                    data-active={
                      item.children.some((child) => child.href === activeHref) || undefined
                    }
                    onClick={() => onToggle(item.id)}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    <Icon name="chevron" className="admin-navigation-chevron" />
                  </button>
                  <div
                    id={`${id}-${item.id}`}
                    className="admin-navigation-submenu"
                    hidden={!openIds.includes(item.id)}
                  >
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        aria-current={child.href === activeHref ? 'page' : undefined}
                        onClick={onNavigate}
                      >
                        <span>{child.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.href === activeHref ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              ),
            )}
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

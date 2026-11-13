'use client';

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BottomNav, Brand, Dialog, Icon, TopBar, type IconName, type TopBarProps } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { activeAdminHref, adminNavigation } from '@/features/admin/navigation';
import { adminBreadcrumbs } from '@/features/admin/breadcrumbs';
import { useAdminNavigation } from '@/features/admin/use-admin-navigation';
import { AdminAccount, AdminNavigation } from './admin-navigation';

type Area = 'student' | 'teacher' | 'admin';
type NavigationItem = { href: string; label: string; icon: IconName; sidebarIcon?: IconName };
const ADMIN_SIDEBAR_STORAGE_KEY = 'numora:admin-sidebar-collapsed';
const studentPrimaryNavigation: NavigationItem[] = [
  { href: '/student', label: 'Belajar', icon: 'graduation' },
  { href: '/student/learn', label: 'Latihan', icon: 'book' },
  { href: '/student/tryout', label: 'Tryout', icon: 'clipboard', sidebarIcon: 'clock' },
  { href: '/student/pvp', label: 'PvP', icon: 'gamepad' },
];
const studentProfile: NavigationItem = { href: '/student/profile', label: 'Profil', icon: 'user' };
const studentBottomNavigation = [...studentPrimaryNavigation, studentProfile];
const navigation: Record<Area, NavigationItem[]> = {
  student: [
    ...studentPrimaryNavigation,
    { href: '/student/assessment', label: 'Progres', icon: 'chart' },
    { href: '/student/leaderboards', label: 'Peringkat', icon: 'trophy' },
    { href: '/student/notifications', label: 'Notifikasi', icon: 'bell' },
    { href: '/student/feedback', label: 'Feedback dari Guru', icon: 'chat' },
    studentProfile,
  ],
  teacher: [
    { href: '/teacher', label: 'Kelas saya', icon: 'users' },
    { href: '/teacher/profile', label: 'Profil', icon: 'user' },
  ],
  admin: [],
};

type AppShellProps = {
  area?: Area;
  title?: string;
  subtitle?: string | undefined;
  children: ReactNode;
  backHref?: string | undefined;
  focus?: boolean | undefined;
  actions?: ReactNode;
  headerVariant?: TopBarProps['variant'];
  mobileHeader?: ReactNode;
  showTopbarProfile?: boolean;
  className?: string;
};

export function AppShell(props: AppShellProps) {
  return props.area === 'admin' ? (
    <Suspense fallback={null}>
      <AdminShell {...props} />
    </Suspense>
  ) : (
    <Shell {...props} />
  );
}

function AdminShell(props: AppShellProps) {
  const search = useSearchParams().toString();
  // Notify URL-backed panels after Next Link navigation as well as native history updates.
  useEffect(() => {
    window.dispatchEvent(new Event('numora-admin-url'));
  }, [search]);
  return <Shell {...props} adminSearch={search} />;
}

function Shell({
  area = 'student',
  title,
  subtitle,
  children,
  backHref,
  focus = false,
  actions,
  headerVariant,
  mobileHeader,
  className = '',
  adminSearch = '',
  showTopbarProfile = true,
}: AppShellProps & { adminSearch?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarOpenButton = useRef<HTMLButtonElement>(null);
  const sidebarCloseButton = useRef<HTMLButtonElement>(null);
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const profile = state.status === 'ready' ? state.profile : null;
  const isStudent = area === 'student';
  const isAdmin = area === 'admin';
  const adminItems = adminNavigation(profile);
  const adminActive = activeAdminHref(pathname, adminItems, adminSearch);
  const dropdowns = useAdminNavigation(
    isAdmin ? profile : null,
    adminItems,
    adminActive,
    `${pathname}?${adminSearch}`,
  );
  const areaName =
    area === 'student' ? 'Ruang belajar' : area === 'teacher' ? 'Ruang guru' : 'Ruang admin';
  useEffect(() => {
    if (!isAdmin) return;
    try {
      setSidebarCollapsed(sessionStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY) === 'true');
    } catch {
      // The sidebar still works when browser storage is unavailable.
    }
  }, [isAdmin]);
  function toggleSidebar(collapsed: boolean) {
    setSidebarCollapsed(collapsed);
    try {
      sessionStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // Keep the in-memory preference when browser storage is unavailable.
    }
    requestAnimationFrame(() => {
      (collapsed ? sidebarOpenButton : sidebarCloseButton).current?.focus();
    });
  }
  useEffect(() => {
    if (!isAdmin || !menuOpen) return;
    const desktop = window.matchMedia('(min-width: 960px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, [isAdmin, menuOpen]);
  const active = (href: string) =>
    area === 'admin'
      ? href === adminActive
      : href === `/${area}`
        ? pathname === href || (area === 'teacher' && pathname.startsWith('/teacher/classes/'))
        : pathname === href ||
          pathname.startsWith(`${href}/`) ||
          (href === '/student/learn' && pathname.startsWith('/student/drill/'));
  const links = (sidebar = false) =>
    navigation[area].map((item) => (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active(item.href) ? 'page' : undefined}
        onClick={() => setMenuOpen(false)}
      >
        <Icon name={(sidebar && item.sidebarIcon) || item.icon} />
        <span>{item.label}</span>
        {active(item.href) && <span className="nav-active-dot" />}
      </Link>
    ));
  return (
    <div
      className={`app-shell app-shell--${area}${focus ? ' app-shell--focus' : ''} ${className}`}
      data-sidebar-collapsed={isAdmin && sidebarCollapsed ? 'true' : undefined}
    >
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      {!focus && (
        <aside
          id={isAdmin ? 'admin-sidebar' : undefined}
          className="app-sidebar"
          hidden={isAdmin && sidebarCollapsed}
        >
          {isAdmin ? (
            <div className="admin-sidebar-heading">
              <Link href="/admin" className="app-brand">
                <Brand />
              </Link>
              <button
                ref={sidebarCloseButton}
                type="button"
                className="admin-sidebar-toggle"
                aria-label="Tutup sidebar"
                aria-controls="admin-sidebar"
                aria-expanded={!sidebarCollapsed}
                title="Tutup sidebar"
                onClick={() => toggleSidebar(true)}
              >
                <Icon name="back" />
              </button>
            </div>
          ) : (
            <Link href={`/${area}`} className="app-brand">
              <Brand />
            </Link>
          )}
          {isAdmin ? (
            <AdminNavigation
              items={adminItems}
              activeHref={adminActive}
              openIds={dropdowns.openIds}
              onToggle={dropdowns.toggle}
              onNavigate={() => setMenuOpen(false)}
            />
          ) : (
            <>
              <p className="nav-caption">{areaName}</p>
              <nav aria-label={`Navigasi ${areaName}`}>{links(true)}</nav>
            </>
          )}
          {isAdmin ? (
            <AdminAccount profile={profile} />
          ) : (
            <div className="sidebar-account">
              <span className="account-avatar">
                {profile?.displayName.slice(0, 1).toUpperCase() || 'N'}
              </span>
              <div>
                <strong>{profile?.displayName || 'NUMORA'}</strong>
                <small>
                  {area === 'student'
                    ? profile?.studentAffiliation === 'SCHOOL'
                      ? 'Siswa sekolah'
                      : 'Siswa mandiri'
                    : areaName}
                </small>
              </div>
            </div>
          )}
        </aside>
      )}
      <div className="app-workspace">
        {mobileHeader && <header className="app-mobile-header">{mobileHeader}</header>}
        <TopBar
          className={`app-topbar${mobileHeader ? ' app-topbar--custom-mobile' : ''}`}
          variant={headerVariant ?? (focus ? 'assessment' : 'context')}
          logo={
            <>
              {isAdmin && (
                <button
                  ref={sidebarOpenButton}
                  type="button"
                  className="admin-sidebar-toggle admin-sidebar-open"
                  aria-label="Buka sidebar"
                  aria-controls="admin-sidebar"
                  aria-expanded={!sidebarCollapsed}
                  title="Buka sidebar"
                  onClick={() => toggleSidebar(false)}
                >
                  <Icon name="menu" />
                </button>
              )}
              {isAdmin && (
                <button
                  ref={menuButton}
                  type="button"
                  className="menu-toggle admin-menu-toggle"
                  aria-label="Menu navigasi"
                  aria-haspopup="dialog"
                  aria-expanded={menuOpen}
                  aria-controls="mobile-menu"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <Icon name={menuOpen ? 'close' : 'menu'} />
                </button>
              )}
              <Link className="mobile-brand" href={`/${area}`}>
                <Brand />
              </Link>
              {isAdmin ? (
                <nav aria-label="Breadcrumb" className="admin-navbar-breadcrumb">
                  <ol>
                    {adminBreadcrumbs(pathname, adminSearch, adminItems, title).map(
                      (crumb, index) => (
                        <li key={index}>
                          {index > 0 && <span aria-hidden="true">/</span>}
                          {crumb.href ? (
                            <Link href={crumb.href}>{crumb.label}</Link>
                          ) : (
                            <span aria-current="page">{crumb.label}</span>
                          )}
                        </li>
                      ),
                    )}
                  </ol>
                </nav>
              ) : isStudent ? (
                !mobileHeader && (
                  <div className="student-desktop-heading">
                    {backHref && (
                      <Link href={backHref} className="materials-header__back" aria-label="Kembali">
                        <Icon name="back" />
                      </Link>
                    )}
                    <div>
                      <h1>
                        {title ||
                          navigation.student.find((item) => active(item.href))?.label ||
                          'Belajar'}
                      </h1>
                      {subtitle && <p>{subtitle}</p>}
                    </div>
                  </div>
                )
              ) : (
                <span className="desktop-context">
                  {areaName}
                  <span>/</span>
                  {title || navigation[area].find((item) => active(item.href))?.label || 'Beranda'}
                </span>
              )}
            </>
          }
          right={
            <div className="topbar-actions">
              {actions}
              {area !== 'admin' ? (
                showTopbarProfile && (
                  <Link href={`/${area}/profile`} className="account-link" aria-label="Buka profil">
                    <span className="account-avatar">
                      {profile?.displayName.slice(0, 1).toUpperCase() || 'N'}
                    </span>
                    <span className="account-name">{profile?.displayName || 'Profil'}</span>
                  </Link>
                )
              ) : (
                <button
                  className="text-button"
                  disabled={loggingOut}
                  onClick={async () => {
                    setLoggingOut(true);
                    try {
                      setLogoutError('');
                      await logout();
                      dropdowns.clear();
                      router.replace(area === 'admin' ? '/admin-numora' : '/login');
                    } catch {
                      setLogoutError('Belum dapat keluar. Coba lagi.');
                      setLoggingOut(false);
                    }
                  }}
                >
                  <Icon name="logout" /> {loggingOut ? 'Keluar…' : 'Keluar'}
                </button>
              )}
              {area === 'teacher' && (
                <button
                  ref={menuButton}
                  type="button"
                  className="menu-toggle"
                  aria-label="Menu navigasi"
                  aria-expanded={menuOpen}
                  aria-controls="mobile-menu"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <Icon name={menuOpen ? 'close' : 'menu'} />
                </button>
              )}
            </div>
          }
        />
        {menuOpen && isAdmin ? (
          <Dialog
            open
            onClose={() => setMenuOpen(false)}
            title="Menu admin"
            className="admin-navigation-drawer"
            actions={<AdminAccount profile={profile} />}
          >
            <AdminNavigation
              items={adminItems}
              activeHref={adminActive}
              openIds={dropdowns.openIds}
              onToggle={dropdowns.toggle}
              onNavigate={() => setMenuOpen(false)}
              mobile
            />
          </Dialog>
        ) : (
          menuOpen && (
            <nav
              id="mobile-menu"
              className="mobile-menu"
              aria-label="Menu navigasi"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setMenuOpen(false);
                  menuButton.current?.focus();
                }
              }}
            >
              {links()}
            </nav>
          )
        )}
        <main id="main-content" className="app-content" tabIndex={-1}>
          {logoutError && (
            <p role="alert" className="form-error">
              {logoutError}
            </p>
          )}
          {(title || backHref) && (
            <div className="page-heading">
              {backHref && (
                <Link href={backHref} className="back-link">
                  <Icon name="back" />
                  Kembali
                </Link>
              )}
              {title && <h1>{title}</h1>}
              {subtitle && <p>{subtitle}</p>}
            </div>
          )}
          {children}
        </main>
        {!focus && (
          <footer className="app-footer">
            NUMORA <span>Belajar matematika, selangkah lebih paham.</span>
          </footer>
        )}
      </div>
      {area === 'student' && !focus && (
        <BottomNav
          className="student-bottom-nav"
          pathname={pathname}
          items={studentBottomNavigation.map((item) => ({
            ...item,
            icon: <Icon name={item.icon} />,
            active: active(item.href),
          }))}
          renderLink={({ href, children, 'aria-current': current }) => (
            <Link href={href} aria-current={current} onClick={() => setMenuOpen(false)}>
              {children}
            </Link>
          )}
        />
      )}
    </div>
  );
}

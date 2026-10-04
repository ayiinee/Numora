'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNav, Brand, Icon, TopBar, type IconName, type TopBarProps } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';

type Area = 'student' | 'teacher' | 'admin';
const navigation: Record<Area, { href: string; label: string; icon: IconName }[]> = {
  student: [
    { href: '/student', label: 'Belajar', icon: 'graduation' },
    { href: '/student/learn', label: 'Materi', icon: 'book' },
    { href: '/student/tryout', label: 'Tryout', icon: 'clipboard' },
    { href: '/student/pvp', label: 'PvP', icon: 'gamepad' },
    { href: '/student/profile', label: 'Profil', icon: 'user' },
    { href: '/student/assessment', label: 'Progres', icon: 'chart' },
    { href: '/student/leaderboards', label: 'Peringkat', icon: 'chart' },
    { href: '/student/feedback', label: 'Catatan Guru', icon: 'chat' },
  ],
  teacher: [
    { href: '/teacher', label: 'Kelas saya', icon: 'users' },
    { href: '/teacher/profile', label: 'Profil', icon: 'user' },
  ],
  admin: [
    { href: '/admin/schools', label: 'Sekolah & token', icon: 'school' },
    { href: '/admin/content', label: 'Konten & operasional', icon: 'book' },
    { href: '/admin/content/imports', label: 'Impor & preview', icon: 'clipboard' },
  ],
};

export function AppShell({
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
}: {
  area?: Area;
  title?: string;
  subtitle?: string | undefined;
  children: ReactNode;
  backHref?: string | undefined;
  focus?: boolean | undefined;
  actions?: ReactNode;
  headerVariant?: TopBarProps['variant'];
  mobileHeader?: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const profile = state.status === 'ready' ? state.profile : null;
  const areaName =
    area === 'student' ? 'Ruang belajar' : area === 'teacher' ? 'Ruang guru' : 'Ruang admin';
  const active = (href: string) =>
    href === `/${area}`
      ? pathname === href || (area === 'teacher' && pathname.startsWith('/teacher/classes/'))
      : pathname === href ||
        pathname.startsWith(`${href}/`) ||
        (href === '/student/learn' && pathname.startsWith('/student/drill/'));
  const links = (mobile = false) =>
    (mobile && area === 'student' ? navigation.student.slice(0, 5) : navigation[area])
      .filter(
        (item) =>
          !item.href.startsWith('/admin/content') ||
          profile?.capabilities?.includes('CONTENT_MANAGE'),
      )
      .map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active(item.href) ? 'page' : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
          {!mobile && active(item.href) && <span className="nav-active-dot" />}
        </Link>
      ));
  return (
    <div className={`app-shell app-shell--${area}${focus ? ' app-shell--focus' : ''} ${className}`}>
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      {!focus && (
        <aside className="app-sidebar">
          <Link href={`/${area}`} className="app-brand">
            <Brand />
          </Link>
          <p className="nav-caption">{areaName}</p>
          <nav aria-label={`Navigasi ${areaName}`}>{links()}</nav>
          {area === 'student' && (
            <div className="sidebar-note">
              <Icon name="spark" />
              <strong>
                Langkah kecil,
                <br />
                kemajuan berarti.
              </strong>
              <p>Temukan ritme belajarmu bersama NUMORA.</p>
            </div>
          )}
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
        </aside>
      )}
      <div className="app-workspace">
        {mobileHeader && <header className="app-mobile-header">{mobileHeader}</header>}
        <TopBar
          className={`app-topbar${mobileHeader ? ' app-topbar--custom-mobile' : ''}`}
          variant={headerVariant ?? (focus ? 'assessment' : 'context')}
          logo={
            <>
              <Link className="mobile-brand" href={`/${area}`}>
                <Brand />
              </Link>
              <span className="desktop-context">
                {areaName}
                <span>/</span>
                {title || navigation[area].find((item) => active(item.href))?.label || 'Beranda'}
              </span>
            </>
          }
          right={
            <div className="topbar-actions">
              {actions}
              {area !== 'admin' ? (
                <Link href={`/${area}/profile`} className="account-link" aria-label="Buka profil">
                  <span className="account-avatar">
                    {profile?.displayName.slice(0, 1).toUpperCase() || 'N'}
                  </span>
                  <span className="account-name">{profile?.displayName || 'Profil'}</span>
                </Link>
              ) : (
                <button
                  className="text-button"
                  disabled={loggingOut}
                  onClick={async () => {
                    setLoggingOut(true);
                    try {
                      setLogoutError('');
                      await logout();
                      router.replace('/');
                    } catch {
                      setLogoutError('Belum dapat keluar. Coba lagi.');
                      setLoggingOut(false);
                    }
                  }}
                >
                  <Icon name="logout" /> {loggingOut ? 'Keluar…' : 'Keluar'}
                </button>
              )}
              {area !== 'student' && (
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
        {menuOpen && (
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
          items={navigation.student.slice(0, 5).map((item) => ({
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

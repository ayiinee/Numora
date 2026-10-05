import Link from 'next/link';
import { BottomNav, Icon, type IconName } from '@tka/ui';

// Availability is presentation-only. Every real destination retains TeacherGate/API authorization.
const destinations: { label: string; icon: IconName; href: string }[] = [
  { label: 'Kelas', icon: 'graduation', href: '/teacher' },
  { label: 'Monitoring', icon: 'chart', href: '/teacher/monitoring' },
  { label: 'Feedback', icon: 'chat', href: '/teacher/feedback' },
  { label: 'Profil', icon: 'user', href: '/teacher/profile' },
];

function active(pathname: string, href: string) {
  return href === '/teacher'
    ? pathname === href || pathname.startsWith('/teacher/classes/')
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function TeacherBottomNavigation({ pathname }: { pathname: string }) {
  return (
    <BottomNav
      className="teacher-bottom-nav"
      pathname={pathname}
      items={destinations.map((item) => ({
        label: item.label,
        href: item.href,
        icon: <Icon name={item.icon} />,
        active: active(pathname, item.href),
      }))}
      renderLink={({ children, 'aria-current': current }, item) => (
        <Link href={item.href} aria-current={current}>
          {children}
        </Link>
      )}
    />
  );
}

export function TeacherDesktopNavigation({ pathname }: { pathname: string }) {
  const classHref = pathname.match(/^\/teacher\/classes\/[^/]+/)?.[0];
  const items = [
    {
      label: 'Beranda',
      icon: 'home' as const,
      href: '/teacher',
      selected: pathname === '/teacher',
    },
    {
      label: 'Detail Kelas',
      icon: 'users' as const,
      href: classHref,
      selected: Boolean(classHref),
    },
    {
      label: 'Monitoring Akademik',
      icon: 'chart' as const,
      href: '/teacher/monitoring',
      selected: active(pathname, '/teacher/monitoring'),
    },
    {
      label: 'Feedback',
      icon: 'chat' as const,
      href: '/teacher/feedback',
      selected: active(pathname, '/teacher/feedback'),
    },
    {
      label: 'Pusat Notifikasi',
      icon: 'bell' as const,
      href: '/teacher/notifications',
      selected: active(pathname, '/teacher/notifications'),
    },
    {
      label: 'Profil & Pengaturan',
      icon: 'settings' as const,
      href: '/teacher/profile',
      selected: active(pathname, '/teacher/profile'),
    },
  ];
  return (
    <nav className="teacher-sidebar__nav" aria-label="Navigasi desktop guru">
      {items.map((item) =>
        item.href ? (
          <Link key={item.label} href={item.href} aria-current={item.selected ? 'page' : undefined}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ) : (
          <button
            key={item.label}
            type="button"
            disabled
            aria-label={`${item.label} — ${item.label === 'Detail Kelas' ? 'Pilih kelas terlebih dahulu' : 'Belum tersedia'}`}
          >
            <Icon name={item.icon} />
            <span>
              {item.label}
              <small>
                {item.label === 'Detail Kelas' ? 'Pilih kelas terlebih dahulu' : 'Belum tersedia'}
              </small>
            </span>
          </button>
        ),
      )}
    </nav>
  );
}

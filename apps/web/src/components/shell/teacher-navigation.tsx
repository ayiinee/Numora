import Link from 'next/link';
import { BottomNav, Icon, type IconName } from '@tka/ui';

const destinations: { label: string; icon: IconName; href: string }[] = [
  { label: 'Kelas', icon: 'graduation', href: '/teacher' },
  { label: 'Profil', icon: 'user', href: '/teacher/profile' },
];

function active(pathname: string, href: string) {
  return href === '/teacher'
    ? pathname === href ||
        pathname.startsWith('/teacher/classes/') ||
        pathname === '/teacher/feedback'
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function TeacherBottomNavigation({ pathname }: { pathname: string }) {
  return (
    <BottomNav
      className="teacher-bottom-nav"
      pathname={pathname}
      items={destinations.map((item) => ({
        ...item,
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
  return (
    <nav className="teacher-sidebar__nav" aria-label="Navigasi desktop guru">
      {destinations.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active(pathname, item.href) ? 'page' : undefined}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

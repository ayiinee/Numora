'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, Badge, Brand, Button, Icon } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { TeacherHeader } from './teacher-header';
import { TeacherBottomNavigation, TeacherDesktopNavigation } from './teacher-navigation';
export function TeacherShell({
  title,
  description,
  teacherName,
  backHref,
  actions,
  children,
}: {
  title: string;
  description?: string | undefined;
  teacherName: string;
  backHref?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { state, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const profile =
    state.status === 'ready' && state.profile.role === 'TEACHER' ? state.profile : null;
  const available = Boolean(profile?.teacherVerified);
  const name = profile?.displayName || teacherName;

  async function signOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
      router.replace('/');
    } catch {
      setLogoutError('Belum dapat keluar. Coba lagi.');
      setLoggingOut(false);
    }
  }

  return (
    <div
      className={`teacher-redesign-shell teacher-shell${available ? '' : ' teacher-shell--gated'}`}
    >
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      {available && (
        <aside className="teacher-sidebar" aria-label="Ruang guru">
          <Link href="/teacher" className="teacher-sidebar__brand" aria-label="NUMORA beranda guru">
            <Brand />
            <Badge variant="primary">Guru</Badge>
          </Link>
          <div className="teacher-sidebar__identity">
            <div className="teacher-sidebar__person">
              <Avatar name={name} />
              <strong>{name}</strong>
            </div>
            <Badge variant="success">
              <Icon name="check" width={14} height={14} /> Guru terverifikasi
            </Badge>
          </div>
          <p className="teacher-sidebar__caption">Menu pembelajaran</p>
          <TeacherDesktopNavigation pathname={pathname} />
          <div className="teacher-sidebar__account">
            <p>
              <Icon name="school" width={18} height={18} /> Ruang guru NUMORA
            </p>
            <small>Kelas dan perkembangan siswa Anda.</small>
            <Button
              variant="ghost"
              fullWidth
              loading={loggingOut}
              onClick={() => void signOut()}
              leftIcon={<Icon name="logout" width={18} height={18} />}
            >
              {loggingOut ? 'Keluar…' : 'Keluar akun'}
            </Button>
          </div>
        </aside>
      )}
      <div className="teacher-shell__workspace">
        <TeacherHeader
          title={title}
          name={name}
          verified={available}
          backHref={backHref}
          actions={actions}
        />
        <main id="main-content" className="app-content teacher-shell__content" tabIndex={-1}>
          {logoutError && (
            <p className="form-error" role="alert">
              {logoutError}
            </p>
          )}
          <div className="page-heading">
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {children}
        </main>
      </div>
      {available && <TeacherBottomNavigation pathname={pathname} />}
    </div>
  );
}

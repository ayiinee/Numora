'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand, Button, Icon } from '@tka/ui';
import { OwnAvatar as Avatar } from '@/features/onboarding/user-avatar';
import { useAuth } from '@/features/onboarding/auth';
import { useTeacherSignOut } from '@/features/onboarding/teacher-session';
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
  const { state } = useAuth();
  const pathname = usePathname();
  const { busy: loggingOut, error: logoutError, signOut } = useTeacherSignOut();
  const profile =
    state.status === 'ready' && state.profile.role === 'TEACHER' ? state.profile : null;
  const available = Boolean(profile?.teacherVerified);
  const name = profile?.displayName || teacherName;

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
          </Link>
          <p className="teacher-sidebar__caption">Ruang guru</p>
          <TeacherDesktopNavigation pathname={pathname} />
          <div className="teacher-sidebar__account">
            <div className="teacher-sidebar__account-person">
              <Avatar name={name} />
              <strong>{name}</strong>
            </div>
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
          showIdentity={pathname === '/teacher'}
        />
        <main id="main-content" className="app-content teacher-shell__content" tabIndex={-1}>
          {logoutError && (
            <p className="form-error" role="alert">
              {logoutError}
            </p>
          )}
          {description && <p className="teacher-page-description">{description}</p>}
          {children}
        </main>
      </div>
      {available && <TeacherBottomNavigation pathname={pathname} />}
    </div>
  );
}

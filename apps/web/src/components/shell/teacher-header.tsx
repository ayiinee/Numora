import type { ReactNode } from 'react';
import Link from 'next/link';
import { Avatar, Icon } from '@tka/ui';

export function TeacherHeader({
  title,
  name,
  verified,
  backHref,
  actions,
}: {
  title: string;
  name: string;
  verified: boolean;
  backHref?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <header className="teacher-header">
      <div className="teacher-header__identity">
        {backHref && (
          <Link href={backHref} className="teacher-header__back" aria-label="Kembali">
            <Icon name="back" />
          </Link>
        )}
        {name && <Avatar name={name} />}
        <div>
          <strong>{name || 'Ruang guru'}</strong>
          <span>
            {verified ? (
              <>
                <span className="teacher-header__verified-dot" /> Guru terverifikasi
              </>
            ) : (
              'NUMORA'
            )}
          </span>
        </div>
      </div>
      <div className="teacher-header__context">
        {backHref ? <Link href={backHref}>Ruang guru</Link> : <span>Ruang guru</span>}
        <Icon name="chevron" width={16} height={16} />
        <strong>{title}</strong>
      </div>
      <div className="teacher-header__actions">
        {actions}
        {verified && (
          <>
            <Link
              className="teacher-header__profile"
              href="/teacher/notifications"
              aria-label="Pusat Notifikasi"
              title="Notifikasi guru belum tersedia"
            >
              <Icon name="bell" width={20} height={20} />
            </Link>
            <Link
              href="/teacher/profile"
              className="teacher-header__profile"
              aria-label="Buka profil"
            >
              <Icon name="user" width={20} height={20} />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

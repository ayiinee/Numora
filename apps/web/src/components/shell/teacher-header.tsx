import type { ReactNode } from 'react';
import Link from 'next/link';
import { Avatar, Icon } from '@tka/ui';
import { OwnAvatar } from '@/features/onboarding/user-avatar';

export function TeacherHeader({
  title,
  name,
  verified,
  backHref,
  actions,
  showIdentity = false,
}: {
  title: string;
  name: string;
  verified: boolean;
  backHref?: string | undefined;
  actions?: ReactNode;
  showIdentity?: boolean;
}) {
  // The verification gate renders this shell before the profile photo provider is available.
  const HeaderAvatar = verified ? OwnAvatar : Avatar;
  return (
    <header className="teacher-header">
      <div className="teacher-header__identity">
        {backHref && (
          <Link href={backHref} className="teacher-header__back" aria-label="Kembali">
            <Icon name="back" />
          </Link>
        )}
        {showIdentity && name && <HeaderAvatar name={name} />}
        <div>
          <strong>{showIdentity ? name || 'Ruang guru' : title}</strong>
          {showIdentity && (
            <span>
              {verified ? (
                <>
                  <span className="teacher-header__verified-dot" /> Guru terverifikasi
                </>
              ) : (
                'NUMORA'
              )}
            </span>
          )}
        </div>
      </div>
      <div className="teacher-header__context">
        {backHref ? <Link href={backHref}>Kembali</Link> : <span>Ruang guru</span>}
        <Icon name="chevron" width={16} height={16} />
        <strong>{title}</strong>
      </div>
      <div className="teacher-header__actions">
        {actions}
        {verified && (
          <Link
            href="/teacher/profile"
            className="teacher-header__profile"
            aria-label="Buka profil"
          >
            <Icon name="user" width={20} height={20} />
          </Link>
        )}
      </div>
    </header>
  );
}

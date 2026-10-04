'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar, Badge, Card, Icon, ListRow, ProgressBar, type IconName } from '@tka/ui';
import type { IdentityProfile } from '@/lib/api';
import type { StudentDashboardDto, CurrentTryoutDto } from './generated-types';

export function AccountHeader({
  title,
  backHref,
  settings = false,
}: {
  title: string;
  backHref?: string;
  settings?: boolean;
}) {
  return (
    <header className="student-account-header">
      {backHref && (
        <Link href={backHref} className="student-account-header__back">
          <Icon name="back" width={18} height={18} /> Kembali
        </Link>
      )}
      <div>
        <small>TKA SMP</small>
        <h1>{title}</h1>
      </div>
      {settings ? (
        <a
          href="#pengaturan-akun"
          className="student-account-header__action"
          aria-label="Buka pengaturan akun"
        >
          <Icon name="settings" width={22} height={22} />
        </a>
      ) : (
        <Link
          href="/student/profile"
          className="student-account-header__action"
          aria-label="Buka profil"
        >
          <Icon name="user" width={22} height={22} />
        </Link>
      )}
    </header>
  );
}

export function ProfileIdentity({
  profile,
  avatarUrl,
  data,
  progressState,
}: {
  profile: IdentityProfile;
  avatarUrl?: string | undefined;
  data?: StudentDashboardDto | undefined;
  progressState?: ReactNode;
}) {
  const school = profile.studentAffiliation === 'SCHOOL';
  return (
    <Card className="student-profile-identity" aria-labelledby="profile-name">
      <div className="student-profile-identity__badges">
        <Badge
          variant="secondary"
          style={{
            background: 'var(--pvp-glass)',
            color: 'var(--color-text-inverse)',
            borderColor: 'var(--pvp-glass-border)',
            fontSize: '10px',
          }}
        >
          <Icon name={school ? 'school' : 'user'} width={14} height={14} />
          {school ? 'TERAFILIASI SEKOLAH' : 'BELAJAR MANDIRI'}
        </Badge>
        <span className="student-profile-active">
          {profile.status === 'ACTIVE' ? '● Aktif' : 'Tidak aktif'}
        </span>
      </div>
      <div className="student-profile-identity__person">
        <div className="student-profile-avatar">
          <Avatar
            name={profile.displayName}
            size="lg"
            style={{ width: 56, height: 56, fontSize: 22 }}
            {...(avatarUrl ? { src: avatarUrl } : {})}
          />
        </div>
        <div>
          <h2 id="profile-name">{profile.displayName}</h2>
          <p>{school ? (data?.class?.schoolName ?? 'Siswa sekolah') : 'User Mandiri'}</p>
          <small>
            {school ? (data?.class?.name ?? 'Terhubung dengan kelas') : 'Belajar sesuai ritmemu'}
          </small>
        </div>
      </div>
      <div className="student-profile-identity__progress">
        {data ? (
          <>
            <div>
              <strong>Progres Drill</strong>
              <span>
                {data.completedLevels} / {data.availableLevels} level
              </span>
            </div>
            {data.availableLevels > 0 ? (
              <ProgressBar
                value={data.completedLevels}
                max={data.availableLevels}
                variant="success"
                size="sm"
                label="Level Drill selesai"
              />
            ) : (
              <p>Materi sedang disiapkan.</p>
            )}
            <small>
              {data.availableLevels > 0
                ? `${data.completedLevels} level telah tuntas`
                : 'Mulai saat materi tersedia'}
            </small>
          </>
        ) : (
          progressState
        )}
      </div>
    </Card>
  );
}

export function ProfileStats({ data }: { data: StudentDashboardDto }) {
  return (
    <div className="student-profile-stats">
      <Card className="student-profile-stat">
        <h3>
          <Icon name="chart" width={14} height={14} /> Nilai Drill terakhir
        </h3>
        <p>
          <strong>{data.latestDrillScore ?? '—'}</strong>
          <small>{data.latestDrillScore === null ? 'Belum ada hasil' : '/ 100'}</small>
        </p>
        {data.latestDrillScore !== null && (
          <ProgressBar
            value={data.latestDrillScore}
            max={100}
            variant="success"
            size="sm"
            label="Nilai Drill terakhir"
          />
        )}
      </Card>
      <Card className="student-profile-stat">
        <h3>
          <Icon name="check" width={14} height={14} /> Level Drill
        </h3>
        <p>
          <strong>{data.completedLevels}</strong>
          <small>/ {data.availableLevels} Tuntas</small>
        </p>
        {data.availableLevels > 0 && (
          <ProgressBar
            value={data.completedLevels}
            max={data.availableLevels}
            size="sm"
            label="Ketuntasan level Drill"
          />
        )}
      </Card>
    </div>
  );
}

const tryoutState: Record<CurrentTryoutDto['state'], string> = {
  unavailable: 'Belum tersedia',
  open: 'Telah dibuka',
  inProgress: 'Sedang dikerjakan',
  waitingIrt: 'Menunggu hasil IRT',
  resultReady: 'Hasil tersedia',
};
export function ProfileTryout({ data }: { data: CurrentTryoutDto }) {
  const href =
    data.attemptId && data.state === 'resultReady'
      ? `/student/tryout/${data.attemptId}/result`
      : data.attemptId && data.state === 'inProgress'
        ? `/student/tryout/${data.attemptId}`
        : '/student/tryout';
  return (
    <Link className="student-profile-tryout" href={href}>
      <span className="student-profile-tryout__icon">
        <Icon name="clipboard" />
      </span>
      <span>
        <strong>{data.title ?? 'Tryout Matematika'}</strong>
        <small>
          {data.state === 'waitingIrt'
            ? 'Hasil dibuka setelah dirilis oleh server.'
            : 'Tryout gratis untuk seluruh siswa.'}
        </small>
      </span>
      <Badge size="sm" variant={data.state === 'resultReady' ? 'success' : 'secondary'}>
        {tryoutState[data.state]}
      </Badge>
    </Link>
  );
}

export function ProfileSetting({
  icon,
  title,
  description,
  href,
  children,
}: {
  icon: IconName;
  title: string;
  description: string;
  href?: string;
  children?: ReactNode;
}) {
  const content = (
    <ListRow
      wrapText
      dividers={false}
      style={{ padding: 0, cursor: 'inherit' }}
      title={title}
      description={description}
      leading={
        <span className={`student-setting-icon student-setting-icon--${icon}`}>
          <Icon name={icon} width={20} height={20} />
        </span>
      }
      trailing={<Icon className="student-setting-chevron" name="chevron" width={18} height={18} />}
    />
  );
  return href ? (
    <Link href={href} className="student-setting-row">
      {content}
    </Link>
  ) : (
    <details className="student-setting-details">
      <summary className="student-setting-row">{content}</summary>
      <div className="student-setting-detail">{children}</div>
    </details>
  );
}

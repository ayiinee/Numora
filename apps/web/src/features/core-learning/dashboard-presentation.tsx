'use client';

import Link from 'next/link';
import { useNotificationSummary } from './notification-queries';
import { Avatar, Card, Icon, ProgressBar, Skeleton, type IconName } from '@tka/ui';
import type { StudentDashboardDto, CurrentTryoutDto, DashboardDrillDto } from './generated-types';
import type { AssessmentRecord } from './types';

const tryoutLabels: Record<CurrentTryoutDto['state'], string> = {
  unavailable: 'Belum tersedia',
  open: 'Telah dibuka',
  inProgress: 'Sedang dikerjakan',
  waitingIrt: 'Menunggu hasil',
  resultReady: 'Hasil tersedia',
};

export function StudentIdentityHeader({
  data,
  avatarUrl,
  tryout,
}: {
  data: StudentDashboardDto;
  avatarUrl?: string | undefined;
  tryout?: CurrentTryoutDto | undefined;
}) {
  const notifications = useNotificationSummary();
  return (
    <div className="student-identity">
      <div className="student-identity__top">
        <Link
          href="/student/profile"
          className="student-identity__person"
          aria-label="Buka profil siswa"
        >
          <span className="student-identity__avatar">
            <Avatar name={data.displayName} {...(avatarUrl ? { src: avatarUrl } : {})} />
          </span>
          <span className="student-identity__name">
            <strong>{data.displayName}</strong>
            <small>
              <span>{data.affiliation === 'SCHOOL' ? 'User Sekolah' : 'User Mandiri'}</span>
              {data.class?.schoolName && (
                <>
                  {' · '}
                  <span>{data.class.schoolName}</span>
                </>
              )}
            </small>
          </span>
        </Link>
        <div className="student-identity__actions">
          {data.bestDrillScore !== null && (
            <span
              className="student-identity__score"
              aria-label={`Nilai Drill terbaik ${data.bestDrillScore}`}
            >
              <Icon name="target" width={16} height={16} />
              {data.bestDrillScore}
            </span>
          )}
          <Link
            className="student-identity__bell"
            href="/student/notifications"
            aria-label={`Lihat notifikasi${notifications.data?.unread ? `, ${notifications.data.unread} belum dibaca` : ''}`}
          >
            <Icon name="bell" width={20} height={20} />
            {!!notifications.data?.unread && (
              <span className="student-notification-count">
                {notifications.data.unread > 99 ? '99+' : notifications.data.unread}
              </span>
            )}
          </Link>
        </div>
      </div>
      <div className="student-identity__progress">
        <div>
          <strong>Progres level Drill</strong>
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
          <p>Materi sedang disiapkan</p>
        )}
      </div>
      {tryout?.state === 'open' && tryout.eligible && (
        <Link href="/student/tryout" className="student-identity__announcement">
          <Icon name="megaphone" width={16} height={16} />
          <span>{tryout.title ?? 'Tryout Matematika'} sudah dibuka!</span>
          <strong>Yuk Mulai!</strong>
        </Link>
      )}
    </div>
  );
}

export function HomeTryoutSkeleton() {
  return (
    <section
      className="student-home-hero home-tryout-skeleton"
      role="status"
      aria-label="Memuat Tryout"
    >
      <span className="sr-only">Memuat Tryout…</span>
      <div className="student-home-hero__badges">
        <Skeleton height={20} width={100} />
      </div>
      <Skeleton height={20} width="80%" />
      <Skeleton height={32} width="90%" />
      <div className="student-home-hero__footer">
        <Skeleton height={14} width={100} />
        <Skeleton height={44} width={110} />
      </div>
    </section>
  );
}

export function HomeTryoutHero({ data }: { data: CurrentTryoutDto }) {
  const action =
    data.state === 'open' && data.eligible
      ? 'Mulai Tryout'
      : data.state === 'inProgress'
        ? 'Lanjutkan Tryout'
        : data.state === 'resultReady'
          ? 'Lihat Hasil'
          : 'Lihat Tryout';
  return (
    <section className="student-home-hero" aria-labelledby="home-tryout-title">
      <div className="student-home-hero__badges">
        <span>
          <Icon name="graduation" width={14} height={14} />
          Gratis Siswa
        </span>
        <span>
          <Icon name="clock" width={14} height={14} />
          {tryoutLabels[data.state]}
        </span>
      </div>
      <h2 id="home-tryout-title">{data.title ?? 'Paket Tryout Mingguan'}</h2>
      <p>
        {data.state === 'unavailable'
          ? 'Paket yang sudah diterbitkan akan muncul di sini. Sambil menunggu, lanjutkan latihanmu.'
          : data.state === 'waitingIrt'
            ? 'Jawaban sudah dikumpulkan. Hasil tersedia setelah dirilis oleh server.'
            : 'Simulasi TKA Matematika SMP • 1× kesempatan pengerjaan per paket.'}
      </p>
      <div className="student-home-hero__footer">
        <span>
          <Icon name="clock" width={15} height={15} />
          {data.questionCount != null ? `${data.questionCount} Soal` : 'TKA Matematika'}
          {data.durationSeconds != null ? ` • ${Math.round(data.durationSeconds / 60)} Menit` : ''}
        </span>
        <Link href="/student/tryout">
          {action}
          <Icon name="arrow" width={14} height={14} />
        </Link>
      </div>
    </section>
  );
}

export function HomeFeatures({ data }: { data: StudentDashboardDto }) {
  const features: {
    title: string;
    subtitle: string;
    icon: IconName;
    badge: string;
    href: string;
  }[] = [
    {
      title: 'Latihan Soal',
      subtitle: 'Adaptif',
      icon: 'book',
      badge: data.availableLevels ? `${data.availableLevels} Lvl` : 'Latihan',
      href: '/student/learn',
    },
    {
      title: 'Tryout',
      subtitle: 'Simulasi TKA',
      icon: 'clipboard',
      badge: 'Gratis',
      href: '/student/tryout',
    },
    {
      title: 'PvP Duel',
      subtitle: '1-on-1',
      icon: 'gamepad',
      badge: data.features.pvp ? 'Live' : 'Segera',
      href: '/student/pvp',
    },
  ];
  return (
    <Card className="student-home-card home-features">
      <h2>
        Fitur Belajar <Icon name="info" width={14} height={14} />
      </h2>
      <div className="home-feature-grid">
        {features.map((item) => {
          const content = (
            <>
              <span className={`home-feature-icon home-feature-icon--${item.icon}`}>
                <Icon name={item.icon} width={28} height={28} />
                <span>{item.badge}</span>
              </span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </>
          );
          return (
            <Link key={item.title} href={item.href}>
              {content}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

export function HomeResume({ attempt }: { attempt: DashboardDrillDto }) {
  return (
    <div className="home-resume">
      <span>Lanjut: {attempt.title}</span>
      <Link href={`/student/drill/${attempt.attemptId}`}>
        <Icon name="rocket" width={15} height={15} />
        Lanjutkan latihan
      </Link>
    </div>
  );
}

export function HomeActivity({
  item,
  resume,
}: {
  item: AssessmentRecord;
  resume?: DashboardDrillDto | null | undefined;
}) {
  const ready = item.resultState === 'ready' && item.activity !== 'pretest';
  const content = (
    <>
      <span className="home-activity__icon">
        <Icon name={item.activity === 'drill' ? 'target' : 'clipboard'} width={25} height={25} />
      </span>
      <div className="home-activity__body">
        <div className="home-activity__meta">
          <span>
            {item.activity.toUpperCase()}
            {item.subchapterTitle ? ` • ${item.subchapterTitle}` : ''}
          </span>
          <time dateTime={item.submittedAt}>
            {new Intl.DateTimeFormat('id-ID', {
              timeZone: 'Asia/Jakarta',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(item.submittedAt))}
          </time>
        </div>
        <h3>{item.title}</h3>
        <div className="home-activity__status">
          {item.resultState === 'waitingIrt' ? (
            <span>Menunggu hasil</span>
          ) : item.score !== null ? (
            <span className="home-score">
              <Icon name="check" width={12} height={12} />
              Nilai: {item.score}%
            </span>
          ) : (
            <span>Nilai belum tersedia</span>
          )}
          {item.xpState === 'ready' && item.xp != null && <span>{item.xp} XP</span>}
          {item.starsState === 'ready' && item.stars != null && (
            <span>Bintang: {item.stars} / 3</span>
          )}
          {item.xpState === 'legacy' && <small>XP tidak tercatat pada hasil versi lama</small>}
          {item.starsState === 'legacy' && (
            <small>Bintang tidak tercatat pada hasil versi lama</small>
          )}
          {item.isDemo && <span>Demo</span>}
          {(item.xpState === 'pending' || item.starsState === 'pending') && (
            <small className="home-activity__pending">
              {item.xpState === 'pending' && item.starsState === 'pending'
                ? 'XP dan bintang belum tersedia'
                : item.xpState === 'pending'
                  ? 'XP belum tersedia'
                  : 'Bintang belum tersedia'}
            </small>
          )}
        </div>
      </div>
    </>
  );
  const row = ready ? (
    <Link
      className="home-activity"
      href={`/student/${item.activity === 'tryout' ? 'tryout' : 'drill'}/${item.attemptId}/result`}
    >
      {content}
    </Link>
  ) : (
    <div className="home-activity">{content}</div>
  );
  return (
    <div className="home-activity-entry">
      {row}
      {resume && <HomeResume attempt={resume} />}
    </div>
  );
}

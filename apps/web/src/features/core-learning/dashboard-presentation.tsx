'use client';

import Link from 'next/link';
import { useNotificationSummary } from './notification-queries';
import { Avatar, Icon, ProgressBar, Skeleton } from '@tka/ui';
import type { StudentDashboardDto } from './generated-types';
import { StudentIllustratedHero } from './student-illustrated-hero';
import { type TryoutSummary, tryoutSummaryHref, tryoutSummaryLabels } from './tryout-queries';
import { releaseDate } from './tryout-presentation';

export function StudentHomeIdentityHeader({
  data,
  avatarUrl,
  tryout,
}: {
  data: StudentDashboardDto;
  avatarUrl?: string | undefined;
  tryout?: TryoutSummary | undefined;
}) {
  const notifications = useNotificationSummary();
  const xp = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(data.totalXp ?? 0);
  const announcement = tryout?.state === 'open' || tryout?.state === 'inProgress';
  return (
    <div className="sh-identity">
      <div className="sh-identity__top">
        <Link
          href="/student/profile"
          className="sh-identity__avatar"
          aria-label="Buka profil siswa"
        >
          <Avatar name={data.displayName} {...(avatarUrl ? { src: avatarUrl } : {})} />
        </Link>
        <div className="sh-identity__greeting">
          <h1>{data.displayName}</h1>
          <p>{data.class?.schoolName ?? 'Belajar Mandiri'}</p>
        </div>
        <Link
          className="sh-identity__xp"
          href="/student/assessment"
          aria-label={`${xp} XP, lihat progres`}
        >
          <Icon name="star" width={17} height={17} fill="currentColor" />
          <strong>{xp} XP</strong>
        </Link>
        <Link
          className="sh-identity__bell"
          href="/student/notifications"
          aria-label={`Lihat notifikasi${notifications.data?.unread ? `, ${notifications.data.unread} belum dibaca` : ''}`}
        >
          <img src="/illustrations/student-home/header-bell.svg" width="14" height="17" alt="" />
          {!!notifications.data?.unread && (
            <span className="student-notification-count">
              {notifications.data.unread > 99 ? '99+' : notifications.data.unread}
            </span>
          )}
        </Link>
      </div>
      <Link
        className="sh-progress"
        href="/student/assessment"
        aria-label={`Progres Drill, ${data.completedLevels} dari ${data.availableLevels} level selesai. Lihat progres`}
      >
        <span className="sh-progress__body">
          <span className="sh-progress__labels">
            <strong>Progres Drill</strong>
            <span>
              {data.availableLevels > 0
                ? `${data.completedLevels}/${data.availableLevels} level`
                : 'Belum ada level'}
            </span>
          </span>
          {data.availableLevels > 0 ? (
            <ProgressBar
              value={data.completedLevels}
              max={data.availableLevels}
              variant="success"
              size="sm"
              label="Level Drill selesai"
            />
          ) : (
            <small>Materi sedang disiapkan</small>
          )}
        </span>
      </Link>
      {announcement && (
        <Link className="sh-identity__announcement" href="/student/tryout">
          <img
            src="/illustrations/student-home/header-announcement.svg"
            width="15"
            height="12"
            alt=""
          />
          <span>{tryout.title ?? 'Tryout Matematika tersedia'}</span>
          <strong>
            {tryout.state === 'inProgress'
              ? 'Lanjutkan'
              : tryout.eligible
                ? 'Yuk Mulai!'
                : 'Lihat status'}
          </strong>
        </Link>
      )}
    </div>
  );
}

/* Keeps the Beranda bar in place while the dashboard loads, so it does not swap. */
export function StudentHomeIdentityHeaderSkeleton() {
  return (
    <div className="sh-identity sh-identity--pending">
      <div className="sh-identity__top">
        <span className="sh-identity__avatar">
          <Skeleton variant="circular" width={32} height={32} />
        </span>
        <div className="sh-identity__greeting">
          <Skeleton width={120} height={12} />
          <Skeleton width={80} height={10} />
        </div>
        <Skeleton width={70} height={44} borderRadius="var(--radius-full)" />
        <Skeleton width={44} height={44} borderRadius="var(--radius-full)" />
      </div>
      <Skeleton height={30} borderRadius="var(--radius-md)" />
    </div>
  );
}

/* The existing compact identity is also used by Materi. Keep that presentation unchanged. */
export function StudentIdentityHeader({
  data,
  avatarUrl,
  tryout,
}: {
  data: StudentDashboardDto;
  avatarUrl?: string | undefined;
  tryout?: TryoutSummary | undefined;
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
    <StudentIllustratedHero variant="tryout" className="sh-hero" badges={<span>TRYOUT</span>}>
      <div className="sh-hero__loading" role="status" aria-label="Memuat Tryout">
        <Skeleton height={32} width="75%" />
        <Skeleton height={16} width="90%" />
        <Skeleton height={44} width="min(100%, 140px)" />
      </div>
    </StudentIllustratedHero>
  );
}

export function HomeTryoutHero({ data }: { data: TryoutSummary }) {
  const actions: Record<TryoutSummary['state'], string> = {
    unavailable: 'Lihat Tryout',
    open: data.eligible ? 'Lihat aturan' : 'Lihat Tryout',
    inProgress: 'Lanjutkan Tryout',
    resultReady: 'Lihat hasil',
    waitingIrt: 'Lihat status hasil',
    overdue: 'Lihat status hasil',
    scheduled: 'Lihat jadwal',
    checking: 'Periksa status sesi',
  };
  const description =
    data.state === 'unavailable'
      ? 'Paket belum tersedia. Sambil menunggu, kamu bisa lanjut berlatih.'
      : data.state === 'overdue'
        ? 'Hasil belum tersedia dan melewati tenggat.'
      : data.state === 'scheduled'
        ? `Dibuka ${releaseDate(data.releaseAt)}.`
      : data.state === 'checking'
        ? 'Periksa apakah sesi masih bisa dilanjutkan.'
      : data.state === 'waitingIrt'
        ? 'Jawaban sudah terkirim. Hasil dan pembahasan menunggu rilis.'
        : data.state === 'resultReady'
          ? 'Hasil dan pembahasan paketmu sudah tersedia.'
          : data.state === 'inProgress'
            ? 'Pengerjaanmu masih berlangsung. Lanjutkan sesi Tryout.'
            : data.eligible
              ? 'Uji kemampuanmu dengan paket Tryout yang tersedia.'
              : 'Paket belum dapat dimulai. Ketersediaan mengikuti status server.';
  return (
    <StudentIllustratedHero
      variant="tryout"
      className="sh-hero"
      badges={
        <>
          <span>TRYOUT</span>
          <span>
            {tryoutSummaryLabels[data.state]}
            {data.isDemo ? ' · Demo' : ''}
          </span>
          {(data.questionCount != null || data.durationSeconds != null) && (
            <span>
              {data.questionCount != null ? `${data.questionCount} soal` : ''}
              {data.questionCount != null && data.durationSeconds != null ? ' · ' : ''}
              {data.durationSeconds != null ? `${Math.ceil(data.durationSeconds / 60)} menit` : ''}
            </span>
          )}
        </>
      }
      title={data.title ?? 'Tryout Matematika'}
      description={description}
    >
      <Link className="sh-hero__action" href={tryoutSummaryHref(data)}>
        {actions[data.state]}
        <Icon name="chevron" width={14} height={14} />
      </Link>
    </StudentIllustratedHero>
  );
}

export function HomeFeatures(_: { data: StudentDashboardDto }) {
  const features = [
    {
      title: 'Latihan Soal',
      image: '/illustrations/student-home/shortcut-practice.webp',
      href: '/student/learn',
    },
    {
      title: 'Tryout',
      image: '/illustrations/student-home/shortcut-tryout.webp',
      href: '/student/tryout',
    },
    {
      title: 'PvP',
      image: '/illustrations/student-home/shortcut-pvp.webp',
      href: '/student/pvp',
    },
  ];
  return (
    <section className="sh-section sh-shortcuts" aria-labelledby="sh-shortcuts-title">
      <div className="sh-section__heading">
        <h2 id="sh-shortcuts-title">Shortcut Belajar</h2>
      </div>
      <div className="sh-shortcuts__grid">
        {features.map((item) => (
          <Link key={item.href} className="sh-shortcut" href={item.href}>
            <span className="sh-shortcut__icon">
              <img src={item.image} width={384} height={384} alt="" />
            </span>
            <strong>{item.title}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}

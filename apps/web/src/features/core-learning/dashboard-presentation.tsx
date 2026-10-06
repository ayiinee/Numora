'use client';

import Link from 'next/link';
import { useNotificationSummary } from './notification-queries';
import { Avatar, Icon, ProgressBar, Skeleton } from '@tka/ui';
import type { StudentDashboardDto, CurrentTryoutDto, DashboardDrillDto } from './generated-types';
import type { AssessmentRecord } from './types';

const tryoutLabels: Record<CurrentTryoutDto['state'], string> = {
  unavailable: 'Belum tersedia',
  open: 'Telah dibuka',
  inProgress: 'Sedang dikerjakan',
  waitingIrt: 'Menunggu hasil',
  resultReady: 'Hasil tersedia',
};

export function StudentHomeIdentityHeader({
  data,
  avatarUrl,
  tryout,
}: {
  data: StudentDashboardDto;
  avatarUrl?: string | undefined;
  tryout?: CurrentTryoutDto | undefined;
}) {
  const notifications = useNotificationSummary();
  const xp = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(data.totalXp ?? 0);
  const announcement = tryout?.state === 'open' || tryout?.state === 'inProgress';
  return (
    <div className="sh-identity">
      <img
        className="sh-identity__pattern"
        src="/illustrations/student-home/header-pattern.png"
        width="1080"
        height="2160"
        alt=""
        aria-hidden="true"
      />
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

/* The existing compact identity is also used by Materi. Keep that presentation unchanged. */
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
    <div
      className="sh-hero sh-hero--tryout student-home-hero"
      role="status"
      aria-label="Memuat Tryout"
    >
      <span className="sh-hero__eyebrow">TRYOUT</span>
      <div className="sh-hero__copy">
        <Skeleton height={32} width="75%" />
        <Skeleton height={16} width="90%" />
        <Skeleton height={44} width={140} />
      </div>
    </div>
  );
}

export function HomeTryoutHero({ data }: { data: CurrentTryoutDto }) {
  const action =
    data.state === 'open' && data.eligible
      ? { label: 'Lihat aturan', href: '/student/tryout' }
      : data.state === 'inProgress' && data.attemptId
        ? { label: 'Lanjutkan Tryout', href: `/student/tryout/${data.attemptId}` }
        : data.state === 'resultReady' && data.attemptId
          ? { label: 'Lihat hasil', href: `/student/tryout/${data.attemptId}/result` }
          : {
              label: data.state === 'waitingIrt' ? 'Lihat status' : 'Lihat Tryout',
              href: '/student/tryout',
            };
  const description =
    data.state === 'unavailable'
      ? 'Paket belum tersedia. Sambil menunggu, kamu bisa lanjut berlatih.'
      : data.state === 'waitingIrt'
        ? 'Jawaban sudah terkirim. Hasil dan pembahasan menunggu rilis.'
        : data.state === 'resultReady'
          ? 'Hasil dan pembahasan paketmu sudah tersedia.'
          : data.state === 'inProgress'
            ? 'Pengerjaanmu masih berlangsung. Lanjutkan dari soal terakhir.'
            : data.eligible
              ? 'Uji kemampuanmu dengan paket Tryout yang tersedia.'
              : 'Paket belum dapat dimulai. Ketersediaan mengikuti status server.';
  return (
    <div
      className="sh-hero sh-hero--tryout student-home-hero"
      aria-label={data.title ?? 'Tryout Matematika'}
    >
      <span className="sh-hero__eyebrow">TRYOUT</span>
      <div className="sh-hero__copy">
        <span className="sh-hero__state">
          {tryoutLabels[data.state]}
          {data.isDemo ? ' · Demo' : ''}
        </span>
        <h2>{data.title ?? 'Tryout Matematika'}</h2>
        <p>{description}</p>
        {(data.questionCount != null || data.durationSeconds != null) && (
          <p className="sh-hero__meta">
            {data.questionCount != null ? `${data.questionCount} soal` : ''}
            {data.questionCount != null && data.durationSeconds != null ? ' · ' : ''}
            {data.durationSeconds != null ? `${Math.ceil(data.durationSeconds / 60)} menit` : ''}
          </p>
        )}
        <Link className="sh-hero__action" href={action.href}>
          {action.label}
          <Icon name="chevron" width={18} height={18} />
        </Link>
      </div>
      <img
        className="sh-hero__illustration sh-hero__illustration--tryout"
        src="/illustrations/student-home/reference-tryout.png"
        width="93"
        height="77"
        alt=""
        draggable="false"
      />
    </div>
  );
}

export function HomeFeatures(_: { data: StudentDashboardDto }) {
  const features: {
    title: string;
    image: string;
    imageWidth: number;
    imageHeight: number;
    href: string;
    tone: string;
    subtitle?: string | undefined;
  }[] = [
    {
      title: 'Latihan Soal',
      image: '/illustrations/student-home/reference-practice.png',
      imageWidth: 76,
      imageHeight: 78,
      href: '/student/learn',
      tone: 'peach',
    },
    {
      title: 'Tryout',
      image: '/illustrations/student-home/reference-tryout.png',
      imageWidth: 93,
      imageHeight: 77,
      href: '/student/tryout',
      tone: 'purple',
    },
    {
      title: 'PvP',
      image: '/illustrations/student-home/reference-pvp.png',
      imageWidth: 99,
      imageHeight: 71,
      href: '/student/pvp',
      tone: 'cool',
    },
  ];
  return (
    <section className="sh-section sh-shortcuts" aria-labelledby="sh-shortcuts-title">
      <div className="sh-section__heading">
        <h2 id="sh-shortcuts-title">Shortcut Belajar</h2>
      </div>
      <div className="sh-shortcuts__grid">
        {features.map((item) => (
          <Link
            key={item.title}
            className={`sh-shortcut sh-shortcut--${item.tone}`}
            href={item.href}
          >
            <span className="sh-shortcut__icon">
              <img src={item.image} width={item.imageWidth} height={item.imageHeight} alt="" />
            </span>
            <strong>{item.title}</strong>
            {item.subtitle && <small>{item.subtitle}</small>}
          </Link>
        ))}
      </div>
    </section>
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
  const body = (
    <>
      <span className={`sh-activity__icon sh-activity__icon--${item.activity}`}>
        {item.activity === 'pretest' ? (
          <Icon name="target" width={25} height={25} />
        ) : (
          <img
            src={`/illustrations/student-home/reference-${item.activity}-activity.png`}
            width="65"
            height="62"
            alt=""
          />
        )}
      </span>
      <span className="sh-activity__body">
        <strong>{item.title}</strong>
        <span className="sh-activity__detail">
          {item.activity.toUpperCase()}
          {item.subchapterTitle ? ` · ${item.subchapterTitle}` : ''}
          {item.score !== null && item.resultState === 'ready' ? ` · Nilai ${item.score}%` : ''}
        </span>
      </span>
      <span className="sh-activity__status">
        {item.resultState === 'waitingIrt' && (
          <span className="sh-activity__pending">Menunggu hasil</span>
        )}
        {item.xpState === 'ready' && item.xp != null && (
          <span className="sh-activity__xp">
            <img
              src="/illustrations/student-home/reference-xp-star.png"
              width="28"
              height="26"
              alt=""
            />
            {item.xp} XP
          </span>
        )}
        {item.starsState === 'ready' && item.stars != null && <span>{item.stars}/3 bintang</span>}
        {item.xpState === 'legacy' && <span>XP tidak tercatat pada hasil versi lama</span>}
        {item.starsState === 'legacy' && <span>Bintang tidak tercatat pada hasil versi lama</span>}
        {item.xpState === 'pending' && <span>XP belum tersedia</span>}
        {item.starsState === 'pending' && <span>Bintang belum tersedia</span>}
        {item.isDemo && <span className="sh-activity__demo">Demo</span>}
      </span>
      <time dateTime={item.submittedAt}>
        {new Intl.DateTimeFormat('id-ID', {
          timeZone: 'Asia/Jakarta',
          day: 'numeric',
          month: 'short',
        }).format(new Date(item.submittedAt))}
      </time>
      {ready && <Icon name="chevron" width={17} height={17} />}
    </>
  );
  return (
    <div className="sh-activity-entry">
      {ready ? (
        <Link
          className="sh-activity"
          href={`/student/${item.activity === 'tryout' ? 'tryout' : 'drill'}/${item.attemptId}/result`}
        >
          {body}
        </Link>
      ) : (
        <div className="sh-activity">{body}</div>
      )}
      {resume && <HomeResume attempt={resume} />}
    </div>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Brand, Card, Icon } from '@tka/ui';
import { UserAvatar as Avatar } from '@/features/onboarding/user-avatar';
import type { ClassSummaryDto, MonitoredLevelDto } from '@/lib/generated-api-types';

// Presentation only: authorization, queries, scores and mutations remain in controllers.
export function TeacherClassCard({
  value,
  count,
  href,
  countError = false,
  retryCount,
}: {
  value: ClassSummaryDto;
  index: number;
  count?: number | undefined;
  href?: string;
  countError?: boolean;
  retryCount?: (() => void) | undefined;
}) {
  return (
    <Card className="teacher-class-card" padding="none">
      <Link
        className="teacher-class-link"
        href={href ?? `/teacher/classes/${value.id}`}
        aria-label={`Buka ${value.name}`}
      >
        <span className="icon-tile">
          <Icon name="users" />
        </span>
        <div className="teacher-class-copy">
          <h3>{value.name}</h3>
          <span className="teacher-class-members">
            {countError
              ? 'Jumlah anggota belum termuat'
              : count === undefined
                ? 'Memuat anggota…'
                : `${count} siswa bergabung`}
          </span>
        </div>
        <Icon name="chevron" />
      </Link>
      {countError && retryCount && (
        <button type="button" className="teacher-count-retry" onClick={retryCount}>
          Muat ulang anggota {value.name}
        </button>
      )}
    </Card>
  );
}

export function TeacherStudentRow({
  name,
  href,
  studentId,
}: {
  name: string;
  href: string;
  studentId?: string;
}) {
  return (
    <tr className="teacher-student-record">
      <td>
        <div className="teacher-roster-name">
          <Avatar userId={studentId} name={name} />
          <strong>{name}</strong>
        </div>
      </td>
      <td>
        <Link className="teacher-student-link" href={href} aria-label={`Lihat progres ${name}`}>
          <span>Lihat progres</span>
          <Icon name="chevron" width={20} height={20} />
        </Link>
      </td>
    </tr>
  );
}

export function MonitoredLevelCard({ value }: { value: MonitoredLevelDto }) {
  return (
    <Card className="level-card teacher-level-card">
      <span className="teacher-level-chapter">{value.chapterLabel}</span>
      <h3>{value.subchapterLabel}</h3>
      <p>{value.levelLabel}</p>
      <Badge
        variant={
          value.inProgress ? 'primary' : value.accessStatus === 'UNLOCKED' ? 'success' : 'default'
        }
      >
        <Icon
          name={value.inProgress ? 'clock' : value.accessStatus === 'UNLOCKED' ? 'check' : 'lock'}
          width={14}
          height={14}
        />
        {value.inProgress
          ? 'Sedang dikerjakan'
          : value.accessStatus === 'UNLOCKED'
            ? 'Terbuka'
            : 'Terkunci'}
      </Badge>
      <dl className="teacher-score-pair">
        <div>
          <dt>Terakhir</dt>
          <dd>{value.latestDrillScore ?? '—'}</dd>
        </div>
        <div>
          <dt>Terbaik</dt>
          <dd>{value.bestDrillScore ?? '—'}</dd>
        </div>
      </dl>
      {(value.latestDrillScore === null || value.bestDrillScore === null) && (
        <p className="teacher-score-note">— berarti belum ada hasil.</p>
      )}
    </Card>
  );
}

export function TeacherVerificationFrame({ children }: { children: ReactNode }) {
  return (
    <div className="teacher-verification-shell">
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      <header className="teacher-verification-header">
        <Link href="/" aria-label="NUMORA beranda">
          <Brand />
        </Link>
        <span>Ruang guru</span>
      </header>
      <main id="main-content" tabIndex={-1} className="teacher-verification-layout">
        <section className="teacher-verification-intro">
          <span className="teacher-verification-mark" aria-hidden="true">
            <Icon name="school" width={32} height={32} />
          </span>
          <span className="teacher-kicker">NUMORA untuk guru</span>
          <h2>Kelas dan progres siswa dalam satu tempat.</h2>
          <p>
            Setelah sekolah terverifikasi, buat kelas dan lihat hasil latihan siswa yang Anda
            dampingi.
          </p>
          <div className="teacher-verification-benefits">
            <span>
              <Icon name="users" /> Kelas Anda
            </span>
            <span>
              <Icon name="chart" /> Progres siswa
            </span>
            <span>
              <Icon name="book" /> Hasil Drill
            </span>
          </div>
        </section>
        <Card className="teacher-verification-form">{children}</Card>
      </main>
    </div>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar, Badge, Brand, Card, Icon, ListRow } from '@tka/ui';
import type { ClassSummaryDto, MonitoredLevelDto } from '@/lib/generated-api-types';

// Presentation only: authorization, queries, scores and mutations remain in controllers.
export function TeacherWelcome({ name, count }: { name: string; count: number | undefined }) {
  return (
    <Card className="teacher-identity-card">
      <div className="teacher-identity-status">
        <Badge variant="success">
          <Icon name="school" width={16} height={16} /> Guru terverifikasi
        </Badge>
      </div>
      <div className="teacher-identity-person">
        <Avatar name={name} size="lg" />
        <div>
          <span className="teacher-kicker">Ruang guru NUMORA</span>
          <h2>Selamat datang, {name}</h2>
          <p>Dampingi setiap langkah belajar siswa.</p>
        </div>
      </div>
      <div className="teacher-identity-foot">
        <Icon name="users" width={18} height={18} />
        <span>
          {count === undefined
            ? 'Buka kelas untuk melihat perkembangan siswa.'
            : `${count} kelas yang Anda dampingi`}
        </span>
      </div>
    </Card>
  );
}

export function TeacherClassCard({ value, index }: { value: ClassSummaryDto; index: number }) {
  return (
    <Link className="teacher-class-link" href={`/teacher/classes/${value.id}`}>
      <Card className="teacher-class-card">
        <span className={`icon-tile accent-${index % 4}`}>
          <Icon name="users" />
        </span>
        <h3>{value.name}</h3>
        {value.joinCode && (
          <p className="teacher-class-code">
            Kode kelas <strong>{value.joinCode}</strong>
          </p>
        )}
        <span className="teacher-class-action">
          Lihat siswa <Icon name="arrow" width={20} height={20} />
        </span>
      </Card>
    </Link>
  );
}

export function TeacherStudentRow({ name, href }: { name: string; href: string }) {
  return (
    <Link className="teacher-student-link" href={href}>
      <ListRow
        wrapText
        dividers={false}
        leading={<Avatar name={name} />}
        title={name}
        description="Lihat progres dan nilai Drill"
        trailing={<Icon name="chevron" />}
        style={{ padding: 0, cursor: 'inherit' }}
      />
    </Link>
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
          <span className="teacher-kicker">Dampingi siswa bersama NUMORA</span>
          <h2>Satu ruang untuk kelas dan perkembangan siswa.</h2>
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

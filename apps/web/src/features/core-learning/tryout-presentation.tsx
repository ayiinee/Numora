'use client';

import { StudentMascot, type StudentMascotPose } from '@/components/student-mascot';

import Link from 'next/link';
import { Badge, Button, Card, Icon, type BadgeVariant, type IconName } from '@tka/ui';
import type { ReactNode, Ref } from 'react';
import type { AssessmentRecord, TryoutPackage, TryoutResult } from './types';
import { RewardSummary } from './reward-summary';

const stateLabels = {
  unavailable: 'Belum tersedia',
  open: 'Tersedia',
  inProgress: 'Sedang berlangsung',
  waitingIrt: 'Menunggu hasil',
  resultReady: 'Hasil dirilis',
};
const stateIcons: Record<TryoutPackage['state'], IconName> = {
  unavailable: 'lock',
  open: 'play-circle',
  inProgress: 'clock',
  waitingIrt: 'clock',
  resultReady: 'check-circle',
};
const tryoutDateFormat = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});

export function releaseDate(value?: string | null) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? `${tryoutDateFormat.format(time)} WIB` : 'Jadwal belum tersedia';
}

export function TryoutCardIcon({ kind }: { kind: 'schedule' | 'missed' | 'history' }) {
  return (
    <img
      className="tryout-card-icon"
      src={`/illustrations/tryout-card/${kind}.webp`}
      alt=""
      width={48}
      height={48}
      decoding="async"
    />
  );
}

export function TryoutStatusBadge({
  variant,
  icon,
  children,
}: {
  variant: BadgeVariant;
  icon: IconName;
  children: string;
}) {
  return (
    <Badge
      className="tryout-status-badge"
      variant={variant}
      size="sm"
      style={{
        borderRadius: '4px',
        fontSize: '0.75rem',
        lineHeight: 1.25,
        padding: '2px 6px',
        whiteSpace: 'normal',
      }}
    >
      <Icon name={icon} width={12} height={12} />
      <span>{children}</span>
    </Badge>
  );
}

export function TryoutCatalogCard({
  title,
  badge,
  pose,
  icon,
  children,
  actions,
}: {
  title: string;
  badge: ReactNode;
  pose: StudentMascotPose;
  icon: React.ComponentProps<typeof TryoutCardIcon>['kind'];
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Card fullWidth className="tryout-catalog-card">
      <div className="tryout-catalog-card__heading tryout-catalog-card__heading--mascot">
        <div>
          <div className="tryout-badges">{badge}</div>
          <h2>{title}</h2>
        </div>
        <StudentMascot pose={pose} compact />
      </div>
      <div className="tryout-catalog-card__body">
        <TryoutCardIcon kind={icon} />
        <div>{children}</div>
      </div>
      {actions && <div className="tryout-catalog-card__footer">{actions}</div>}
    </Card>
  );
}

export function TryoutHistoryCard({
  item,
  resultState,
}: {
  item: AssessmentRecord;
  resultState?: AssessmentRecord['tryoutResultState'] | undefined;
}) {
  const ready = resultState === 'ready' || (!resultState && item.resultState === 'ready');
  const hasScore = ready && item.resultState === 'ready';
  const action = ready ? 'Lihat hasil' : 'Lihat status hasil';
  const status = ready
    ? 'Hasil tersedia'
    : resultState === 'overdue'
      ? 'Hasil belum tersedia dan melewati tenggat'
      : 'Jawaban terkirim · Menunggu hasil';
  return (
    <TryoutCatalogCard
      title={item.title}
      badge={
        <TryoutStatusBadge
          variant={ready ? 'success' : 'warning'}
          icon={ready ? 'check-circle' : 'clock'}
        >
          {status}
        </TryoutStatusBadge>
      }
      pose="tryout-record"
      icon="history"
      actions={
        <Link
          className="button-link"
          href={`/student/tryout/${item.attemptId}/result`}
          aria-label={`${item.title} — ${action}`}
        >
          {action}
          <Icon name="chevron" width={16} height={16} />
        </Link>
      }
    >
      <dl className="tryout-schedule">
        <div>
          <dt>Dikirim</dt>
          <dd>
            <time dateTime={item.submittedAt}>{releaseDate(item.submittedAt)}</time>
          </dd>
        </div>
        {hasScore && (
          <div>
            <dt>Nilai</dt>
            <dd>
              {item.score === null
                ? 'Nilai tidak tersedia'
                : item.score.toLocaleString('id-ID', { maximumFractionDigits: 20 })}
            </dd>
          </div>
        )}
        {item.xpState === 'ready' && item.xp != null && (
          <div>
            <dt>XP</dt>
            <dd>{item.xp.toLocaleString('id-ID', { maximumFractionDigits: 20 })} XP</dd>
          </div>
        )}
      </dl>
      {item.xpState === 'legacy' && <p>XP tidak tercatat pada hasil versi lama</p>}
      {item.xpState === 'pending' && <p>XP belum tersedia</p>}
    </TryoutCatalogCard>
  );
}

export function TryoutSchedule({
  opensAt,
  closesAt,
}: {
  opensAt?: string | null | undefined;
  closesAt?: string | null | undefined;
}) {
  return (
    <dl className="tryout-schedule">
      {(
        [
          ['Dibuka', opensAt],
          ['Ditutup', closesAt],
        ] as const
      ).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value && Number.isFinite(Date.parse(value)) ? (
              <time dateTime={value}>{releaseDate(value)}</time>
            ) : (
              'Belum tersedia'
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TryoutStartRules({
  questionCount,
  durationSeconds,
  closeAt,
  batch,
}: {
  questionCount?: number | null | undefined;
  durationSeconds?: number | null | undefined;
  closeAt?: string | null | undefined;
  batch?: boolean;
}) {
  return (
    <ul className="tryout-start-rules">
      <li>
        {questionCount == null ? 'Jumlah soal belum tersedia' : `${questionCount} soal`} ·{' '}
        {durationSeconds == null
          ? 'Durasi belum tersedia'
          : `${Math.ceil(durationSeconds / 60)} menit`}
      </li>
      <li>Satu kesempatan per {batch ? 'batch' : 'paket'}.</li>
      <li>
        <strong>
          {closeAt ? `Ditutup ${releaseDate(closeAt)}` : 'Waktu tutup belum tersedia'}.
        </strong>{' '}
        Waktu pengerjaan bisa lebih singkat jika jadwal segera berakhir.
      </li>
      <li>
        Timer tetap berjalan saat kamu keluar. Saat waktu habis, jawaban yang tersimpan dikirim
        otomatis.
      </li>
    </ul>
  );
}

export function TryoutPackageCard({
  current,
  onDetails,
  detailsButtonRef,
}: {
  current: TryoutPackage;
  onDetails: () => void;
  detailsButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <Card fullWidth className="tryout-catalog-card">
      <div className="tryout-catalog-card__heading">
        <div className="tryout-badges">
          <TryoutStatusBadge variant="success" icon="check">
            Gratis
          </TryoutStatusBadge>
          <TryoutStatusBadge variant="primary" icon={stateIcons[current.state]}>
            {stateLabels[current.state]}
          </TryoutStatusBadge>
        </div>
        <h2>{current.title}</h2>
      </div>
      <div className="tryout-catalog-card__body">
        <TryoutCardIcon kind="schedule" />
        <div>
          <TryoutSchedule opensAt={current.releaseAt} closesAt={current.closeAt} />
          <span>
            {current.questionCount ?? '—'} soal ·{' '}
            {current.durationSeconds != null
              ? `${Math.ceil(current.durationSeconds / 60)} menit`
              : 'Durasi belum tersedia'}
          </span>
        </div>
      </div>
      {current.state === 'open' && !current.eligible && (
        <p className="tryout-inline-status">
          Paket belum dapat dimulai. Ketersediaan mengikuti status server.
        </p>
      )}
      <div className="tryout-catalog-card__actions">
        <Button ref={detailsButtonRef} variant="ghost" onClick={onDetails}>
          Detail dan aturan paket
          <Icon name="chevron" width={18} height={18} />
        </Button>
        {current.state === 'inProgress' && current.attemptId && (
          <Link className="button-link" href={`/student/tryout/${current.attemptId}`}>
            Lanjutkan TryOut
            <Icon name="arrow" width={18} height={18} />
          </Link>
        )}
        {(current.state === 'resultReady' || current.state === 'waitingIrt') &&
          current.attemptId && (
            <Link className="button-link" href={`/student/tryout/${current.attemptId}/result`}>
              {current.state === 'resultReady' ? 'Lihat hasil' : 'Lihat status hasil'}
              <Icon name="arrow" width={18} height={18} />
            </Link>
          )}
      </div>
    </Card>
  );
}

export function TryoutDetail({
  current,
  accepted,
  onAccepted,
  onBack,
  onStart,
  pending,
  error,
}: {
  current: TryoutPackage;
  accepted: boolean;
  onAccepted: (value: boolean) => void;
  onBack: () => void;
  onStart: () => void;
  pending: boolean;
  error?: string | undefined;
}) {
  return (
    <div className="tryout-detail-screen">
      <header className="tryout-detail-header">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={pending}
          aria-label="Kembali ke katalog Tryout"
        >
          <Icon name="back" />
        </Button>
        <h1>Detail Tryout</h1>
      </header>
      <div className="tryout-detail-layout">
        <div className="tryout-detail-main">
          <Card fullWidth className="tryout-detail-summary">
            <span className="tryout-detail-summary__free">GRATIS SISWA</span>
            <h2>{current.title}</h2>
            <TryoutSchedule opensAt={current.releaseAt} closesAt={current.closeAt} />
            <div className="tryout-detail-status">
              <TryoutStatusBadge
                variant={current.state === 'waitingIrt' ? 'primary' : 'success'}
                icon={stateIcons[current.state]}
              >
                {stateLabels[current.state]}
              </TryoutStatusBadge>
            </div>
            <div className="tryout-detail-stats">
              <div>
                <span>
                  <Icon name="clock" width={16} height={16} />
                  Total waktu
                </span>
                <strong>
                  {current.durationSeconds != null
                    ? `${Math.ceil(current.durationSeconds / 60)} menit`
                    : 'Belum tersedia'}
                </strong>
              </div>
              <div>
                <span>
                  <Icon name="clipboard" width={16} height={16} />
                  Total soal
                </span>
                <strong>
                  {current.questionCount != null
                    ? `${current.questionCount} butir`
                    : 'Belum tersedia'}
                </strong>
              </div>
            </div>
          </Card>
          <div className="tryout-detail-note">
            <Icon name="info" width={18} height={18} />
            <p>
              Pengerjaan berlaku satu kali per paket. Nilai dan pembahasan tersedia setelah hasil
              simulasi dirilis, tanpa skor parsial saat pemrosesan.
            </p>
          </div>
          <section className="tryout-tutorial" aria-label="Panduan pengerjaan">
            <h2>PANDUAN PENGERJAAN</h2>
            {[
              [
                'Pilih jawaban',
                'Satu soal per tampilan. Jawaban dapat diubah sebelum pengiriman akhir.',
              ],
              [
                'Gunakan navigator',
                'Berpindah soal, tandai ragu-ragu, dan perhatikan status penyimpanan.',
              ],
              [
                'Kumpulkan jawaban',
                'Periksa soal kosong sebelum konfirmasi. Saat waktu habis, pengiriman berjalan tanpa konfirmasi.',
              ],
            ].map(([title, copy], index) => (
              <Card fullWidth key={title}>
                <span>{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </Card>
            ))}
          </section>
        </div>
        <aside className="tryout-detail-context">
          <Card fullWidth className="tryout-rules">
            <h2>
              <Icon name="clipboard" width={20} height={20} />
              Aturan Tryout
            </h2>
            <TryoutStartRules
              questionCount={current.questionCount}
              durationSeconds={current.durationSeconds}
              closeAt={current.closeAt}
            />
            <ul>
              <li>
                <strong>Penyimpanan:</strong> hanya jawaban yang diterima server tersimpan. Refresh
                atau keluar dapat menghilangkan perubahan yang belum tersimpan.
              </li>
              <li>
                <strong>Hasil simulasi:</strong> nilai dan pembahasan tersedia bersama setelah
                dirilis.{' '}
                {current.resultPendingReason
                  ? 'Konten atau penilaian belum siap; jadwal hasil belum tersedia.'
                  : 'Tenggat rilis maksimal 72 jam setelah jadwal pengerjaan ditutup.'}
                {current.resultDueAt && (
                  <> Batas ketersediaan: {releaseDate(current.resultDueAt)}.</>
                )}
              </li>
            </ul>
          </Card>
        </aside>
      </div>
      <div className="tryout-detail-footer tryout-detail-footer--inline">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {current.state === 'open' && current.eligible ? (
          <>
            <label className="tryout-student-batch__consent">
              <input
                type="checkbox"
                checked={accepted}
                disabled={pending}
                onChange={(event) => onAccepted(event.target.checked)}
              />
              Saya memahami aturan pengerjaan.
            </label>
            <Button fullWidth disabled={pending || !accepted} onClick={onStart}>
              {pending ? 'Memulai…' : 'Mulai pengerjaan'}
              <Icon name="arrow" width={18} height={18} />
            </Button>
          </>
        ) : current.state === 'inProgress' && current.attemptId ? (
          <Link className="button-link" href={`/student/tryout/${current.attemptId}`}>
            Lanjutkan TryOut
            <Icon name="arrow" width={18} height={18} />
          </Link>
        ) : (current.state === 'resultReady' || current.state === 'waitingIrt') &&
          current.attemptId ? (
          <Link className="button-link" href={`/student/tryout/${current.attemptId}/result`}>
            {current.state === 'resultReady' ? 'Lihat hasil' : 'Lihat status hasil'}
            <Icon name="arrow" width={18} height={18} />
          </Link>
        ) : (
          <p role="status">
            {current.state === 'waitingIrt'
              ? 'Jawaban terkirim · Menunggu hasil'
              : 'Paket belum dapat dimulai.'}
          </p>
        )}
        <small>TryOut gratis untuk seluruh siswa, Mandiri maupun Sekolah.</small>
      </div>
    </div>
  );
}

export function TryoutWaiting({
  fetching = false,
  onCheck,
  xp,
  closeAt,
  resultDueAt,
  resultPendingReason,
  waitState,
}: {
  fetching?: boolean;
  onCheck?: () => void;
  xp?: number | null;
  closeAt?: string | null | undefined;
  resultDueAt?: string | null | undefined;
  resultPendingReason?: 'CONTENT_PENDING' | 'SCORING_PENDING' | null | undefined;
  waitState?: 'waiting' | 'overdue' | null | undefined;
}) {
  return (
    <Card fullWidth className="tryout-waiting">
      <StudentMascot pose="submitted" />
      <TryoutStatusBadge variant="success" icon="check-circle">
        Jawaban terkirim
      </TryoutStatusBadge>
      <h2>
        {waitState === 'overdue' ? 'Hasil belum tersedia dan melewati tenggat' : 'Menunggu hasil'}
      </h2>

      {xp != null && (
        <p>
          <strong>{xp.toLocaleString('id-ID', { maximumFractionDigits: 20 })} XP</strong> sudah
          tercatat.
        </p>
      )}
      <p>
        {resultPendingReason === 'CONTENT_PENDING' && 'Konten penilaian sedang disiapkan. '}
        {resultPendingReason === 'SCORING_PENDING' && 'Penilaian sedang disiapkan. '}
        Nilai dan pembahasan tersedia setelah hasil dirilis.
      </p>
      {resultDueAt ? (
        <p>Tenggat rilis {releaseDate(resultDueAt)}.</p>
      ) : closeAt ? (
        <p>Batch ditutup {releaseDate(closeAt)}.</p>
      ) : null}
      {onCheck && (
        <Button className="tryout-check-status" fullWidth disabled={fetching} onClick={onCheck}>
          {fetching ? 'Memeriksa…' : 'Periksa status hasil'}
        </Button>
      )}
      <Link className="button-link button-link--secondary" href="/student/tryout">
        Kembali ke Tryout
      </Link>
      <Link className="tryout-text-link" href="/student/tryout/history">
        Lihat riwayat Tryout
      </Link>
    </Card>
  );
}

export function TryoutReleasedResult({ result }: { result: TryoutResult }) {
  return (
    <div className="tryout-result-layout">
      <Card fullWidth className="tryout-released-summary">
        <TryoutStatusBadge variant="success" icon="check-circle">
          Hasil dirilis
        </TryoutStatusBadge>
        <h2>{result.packageTitle}</h2>
        {result.score === null ? (
          <p className="tryout-score-unavailable">
            <strong>Nilai tidak tersedia</strong>
          </p>
        ) : (
          <>
            <strong className="tryout-result-score">
              {result.score.toLocaleString('id-ID', { maximumFractionDigits: 20 })}
            </strong>
            <p>Skala 0–100</p>
          </>
        )}
        {result.score === null && result.resultMethodReason ? (
          <p>{result.resultMethodReason}</p>
        ) : (
          result.score === null &&
          result.mode === 'UNSCORABLE' && (
            <p>Nilai tidak tersedia karena tidak ada poin maksimum valid.</p>
          )
        )}
        <p>
          {result.correctCount} dari {result.questionCount} benar penuh
        </p>
        {result.explanation.length > 0 ? (
          <Link className="button-link" href={`/student/tryout/${result.attemptId}/explanation`}>
            Lihat pembahasan
          </Link>
        ) : (
          <p>Pembahasan belum tersedia.</p>
        )}
        <small>Hasil simulasi, bukan nilai TKA resmi.</small>
        <details className="learning-detail">
          <summary>Info nilai</summary>
          {result.resultMethod === 'IRT' ? (
            <p>Metode: Skor IRT.</p>
          ) : result.resultMethod === 'STANDARD' ? (
            <p>
              Metode: Skor perhitungan standar. Hasil ini menggunakan scoring biasa untuk batch
              tersebut.
            </p>
          ) : result.mode === 'UNSCORABLE' ? (
            <p>Status: tidak dapat diberi nilai.</p>
          ) : (
            <p>Metode penilaian tidak tercatat pada hasil versi ini.</p>
          )}
          {result.score !== null && result.resultMethodReason && <p>{result.resultMethodReason}</p>}
          <p>Metode nilai terpisah dari XP yang sudah tercatat saat submit.</p>
        </details>
      </Card>
      <RewardSummary kind="tryout" xp={result.xp ?? null} detail={result.xpDetail} />
      <Link
        className="button-link button-link--secondary tryout-result-back"
        href="/student/tryout/history"
      >
        Lihat riwayat Tryout <Icon name="back" width={18} height={18} />
      </Link>
    </div>
  );
}

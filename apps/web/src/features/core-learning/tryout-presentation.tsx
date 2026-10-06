'use client';

import Link from 'next/link';
import { Badge, Button, Card, Icon } from '@tka/ui';
import type { Ref } from 'react';
import type { TryoutPackage, TryoutResult } from './types';
import { RewardSummary } from './reward-summary';

const stateLabels = {
  unavailable: 'Belum tersedia',
  open: 'Tersedia',
  inProgress: 'Sedang berlangsung',
  waitingIrt: 'Menunggu IRT',
  resultReady: 'Hasil dirilis',
};
function releaseDate(value?: string) {
  return value
    ? `${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value))} WIB`
    : 'Jadwal belum tersedia';
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
          <Badge variant="success">Gratis</Badge>
          <Badge variant="primary">{stateLabels[current.state]}</Badge>
        </div>
        <h2>{current.title}</h2>
        {current.isDemo && (
          <Badge variant="warning">DEMO · Bukan asesmen kemampuan TKA resmi</Badge>
        )}
      </div>
      <div className="tryout-catalog-card__body">
        <span className="tryout-package-symbol">
          <Icon name="clipboard" />
          <small>TKA</small>
        </span>
        <div>
          <strong>{current.title}</strong>
          <p>Dirilis {releaseDate(current.releaseAt)}</p>
          <span>
            {current.questionCount ?? '—'} soal ·{' '}
            {current.durationSeconds != null
              ? `${Math.ceil(current.durationSeconds / 60)} menit`
              : 'Durasi belum tersedia'}
          </span>
        </div>
      </div>
      {current.state === 'waitingIrt' && (
        <p role="status" className="tryout-inline-status">
          Jawaban terkirim. Hasil menunggu batch IRT; pembahasan belum tersedia.
        </p>
      )}
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
        {current.state === 'resultReady' && current.attemptId && (
          <Link className="button-link" href={`/student/tryout/${current.attemptId}/result`}>
            Lihat hasil simulasi
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
            <p>Dirilis {releaseDate(current.releaseAt)}</p>
            <div className={`tryout-detail-status tryout-detail-status--${current.state}`}>
              {stateLabels[current.state]}
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
            <ul>
              <li>
                <strong>Satu kesempatan:</strong> paket yang sudah dikerjakan tidak dapat diulang.
              </li>
              <li>
                <strong>Timer otomatis:</strong> waktu tidak dapat dijeda. Batas waktu mengikuti
                server.
              </li>
              <li>
                <strong>Batch mingguan:</strong> Senin 00:00 hingga Minggu 23:59:00 WIB. Pengiriman
                otomatis saat countdown habis atau batch ditutup, mana yang lebih dahulu.
                {current.closeAt && <> Paket ini ditutup {releaseDate(current.closeAt)}.</>}
              </li>
              <li>
                <strong>Penyimpanan:</strong> hanya jawaban yang diterima server tersimpan. Refresh
                atau keluar dapat menghilangkan perubahan yang belum tersimpan.
              </li>
              <li>
                <strong>Hasil simulasi:</strong> menunggu rilis IRT; nilai ini bukan nilai TKA
                resmi. Nilai dan pembahasan tersedia bersama maksimal 72 jam setelah batch ditutup.
                {current.resultDueAt && (
                  <> Batas ketersediaan: {releaseDate(current.resultDueAt)}.</>
                )}
              </li>
            </ul>
            {current.state === 'open' && current.eligible && (
              <label>
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => onAccepted(e.target.checked)}
                  disabled={pending}
                />
                Saya memahami aturan pengerjaan.
              </label>
            )}
          </Card>
        </aside>
      </div>
      <div className="tryout-detail-footer">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {current.state === 'open' && current.eligible ? (
          <Button fullWidth disabled={pending || !accepted} onClick={onStart}>
            {pending ? 'Memulai…' : 'Mulai TryOut'}
            <Icon name="arrow" width={18} height={18} />
          </Button>
        ) : current.state === 'inProgress' && current.attemptId ? (
          <Link className="button-link" href={`/student/tryout/${current.attemptId}`}>
            Lanjutkan TryOut
            <Icon name="arrow" width={18} height={18} />
          </Link>
        ) : current.state === 'resultReady' && current.attemptId ? (
          <Link className="button-link" href={`/student/tryout/${current.attemptId}/result`}>
            Lihat hasil simulasi
            <Icon name="arrow" width={18} height={18} />
          </Link>
        ) : (
          <p role="status">
            {current.state === 'waitingIrt'
              ? 'Jawaban terkirim. Nilai dan pembahasan menunggu rilis hasil.'
              : 'Paket belum dapat dimulai.'}
          </p>
        )}
        <small>TryOut gratis untuk seluruh siswa, Mandiri maupun Sekolah.</small>
      </div>
    </div>
  );
}

export function TryoutWaiting({
  submitted = false,
  fetching = false,
  onCheck,
  xp,
  closeAt,
  resultDueAt,
  isDemo,
}: {
  submitted?: boolean;
  fetching?: boolean;
  onCheck?: () => void;
  xp?: number | null;
  closeAt?: string | null | undefined;
  resultDueAt?: string | null | undefined;
  isDemo?: boolean | undefined;
}) {
  return (
    <Card fullWidth className="tryout-waiting">
      <span className="tryout-waiting__icon">
        <Icon name={submitted ? 'check' : 'clock'} width={36} height={36} />
      </span>
      <Badge variant="success">Jawaban tersimpan</Badge>
      <h2>{submitted ? 'Jawaban sudah dikirim' : 'Menunggu hasil IRT'}</h2>
      {isDemo && <Badge variant="warning">DEMO · Konten uji, bukan hasil TKA resmi</Badge>}
      {xp != null && (
        <p>
          <strong>{xp} XP</strong> sudah tercatat. Tanpa bonus waktu.
        </p>
      )}
      <p>
        Jawaban sudah terkirim. Nilai dan pembahasan tersedia setelah hasil dirilis. Proses IRT
        selesai belum berarti hasil telah dirilis.
      </p>
      {isDemo ? (
        <p>
          Konten uji menyimpan jawaban di server. Rilis hasil DEMO menunggu persetujuan konten serta
          rubrik terkait.
        </p>
      ) : (
        <p>
          Nilai dan pembahasan dirilis bersama maksimal 72 jam setelah batch ditutup.
          {closeAt && <> Penutupan batch: {releaseDate(closeAt)}.</>}
          {resultDueAt && <> Batas ketersediaan: {releaseDate(resultDueAt)}.</>}
        </p>
      )}
      <ol>
        <li>
          <Icon name="check" width={18} height={18} />
          <span>Jawaban terkirim</span>
        </li>
        <li aria-current="step">
          <Icon name="clock" width={18} height={18} />
          <span>Pemrosesan dan rilis hasil</span>
        </li>
        <li>
          <Icon name="lock" width={18} height={18} />
          <span>Hasil simulasi & pembahasan</span>
        </li>
      </ol>
      {onCheck && (
        <Button fullWidth disabled={fetching} onClick={onCheck}>
          {fetching ? 'Memeriksa…' : 'Periksa status hasil'}
        </Button>
      )}
      <Link className="button-link button-link--secondary" href="/student/tryout">
        Lihat status paket
      </Link>
      <Link className="tryout-text-link" href="/student/assessment">
        Lihat riwayat aktivitas
      </Link>
    </Card>
  );
}

export function TryoutReleasedResult({ result }: { result: TryoutResult }) {
  return (
    <div className="tryout-result-layout">
      <aside>
        <Card fullWidth className="tryout-released-summary">
          <Badge variant="success">Hasil dirilis</Badge>
          <h2>{result.packageTitle}</h2>
          <strong className="tryout-result-score">{result.score}</strong>
          <p>
            {result.correctCount} dari {result.questionCount} benar penuh
          </p>
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
            ) : (
              <p>Metode penilaian tidak tercatat pada hasil versi ini.</p>
            )}
            {result.resultMethodReason && <p>{result.resultMethodReason}</p>}
            <p>Metode nilai terpisah dari XP yang sudah tercatat saat submit.</p>
          </details>
        </Card>
        <RewardSummary kind="tryout" xp={result.xp ?? null} detail={result.xpDetail} />
      </aside>
      <Card fullWidth className="explanation-entry">
        <h2>Pembahasan soal</h2>
        <p>Lihat jawabanmu, kunci, dan pembahasan setiap soal.</p>
        <Link className="button-link" href={`/student/tryout/${result.attemptId}/explanation`}>
          Lihat pembahasan
        </Link>
      </Card>
      <Link
        className="button-link button-link--secondary tryout-result-back"
        href="/student/tryout"
      >
        Kembali ke Tryout <Icon name="back" width={18} height={18} />
      </Link>
    </div>
  );
}

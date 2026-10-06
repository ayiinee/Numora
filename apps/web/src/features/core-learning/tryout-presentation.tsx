'use client';

import Link from 'next/link';
import { Badge, Button, Card, Icon } from '@tka/ui';
import { useState, type Ref } from 'react';
import type { TryoutPackage, TryoutResult } from './types';
import { RichQuestionReview } from './rich-question-review';
import { MathText } from './ui';
import { AnswerMatrix } from './drill-review';

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

export function TryoutHero({ onHistory }: { onHistory: () => void }) {
  return (
    <section className="tryout-catalog-hero" aria-label="Tentang Tryout">
      <div className="tryout-catalog-hero__nav">
        <Link href="/student" aria-label="Kembali ke beranda">
          <Icon name="back" />
        </Link>
        <Button variant="ghost" onClick={onHistory}>
          <Icon name="clock" width={16} height={16} />
          Tryout Saya
        </Button>
      </div>
      <div className="tryout-catalog-hero__body">
        <div className="tryout-catalog-hero__symbol" aria-hidden="true">
          <Icon name="clipboard" width={48} height={48} />
          <span>TKA SMP</span>
        </div>
        <div>
          <span className="tryout-catalog-hero__pill">Gratis untuk siswa</span>
          <h1>Tryout TKA</h1>
          <p>
            Simulasi matematika SMP.
            <br />
            Hasil setelah rilis IRT.
          </p>
        </div>
      </div>
      <p className="tryout-catalog-hero__access">
        TryOut gratis untuk seluruh siswa, Mandiri maupun Sekolah.
      </p>
    </section>
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
          <Badge variant="success">Gratis</Badge>
          <Badge variant="primary">{stateLabels[current.state]}</Badge>
        </div>
        <h2>{current.title}</h2>
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
                <strong>Penyimpanan:</strong> hanya jawaban yang diterima server tersimpan. Refresh
                atau keluar dapat menghilangkan perubahan yang belum tersimpan.
              </li>
              <li>
                <strong>Hasil simulasi:</strong> menunggu rilis IRT; nilai ini bukan nilai TKA
                resmi.
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
}: {
  submitted?: boolean;
  fetching?: boolean;
  onCheck?: () => void;
  xp?: number | null;
}) {
  return (
    <Card fullWidth className="tryout-waiting">
      <span className="tryout-waiting__icon">
        <Icon name={submitted ? 'check' : 'clock'} width={36} height={36} />
      </span>
      <Badge variant="success">Jawaban tersimpan</Badge>
      <h2>{submitted ? 'Jawaban sudah dikirim' : 'Menunggu hasil IRT'}</h2>
      {xp != null && <p><strong>{xp} XP</strong> sudah tercatat. Tanpa bonus waktu.</p>}
      <p>
        Jawaban sudah terkirim. Nilai dan pembahasan tersedia setelah hasil dirilis. Proses IRT
        selesai belum berarti hasil telah dirilis.
      </p>
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

export function TryoutReleasedResult({
  result,
  token,
}: {
  result: TryoutResult;
  token?: string | undefined;
}) {
  const [selected, setSelected] = useState(0);
  const item = result.explanation[selected];
  return (
    <div className="tryout-result-layout">
      <aside>
        <Card fullWidth className="tryout-released-summary">
          <Badge variant="success">Hasil dirilis</Badge>
          <h2>{result.packageTitle}</h2>
          <strong className="tryout-result-score">{result.score ?? 'Tidak tersedia'}</strong>
          {result.mode && result.mode !== 'DEMO' && (
            <p>
              Mode {result.mode} - versi publikasi {result.publicationVersion}
            </p>
          )}
          <p>
            {result.correctCount} dari {result.questionCount} benar
          </p>
          <small>Hasil simulasi, bukan nilai TKA resmi.</small>
        </Card>
        <Card fullWidth className="tryout-result-note">
          <Icon name="info" />
          <p>
            {result.xp != null ? `${result.xp} XP sudah tercatat.` : 'XP attempt versi lama tidak tersedia.'}
            {' '}Tidak ada bonus kecepatan Tryout. Nilai mengikuti hasil server.
          </p>
        </Card>
      </aside>
      <Card fullWidth className="tryout-released-review">
        <h2>Pembahasan</h2>
        <p>Gunakan nomor soal untuk melihat jawaban dan pembahasannya.</p>
        <AnswerMatrix questions={result.explanation} selected={selected} onSelect={setSelected} />
        {item ? (
          <article className="drill-review__question">
            <strong>Soal #{selected + 1}</strong>
            {item.richStem ? (
              <RichQuestionReview question={item} token={token} attemptId={result.attemptId} />
            ) : (
              <>
                <h3>
                  <MathText value={item.stem} />
                </h3>
                <div
                  className={`drill-review__answer ${item.selectedOptionId === item.correctOptionId ? 'drill-review__answer--correct' : 'drill-review__answer--wrong'}`}
                >
                  Jawabanmu: {item.selectedOptionId ?? 'Tidak dijawab'}
                </div>
                <div className="drill-review__answer drill-review__answer--correct">
                  Jawaban benar: {item.correctOptionId}
                </div>
                <div className="drill-review__explanation">
                  <strong>Pembahasan Numora</strong>
                  <p>
                    <MathText value={item.explanation} />
                  </p>
                </div>
              </>
            )}
          </article>
        ) : (
          <p>Pembahasan soal belum tersedia.</p>
        )}
      </Card>
      <Link
        className="button-link button-link--secondary tryout-result-back"
        href="/student/tryout"
      >
        Kembali ke Tryout
        <Icon name="back" width={18} height={18} />
      </Link>
    </div>
  );
}

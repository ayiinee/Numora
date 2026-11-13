'use client';

import Link from 'next/link';
import { Button, Dialog, Icon } from '@tka/ui';
import type { ReactNode } from 'react';
import { StudentMascot } from '@/components/student-mascot';

export function AssessmentExitDialog({
  open,
  title,
  description,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      className="practice-submit-dialog practice-mascot-dialog"
      open={open}
      title={title}
      description={description}
      icon={<StudentMascot pose="practice" />}
      onClose={onClose}
      actions={
        <>
          <Button fullWidth variant="secondary" onClick={onClose}>
            Lanjut mengerjakan
          </Button>
          <Button fullWidth onClick={onConfirm}>
            Ya, keluar dulu
          </Button>
        </>
      }
    >
      <p className="practice-exit-encouragement">Sedikit demi sedikit, kamu makin paham.</p>
    </Dialog>
  );
}

export function AssessmentHeader({
  title = 'Sesi Latihan Soal',
  status,
  timer,
  progress,
  progressLabel = 'Posisi soal',
  exitDisabled = false,
  exitHref = '/student/learn',
  exitLabel = exitHref.endsWith('/result')
    ? 'Kembali ke hasil'
    : exitHref === '/student/tryout'
      ? 'Kembali ke Tryout'
      : 'Kembali ke latihan',
}: {
  title?: string;
  status: ReactNode;
  timer?: ReactNode;
  progress: number;
  progressLabel?: string;
  exitDisabled?: boolean;
  exitHref?: string;
  exitLabel?: string;
}) {
  return (
    <header className="practice-header">
      <div className="practice-header__row">
        {exitDisabled ? (
          <Button variant="secondary" aria-label={exitLabel} disabled>
            <Icon name="back" />
          </Button>
        ) : (
          <Link className="practice-exit" href={exitHref} aria-label={exitLabel}>
            <Icon name="back" />
            <span className="practice-exit__label">{exitLabel}</span>
          </Link>
        )}
        <div className="practice-header__copy">
          <h1>{title}</h1>
          {status}
        </div>
        <div className="practice-timer">{timer}</div>
        {!exitDisabled && (
          <Link className="practice-profile" href="/student/profile" aria-label="Buka profil siswa">
            <Icon name="user" width={20} height={20} />
          </Link>
        )}
      </div>
      <div
        className="practice-header__track"
        role="progressbar"
        aria-label={progressLabel}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
    </header>
  );
}

export function SubmitConfirmation({
  open,
  onClose,
  onConfirm,
  total,
  empty,
  flagged,
  incomplete = [],
  description,
  pending,
  error,
  title = 'Kumpulkan Latihan Sekarang?',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  total: number;
  empty: number[];
  flagged: number[];
  incomplete?: number[];
  description: string;
  pending: boolean;
  error?: string | undefined;
  title?: string;
}) {
  return (
    <Dialog
      className="practice-submit-dialog practice-mascot-dialog"
      icon={<StudentMascot pose="submitted" />}
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      pending={pending}
      actions={
        <>
          <Button fullWidth disabled={pending} onClick={onConfirm}>
            <Icon name="check" />
            {pending ? 'Mengirim jawaban…' : 'Ya, Kumpulkan Jawaban'}
          </Button>
          <Button fullWidth variant="secondary" disabled={pending} onClick={onClose}>
            Periksa Kembali
          </Button>
        </>
      }
    >
      <div className="submit-summary">
        <div className="submit-summary__total">
          <span>Total soal</span>
          <strong>{total} Soal</strong>
        </div>
        <div className="submit-summary__counts">
          <div>
            <span>Terisi lengkap</span>
            <strong>{total - empty.length - incomplete.length}</strong>
          </div>
          <div>
            <span>Kosong</span>
            <strong>{empty.length}</strong>
            {empty.length > 0 && <small>No. {empty.join(', ')}</small>}
          </div>
          <div>
            <span>Ragu</span>
            <strong>{flagged.length}</strong>
            {flagged.length > 0 && <small>No. {flagged.join(', ')}</small>}
          </div>
        </div>
      </div>
      {incomplete.length > 0 && (
        <p role="note" className="submit-incomplete-notice">
          {incomplete.length} soal Kategori belum lengkap (No. {incomplete.join(', ')}). Jawaban
          yang sudah tersimpan tetap dapat dikumpulkan.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error} Coba kirim lagi.
        </p>
      )}
    </Dialog>
  );
}

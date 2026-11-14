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
  progressText,
  exitDisabled = false,
  exitHref = '/student/learn',
}: {
  title?: string;
  status: ReactNode;
  timer?: ReactNode;
  progress?: number;
  progressLabel?: string;
  progressText?: string | undefined;
  exitDisabled?: boolean;
  exitHref?: string;
}) {
  return (
    <header className="practice-header">
      <div className="practice-header__row">
        {exitDisabled ? (
          <Button variant="secondary" aria-label="Kembali ke materi" disabled>
            <Icon name="close" />
          </Button>
        ) : (
          <Link
            className="practice-exit"
            href={exitHref}
            aria-label={exitHref === '/student/tryout' ? 'Kembali ke Tryout' : 'Kembali ke materi'}
          >
            <Icon name="close" />
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
      {progressText && <p className="tryout-session-progress">{progressText}</p>}
      {progress !== undefined && <div
        className="practice-header__track"
        role="progressbar"
        aria-label={progressLabel}
        aria-valuenow={progress}
        aria-valuetext={progressText}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${progress}%` }} />
      </div>}
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
  onReviewQuestion,
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
  onReviewQuestion?: ((position: number) => void) | undefined;
  title?: string;
}) {
  return (
    <Dialog
      className={
        onReviewQuestion
          ? 'practice-submit-dialog tryout-submit-dialog'
          : 'practice-submit-dialog practice-mascot-dialog'
      }
      icon={onReviewQuestion ? undefined : <StudentMascot pose="submitted" />}
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
            {!onReviewQuestion && empty.length > 0 && <small>No. {empty.join(', ')}</small>}
          </div>
          <div>
            <span>{onReviewQuestion ? 'Ragu-ragu' : 'Ragu'}</span>
            <strong>{flagged.length}</strong>
            {!onReviewQuestion && flagged.length > 0 && <small>No. {flagged.join(', ')}</small>}
          </div>
          {onReviewQuestion && (
            <div>
              <span>Kategori belum lengkap</span>
              <strong>{incomplete.length}</strong>
            </div>
          )}
        </div>
      </div>
      {onReviewQuestion && (empty.length > 0 || incomplete.length > 0) && (
        <div className="tryout-submit-review">
          {empty[0] !== undefined && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => onReviewQuestion(empty[0]! - 1)}
            >
              Ke soal kosong
            </Button>
          )}
          {incomplete[0] !== undefined && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => onReviewQuestion(incomplete[0]! - 1)}
            >
              Ke soal belum lengkap
            </Button>
          )}
        </div>
      )}
      {!onReviewQuestion && incomplete.length > 0 && (
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

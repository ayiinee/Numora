'use client';

import { useState } from 'react';
import { Badge, Button, Card, Dialog, Icon } from '@tka/ui';

export type PretestChapterState =
  'unavailable' | 'available' | 'inProgress' | 'completed' | 'skipped' | 'mappingUnavailable';

type PretestAction = () => void | Promise<void>;
type PendingAction = 'start' | 'skip' | 'resume' | 'result';

export function PretestCard({
  chapterTitle,
  state,
  onStart,
  onSkip,
  onResume,
  onViewResult,
}: {
  chapterTitle: string;
  state: PretestChapterState;
  onStart?: PretestAction;
  onSkip?: PretestAction;
  onResume?: PretestAction;
  onViewResult?: PretestAction;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = {
    unavailable: {
      label: 'Belum tersedia',
      description:
        'Pretest untuk bab ini belum dapat dimulai. Kamu tetap bisa belajar dari materi.',
    },
    available: {
      label: 'Opsional',
      description: 'Kenali kemampuan awalmu sebelum mulai berlatih di bab ini.',
    },
    inProgress: {
      label: 'Belum selesai',
      description: 'Lanjutkan Pretest dari jawaban yang sudah tersimpan.',
    },
    completed: {
      label: 'Selesai',
      description: 'Pretest bab ini sudah selesai dan tidak dapat diulang.',
    },
    skipped: {
      label: 'Dilewati',
      description: 'Pretest dilewati. Level 1 pada semua subbab bab ini tersedia.',
    },
    mappingUnavailable: {
      label: 'Hasil tersimpan',
      description:
        'Pemetaan hasil ke level belum tersedia. Level yang sudah terbuka tetap dipertahankan.',
    },
  }[state];

  async function runAction(action: PendingAction, callback: PretestAction | undefined) {
    if (!callback || pending) return;
    setPending(action);
    setError(null);
    try {
      await callback();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tindakan belum berhasil. Coba lagi.');
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <Card className="pretest-card" role="region" aria-label={`Pretest ${chapterTitle}`}>
        <span className="pretest-card__icon" aria-hidden="true">
          <Icon name="clipboard" width={24} height={24} />
        </span>
        <div className="pretest-card__copy">
          <div className="pretest-card__heading">
            <h3>Pretest Bab</h3>
            <Badge variant={state === 'completed' ? 'success' : 'secondary'}>{status.label}</Badge>
          </div>
          <p>{status.description}</p>
          <span className="pretest-card__meta">20 soal · Opsional · Tanpa XP</span>
        </div>
        {state === 'available' && (
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Lihat informasi
          </Button>
        )}
        {state === 'inProgress' && (
          <Button
            disabled={!onResume || pending !== null}
            onClick={() => void runAction('resume', onResume)}
          >
            {pending === 'resume' ? 'Melanjutkan…' : 'Lanjutkan'}
          </Button>
        )}
        {state === 'completed' && onViewResult && (
          <Button
            variant="secondary"
            disabled={pending !== null}
            onClick={() => void runAction('result', onViewResult)}
          >
            {pending === 'result' ? 'Membuka hasil…' : 'Lihat hasil'}
          </Button>
        )}
      </Card>
      {error && state !== 'available' && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {state === 'available' && (
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title={`Pretest ${chapterTitle}`}
          description="Baca informasi ini sebelum memilih tindakan."
          pending={pending !== null}
          icon={<Icon name="clipboard" width={28} height={28} />}
          actions={
            <>
              <Button
                fullWidth
                disabled={!onStart || pending !== null}
                onClick={() => void runAction('start', onStart)}
              >
                {pending === 'start' ? 'Memulai…' : 'Mulai Pretest'}
              </Button>
              <Button
                fullWidth
                variant="secondary"
                disabled={!onSkip || pending !== null}
                onClick={() => void runAction('skip', onSkip)}
              >
                {pending === 'skip' ? 'Melewati…' : 'Skip Pretest'}
              </Button>
            </>
          }
        >
          <ul className="pretest-info-list">
            <li>Pretest berisi 20 soal dan bersifat opsional.</li>
            <li>Pretest yang selesai tidak dapat diulang dan tidak memberikan XP.</li>
            <li>Jika memilih Skip, Level 1 pada semua subbab bab ini akan terbuka.</li>
            <li>Pemetaan skor ke level masih menunggu keputusan Curriculum dan Product.</li>
          </ul>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}

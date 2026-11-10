'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Button, Card } from '@tka/ui';
import { request } from './api';
import { LearningFrame } from './ui';
import { StudentSectionHeader } from './student-section-header';
import type {
  StudentTryoutBatchesDto,
  StudentTryoutBatchDto,
  TryoutAttemptDto,
} from './generated-types';

const wib = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value)) + ' WIB';
export function ManagedTryouts({
  token,
  data,
  refresh,
}: {
  token: string;
  data: StudentTryoutBatchesDto;
  refresh: () => void;
}) {
  const [history, setHistory] = useState(false);
  const visible = data.items.filter((b) => (history ? b.state === 'CLOSED' : b.state !== 'CLOSED'));
  return (
    <LearningFrame
      title="Tryout TKA"
      className="tryout-shell tryout-shell--catalog"
      mobileHeader={<StudentSectionHeader title="Tryout TKA" />}
    >
      <div className="admin-content-actions">
        <Button variant={!history ? 'primary' : 'secondary'} onClick={() => setHistory(false)}>
          Tryout tersedia
        </Button>
        <Button variant={history ? 'primary' : 'secondary'} onClick={() => setHistory(true)}>
          Riwayat batch
        </Button>
        <Button variant="secondary" onClick={refresh}>
          Muat ulang
        </Button>
      </div>
      {!visible.length && (
        <Card>
          <p>{history ? 'Belum ada riwayat batch.' : 'Belum ada batch yang tersedia untukmu.'}</p>
        </Card>
      )}
      <div className="activity-list">
        {visible.map((b) => (
          <StudentBatch key={b.id} batch={b} token={token} />
        ))}
      </div>
      <Link className="button-link" href="/student/tryout/history">
        Riwayat Tryout sebelumnya
      </Link>
    </LearningFrame>
  );
}
function StudentBatch({ batch: b, token }: { batch: StudentTryoutBatchDto; token: string }) {
  const router = useRouter();
  const [school, setSchool] = useState(b.schools.length === 1 ? b.schools[0]!.schoolId : '');
  const [accepted, setAccepted] = useState(false);
  const start = useMutation({
    mutationFn: () =>
      request<TryoutAttemptDto>(token, `/tryout/batches/${b.id}/attempts`, {
        method: 'POST',
        body: JSON.stringify(school ? { schoolId: school } : {}),
      }),
    onSuccess: (attempt) => router.push(`/student/tryout/${attempt.id}`),
  });
  const working = b.attemptId && b.attemptStatus === 'IN_PROGRESS';
  return (
    <Card fullWidth>
      <h2>{b.title}</h2>
      <p>
        {wib(b.startsAt)} — {wib(b.closesAt)}
      </p>
      <p>30 soal · 10 menit · Satu kesempatan per batch</p>
      {b.attemptId ? (
        <Link
          className="button-link"
          href={`/student/tryout/${b.attemptId}${working ? '' : '/result'}`}
        >
          {working ? 'Lanjutkan pengerjaan' : 'Lihat status hasil'}
        </Link>
      ) : b.state === 'SCHEDULED' ? (
        <p>Belum dimulai.</p>
      ) : b.state === 'CLOSED' ? (
        <p>Batch sudah ditutup.</p>
      ) : (
        <>
          {b.schools.length > 1 ? (
            <label>
              Sekolah untuk Tryout ini
              <select value={school} onChange={(e) => setSchool(e.target.value)}>
                <option value="">Pilih sekolah</option>
                {b.schools.map((s) => (
                  <option key={s.schoolId} value={s.schoolId}>
                    {s.schoolName}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>{b.mandiri ? 'Peserta Mandiri' : b.schools[0]?.schoolName}</p>
          )}
          <p>
            Pilihan sekolah dan paket dikunci setelah mulai. Waktu pengerjaan berakhir paling lambat
            saat batch ditutup.
          </p>
          <label>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            Saya memahami aturan pengerjaan.
          </label>
          {start.isError && <p role="alert">{start.error.message}</p>}
          <Button
            disabled={!accepted || (!b.mandiri && !school) || start.isPending || start.isSuccess}
            onClick={() => start.mutate()}
          >
            {start.isPending ? 'Memulai…' : 'Mulai Tryout'}
          </Button>
        </>
      )}
      <p>Hasil dan pembahasan paling lambat {wib(b.resultDueAt)}.</p>
    </Card>
  );
}

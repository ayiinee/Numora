'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Badge, Button, Card, Dialog, EmptyState, Icon } from '@tka/ui';
import { StudentMascot } from '@/components/student-mascot';
import { request } from './api';
import type { StudentTryoutBatchDto, TryoutAttemptDto } from './generated-types';

const wib = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value)) + ' WIB';
export function TryoutBatchList({
  token,
  batches,
  history = false,
}: {
  token: string;
  batches: StudentTryoutBatchDto[];
  history?: boolean;
}) {
  const visible = batches.filter((batch) => (batch.state === 'CLOSED') === history);
  return visible.length ? (
    <div className="tryout-student-batch-list">
      {visible.map((batch) => (
        <StudentBatch key={batch.id} batch={batch} token={token} />
      ))}
    </div>
  ) : (
    <Card fullWidth>
      <EmptyState
        icon={<StudentMascot pose={history ? 'history' : 'calendar'} />}
        title={history ? 'Belum ada Tryout terlewat' : 'Belum ada Tryout tersedia'}
        description={
          history
            ? 'Tryout yang jadwalnya sudah berakhir akan muncul di sini.'
            : 'Jadwal Tryout yang tersedia untukmu akan muncul di sini.'
        }
      />
    </Card>
  );
}

function StudentBatch({ batch: b, token }: { batch: StudentTryoutBatchDto; token: string }) {
  const router = useRouter();
  const [school, setSchool] = useState(b.schools.length === 1 ? b.schools[0]!.schoolId : '');
  const [accepted, setAccepted] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const start = useMutation({
    mutationFn: () =>
      request<TryoutAttemptDto>(token, `/tryout/batches/${b.id}/attempts`, {
        method: 'POST',
        body: JSON.stringify(school ? { schoolId: school } : {}),
      }),
    onSuccess: (attempt) => router.push(`/student/tryout/${attempt.id}`),
  });
  const starting = start.isPending || start.isSuccess;
  const working = b.attemptId && b.attemptStatus === 'IN_PROGRESS';
  return (
    <Card fullWidth className="tryout-catalog-card tryout-student-batch">
      <div className="tryout-catalog-card__heading tryout-student-batch__heading">
        <div>
          <div className="tryout-badges">
            <Badge variant={b.state === 'OPEN' ? 'success' : 'secondary'}>
              {b.state === 'SCHEDULED'
                ? 'Terjadwal'
                : b.state === 'CLOSED'
                  ? 'Ditutup'
                  : 'Berlangsung'}
            </Badge>
          </div>
          <h2>{b.title}</h2>
        </div>
        <StudentMascot pose={b.state === 'CLOSED' ? 'history' : 'calendar'} compact />
      </div>
      <div className="tryout-catalog-card__body">
        <span className="tryout-package-symbol" aria-hidden="true">
          <Icon name="clock" />
        </span>
        <div>
          <strong>Jadwal pengerjaan</strong>
          <p>
            {wib(b.startsAt)} — {wib(b.closesAt)}
          </p>
          <span>30 soal · 10 menit · Satu kesempatan per jadwal Tryout</span>
        </div>
      </div>
      <div className="tryout-student-batch__actions">
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
          <p>Jadwal Tryout sudah berakhir.</p>
        ) : (
          <>
            <Button
              aria-haspopup="dialog"
              onClick={() => {
                setSchool(b.schools.length === 1 ? b.schools[0]!.schoolId : '');
                setAccepted(false);
                start.reset();
                setRulesOpen(true);
              }}
            >
              Mulai Tryout
            </Button>
            <Dialog
              className="tryout-student-rules-dialog"
              open={rulesOpen}
              onClose={() => setRulesOpen(false)}
              title="Aturan pengerjaan Tryout"
              pending={starting}
              icon={<StudentMascot pose="calendar" compact />}
              actions={
                <>
                  <Button
                    disabled={!accepted || (!b.mandiri && !school) || starting}
                    onClick={() => start.mutate()}
                  >
                    {starting ? 'Memulai…' : 'Mulai pengerjaan'}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={starting}
                    onClick={() => setRulesOpen(false)}
                  >
                    Batal
                  </Button>
                </>
              }
            >
              <div className="tryout-student-batch__rules">
                {b.schools.length > 1 ? (
                  <label className="tryout-student-batch__school">
                    Sekolah untuk Tryout ini
                    <select
                      value={school}
                      disabled={starting}
                      onChange={(e) => setSchool(e.target.value)}
                    >
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
                <p className="tryout-rules-facts">
                  30 soal · Maksimal 10 menit, dibatasi akhir jadwal
                </p>
                <p>
                  Pilihan sekolah dan paket dikunci setelah mulai. Kamu memiliki satu kesempatan
                  pada jadwal Tryout ini. Timer tidak dapat dijeda saat kamu keluar atau memuat
                  ulang halaman. Jawaban dikirim otomatis ketika waktu habis atau jadwal berakhir,
                  mana yang lebih dahulu.
                </p>
                <p>
                  Hanya jawaban yang sudah tersimpan yang ikut dikumpulkan. Perhatikan status
                  penyimpanan sebelum berpindah atau keluar.
                </p>
                <p>
                  Batas akhir pengerjaan: {wib(b.closesAt)}. Hasil dan pembahasan tersedia paling
                  lambat {wib(b.resultDueAt)}.
                </p>
                <label className="tryout-student-batch__consent">
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={starting}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  Saya memahami aturan pengerjaan.
                </label>
                {start.isError && (
                  <p className="form-error" role="alert">
                    {start.error.message}
                  </p>
                )}
              </div>
            </Dialog>
          </>
        )}
      </div>
      <p className="tryout-inline-status">
        Hasil dan pembahasan paling lambat {wib(b.resultDueAt)}.
      </p>
    </Card>
  );
}

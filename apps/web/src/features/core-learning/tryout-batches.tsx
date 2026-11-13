'use client';
import Link from 'next/link';
import { Fragment, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Dialog, EmptyState, Icon } from '@tka/ui';
import { StudentMascot } from '@/components/student-mascot';
import { request } from './api';
import type { StudentTryoutBatchDto, TryoutAttemptDto } from './generated-types';
import { TryoutSchedule, TryoutStartRules } from './tryout-presentation';
import { refreshTryoutStatus, scheduledTryouts } from './tryout-queries';
export function TryoutBatchList({
  token,
  batches,
  history = false,
}: {
  token: string;
  batches: StudentTryoutBatchDto[];
  history?: boolean;
}) {
  const [rulesBatchId, setRulesBatchId] = useState<string | null>(null);
  const eligible = history
    ? batches.filter((batch) => batch.state === 'CLOSED' && !batch.attemptId)
    : scheduledTryouts(batches);
  const visible = history
    ? eligible
    : [
        ...eligible.filter((batch) => batch.state !== 'SCHEDULED'),
        ...eligible.filter((batch) => batch.state === 'SCHEDULED'),
      ];
  const rulesBatch = rulesBatchId && batches.find((batch) => batch.id === rulesBatchId);
  if (rulesBatch && !visible.some((batch) => batch.id === rulesBatch.id))
    visible.unshift(rulesBatch);
  const upcomingIndex = history ? -1 : visible.findIndex((batch) => batch.state === 'SCHEDULED');
  return visible.length ? (
    <div className="tryout-student-batch-list">
      {visible.map((batch, index) => (
        <Fragment key={batch.id}>
          {index === upcomingIndex && <h2 className="tryout-upcoming-heading">Akan datang</h2>}
          <StudentBatch
            batch={batch}
            token={token}
            rulesOpen={rulesBatchId === batch.id}
            setRulesOpen={(open) => setRulesBatchId(open ? batch.id : null)}
          />
        </Fragment>
      ))}
    </div>
  ) : (
    <Card fullWidth>
      <EmptyState
        icon={<StudentMascot pose={history ? 'history' : 'calendar'} />}
        title={history ? 'Belum ada Tryout terlewat' : 'Belum ada jadwal Tryout'}
        description={
          history
            ? 'Tryout yang ditutup sebelum kamu mengerjakannya akan muncul di sini.'
            : 'Jadwal Tryout yang tersedia untukmu akan muncul di sini.'
        }
      />
    </Card>
  );
}

function StudentBatch({
  batch: b,
  token,
  rulesOpen,
  setRulesOpen,
}: {
  batch: StudentTryoutBatchDto;
  token: string;
  rulesOpen: boolean;
  setRulesOpen: (open: boolean) => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const startingRef = useRef(false);
  const [school, setSchool] = useState(b.schools.length === 1 ? b.schools[0]!.schoolId : '');
  const [accepted, setAccepted] = useState(false);
  const selectedSchool =
    b.schools.length === 1 ? b.schools[0] : b.schools.find(({ schoolId }) => schoolId === school);
  const start = useMutation({
    mutationFn: () =>
      request<TryoutAttemptDto>(token, `/tryout/batches/${b.id}/attempts`, {
        method: 'POST',
        body: JSON.stringify(
          !b.mandiri && selectedSchool ? { schoolId: selectedSchool.schoolId } : {},
        ),
      }),
    onSuccess: (attempt) => {
      refreshTryoutStatus(client);
      router.push(`/student/tryout/${attempt.id}`);
    },
    onError: () => {
      startingRef.current = false;
      refreshTryoutStatus(client);
    },
  });
  const starting = start.isPending || start.isSuccess;
  const working =
    b.attemptId && b.attemptStatus === 'IN_PROGRESS' && b.state === 'OPEN' && b.canResume === true;
  const canStart = b.state === 'OPEN' && !b.attemptId && (b.mandiri || !!selectedSchool);
  return (
    <Card fullWidth className="tryout-catalog-card tryout-student-batch">
      <div className="tryout-catalog-card__heading tryout-student-batch__heading">
        <div>
          <div className="tryout-badges">
            <Badge variant={b.state === 'OPEN' ? 'success' : 'secondary'}>
              {working
                ? 'Sedang dikerjakan'
                : b.state === 'SCHEDULED'
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
          <TryoutSchedule opensAt={b.startsAt} closesAt={b.closesAt} />
          <span>30 soal · 10 menit</span>
        </div>
      </div>
      <div
        className={b.attemptId || b.state === 'OPEN' ? 'tryout-student-batch__actions' : undefined}
      >
        {b.attemptId ? (
          <Link className="button-link" href={`/student/tryout/${b.attemptId}`}>
            {working ? 'Lanjutkan pengerjaan' : 'Periksa status sesi'}
          </Link>
        ) : (
          b.state === 'OPEN' && (
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
          )
        )}
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
                disabled={!accepted || !canStart || starting}
                onClick={() => {
                  if (startingRef.current || !canStart || !accepted) return;
                  startingRef.current = true;
                  start.mutate();
                }}
              >
                {starting ? 'Memulai…' : 'Mulai pengerjaan'}
              </Button>
              <Button variant="secondary" disabled={starting} onClick={() => setRulesOpen(false)}>
                Batal
              </Button>
            </>
          }
        >
          <div className="tryout-student-batch__rules">
            <TryoutStartRules questionCount={30} durationSeconds={600} closeAt={b.closesAt} batch />
            {(b.state !== 'OPEN' || b.attemptId) && (
              <p role="alert">
                {b.attemptId
                  ? 'Sesi sudah tersedia. Tutup aturan untuk melihat status sesi.'
                  : 'Jadwal Tryout berubah. Batch ini sudah tidak bisa dimulai.'}
              </p>
            )}
            {b.schools.length > 1 ? (
              <label className="tryout-student-batch__school">
                Sekolah untuk Tryout ini
                <select
                  required
                  disabled={starting}
                  value={selectedSchool?.schoolId ?? ''}
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
              <p>
                {b.mandiri
                  ? 'Peserta Mandiri'
                  : b.schools[0]
                    ? `Sekolah: ${b.schools[0].schoolName}`
                    : 'Sekolah belum tersedia'}
              </p>
            )}
            {start.isError && (
              <p className="form-error" role="alert">
                {start.error.message}
              </p>
            )}
            <label className="tryout-student-batch__consent">
              <input
                type="checkbox"
                checked={accepted}
                disabled={starting}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              Saya memahami aturan pengerjaan.
            </label>
          </div>
        </Dialog>
      </div>
    </Card>
  );
}

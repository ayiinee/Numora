'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, EmptyState, Icon, SectionHeader, Textarea } from '@tka/ui';
import { TeacherShell } from '@/components/shell';
import { ApiProblem, getTeacherStudentProgress } from '@/lib/api';
import { DataState } from '@/features/core-learning/ui';
import { TeacherGate } from './teacher-gate';
import { TeacherAnnouncement } from './teacher-ui';
import { getTeacherFeedback, sendTeacherFeedback } from './teacher-feedback-api';

const formatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'medium',
  timeStyle: 'short',
});
export function TeacherFeedbackScreen({
  classId,
  studentId,
}: {
  classId: string;
  studentId: string;
}) {
  return (
    <TeacherGate>
      {(token, name) => (
        <Feedback token={token} teacherName={name} classId={classId} studentId={studentId} />
      )}
    </TeacherGate>
  );
}
function Feedback({
  token,
  teacherName,
  classId,
  studentId,
}: {
  token: string;
  teacherName: string;
  classId: string;
  studentId: string;
}) {
  const progress = useQuery({
    queryKey: ['student-progress', classId, studentId],
    queryFn: () => getTeacherStudentProgress(token, classId, studentId),
  });
  return (
    <TeacherShell
      title="Feedback siswa"
      description={progress.data?.class.name}
      teacherName={teacherName}
      backHref={`/teacher/classes/${classId}/students/${studentId}`}
    >
      <div className="teacher-page-stack">
        <TeacherAnnouncement>
          Feedback berupa catatan teks satu arah untuk siswa yang dipilih.
        </TeacherAnnouncement>
        {progress.isPending || progress.isError ? (
          <DataState
            pending={progress.isPending}
            error={progress.error}
            retry={() => void progress.refetch()}
          />
        ) : (
          <FeedbackWorkspace
            key={`${classId}/${studentId}`}
            token={token}
            classId={classId}
            studentId={studentId}
            studentName={progress.data.student.displayName}
          />
        )}
      </div>
    </TeacherShell>
  );
}

export function FeedbackWorkspace({
  token,
  classId,
  studentId,
  studentName,
}: {
  token: string;
  classId: string;
  studentId: string;
  studentName: string;
}) {
  const cache = useQueryClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const request = useRef<{ body: string; id: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState('');
  const history = useInfiniteQuery({
    queryKey: ['teacher-feedback', classId, studentId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getTeacherFeedback(token, classId, studentId, pageParam),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const accessFailure = [error, history.error].find(
    (failure): failure is ApiProblem =>
      failure instanceof ApiProblem && [401, 403, 404].includes(failure.status),
  );
  const entries = [
    ...new Map(
      (history.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item]),
    ).values(),
  ];
  async function send(event: FormEvent) {
    event.preventDefault();
    const message = body.trim();
    if (sending.current || !message || message.length > 1000) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setSuccess('');
    // A lost acknowledgement must retry with the same UUID and the same payload.
    try {
      if (!request.current || request.current.body !== message)
        request.current = { body: message, id: crypto.randomUUID() };
      await sendTeacherFeedback(token, classId, studentId, {
        clientRequestId: request.current.id,
        body: message,
      });
      request.current = null;
      setBody('');
      setSuccess(`Feedback berhasil dikirim kepada ${studentName}.`);
      void cache.invalidateQueries({ queryKey: ['teacher-feedback', classId, studentId] });
    } catch (err) {
      setError(err);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  if (accessFailure)
    return (
      <DataState
        pending={false}
        error={accessFailure}
        retry={() => {
          void history.refetch().then((result) => {
            if (result.isSuccess) setError(null);
          });
        }}
      />
    );
  return (
    <div className="teacher-feedback-layout">
      <Card className="teacher-feedback-composer">
        <SectionHeader title="Tulis feedback" />
        <div className="teacher-feedback-recipient">
          <Avatar name={studentName} />
          <div>
            <strong>{studentName}</strong>
            <Link href={`/teacher/classes/${classId}/students/${studentId}`}>
              Lihat progres siswa <Icon name="arrow" width={16} height={16} />
            </Link>
          </div>
        </div>
        <form onSubmit={(event) => void send(event)}>
          <Textarea
            label="Pesan feedback"
            placeholder="Tulis arahan atau apresiasi untuk siswa…"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setSuccess('');
            }}
            maxLength={1000}
            rows={8}
            required
            disabled={busy}
          />
          <p className="teacher-character-count">{body.length} / 1.000 karakter</p>
          {error !== null && (
            <p role="alert" className="form-error">
              {error instanceof Error ? error.message : 'Feedback belum dapat dikirim.'}
            </p>
          )}
          {error instanceof ApiProblem && error.status === 401 && (
            <Link className="button-link" href="/">
              Masuk kembali
            </Link>
          )}
          {success && (
            <p className="teacher-feedback-success" role="status">
              <Icon name="check" />
              {success}
            </p>
          )}
          <Button type="submit" fullWidth loading={busy} disabled={busy || !body.trim()}>
            <Icon name="chat" />
            {busy ? 'Mengirim…' : 'Kirim feedback'}
          </Button>
        </form>
        <p className="teacher-help-text">Pesan dikirim hanya kepada siswa yang dipilih.</p>
      </Card>
      <section className="teacher-feedback-history">
        <SectionHeader title="Riwayat feedback" subtitle={`Untuk ${studentName}`} />
        <Card>
          <p className="teacher-help-text">
            {entries.length} catatan dimuat
            {history.hasNextPage ? ' · masih ada riwayat sebelumnya' : ''}.
          </p>
        </Card>
        {history.isPending || (history.isError && !history.data) ? (
          <DataState
            pending={history.isPending}
            error={history.error}
            retry={() => void history.refetch()}
          />
        ) : (
          <>
            {entries.map((item) => (
              <Card className="teacher-feedback-entry" key={item.id}>
                <div className="teacher-feedback-entry__header">
                  <strong>{item.teacherName}</strong>
                </div>
                <p>{item.body}</p>
                <time dateTime={item.sentAt}>{formatter.format(new Date(item.sentAt))} WIB</time>
              </Card>
            ))}
            {!entries.length && (
              <Card>
                <EmptyState
                  icon={<Icon name="chat" />}
                  title="Belum ada feedback"
                  description="Kirim catatan pertama untuk mendampingi siswa ini."
                />
              </Card>
            )}
            {history.isError && (
              <DataState
                pending={false}
                error={history.error}
                retry={() =>
                  history.isFetchNextPageError
                    ? void history.fetchNextPage()
                    : void history.refetch()
                }
              />
            )}
            {history.hasNextPage && (
              <Button
                variant="secondary"
                fullWidth
                loading={history.isFetchingNextPage}
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                Muat riwayat sebelumnya
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

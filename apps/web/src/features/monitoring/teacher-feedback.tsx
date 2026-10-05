'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  SectionHeader,
  Select,
  Textarea,
} from '@tka/ui';
import { TeacherShell } from '@/components/shell';
import { ApiProblem } from '@/lib/api';
import { DataState } from '@/features/core-learning/ui';
import { TeacherGate } from './teacher-gate';
import { useTeacherClassContext } from './teacher-data';
import { TeacherAnnouncement } from './teacher-ui';
import { getTeacherFeedback, sendTeacherFeedback } from './teacher-feedback-api';

const formatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'medium',
  timeStyle: 'short',
});
export function TeacherFeedbackScreen() {
  const params = useSearchParams();
  return (
    <TeacherGate>
      {(token, name) => (
        <Feedback
          key={`${params.get('classId') ?? ''}/${params.get('studentId') ?? ''}`}
          token={token}
          teacherName={name}
          initialClassId={params.get('classId') ?? ''}
          initialStudentId={params.get('studentId') ?? ''}
        />
      )}
    </TeacherGate>
  );
}
function Feedback({
  token,
  teacherName,
  initialClassId,
  initialStudentId,
}: {
  token: string;
  teacherName: string;
  initialClassId: string;
  initialStudentId: string;
}) {
  const context = useTeacherClassContext(token, initialClassId);
  const [selectedId, setSelectedId] = useState(initialStudentId);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const studentId = selectedId || context.roster.data?.items[0]?.id || '';
  const student = context.roster.isSuccess
    ? context.roster.data.items.find((value) => value.id === studentId)
    : undefined;
  return (
    <TeacherShell
      title="Feedback siswa"
      description="Berikan arahan belajar melalui catatan pribadi."
      teacherName={teacherName}
    >
      <div className="teacher-page-stack">
        <TeacherAnnouncement>
          Feedback berupa catatan teks satu arah. Siswa dapat membaca catatan Anda; status baca
          tampil pada riwayat.
        </TeacherAnnouncement>
        {context.classes.isPending || context.classes.isError ? (
          <DataState
            pending={context.classes.isPending}
            error={context.classes.error}
            retry={() => void context.classes.refetch()}
          />
        ) : !context.classes.data.items.length ? (
          <Card>
            <EmptyState
              icon={<Icon name="users" />}
              title="Belum ada kelas"
              description="Buat kelas dan undang siswa untuk mengirim feedback."
            />
            <Link className="button-link" href="/teacher">
              Buka kelas saya
            </Link>
          </Card>
        ) : (
          <>
            <Card className="teacher-recipient-picker">
              <Select
                label="Pilih kelas"
                disabled={sendingFeedback}
                value={context.classId}
                onChange={(event) => {
                  context.setSelection(event.target.value);
                  setSelectedId('');
                }}
                options={context.classes.data.items.map((value) => ({
                  value: value.id,
                  label: value.name,
                }))}
              />
              {context.roster.isSuccess && context.roster.data.items.length > 0 && (
                <Select
                  label="Penerima feedback"
                  disabled={sendingFeedback}
                  value={studentId}
                  onChange={(event) => setSelectedId(event.target.value)}
                  options={context.roster.data.items.map((value) => ({
                    value: value.id,
                    label: value.displayName,
                  }))}
                />
              )}
            </Card>
            {context.invalidError ? (
              <DataState
                pending={false}
                error={context.invalidError}
                retry={() => context.setSelection('')}
              />
            ) : context.roster.isPending || context.roster.isError ? (
              <DataState
                pending={context.roster.isPending}
                error={context.roster.error}
                retry={() => void context.roster.refetch()}
              />
            ) : !context.roster.data.items.length ? (
              <Card>
                <EmptyState
                  icon={<Icon name="users" />}
                  title="Belum ada siswa"
                  description="Siswa yang bergabung akan tersedia sebagai penerima feedback."
                />
              </Card>
            ) : !student ? (
              <DataState
                pending={false}
                error={
                  new ApiProblem(
                    404,
                    'STUDENT_NOT_FOUND',
                    'Penerima tidak tersedia dalam kelas ini.',
                  )
                }
                retry={() => setSelectedId('')}
              />
            ) : (
              <FeedbackWorkspace
                key={`${context.classId}/${studentId}`}
                token={token}
                classId={context.classId}
                studentId={studentId}
                studentName={student.displayName}
                onSendingChange={setSendingFeedback}
              />
            )}
          </>
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
  onSendingChange,
}: {
  token: string;
  classId: string;
  studentId: string;
  studentName: string;
  onSendingChange?: (busy: boolean) => void;
}) {
  const cache = useQueryClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const request = useRef<{ body: string; id: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState('all');
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
  const filtered = entries.filter(
    (item) => filter === 'all' || (filter === 'read' ? item.readAt !== null : item.readAt === null),
  );
  async function send(event: FormEvent) {
    event.preventDefault();
    const message = body.trim();
    if (sending.current || !message || message.length > 1000) return;
    sending.current = true;
    onSendingChange?.(true);
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
      onSendingChange?.(false);
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
          <Select
            label="Status baca"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            options={[
              { value: 'all', label: 'Semua catatan' },
              { value: 'unread', label: 'Belum dibaca' },
              { value: 'read', label: 'Sudah dibaca' },
            ]}
          />
          <p className="teacher-help-text">
            {entries.length} catatan dimuat
            {history.hasNextPage ? ' · masih ada riwayat sebelumnya' : ''}. Filter berlaku pada
            catatan yang dimuat.
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
            {filtered.map((item) => (
              <Card className="teacher-feedback-entry" key={item.id}>
                <div className="teacher-feedback-entry__header">
                  <strong>{item.teacherName}</strong>
                  <Badge variant={item.readAt ? 'success' : 'default'}>
                    <Icon name={item.readAt ? 'check' : 'clock'} width={14} height={14} />
                    {item.readAt ? 'Sudah dibaca' : 'Belum dibaca'}
                  </Badge>
                </div>
                <p>{item.body}</p>
                <time dateTime={item.sentAt}>{formatter.format(new Date(item.sentAt))} WIB</time>
                {item.readAt && <small>Dibaca {formatter.format(new Date(item.readAt))} WIB</small>}
              </Card>
            ))}
            {!filtered.length && (
              <Card>
                <EmptyState
                  icon={<Icon name="chat" />}
                  title={entries.length ? 'Tidak ada catatan sesuai filter' : 'Belum ada feedback'}
                  description={
                    entries.length
                      ? 'Ubah filter atau muat riwayat sebelumnya.'
                      : 'Kirim catatan pertama untuk mendampingi siswa ini.'
                  }
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

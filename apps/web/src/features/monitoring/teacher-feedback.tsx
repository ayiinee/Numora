'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, Icon, SectionHeader, Textarea } from '@tka/ui';
import { UserAvatar as Avatar } from '@/features/onboarding/user-avatar';
import { ApiProblem } from '@/lib/api';
import { DataState } from '@/features/core-learning/ui';
import { getTeacherFeedback, sendTeacherFeedback } from './teacher-feedback-api';
import { jakartaTime, teacherAccessFailure, teacherKeys } from './teacher-query';
import { useUnsavedWarning } from '@/features/core-learning/use-unsaved-warning';

export function FeedbackWorkspace({
  token,
  classId,
  studentId,
  studentName,
  onAccessFailure,
}: {
  token: string;
  classId: string;
  studentId: string;
  studentName: string;
  onAccessFailure?: (error: ApiProblem) => void;
}) {
  const cache = useQueryClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const request = useRef<{ body: string; id: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState('');
  const history = useInfiniteQuery({
    queryKey: teacherKeys.feedback(classId, studentId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getTeacherFeedback(token, classId, studentId, pageParam),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const accessFailure = teacherAccessFailure(error, history.error);
  useEffect(() => {
    if (accessFailure) onAccessFailure?.(accessFailure);
  }, [accessFailure, onAccessFailure]);
  useUnsavedWarning(Boolean(body.trim()) && !accessFailure, false, undefined, {
    message: 'Catatan belum dikirim. Keluar dari siswa ini dan hapus draft?',
    ignoreSearchChanges: true,
  });
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
      setSuccess('Catatan terkirim.');
      void cache.invalidateQueries({ queryKey: teacherKeys.feedback(classId, studentId) });
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
        <SectionHeader title="Tulis catatan" />
        <div className="teacher-feedback-recipient">
          <Avatar userId={studentId} name={studentName} />
          <div>
            <strong>{studentName}</strong>
            <small>Catatan satu arah</small>
          </div>
        </div>
        <form onSubmit={(event) => void send(event)}>
          <Textarea
            label="Catatan untuk siswa"
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
            {busy ? 'Mengirim…' : 'Kirim catatan'}
          </Button>
        </form>
      </Card>
      <section className="teacher-feedback-history">
        <SectionHeader title="Catatan sebelumnya" subtitle={`Untuk ${studentName}`} />
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
                <time dateTime={item.sentAt}>{jakartaTime.format(new Date(item.sentAt))} WIB</time>
              </Card>
            ))}
            {!entries.length && (
              <Card>
                <EmptyState
                  icon={<Icon name="chat" />}
                  title="Belum ada catatan"
                  description="Catatan yang Anda kirim akan tampil di sini."
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

'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, Icon, SectionHeader, Textarea } from '@tka/ui';
import { TeacherShell } from '@/components/shell';
import type { AssessmentRecordDto } from '../core-learning/generated-types';
import { DataState, Panel } from '../core-learning/ui';
import { TeacherGate } from '../monitoring/teacher-screens';
import { FEEDBACK_BODY_MAX_LENGTH, feedbackApi } from './api';

const stamp = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});
const day = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' });

export function TeacherFeedbackPanel({
  token,
  classId,
  studentId,
}: {
  token: string;
  classId: string;
  studentId: string;
}) {
  return (
    <div className="stack">
      <FeedbackSendForm token={token} classId={classId} studentId={studentId} />
      <SentFeedbackList token={token} classId={classId} studentId={studentId} />
      <StudentAssessmentHistory token={token} classId={classId} studentId={studentId} />
    </div>
  );
}

export function TeacherFeedbackScreen({
  classId,
  studentId,
  studentName,
}: {
  classId: string;
  studentId: string;
  studentName?: string;
}) {
  return (
    <TeacherGate>
      {(token, teacherName) => (
        <TeacherShell title={studentName ?? 'Catatan siswa'} teacherName={teacherName}>
          <TeacherFeedbackPanel token={token} classId={classId} studentId={studentId} />
        </TeacherShell>
      )}
    </TeacherGate>
  );
}

function FeedbackSendForm({
  token,
  classId,
  studentId,
}: {
  token: string;
  classId: string;
  studentId: string;
}) {
  const client = useQueryClient();
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const sending = useRef(false);
  const attempt = useRef<{ payload: string; id: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = body.trim();
    if (sending.current || !payload) return;
    sending.current = true;
    setState('saving');
    try {
      const current =
        attempt.current?.payload === payload
          ? attempt.current
          : { payload, id: crypto.randomUUID() };
      attempt.current = current;
      await feedbackApi.send(token, classId, studentId, {
        clientRequestId: current.id,
        body: payload,
      });
      attempt.current = null;
      setBody('');
      setState('success');
      void client.invalidateQueries({ queryKey: ['teacher-feedback', classId, studentId] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Catatan belum terkirim.');
      setState('error');
    } finally {
      sending.current = false;
    }
  }

  return (
    <Panel>
      <SectionHeader
        title="Kirim catatan"
        subtitle={`Satu arah untuk siswa ini, maksimal ${FEEDBACK_BODY_MAX_LENGTH} karakter.`}
      />
      <form
        className="space-y-3"
        aria-label="Kirim catatan untuk siswa"
        onSubmit={(event) => void submit(event)}
      >
        <Textarea
          label="Catatan untuk siswa"
          value={body}
          maxLength={FEEDBACK_BODY_MAX_LENGTH}
          disabled={state === 'saving'}
          helper={`${body.length} dari ${FEEDBACK_BODY_MAX_LENGTH} karakter.`}
          error={state === 'error' ? error : ''}
          onChange={(event) => {
            setBody(event.target.value);
            if (state !== 'idle') setState('idle');
          }}
        />
        {state === 'success' && (
          <p className="success-message" role="status">
            Catatan terkirim.
          </p>
        )}
        <Button type="submit" disabled={state === 'saving' || !body.trim()}>
          {state === 'saving'
            ? 'Mengirim…'
            : state === 'error'
              ? 'Kirim ulang catatan'
              : 'Kirim catatan'}
        </Button>
      </form>
    </Panel>
  );
}

function SentFeedbackList({
  token,
  classId,
  studentId,
}: {
  token: string;
  classId: string;
  studentId: string;
}) {
  const query = useInfiniteQuery({
    queryKey: ['teacher-feedback', classId, studentId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => feedbackApi.teacherList(token, classId, studentId, pageParam),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isPending || (query.isError && !query.data))
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );

  return (
    <section aria-label="Catatan yang sudah dikirim">
      <SectionHeader
        title="Catatan terkirim"
        subtitle="Status baca ikut saat siswa membuka catatan."
      />
      {items.length ? (
        <Panel>
          <ul className="mt-3 space-y-4">
            {items.map((item) => (
              <li
                key={item.id}
                className="border-t border-[var(--color-border)] pt-4 first:border-t-0 first:pt-0"
              >
                <p className="whitespace-pre-wrap break-words">{item.body}</p>
                <p className="mt-1 text-xs text-slate-700">
                  <time dateTime={item.sentAt}>{stamp.format(new Date(item.sentAt))}</time>
                  {' · '}
                  {item.readAt === null ? (
                    'Belum dibaca'
                  ) : (
                    <time dateTime={item.readAt}>Dibaca {stamp.format(new Date(item.readAt))}</time>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Card>
          <EmptyState
            icon={<Icon name="mail" />}
            title="Belum ada catatan terkirim"
            description="Catatan yang kamu kirim tersimpan di sini beserta status bacanya."
          />
        </Card>
      )}
      {query.hasNextPage && (
        <Button
          className="load-more"
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Memuat…' : 'Muat catatan lain'}
        </Button>
      )}
      {query.isFetchNextPageError && (
        <p className="form-error" role="alert">
          Catatan berikutnya belum dapat dimuat. Coba muat kembali.
        </p>
      )}
    </section>
  );
}

function StudentAssessmentHistory({
  token,
  classId,
  studentId,
}: {
  token: string;
  classId: string;
  studentId: string;
}) {
  const query = useInfiniteQuery({
    queryKey: ['teacher-assessment-history', classId, studentId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => feedbackApi.teacherHistory(token, classId, studentId, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const records = query.data?.pages.flatMap((page) => page.records) ?? [];

  if (query.isPending || (query.isError && !query.data))
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );

  return (
    <section aria-label="Riwayat asesmen siswa">
      <SectionHeader title="Riwayat asesmen" subtitle="Hanya hasil siswa pada kelas ini." />
      {records.length ? (
        <div className="activity-list">
          {records.map((item) => (
            <HistoryRow key={item.attemptId} item={item} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Icon name="clock" />}
            title="Belum ada hasil asesmen"
            description="Riwayat Drill, Pretest, dan Tryout siswa ini muncul setelah ada hasil."
          />
        </Card>
      )}
      {query.hasNextPage && (
        <Button
          className="load-more"
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Memuat…' : 'Muat riwayat lain'}
        </Button>
      )}
      {query.isFetchNextPageError && (
        <p className="form-error" role="alert">
          Halaman berikutnya belum dapat dimuat. Coba muat kembali.
        </p>
      )}
    </section>
  );
}

function HistoryRow({ item }: { item: AssessmentRecordDto }) {
  const labels = [item.chapterTitle, item.subchapterTitle, item.levelTitle].filter(Boolean);
  return (
    <div className="activity-row">
      <span className={`icon-tile ${item.activity === 'drill' ? 'accent-0' : 'accent-1'}`}>
        <Icon name={item.activity === 'drill' ? 'target' : 'clipboard'} />
      </span>
      <div className="row-copy">
        <span className="eyebrow">
          {item.activity === 'drill' ? 'Drill' : item.activity === 'pretest' ? 'Pretest' : 'Tryout'}{' '}
          {item.isDemo && <Badge>Demo</Badge>}
        </span>
        <h3>{item.title}</h3>
        {labels.length > 0 && <p className="muted">{labels.join(' · ')}</p>}
        <time dateTime={item.submittedAt}>{day.format(new Date(item.submittedAt))}</time>
      </div>
      <div className="activity-score">
        {item.resultState === 'waitingIrt' ? (
          <Badge variant="warning" style={{ whiteSpace: 'normal' }}>
            Menunggu hasil
          </Badge>
        ) : (
          <>
            <strong>{item.score ?? '—'}</strong>
            <small>Nilai</small>
          </>
        )}
      </div>
    </div>
  );
}

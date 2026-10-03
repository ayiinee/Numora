'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, Icon } from '@tka/ui';
import { StudentLayout } from '@/components/shell';
import type { FeedbackDto } from '@/lib/generated-api-types';
import { DataState, Panel, StudentGate } from '../core-learning/ui';
import { feedbackApi } from './api';

const sentFormat = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});

export function StudentFeedbackScreen() {
  return (
    <StudentLayout title="Catatan Guru" subtitle="Semua catatan dari Gurumu terkumpul di sini.">
      <StudentGate>{(token) => <StudentInbox token={token} />}</StudentGate>
    </StudentLayout>
  );
}

export function StudentInbox({ token }: { token: string }) {
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['student-feedback'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => feedbackApi.studentList(token, pageParam),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
  const markRead = useMutation({
    mutationFn: (feedbackId: string) => feedbackApi.markRead(token, feedbackId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['student-feedback'] });
      void client.invalidateQueries({ queryKey: ['student-feedback-summary'] });
    },
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isPending || (query.isError && !query.data))
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );

  return (
    <div className="stack">
      <section aria-label="Daftar catatan Guru">
        {items.length ? (
          <Panel>
            <h2 className="text-lg font-bold">Catatan dari Guru</h2>
            <ul className="mt-3 space-y-4">
              {items.map((item) => (
                <FeedbackItem
                  key={item.id}
                  item={item}
                  busy={markRead.isPending && markRead.variables === item.id}
                  onRead={() => markRead.mutate(item.id)}
                />
              ))}
            </ul>
          </Panel>
        ) : (
          <Card>
            <EmptyState
              icon={<Icon name="mail" />}
              title="Belum ada catatan"
              description="Catatan dari Gurumu akan muncul di sini setelah dikirim."
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
        {markRead.isError && (
          <p className="form-error" role="alert">
            {markRead.error instanceof Error
              ? markRead.error.message
              : 'Status baca belum dapat disimpan.'}
          </p>
        )}
      </section>
    </div>
  );
}

function FeedbackItem({
  item,
  busy,
  onRead,
}: {
  item: FeedbackDto;
  busy: boolean;
  onRead: () => void;
}) {
  const unread = item.readAt === null;
  return (
    <li className="border-t border-[var(--color-border)] pt-4 first:border-t-0 first:pt-0">
      <p className="font-semibold">
        {item.teacherName}
        {unread ? ' · Belum dibaca' : ''}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words">{item.body}</p>
      <p className="mt-1 text-xs text-slate-700">
        <time dateTime={item.sentAt}>{sentFormat.format(new Date(item.sentAt))}</time>
        {item.readAt !== null && (
          <>
            {' · '}
            <time dateTime={item.readAt}>Dibaca {sentFormat.format(new Date(item.readAt))}</time>
          </>
        )}
      </p>
      {unread && (
        <Button className="mt-3" variant="secondary" loading={busy} onClick={onRead}>
          {busy ? 'Menyimpan…' : 'Tandai sudah dibaca'}
        </Button>
      )}
    </li>
  );
}

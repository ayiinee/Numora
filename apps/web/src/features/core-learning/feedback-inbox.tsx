'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Button, Card, EmptyState, Icon } from '@tka/ui';
import { AppShell } from '@/components/shell';
import type { FeedbackListDto } from '@/lib/generated-api-types';
import { AccountHeader } from './account-presentation';
import { FeedbackCard } from './feedback-card';
import {
  feedbackApi,
  feedbackListKey,
  feedbackSummaryKey,
  useFeedbackList,
  useFeedbackSummary,
} from './feedback-queries';
import { DataState, StudentGate } from './ui';
import { LearningApiError } from './api';

export function FeedbackScreen() {
  return <StudentGate>{(token) => <FeedbackInbox token={token} />}</StudentGate>;
}
function FeedbackInbox({ token }: { token: string }) {
  const query = useFeedbackList(token);
  const summary = useFeedbackSummary(token);
  const cache = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [notice, setNotice] = useState('');
  const unreadButton = useRef<HTMLButtonElement>(null);
  const marking = useRef(false);
  const read = useMutation({
    mutationFn: async (id: string) => {
      const ack = await feedbackApi.read(token, id);
      if (ack.id !== id || !Number.isFinite(Date.parse(ack.readAt)))
        throw new Error('Status dibaca belum dikonfirmasi server. Coba lagi.');
      return ack;
    },
    onMutate: async () => {
      setNotice('');
      await Promise.all([
        cache.cancelQueries({ queryKey: feedbackListKey }),
        cache.cancelQueries({ queryKey: feedbackSummaryKey }),
      ]);
    },
    onSuccess: (ack) => {
      cache.setQueryData<InfiniteData<FeedbackListDto>>(feedbackListKey, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((item) =>
                  item.id === ack.id ? { ...item, readAt: ack.readAt } : item,
                ),
              })),
            }
          : old,
      );
      void cache.invalidateQueries({ queryKey: feedbackSummaryKey });
      setNotice('Catatan ditandai dibaca.');
      if (filter === 'unread') unreadButton.current?.focus();
    },
    onSettled: () => {
      marking.current = false;
    },
  });
  const items = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item]),
    ).values(),
  ];
  const visible = filter === 'unread' ? items.filter((item) => item.readAt === null) : items;
  function markRead(id: string) {
    if (marking.current) return;
    marking.current = true;
    read.mutate(id);
  }
  return (
    <AppShell className="student-account-shell student-feedback-shell">
      <AccountHeader title="Catatan Guru" backHref="/student" />
      <div className="student-feedback-layout">
        <div className="student-feedback-main">
          <div className="student-feedback-filters" role="group" aria-label="Filter catatan">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              Semua Catatan ({items.length})
            </button>
            <button
              ref={unreadButton}
              type="button"
              aria-pressed={filter === 'unread'}
              onClick={() => setFilter('unread')}
            >
              <span aria-hidden="true">●</span> Baru & Belum Dibaca
              {summary.data && !summary.isError ? ` (${summary.data.unreadCount})` : ''}
            </button>
          </div>
          {(query.hasNextPage || filter === 'unread') && (
            <p className="student-feedback-pagination-note">
              Filter menampilkan catatan yang sudah dimuat.
              {query.hasNextPage && ' Muat lainnya untuk memeriksa catatan berikutnya.'}
            </p>
          )}
          {query.isPending || (query.isError && !query.data) ? (
            <DataState
              pending={query.isPending}
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : (
            <>
              <div className="student-feedback-list">
                {visible.length ? (
                  visible.map((item) => (
                    <FeedbackCard
                      key={item.id}
                      item={item}
                      pending={read.isPending && read.variables === item.id}
                      disabled={read.isPending}
                      error={
                        read.isError && read.variables === item.id
                          ? read.error instanceof Error
                            ? read.error.message
                            : 'Catatan belum dapat ditandai dibaca.'
                          : undefined
                      }
                      onRead={() => markRead(item.id)}
                    />
                  ))
                ) : (
                  <Card>
                    <EmptyState
                      icon={<Icon name="chat" />}
                      title={
                        filter === 'unread'
                          ? 'Tidak ada catatan belum dibaca pada halaman yang dimuat'
                          : 'Belum ada catatan guru'
                      }
                      description="Pesan dari guru akan tampil di sini. Kamu tetap dapat melanjutkan belajar."
                      action={
                        <Link className="button-link" href="/student/learn">
                          Lanjut belajar
                        </Link>
                      }
                    />
                  </Card>
                )}
              </div>
              {query.isError && (
                <p className="form-error" role="alert">
                  {query.error.message} Catatan yang sudah dimuat tetap tersedia.
                </p>
              )}
              {query.hasNextPage && (
                <Button
                  fullWidth
                  variant="secondary"
                  disabled={query.isFetching || read.isPending}
                  onClick={() => void query.fetchNextPage()}
                >
                  {query.isFetchingNextPage
                    ? 'Memuat catatan…'
                    : query.isFetchNextPageError
                      ? 'Coba muat catatan lagi'
                      : 'Muat lainnya'}
                </Button>
              )}
              {query.isRefetchError && (
                <Button
                  variant="secondary"
                  disabled={read.isPending || query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  Coba muat ulang catatan
                </Button>
              )}
            </>
          )}
          <p className="sr-only" role="status">
            {notice}
          </p>
          {((read.error instanceof LearningApiError && read.error.status === 401) ||
            (query.data &&
              query.error instanceof LearningApiError &&
              query.error.status === 401)) && (
            <Link className="button-link" href="/">
              Sesi berakhir. Masuk kembali
            </Link>
          )}
        </div>
        <aside className="student-feedback-context">
          <Card>
            <h2>
              <Icon name="chat" width={18} height={18} /> Catatan untukmu
            </h2>
            {summary.isPending ? (
              <p role="status">Memuat jumlah catatan…</p>
            ) : summary.isError ? (
              <>
                <p role="alert">Jumlah catatan belum dapat dimuat.</p>
                <Button
                  variant="secondary"
                  onClick={() => void summary.refetch()}
                  disabled={read.isPending}
                >
                  Coba muat jumlah catatan
                </Button>
              </>
            ) : (
              <p>
                <strong>{summary.data.unreadCount}</strong> catatan belum dibaca secara keseluruhan.
              </p>
            )}
            <p>Catatan tidak otomatis ditandai dibaca saat kamu membuka halaman.</p>
            <Button
              variant="secondary"
              fullWidth
              disabled={query.isFetching || read.isPending}
              onClick={() => void query.refetch()}
            >
              Perbarui catatan
            </Button>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

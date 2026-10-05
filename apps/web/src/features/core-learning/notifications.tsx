'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, Icon, type IconName } from '@tka/ui';
import { AppShell } from '@/components/shell';
import { useStudentToken } from './student-session';
import { DataState } from './ui';
import { request, LearningApiError } from './api';
import { usePvpSocket } from '@/features/pvp/use-pvp-socket';
import {
  notificationApi,
  notificationKey,
  useNotifications,
  useNotificationSummary,
  type NotificationFilter,
} from './notification-queries';
import { notificationDateGroup, notificationTime } from './notification-dates';
import type { NotificationDto, NotificationActionDto, PvpAvailabilityDto } from './generated-types';

const filters: { id: NotificationFilter; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'unread', label: 'Belum Dibaca' },
  { id: 'class', label: 'Aktivitas Kelas' },
  { id: 'tryout', label: 'Tryout' },
  { id: 'learning', label: 'Latihan' },
  { id: 'archive', label: 'Arsip' },
];
const icons: Record<string, IconName> = {
  FEEDBACK_RECEIVED: 'chat',
  PVP_INVITED: 'gamepad',
  TRYOUT_OPENED: 'clipboard',
  TRYOUT_RESULT_READY: 'chart',
  LEVEL_UNLOCKED: 'check',
};
function destination(action: NotificationActionDto): { href: string; label: string } | null {
  if (!action.enabled) return null;
  if (action.type === 'feedback' && action.feedbackId)
    return {
      href: `/student/feedback#feedback-${action.feedbackId}`,
      label: 'Buka Feedback dari Guru',
    };
  if (action.type === 'tryout') return { href: '/student/tryout', label: 'Buka Paket Tryout' };
  if (action.type === 'result' && action.attemptId)
    return { href: `/student/tryout/${action.attemptId}/result`, label: 'Lihat Hasil Tryout' };
  if (action.type === 'roadmap' && action.chapterId && action.subchapterId)
    return {
      href: `/student/learn/${action.chapterId}/${action.subchapterId}`,
      label: 'Lanjutkan Latihan',
    };
  return null;
}
export function NotificationsScreen() {
  const token = useStudentToken();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const list = useNotifications(filter);
  const summary = useNotificationSummary();
  const client = useQueryClient();
  const reading = useRef(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState('');
  const read = useMutation({
    mutationFn: (id: string | null) =>
      id ? notificationApi.read(token, id) : notificationApi.readAll(token),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: notificationKey });
      setNotice('Notifikasi ditandai dibaca.');
      if (filter === 'unread')
        filtersRef.current
          ?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
          ?.focus();
    },
    onSettled: () => {
      reading.current = false;
    },
  });
  const availability = useQuery({
    queryKey: ['pvp-availability'],
    queryFn: () => request<PvpAvailabilityDto>(token, '/pvp/availability'),
  });
  const socket = usePvpSocket(availability.data?.available === true);
  const denied = list.error instanceof LearningApiError && [401, 403].includes(list.error.status);
  const items = [
    ...new Map(
      (list.data?.pages.flatMap((p) => p.items) ?? []).map((item) => [item.id, item]),
    ).values(),
  ];
  const groups = new Map<string, NotificationDto[]>();
  for (const item of items) {
    const label = notificationDateGroup(item.occurredAt);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  function mark(id: string | null) {
    if (reading.current) return;
    reading.current = true;
    setNotice('');
    read.mutate(id);
  }
  const header = (
    <header className="notification-header">
      <Link href="/student" className="notification-header__back">
        <Icon name="back" /> Keluar
      </Link>
      <h1>Notifikasi</h1>
      <Link
        href="/student/profile"
        className="notification-header__profile"
        aria-label="Buka profil siswa"
      >
        <Icon name="user" />
      </Link>
    </header>
  );
  return (
    <AppShell
      title="Notifikasi"
      focus
      backHref="/student"
      mobileHeader={header}
      className="notifications-shell"
    >
      <div className="notifications-page">
        <div className="notifications-title">
          <h2>
            Pusat Notifikasi{' '}
            {summary.data && (
              <Badge variant="primary" size="sm" className="notification-unread-badge">
                {summary.data.unread} Baru
              </Badge>
            )}
          </h2>
          <button
            className="text-action"
            type="button"
            disabled={read.isPending || !summary.data?.unread}
            onClick={() => mark(null)}
          >
            <Icon name="check" width={18} /> Tandai Dibaca
          </button>
        </div>
        {summary.isError && (
          <p className="form-error" role="alert">
            Jumlah notifikasi belum dapat dimuat.{' '}
            <button type="button" onClick={() => void summary.refetch()}>
              Coba lagi
            </button>
          </p>
        )}
        <div className="notification-filter" ref={filtersRef} aria-label="Filter notifikasi">
          {filters.map((f) => (
            <button
              type="button"
              key={f.id}
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setNotice('');
              }}
            >
              {f.label}
              {summary.data && (f.id === 'all' || f.id === 'unread')
                ? ` (${f.id === 'all' ? summary.data.total : summary.data.unread})`
                : ''}
            </button>
          ))}
        </div>
        <div className="notifications-composition">
          <Card className="notification-list" padding="none">
            {list.isPending || denied || (list.isError && !list.data) ? (
              <DataState
                pending={list.isPending}
                error={list.error}
                retry={() => void list.refetch()}
              />
            ) : !items.length ? (
              <EmptyState
                icon={<Icon name="bell" />}
                title={
                  filter === 'unread' ? 'Semua notifikasi sudah dibaca' : 'Belum ada notifikasi'
                }
                description={
                  filter === 'archive'
                    ? 'Notifikasi berumur 30 hari akan tersimpan di sini.'
                    : 'Pemberitahuan baru akan muncul ketika ada aktivitas terkait akunmu.'
                }
              />
            ) : (
              [...groups].map(([group, rows]) => (
                <section key={group} aria-label={group}>
                  <div className="notification-group">
                    <h3>{group}</h3>
                    <span>{rows.length} Aktivitas dimuat</span>
                  </div>
                  <ul>
                    {rows.map((item) => {
                      const target = destination(item.action);
                      return (
                        <li
                          key={item.id}
                          className={`notification-item notification-item--${item.kind.toLowerCase()}${item.readAt ? ' is-read' : ''}`}
                        >
                          <span className="notification-item__icon">
                            <Icon name={icons[item.kind] ?? 'bell'} width={25} height={25} />
                            {!item.readAt && (
                              <span aria-label="Belum dibaca" className="notification-unread" />
                            )}
                          </span>
                          <div className="notification-item__content">
                            <div className="notification-item__heading">
                              <h4>{item.title}</h4>
                              <time dateTime={item.occurredAt}>
                                {notificationTime(item.occurredAt)}
                              </time>
                            </div>
                            <p>{item.body}</p>
                            <div className="notification-item__actions">
                              {target && (
                                <Link className="text-action" href={target.href}>
                                  {target.label} <Icon name="arrow" width={16} />
                                </Link>
                              )}
                              {item.action.type === 'pvp' && item.action.enabled && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={!socket.connected || socket.busy || socket.uncertain}
                                    onClick={() =>
                                      void socket.command('invitation:respond', {
                                        inviteId: item.action.inviteId,
                                        accept: true,
                                      })
                                    }
                                  >
                                    Terima Duel
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={!socket.connected || socket.busy || socket.uncertain}
                                    onClick={() =>
                                      void socket.command('invitation:respond', {
                                        inviteId: item.action.inviteId,
                                        accept: false,
                                      })
                                    }
                                  >
                                    Tolak
                                  </Button>
                                </>
                              )}
                              {item.action.status && (
                                <span className="muted">{item.action.status}</span>
                              )}
                              {!item.readAt && (
                                <button
                                  className="notification-mark"
                                  disabled={read.isPending}
                                  type="button"
                                  onClick={() => mark(item.id)}
                                  aria-label={`Tandai dibaca: ${item.title}`}
                                >
                                  <Icon name="check" width={15} /> Dibaca
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
            {!denied && list.hasNextPage && (
              <Button
                variant="secondary"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? 'Memuat…' : 'Muat lainnya'}
              </Button>
            )}
            {!denied && list.isError && list.data && (
              <div role="alert" className="form-error">
                <p>Daftar terbaru belum dapat dimuat.</p>
                <Button variant="secondary" onClick={() => void list.refetch()}>
                  Coba lagi
                </Button>
              </div>
            )}
          </Card>
          <aside className="notification-context">
            <p>
              <Icon name="info" width={18} /> Pemberitahuan otomatis diarsipkan setelah 30 hari.
            </p>
            <Link href="/student/feedback">
              Lihat semua Feedback dari Guru <Icon name="arrow" width={16} />
            </Link>
          </aside>
        </div>
        <p role="status" className="muted">
          {notice}
        </p>
        {read.isError && (
          <p className="form-error" role="alert">
            {read.error.message}
          </p>
        )}
        {socket.error && (
          <div role="alert" className="form-error">
            {socket.error}
            {socket.uncertain && (
              <Button
                variant="secondary"
                disabled={!socket.connected || socket.busy}
                onClick={socket.retry}
              >
                Periksa permintaan sebelumnya
              </Button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

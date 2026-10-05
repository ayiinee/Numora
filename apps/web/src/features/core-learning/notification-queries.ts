'use client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { request } from './api';
import { useStudentToken } from './student-session';
import type {
  NotificationsDto,
  NotificationSummaryDto,
  NotificationReadDto,
} from './generated-types';
export type NotificationFilter = 'all' | 'unread' | 'class' | 'tryout' | 'learning' | 'archive';
export const notificationKey = ['student-notifications'] as const;
export function useNotificationSummary() {
  const token = useStudentToken();
  return useQuery({
    queryKey: [...notificationKey, 'summary'],
    queryFn: () => request<NotificationSummaryDto>(token, '/students/me/notifications/summary'),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
export function useNotifications(filter: NotificationFilter) {
  const token = useStudentToken();
  return useInfiniteQuery({
    queryKey: [...notificationKey, 'list', filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      request<NotificationsDto>(
        token,
        `/students/me/notifications?filter=${filter}${pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''}`,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
export const notificationApi = {
  read: (token: string, id: string) =>
    request<NotificationReadDto>(
      token,
      `/students/me/notifications/${encodeURIComponent(id)}/read`,
      { method: 'POST' },
    ),
  readAll: (token: string) =>
    request<NotificationReadDto>(token, '/students/me/notifications/read-all', { method: 'POST' }),
};

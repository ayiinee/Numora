'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  FeedbackListDto,
  FeedbackSummaryDto,
  ReadFeedbackDto,
} from '@/lib/generated-api-types';
import { request } from './api';

export const feedbackListKey = ['student-feedback'] as const;
export const feedbackSummaryKey = ['student-feedback-summary'] as const;

export const feedbackApi = {
  list: (token: string, offset: number) =>
    request<FeedbackListDto>(token, `/students/me/feedback?limit=20&offset=${offset}`),
  read: (token: string, id: string) =>
    request<ReadFeedbackDto>(token, `/students/me/feedback/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    }),
};
export function useFeedbackList(token: string) {
  return useInfiniteQuery({
    queryKey: feedbackListKey,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => feedbackApi.list(token, pageParam),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
}
export function useFeedbackSummary(token: string) {
  return useQuery({
    queryKey: feedbackSummaryKey,
    queryFn: () => request<FeedbackSummaryDto>(token, '/students/me/feedback/summary'),
    staleTime: 60_000,
  });
}

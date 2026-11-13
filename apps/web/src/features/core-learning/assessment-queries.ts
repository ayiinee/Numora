'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { learningApi } from './api';

/** Shared cache/pagination for the existing history endpoint, including Tryout history. */
export function useAssessmentHistory(token: string, enabled = true, levelId?: string, activity?: 'tryout') {
  return useInfiniteQuery({
    queryKey: ['assessment-history', levelId ?? null, ...(activity ? [activity] : [])],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => activity
      ? learningApi.assessmentHistory(token, pageParam, levelId, activity)
      : levelId ? learningApi.assessmentHistory(token, pageParam, levelId)
        : learningApi.assessmentHistory(token, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...(activity === 'tryout' && { refetchInterval: 30_000, refetchOnWindowFocus: true }),
    enabled,
  });
}

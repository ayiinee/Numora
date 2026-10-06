'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { learningApi } from './api';

/** Shared cache/pagination for the existing history endpoint, including Tryout history. */
export function useAssessmentHistory(token: string, enabled = true, levelId?: string) {
  return useInfiniteQuery({
    queryKey: ['assessment-history', levelId ?? null],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => levelId
      ? learningApi.assessmentHistory(token, pageParam, levelId)
      : learningApi.assessmentHistory(token, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

'use client';

import { useQueries } from '@tanstack/react-query';
import { getClassStudents } from '@/lib/api';
import type { ClassSummary } from '@/lib/api';

export function useTeacherRosterCounts(token: string, classes: ClassSummary[] | undefined) {
  const queries = useQueries({
    queries: (classes ?? []).map((value) => ({
      queryKey: ['class-students', value.id],
      queryFn: () => getClassStudents(token, value.id),
      staleTime: 30_000,
    })),
  });
  const complete = classes !== undefined && queries.every((query) => query.isSuccess);
  return {
    queries,
    complete,
    total: complete ? queries.reduce((sum, query) => sum + query.data!.items.length, 0) : undefined,
    error: queries.find((query) => query.isError)?.error,
    retry: () => queries.forEach((query) => void query.refetch()),
  };
}

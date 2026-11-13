'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { learningApi, request, LearningApiError } from './api';
import type {
  CurrentTryoutDto,
  StudentTryoutBatchDto,
  StudentTryoutBatchesDto,
} from './generated-types';
import { useAssessmentHistory } from './assessment-queries';

export type TryoutSummary = Omit<CurrentTryoutDto, 'state'> & {
  state: CurrentTryoutDto['state'] | 'scheduled' | 'overdue' | 'checking';
};

export const tryoutSummaryLabels: Record<TryoutSummary['state'], string> = {
  unavailable: 'Belum tersedia',
  open: 'Telah dibuka',
  inProgress: 'Sedang dikerjakan',
  waitingIrt: 'Menunggu hasil',
  resultReady: 'Hasil tersedia',
  scheduled: 'Terjadwal',
  overdue: 'Hasil melewati tenggat',
  checking: 'Perlu periksa sesi',
};

export function tryoutSummaryHref(data: TryoutSummary) {
  if (!data.attemptId) return '/student/tryout';
  if (data.state === 'inProgress' || data.state === 'checking')
    return `/student/tryout/${data.attemptId}`;
  return `/student/tryout/${data.attemptId}/result`;
}

export function useTryoutBatches(token: string) {
  return useQuery({
    queryKey: ['tryout-batches'],
    queryFn: async () => {
      const data = await request<StudentTryoutBatchesDto>(token, '/tryout/batches');
      if (typeof data?.routingActive !== 'boolean' || !Array.isArray(data.items))
        throw new Error('Status Tryout belum dapat dimuat.');
      return data;
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCurrentTryout(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ['current-tryout'],
    queryFn: () => learningApi.currentTryout(token),
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function scheduledTryouts(batches: StudentTryoutBatchDto[]) {
  const rank = (batch: StudentTryoutBatchDto) =>
    batch.attemptStatus === 'IN_PROGRESS' && batch.state === 'OPEN' && batch.canResume === true
      ? 0
      : !batch.attemptId && batch.state === 'OPEN' ? 1
        : batch.state === 'SCHEDULED' ? 2 : 3;
  return batches
    .filter(
      (batch) =>
        batch.attemptStatus === 'IN_PROGRESS' ||
        (!batch.attemptId && (batch.state === 'OPEN' || batch.state === 'SCHEDULED')),
    )
    .sort((a, b) => rank(a) - rank(b) || a.startsAt.localeCompare(b.startsAt));
}

export function useTryoutSummary(token: string) {
  const batches = useTryoutBatches(token);
  const managed = batches.data?.routingActive === true;
  const legacy = useCurrentTryout(token, batches.data?.routingActive === false);
  const next = managed ? scheduledTryouts(batches.data?.items ?? [])[0] : undefined;
  const useHistory = managed ? !next : legacy.data?.state === 'unavailable';
  const history = useAssessmentHistory(token, useHistory, undefined, 'tryout');
  const recent = history.data?.pages[0]?.records.find((item) => item.activity === 'tryout');
  const recentBatch =
    managed && recent
      ? batches.data?.items.find((batch) => batch.attemptId === recent.attemptId)
      : undefined;
  const fallbackBatch =
    managed && useHistory
      ? batches.data?.items.find(
          (batch) => batch.attemptId && ['GRADED', 'SUBMITTED'].includes(batch.attemptStatus ?? ''),
        )
      : undefined;
  let data: TryoutSummary | undefined;
  if (next) {
    data = {
      title: next.title,
      releaseAt: next.startsAt,
      closeAt: next.closesAt,
      attemptId: next.attemptId,
      state: next.attemptId
        ? next.state === 'OPEN' && next.canResume === true
          ? 'inProgress'
          : 'checking'
        : next.state === 'OPEN'
          ? 'open'
          : 'scheduled',
      eligible: !next.attemptId && next.state === 'OPEN',
    };
  } else if (recent && useHistory) {
    const status = recentBatch?.resultState ?? recent.tryoutResultState;
    data = {
      title: recent.title,
      attemptId: recent.attemptId,
      state:
        status === 'overdue'
          ? 'overdue'
          : status === 'ready' || (!status && recent.resultState === 'ready')
            ? 'resultReady'
            : 'waitingIrt',
    };
  } else if (fallbackBatch?.attemptId && !history.isPending) {
    data = {
      title: fallbackBatch.title,
      attemptId: fallbackBatch.attemptId,
      state:
        fallbackBatch.resultState === 'ready'
          ? 'resultReady'
          : fallbackBatch.resultState === 'overdue'
            ? 'overdue'
            : 'waitingIrt',
    };
  } else if (!managed && !useHistory) {
    data = legacy.data;
  } else if (useHistory && !history.isPending && !history.isError) {
    data = { state: 'unavailable' };
  }
  const error =
    batches.error ??
    (!managed ? legacy.error : null) ??
    (useHistory && !data ? history.error : null);
  return {
    data,
    error,
    isError: !!error,
    isPending: !data && !error,
    refetch: async () => {
      const refreshed = await batches.refetch();
      if (refreshed.data?.routingActive === false) await legacy.refetch();
      if (useHistory) await history.refetch();
    },
  };
}

export function refreshTryoutStatus(client: QueryClient) {
  for (const key of [
    'tryout-batches',
    'current-tryout',
    'student-dashboard',
    'assessment-history',
    'tryout-packages',
  ])
    void client.invalidateQueries({ queryKey: [key] });
}

export function waitingForTryoutResult(error: unknown) {
  return error instanceof LearningApiError && error.code === 'TRYOUT_RESULT_PENDING';
}

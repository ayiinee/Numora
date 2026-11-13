'use client';

import { useQuery } from '@tanstack/react-query';
import { learningApi, request } from './api';
import type { CurrentTryoutDto, StudentTryoutBatchesDto } from './generated-types';

export type StudentTryoutSummary = CurrentTryoutDto & {
  /** Presentation context only: submission does not imply a published result. */
  batchState?: string;
  batchSubmission?: boolean;
};

// Summary surfaces follow the same routing switch as the Tryout catalogue.
export const tryoutBatchesKey = ['tryout-batches'] as const;
export function useTryoutBatches(token: string) {
  return useQuery({
    queryKey: tryoutBatchesKey,
    queryFn: () => request<StudentTryoutBatchesDto>(token, '/tryout/batches'),
    refetchInterval: 30_000,
  });
}

export function batchTryoutSummary(data: StudentTryoutBatchesDto): StudentTryoutSummary {
  const working = data.items.find((batch) => batch.attemptStatus === 'IN_PROGRESS');
  const open = data.items.find((batch) => batch.state === 'OPEN' && !batch.attemptId);
  const attempted = data.items.find((batch) => batch.attemptId);
  const scheduled = data.items.find((batch) => batch.state === 'SCHEDULED');
  const batch = working ?? open ?? attempted ?? scheduled;
  if (!batch) return { state: 'unavailable' };
  // Batch IDs are deliberately not exposed as legacy package IDs.
  return {
    title: batch.title,
    state: working ? 'inProgress' : open ? 'open' : attempted ? 'waitingIrt' : 'unavailable',
    eligible: !!open && !working,
    attemptId: batch.attemptId,
    releaseAt: batch.startsAt,
    closeAt: batch.closesAt,
    resultDueAt: batch.resultDueAt,
    batchState: batch.state,
    batchSubmission: !!attempted && !working && !open,
  };
}

export function useTryoutSummary(token: string) {
  const batches = useTryoutBatches(token);
  const legacy = useQuery({
    queryKey: ['current-tryout'],
    queryFn: () => learningApi.currentTryout(token),
    enabled: batches.data?.routingActive === false,
  });
  const routed = batches.data?.routingActive === true;
  return {
    data: routed ? batchTryoutSummary(batches.data!) : batches.isSuccess ? legacy.data : undefined,
    isPending: batches.isPending || (!batches.isError && !routed && legacy.isPending),
    isError: batches.isError || (!routed && batches.isSuccess && legacy.isError),
    error: batches.error ?? (!routed ? legacy.error : null),
    refetch: () => (batches.isError || routed ? batches.refetch() : legacy.refetch()),
  };
}

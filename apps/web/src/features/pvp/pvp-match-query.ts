import { queryOptions } from '@tanstack/react-query';
import { request } from '@/features/core-learning/api';
import type { PvpSnapshotDto } from '@/features/core-learning/generated-types';

export const pvpAvailabilityKey = ['pvp-availability'] as const;
export const pvpMatchKey = (matchId: string) => ['pvp-match', matchId] as const;

export function pvpMatchQuery(token: string, matchId: string) {
  return queryOptions({
    queryKey: pvpMatchKey(matchId),
    queryFn: ({ signal }) =>
      request<PvpSnapshotDto>(token, `/pvp/matches/${encodeURIComponent(matchId)}`, { signal }),
  });
}

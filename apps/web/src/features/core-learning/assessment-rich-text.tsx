'use client';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { ContentRichText } from '@/features/admin/content-rich-text';
import type { MediaLinksDto } from '@/features/admin/generated-types';
import { useStudentToken } from './student-session';
import { MathText } from './ui';

export function AssessmentRichText({
  value,
  instanceId,
  phase = 'WORK',
}: {
  value: string;
  instanceId: string;
  phase?: 'WORK' | 'REVIEW';
}) {
  return value.includes('[[asset:') ? (
    <MediaText key={`${instanceId}:${phase}`} value={value} instanceId={instanceId} phase={phase} />
  ) : (
    <MathText value={value} />
  );
}
function MediaText({
  value,
  instanceId,
  phase,
}: {
  value: string;
  instanceId: string;
  phase: 'WORK' | 'REVIEW';
}) {
  const token = useStudentToken();
  const links = useQuery({
    queryKey: ['assessment-media', instanceId, phase],
    queryFn: () =>
      apiRequest<MediaLinksDto>(
        `assessment-items/${encodeURIComponent(instanceId)}/media?phase=${phase}`,
        token,
      ),
    staleTime: 10 * 60_000,
    retry: false,
  });
  return (
    <ContentRichText
      text={value}
      media={links.data?.media ?? []}
      retry={() => void links.refetch()}
      renderBareMath
    />
  );
}

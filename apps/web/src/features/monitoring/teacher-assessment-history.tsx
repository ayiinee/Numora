'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, Icon, SectionHeader } from '@tka/ui';
import { apiRequest, ApiProblem } from '@/lib/api';
import type { AssessmentHistoryDto } from '@/features/core-learning/generated-types';
import { DataState } from '@/features/core-learning/ui';

export function TeacherAssessmentHistory({
  token,
  classId,
  studentId,
}: {
  token: string;
  classId: string;
  studentId: string;
}) {
  const query = useInfiniteQuery({
    queryKey: ['teacher-assessments', classId, studentId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest<AssessmentHistoryDto>(
        `classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/assessment-results${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
        token,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const records = query.data?.pages.flatMap((page) => page.records) ?? [];
  const accessFailure =
    query.error instanceof ApiProblem && [401, 403, 404].includes(query.error.status);
  return (
    <section className="teacher-page-stack">
      <SectionHeader title="Riwayat asesmen" subtitle="Hasil sesuai akses dan waktu rilis sistem" />
      {query.isPending || (query.isError && (!query.data || accessFailure)) ? (
        <DataState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : (
        <>
          {records.map((record) => (
            <Card className="teacher-assessment-record" key={record.attemptId}>
              <div>
                <Badge variant="primary">
                  {record.activity === 'drill'
                    ? 'Drill'
                    : record.activity === 'pretest'
                      ? 'Pretest'
                      : 'Tryout'}
                </Badge>
                {record.isDemo && <Badge variant="warning">Demo</Badge>}
                <h3>{record.title}</h3>
                {record.levelTitle && <p>{record.levelTitle}</p>}
                <time dateTime={record.submittedAt}>
                  {new Intl.DateTimeFormat('id-ID', {
                    timeZone: 'Asia/Jakarta',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(record.submittedAt))}{' '}
                  WIB
                </time>
              </div>
              <div className="teacher-assessment-record__result">
                {record.resultState === 'ready' ? (
                  <>
                    <span>Nilai</span>
                    <strong>{record.score ?? '—'}</strong>
                  </>
                ) : (
                  <Badge variant="warning">
                    <Icon name="clock" width={14} height={14} />
                    Menunggu IRT
                  </Badge>
                )}
              </div>
            </Card>
          ))}
          {!records.length && (
            <Card>
              <EmptyState
                title="Belum ada riwayat asesmen"
                description="Hasil yang diizinkan tampil setelah asesmen dikumpulkan."
              />
            </Card>
          )}
          {query.isError && (
            <DataState
              pending={false}
              error={query.error}
              retry={() =>
                query.isFetchNextPageError ? void query.fetchNextPage() : void query.refetch()
              }
            />
          )}
          {query.hasNextPage && (
            <Button
              variant="secondary"
              loading={query.isFetchingNextPage}
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Muat asesmen sebelumnya
            </Button>
          )}
        </>
      )}
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, EmptyState, Icon, SectionHeader } from '@tka/ui';
import { StudentLayout } from '@/components/shell';
import { learningApi } from './api';
import { DataState, StudentGate } from './ui';
import { ActivityRow, ProgressSummary } from './cards';
import { useAssessmentHistory } from './assessment-queries';

export function AssessmentScreen() {
  return (
    <StudentLayout
      title="Progres & riwayat"
      subtitle="Lihat kemajuanmu, satu latihan pada satu waktu."
      className="assessment-history-shell"
    >
      <StudentGate>{(token) => <AssessmentContent token={token} />}</StudentGate>
    </StudentLayout>
  );
}
function AssessmentContent({ token }: { token: string }) {
  const progress = useQuery({
    queryKey: ['student-progress'],
    queryFn: () => learningApi.progress(token),
  });
  const query = useAssessmentHistory(token);
  const records = query.data?.pages.flatMap((page) => page.records) ?? [];
  return (
    <div className="assessment-history-layout">
      <aside className="assessment-history-progress">
        {progress.isPending || progress.isError ? (
          <DataState
            pending={progress.isPending}
            error={progress.error}
            retry={() => void progress.refetch()}
          />
        ) : (
          <ProgressSummary progress={progress.data} />
        )}
      </aside>
      <section className="assessment-history-records">
        <SectionHeader title="Riwayat aktivitas" subtitle="Hasil terbaru tampil paling atas." />
        {query.isPending || (query.isError && !query.data) ? (
          <DataState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          />
        ) : records.length ? (
          <div className="activity-list">
            {records.map((item) => (
              <ActivityRow key={item.attemptId} item={item} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={<Icon name="clock" />}
              title="Belum ada aktivitas"
              description="Selesaikan latihan pertamamu untuk melihat hasil di sini."
              action={
                <Link className="button-link" href="/student/learn">
                  Mulai belajar
                </Link>
              }
            />
          </Card>
        )}
        {query.hasNextPage && (
          <Button
            className="load-more"
            variant="secondary"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Memuat…' : 'Muat hasil lain'}
          </Button>
        )}
        {query.isFetchNextPageError && (
          <p className="form-error" role="alert">
            Halaman berikutnya belum dapat dimuat. Coba muat kembali.
          </p>
        )}
      </section>
    </div>
  );
}

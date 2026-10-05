'use client';

import { useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { EmptyState, Icon } from '@tka/ui';
import { StudentLayout } from '@/components/shell';
import { learningApi } from './api';
import { DataState, StudentGate } from './ui';
import { LevelPath } from './level-path';
import { StudentIdentityHeader } from './dashboard-presentation';

export { MaterialsScreen as CatalogScreen } from './materials';
export function ChapterScreen() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/student/learn?chapter=${encodeURIComponent(chapterId)}`);
  }, [router, chapterId]);
  return <DataState pending />;
}

export function SubchapterScreen() {
  const { chapterId, subchapterId } = useParams<{ chapterId: string; subchapterId: string }>();
  return (
    <StudentGate>
      {(token) => (
        <SubchapterLayout token={token} chapterId={chapterId} subchapterId={subchapterId} />
      )}
    </StudentGate>
  );
}
function SubchapterLayout({
  token,
  chapterId,
  subchapterId,
}: {
  token: string;
  chapterId: string;
  subchapterId: string;
}) {
  const dashboard = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => learningApi.dashboard(token),
  });
  const tryout = useQuery({
    queryKey: ['current-tryout'],
    queryFn: () => learningApi.currentTryout(token),
  });
  return (
    <StudentLayout
      title="Langkah belajarmu"
      backHref={`/student/learn?chapter=${chapterId}`}
      className="learning-map-shell"
      mobileHeader={
        dashboard.data && <StudentIdentityHeader data={dashboard.data} tryout={tryout.data} />
      }
    >
      <SubchapterContent token={token} subchapterId={subchapterId} />
    </StudentLayout>
  );
}
function SubchapterContent({ token, subchapterId }: { token: string; subchapterId: string }) {
  const router = useRouter();
  const starting = useRef(false);
  const query = useQuery({
    queryKey: ['subchapter', subchapterId],
    queryFn: () => learningApi.subchapter(token, subchapterId),
  });
  const start = useMutation({
    mutationFn: (levelId: string) => learningApi.start(token, levelId),
    onSuccess: (attempt) => router.push(`/student/drill/${attempt.id}`),
  });
  if (query.isPending || query.isError)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );
  const levels = [...query.data.levels].sort((a, b) => a.order - b.order);
  return (
    <div className="page-stack learning-catalog">
      {levels.length ? (
        <LevelPath
          data={query.data}
          pending={start.isPending}
          pendingLevelId={start.variables}
          onStart={(id) => {
            if (starting.current) return;
            starting.current = true;
            start.mutate(id, {
              onError: () => {
                starting.current = false;
              },
            });
          }}
        />
      ) : (
        <EmptyState
          icon={<Icon name="target" />}
          title="Level belum tersedia"
          description="Level latihan akan muncul setelah diterbitkan."
        />
      )}
      {start.isError && (
        <p className="form-error" role="alert">
          {start.error.message}
        </p>
      )}
    </div>
  );
}

'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { skipToken, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, EmptyState, Icon, ProgressBar } from '@tka/ui';
import { StudentLayout } from '@/components/shell';
import { learningApi, request } from './api';
import { DataState, StudentGate } from './ui';
import { LevelPath } from './level-path';
import { useStudentToken } from './student-session';
import { ChapterPretest } from './pretest-screens';
import { MaterialsHeader, MaterialSubchapterList } from './materials';
import type { StudentMaterialsDto } from './generated-types';

export { MaterialsScreen as CatalogScreen } from './materials';
export function ChapterScreen() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const token = useStudentToken();
  const query = useQuery({
    queryKey: ['student-materials'],
    queryFn: () => request<StudentMaterialsDto>(token, '/students/me/materials'),
  });
  const chapter = query.data?.chapters.find((item) => item.id === chapterId);
  return (
    <StudentLayout
      title="Latihan Soal"
      className="materials-shell materials-detail-shell"
      mobileHeader={<MaterialsHeader />}
    >
      <div className="materials-page materials-detail">
        <Link className="materials-detail__back" href="/student/learn">
          <Icon name="back" width={18} /> Semua bab
        </Link>
        {query.isPending || query.isError ? (
          <DataState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          />
        ) : chapter ? (
          <>
            <div className="materials-detail__heading">
              <small>BAB {chapter.order}</small>
              <h1>{chapter.title}</h1>
              <p>
                {chapter.completedLevels} dari {chapter.totalLevels} level selesai
              </p>
            </div>
            <ChapterPretest chapterId={chapter.id} chapterTitle={chapter.title} />
            <section aria-label={`Subbab ${chapter.title}`}>
              <h2 className="materials-detail__section-title">Pilih Subbab</h2>
              <Card className="material-chapter materials-detail__subchapters" padding="none">
                <MaterialSubchapterList chapter={chapter} />
              </Card>
            </section>
          </>
        ) : (
          <Card>
            <EmptyState
              icon={<Icon name="book" />}
              title="Bab tidak tersedia"
              description="Bab ini belum diterbitkan atau tidak lagi tersedia."
            />
          </Card>
        )}
      </div>
    </StudentLayout>
  );
}

export function SubchapterScreen() {
  const { chapterId, subchapterId } = useParams<{ chapterId: string; subchapterId: string }>();
  return (
    <StudentGate>
      {(token) => (
        <StudentLayout title="Langkah belajarmu" className="learning-map-shell">
          <SubchapterContent
            token={token}
            subchapterId={subchapterId}
            backHref={`/student/learn/${chapterId}`}
          />
        </StudentLayout>
      )}
    </StudentGate>
  );
}
function SubchapterContent({
  token,
  subchapterId,
  backHref,
}: {
  token: string;
  subchapterId: string;
  backHref: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const starting = useRef(false);
  const query = useQuery({
    queryKey: ['subchapter', subchapterId],
    queryFn: () => learningApi.subchapter(token, subchapterId),
  });
  const chapterId = query.data?.subchapter.chapterId;
  const chapterQuery = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: chapterId ? () => learningApi.chapter(token, chapterId) : skipToken,
  });
  const start = useMutation({
    mutationFn: (levelId: string) => learningApi.start(token, levelId),
    onSuccess: (attempt) => {
      queryClient.setQueryData(['attempt', attempt.id], attempt);
      router.push(`/student/drill/${attempt.id}`);
    },
  });
  if (query.isPending || query.isError)
    return (
      <div className="learning-adventure">
        <Link href={backHref} className="back-link">
          <Icon name="back" /> Kembali
        </Link>
        <DataState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      </div>
    );
  const { levels, subchapter } = query.data;
  const chapter = chapterQuery.data?.chapter;
  const chapterLabel = chapter
    ? `Bab ${chapter.order} · ${chapter.title}`
    : chapterQuery.isPending
      ? 'Memuat bab…'
      : 'Bab tidak tersedia';
  const completed = levels.filter((level) => level.status === 'completed').length;
  return (
    <div className="learning-adventure">
      <header className="adventure-summary">
        <Link href={backHref} className="adventure-summary__back" aria-label="Kembali">
          <Icon name="back" />
        </Link>
        <div>
          <span className="eyebrow">Subbab</span>
          <h1>{subchapter.title}</h1>
          <ProgressBar
            value={completed}
            max={levels.length}
            variant="success"
            label="Level subbab selesai"
          />
          <p>
            {completed} / {levels.length} level selesai
          </p>
        </div>
      </header>
      {levels.length ? (
        <LevelPath
          key={query.data.subchapter.id}
          data={query.data}
          chapterLabel={chapterLabel}
          pending={start.isPending}
          requestedLevelId={start.variables}
          startError={start.error?.message}
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
    </div>
  );
}

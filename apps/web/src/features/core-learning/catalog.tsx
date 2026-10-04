'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Badge, Card, EmptyState, Icon, Input, SectionHeader } from '@tka/ui';
import { StudentLayout } from '@/components/shell';
import { learningApi } from './api';
import { DataState, StudentGate } from './ui';
import { ChapterCard } from './cards';
import { LevelPath } from './level-path';
import { StudentIdentityHeader } from './dashboard-presentation';

export function CatalogScreen() {
  return (
    <StudentLayout title="Belajar matematika" subtitle="Satu bab, satu langkah lebih paham.">
      <StudentGate>{(token) => <CatalogContent token={token} />}</StudentGate>
    </StudentLayout>
  );
}
function CatalogContent({ token }: { token: string }) {
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['chapters'], queryFn: () => learningApi.catalog(token) });
  if (query.isPending || query.isError)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );
  const chapters = [...query.data.chapters].sort((a, b) => a.order - b.order);
  const visible = chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) =>
      chapter.title.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')),
    );
  return (
    <div className="page-stack learning-catalog">
      <div className="catalog-intro">
        <div>
          <Badge variant="secondary">TKA Matematika · Kelas IX</Badge>
          <h2>Temukan materi belajarmu</h2>
          <p>Pilih bab, jelajahi subbab, lalu berlatih dari level yang terbuka.</p>
        </div>
        <span className="catalog-math" aria-hidden="true">
          a² + b²
        </span>
      </div>
      <div className="catalog-toolbar">
        <Input
          label="Cari bab"
          type="search"
          placeholder="Ketik nama bab…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Icon name="search" />}
        />
        <span className="muted">{chapters.length} bab tersedia</span>
      </div>
      {visible.length ? (
        <div className="chapter-grid catalog-grid">
          {visible.map(({ chapter, index }) => (
            <ChapterCard key={chapter.id} chapter={chapter} index={index} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Icon name="book" />}
            title={chapters.length ? 'Bab tidak ditemukan' : 'Materi sedang disiapkan'}
            description={
              chapters.length
                ? 'Coba kata kunci yang lain.'
                : 'Bab yang diterbitkan akan muncul di sini.'
            }
          />
        </Card>
      )}
    </div>
  );
}

export function ChapterScreen() {
  const { chapterId } = useParams<{ chapterId: string }>();
  return (
    <StudentLayout title="Jelajahi subbab" backHref="/student/learn">
      <StudentGate>{(token) => <ChapterContent token={token} chapterId={chapterId} />}</StudentGate>
    </StudentLayout>
  );
}
function ChapterContent({ token, chapterId }: { token: string; chapterId: string }) {
  const query = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => learningApi.chapter(token, chapterId),
  });
  if (query.isPending || query.isError)
    return (
      <DataState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <div className="page-stack learning-catalog">
      <div className="catalog-intro">
        <div>
          <span className="eyebrow">Bab matematika</span>
          <h2>{query.data.chapter.title}</h2>
          <p>{query.data.subchapters.length} subbab · Pilih topik yang ingin kamu latih.</p>
        </div>
        <span className="icon-tile accent-0">
          <Icon name="book" />
        </span>
      </div>
      <SectionHeader title="Materi dalam bab ini" />
      {query.data.subchapters.length ? (
        <div className="subchapter-list">
          {[...query.data.subchapters]
            .sort((a, b) => a.order - b.order)
            .map((sub, index) => (
              <Link
                className="subchapter-row"
                key={sub.id}
                href={`/student/learn/${chapterId}/${sub.id}`}
              >
                <span className={`subchapter-number accent-${index % 4}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="row-copy">
                  <h3>{sub.title}</h3>
                  <p>Lihat level dan progres latihan</p>
                </div>
                <Icon name="arrow" />
              </Link>
            ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Icon name="book" />}
            title="Subbab belum tersedia"
            description="Materi pada bab ini sedang disiapkan."
          />
        </Card>
      )}
    </div>
  );
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
      backHref={`/student/learn/${chapterId}`}
      className="learning-map-shell"
      mobileHeader={
        dashboard.data && (
          <StudentIdentityHeader
            data={dashboard.data}
            tryout={tryout.data}
            feedbackHref="/student#catatan-guru"
          />
        )
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

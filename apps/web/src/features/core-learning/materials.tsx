'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, EmptyState, Icon, Input } from '@tka/ui';
import { StudentLayout } from '@/components/shell';
import { useStudentToken } from './student-session';
import { learningApi, request } from './api';
import { DataState } from './ui';
import { HomeActivity } from './dashboard-presentation';
import { StudentSectionHeader } from './student-section-header';
import type { StudentMaterialsDto, MaterialChapterDto } from './generated-types';

export function MaterialsHeader() {
  return <StudentSectionHeader title="Latihan Soal" />;
}

export function MaterialsScreen() {
  return (
    <Suspense fallback={<DataState pending />}>
      <MaterialsContent />
    </Suspense>
  );
}

function MaterialsContent() {
  const token = useStudentToken();
  const router = useRouter();
  const params = useSearchParams();
  const query = useQuery({
    queryKey: ['student-materials'],
    queryFn: () => request<StudentMaterialsDto>(token, '/students/me/materials'),
  });
  const dashboard = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => learningApi.dashboard(token),
  });
  const search = params.get('q') ?? '';
  const legacyChapter = params.get('chapter');
  const legacyCategory = params.get('category');
  useEffect(() => {
    if (legacyChapter) {
      router.replace(`/student/learn/${encodeURIComponent(legacyChapter)}`);
    } else if (legacyCategory !== null) {
      const next = new URLSearchParams(window.location.search);
      next.delete('category');
      window.history.replaceState(null, '', `/student/learn${next.size ? `?${next}` : ''}`);
    }
  }, [legacyChapter, legacyCategory, router]);

  function changeSearch(value: string) {
    const next = new URLSearchParams(window.location.search);
    next.delete('category');
    if (value) next.set('q', value);
    else next.delete('q');
    window.history.replaceState(null, '', `/student/learn${next.size ? `?${next}` : ''}`);
  }

  const needle = search.trim().toLocaleLowerCase('id');
  const visible =
    query.data?.chapters.filter(
      (chapter) =>
        !needle ||
        chapter.title.toLocaleLowerCase('id').includes(needle) ||
        chapter.subchapters.some((sub) => sub.title.toLocaleLowerCase('id').includes(needle)),
    ) ?? [];
  const activity = dashboard.data?.activities[0];
  const recentChapter = query.data?.chapters.find(
    (chapter) => chapter.id === query.data.recentChapterId,
  );

  return (
    <StudentLayout
      title="Latihan Soal"
      className="materials-shell"
      mobileHeader={<MaterialsHeader />}
    >
      <div className="materials-page">
        <div className="materials-heading">
          <h1>Latihan Soal</h1>
          <p>Pilih bab TKA Matematika SMP untuk mulai berlatih.</p>
        </div>
        <section className="materials-activity" aria-labelledby="materials-recent">
          <div className="materials-section-title">
            <h2 id="materials-recent">Aktivitas Terakhir</h2>
            <Link href="/student/assessment">Lihat Semua</Link>
          </div>
          {dashboard.isPending || dashboard.isError ? (
            <DataState
              pending={dashboard.isPending}
              error={dashboard.error}
              retry={() => void dashboard.refetch()}
            />
          ) : activity ? (
            <Card className="materials-recent-card">
              <HomeActivity item={activity} resume={dashboard.data.activeDrill} />
              {!dashboard.data.activeDrill && recentChapter?.continueSubchapterId && (
                <Link
                  className="materials-recent-card__continue"
                  href={`/student/learn/${recentChapter.id}/${recentChapter.continueSubchapterId}`}
                >
                  Lanjut Drill <Icon name="arrow" width={16} height={16} />
                </Link>
              )}
            </Card>
          ) : (
            <Card>
              <EmptyState
                title="Belum ada aktivitas"
                description="Pilih bab untuk memulai latihan pertamamu."
              />
            </Card>
          )}
        </section>
        <Input
          className="materials-search"
          label="Cari bab atau subbab"
          type="search"
          placeholder="Cari bab atau subbab…"
          value={search}
          onChange={(event) => changeSearch(event.target.value)}
          leftIcon={<Icon name="search" />}
        />
        <section className="materials-chapters" aria-label="Daftar bab latihan">
          {query.isPending || query.isError ? (
            <DataState
              pending={query.isPending}
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : !visible.length ? (
            <Card>
              <EmptyState
                icon={<Icon name="book" />}
                title={
                  query.data.chapters.length ? 'Bab tidak ditemukan' : 'Latihan sedang disiapkan'
                }
                description={
                  query.data.chapters.length
                    ? 'Coba kata kunci lainnya.'
                    : 'Bab yang diterbitkan akan muncul di sini.'
                }
              />
            </Card>
          ) : (
            visible.map((chapter) => <MaterialChapterLink key={chapter.id} chapter={chapter} />)
          )}
        </section>
      </div>
    </StudentLayout>
  );
}

const categoryNames: Record<NonNullable<MaterialChapterDto['category']>, string> = {
  algebra: 'Aljabar',
  geometry: 'Geometri',
  numbers: 'Bilangan',
  statistics: 'Statistika',
};

function chapterIcon(chapter: MaterialChapterDto) {
  if (chapter.totalLevels > 0 && chapter.completedLevels === chapter.totalLevels) return 'verified';
  if (chapter.category === 'algebra') return 'calculator';
  if (chapter.category === 'geometry') return 'globe';
  if (chapter.category === 'numbers') return 'numbers';
  if (chapter.category === 'statistics') return 'chart-box';
  return 'book';
}

function MaterialChapterLink({ chapter }: { chapter: MaterialChapterDto }) {
  const completed = chapter.totalLevels > 0 && chapter.completedLevels === chapter.totalLevels;
  return (
    <Card
      className={`material-chapter material-chapter--${chapter.category ?? 'other'}${completed ? ' is-completed' : ''}`}
      padding="none"
    >
      <Link className="material-chapter__toggle" href={`/student/learn/${chapter.id}`}>
        <span className="material-chapter__icon">
          <Icon name={chapterIcon(chapter)} />
        </span>
        <span className="material-chapter__copy">
          <small>
            <b>BAB {chapter.order}</b> {chapter.category && categoryNames[chapter.category]}
          </small>
          <strong>{chapter.title}</strong>
        </span>
        <Badge size="sm" className="material-chapter__status" variant="secondary">
          {chapter.completedLevels}/{chapter.totalLevels} level selesai
        </Badge>
        <Icon name="arrow" className="material-chapter__chevron" width={16} height={16} />
      </Link>
    </Card>
  );
}

export function MaterialSubchapterList({ chapter }: { chapter: MaterialChapterDto }) {
  return (
    <div className="material-chapter__body">
      <div className="material-chapter__progress">
        <span>
          Progres: {chapter.completedLevels} dari {chapter.totalLevels} level selesai
        </span>
        <strong>Target ≥80%</strong>
      </div>
      {chapter.subchapters.length ? (
        <ul>
          {chapter.subchapters.map((sub) => (
            <li key={sub.id}>
              <Link href={`/student/learn/${chapter.id}/${sub.id}`}>
                <Icon
                  className={
                    sub.latestScore !== null && sub.latestScore >= 80
                      ? 'is-mastered'
                      : sub.availableLevels
                        ? 'is-ready'
                        : 'is-unavailable'
                  }
                  name={
                    !sub.totalLevels
                      ? 'info'
                      : !sub.availableLevels
                        ? 'lock'
                        : sub.latestScore !== null && sub.latestScore >= 80
                          ? 'check-circle'
                          : 'play-circle'
                  }
                  width={18}
                  height={18}
                />
                <span>
                  {chapter.order}.{sub.order} {sub.title}
                </span>
                {sub.latestScore !== null ? (
                  <strong
                    className="material-sub-score"
                    aria-label={`Nilai terakhir ${sub.latestScore}%`}
                  >
                    {sub.latestScore}%
                  </strong>
                ) : (
                  <span className="material-sub-ready">
                    {sub.availableLevels ? 'Siap Drill' : 'Belum tersedia'}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Subbab belum tersedia.</p>
      )}
      {chapter.continueSubchapterId && (
        <Link
          className="material-chapter__continue"
          href={`/student/learn/${chapter.id}/${chapter.continueSubchapterId}`}
        >
          Lanjut Telusuri Bab {chapter.order} <Icon name="arrow" width={18} />
        </Link>
      )}
    </div>
  );
}

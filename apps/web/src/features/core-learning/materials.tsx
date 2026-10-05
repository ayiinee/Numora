'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, EmptyState, Icon, Input, type IconName } from '@tka/ui';
import { StudentLayout } from '@/components/shell';
import { useAuth } from '@/features/onboarding/auth';
import { useStudentToken } from './student-session';
import { learningApi, request } from './api';
import { DataState } from './ui';
import { HomeActivity, StudentIdentityHeader } from './dashboard-presentation';
import type { StudentMaterialsDto, MaterialChapterDto } from './generated-types';

export const materialCategories = [
  { id: 'algebra', title: 'Aljabar', detail: '& Fungsi', symbol: 'Σ' },
  { id: 'geometry', title: 'Geometri', detail: '& Ruang', icon: 'geometry' },
  { id: 'numbers', title: 'Bilangan', detail: '& Eksponen', icon: 'numbers' },
  { id: 'statistics', title: 'Statistika', detail: '& Peluang', icon: 'chart-box' },
] as const;

export function MaterialsScreen() {
  return (
    <Suspense fallback={<DataState pending />}>
      <MaterialsContent />
    </Suspense>
  );
}
function MaterialsContent() {
  const token = useStudentToken();
  const { state } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const query = useQuery({
    queryKey: ['student-materials'],
    queryFn: () => request<StudentMaterialsDto>(token, '/students/me/materials'),
  });
  const dashboard = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => learningApi.dashboard(token),
  });
  const tryout = useQuery({
    queryKey: ['current-tryout'],
    queryFn: () => learningApi.currentTryout(token),
  });
  const search = params.get('q') ?? '';
  const category = materialCategories.some((c) => c.id === params.get('category'))
    ? params.get('category')
    : null;
  const expanded = params.has('chapter')
    ? params.get('chapter')
    : (query.data?.recentChapterId ?? query.data?.chapters[0]?.id);
  function change(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.replace(`/student/learn${next.size ? '?' + next.toString() : ''}`, { scroll: false });
  }
  const needle = search.trim().toLocaleLowerCase('id');
  const visible =
    query.data?.chapters.filter(
      (c) =>
        (!category || c.category === category) &&
        (!needle ||
          c.title.toLocaleLowerCase('id').includes(needle) ||
          c.subchapters.some((s) => s.title.toLocaleLowerCase('id').includes(needle))),
    ) ?? [];
  const avatar =
    state.status === 'ready' ? state.session.user?.user_metadata?.avatar_url : undefined;
  const avatarUrl = typeof avatar === 'string' ? avatar : undefined;
  const activity = dashboard.data?.activities[0];
  const recentChapter = query.data?.chapters.find((c) => c.id === query.data.recentChapterId);
  return (
    <StudentLayout
      title="Materi Belajar"
      className="materials-shell"
      mobileHeader={
        dashboard.data && (
          <StudentIdentityHeader data={dashboard.data} avatarUrl={avatarUrl} tryout={tryout.data} />
        )
      }
    >
      <div className="materials-page">
        <div className="materials-heading">
          <div>
            <h1>Materi Belajar</h1>
            <p>Kurikulum TKA Matematika SMP</p>
          </div>
          <Badge variant="secondary">Kelas 9 · TKA</Badge>
        </div>
        <Input
          className="materials-search"
          label="Cari materi, bab, atau subbab"
          type="search"
          placeholder="Cari materi, bab, atau subbab…"
          value={search}
          onChange={(e) => change('q', e.target.value || null)}
          leftIcon={<Icon name="search" />}
          rightIcon={<span className="materials-search__tag">TKA IX</span>}
        />
        <div className="materials-categories" aria-label="Kategori materi">
          {materialCategories.map((c, index) => {
            const count =
              query.data?.chapters.filter((chapter) => chapter.category === c.id).length ?? 0;
            return (
              <button
                type="button"
                key={c.id}
                className={`material-category material-category--${index}`}
                aria-pressed={category === c.id}
                disabled={!count}
                onClick={() => change('category', category === c.id ? null : c.id)}
              >
                <span className="material-category__icon">
                  <span className="material-category__count">{count} Bab</span>
                  {'symbol' in c ? (
                    <b>{c.symbol}</b>
                  ) : (
                    <Icon name={c.icon as IconName} width={28} height={28} />
                  )}
                </span>
                <strong>{c.title}</strong>
                <small>{c.detail}</small>
              </button>
            );
          })}
        </div>
        {category && (
          <button className="text-action" type="button" onClick={() => change('category', null)}>
            Lihat semua kategori <Icon name="close" width={16} />
          </button>
        )}
        <Card className="materials-pretest">
          <span className="icon-tile">
            <Icon name="zap" />
          </span>
          <div>
            <strong>Pretest</strong>
            <p>Fitur belum tersedia · Tetap bisa mulai Drill</p>
          </div>
        </Card>
        <div className="materials-composition">
          <section aria-labelledby="materials-chapters">
            <div className="materials-section-title">
              <h2 id="materials-chapters">Daftar Bab TKA</h2>
              <Badge variant="secondary">{visible.length} Bab</Badge>
            </div>
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
                    query.data.chapters.length
                      ? 'Materi tidak ditemukan'
                      : 'Materi sedang disiapkan'
                  }
                  description={
                    query.data.chapters.length
                      ? 'Coba kata kunci atau kategori lainnya.'
                      : 'Materi yang diterbitkan akan muncul di sini.'
                  }
                />
              </Card>
            ) : (
              <div className="materials-chapters">
                {visible.map((chapter) => (
                  <MaterialChapter
                    key={chapter.id}
                    chapter={chapter}
                    expanded={expanded === chapter.id}
                    onToggle={() => change('chapter', expanded === chapter.id ? '' : chapter.id)}
                    needle={needle}
                  />
                ))}
              </div>
            )}
          </section>
          <aside className="materials-activity" aria-labelledby="materials-recent">
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
                  description="Pilih subbab untuk memulai latihan pertamamu."
                />
              </Card>
            )}
          </aside>
        </div>
      </div>
    </StudentLayout>
  );
}
function MaterialChapter({
  chapter,
  expanded,
  onToggle,
  needle,
}: {
  chapter: MaterialChapterDto;
  expanded: boolean;
  onToggle: () => void;
  needle: string;
}) {
  const category = materialCategories.find((c) => c.id === chapter.category);
  const completed = chapter.totalLevels > 0 && chapter.completedLevels === chapter.totalLevels;
  const subs =
    !needle || chapter.title.toLocaleLowerCase('id').includes(needle)
      ? chapter.subchapters
      : chapter.subchapters.filter((s) => s.title.toLocaleLowerCase('id').includes(needle));
  return (
    <Card
      className={`material-chapter material-chapter--${chapter.category ?? 'other'}${expanded ? ' is-expanded' : ''}${completed ? ' is-completed' : ''}`}
      padding="none"
    >
      <button
        type="button"
        className="material-chapter__toggle"
        aria-expanded={expanded}
        aria-controls={`chapter-${chapter.id}`}
        onClick={onToggle}
      >
        <span className="material-chapter__icon">
          <Icon
            name={
              completed
                ? 'verified'
                : chapter.category === 'algebra'
                  ? 'calculator'
                  : chapter.category === 'geometry'
                    ? 'globe'
                    : category && 'icon' in category
                      ? category.icon
                      : 'book'
            }
          />
        </span>
        <span className="material-chapter__copy">
          <small>
            <b>BAB {chapter.order}</b> {category?.title}
          </small>
          <strong>{chapter.title}</strong>
        </span>
        <Badge size="sm" className="material-chapter__status" variant="secondary">
          {chapter.completedLevels}/{chapter.totalLevels} level selesai
        </Badge>
        <Icon name="chevron" className="material-chapter__chevron" width={16} height={16} />
      </button>
      <div id={`chapter-${chapter.id}`} hidden={!expanded} className="material-chapter__body">
        <div className="material-chapter__progress">
          <span>
            Progres: {chapter.completedLevels} dari {chapter.totalLevels} level selesai
          </span>
          <strong>Target ≥80%</strong>
        </div>
        {subs.length ? (
          <ul>
            {subs.map((sub) => (
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
    </Card>
  );
}

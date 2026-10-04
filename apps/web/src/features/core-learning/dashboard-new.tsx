'use client';

import Link from 'next/link';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Card, EmptyState, Icon } from '@tka/ui';
import { AppShell } from '@/components/shell';
import { useAuth } from '@/features/onboarding/auth';
import { learningApi } from './api';
import { DataState, StudentGate } from './ui';
import type { StudentDashboardDto } from './generated-types';
import type { Catalog } from './types';
import { FeedbackOverview } from './feedback-overview';
import { HomeClassPodium } from './home-class-podium';
import {
  HomeActivity,
  HomeResume,
  HomeFeatures,
  HomeTryoutHero,
  HomeTryoutSkeleton,
  StudentIdentityHeader,
} from './dashboard-presentation';

export function NewStudentDashboard() {
  return <StudentGate>{(token) => <DashboardContent token={token} />}</StudentGate>;
}

function DashboardContent({ token }: { token: string }) {
  const dashboard = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => learningApi.dashboard(token),
  });
  const catalog = useQuery({ queryKey: ['chapters'], queryFn: () => learningApi.catalog(token) });
  if (dashboard.isPending || dashboard.isError)
    return (
      <AppShell className="student-home-shell">
        <DataState
          pending={dashboard.isPending}
          error={dashboard.error}
          retry={() => void dashboard.refetch()}
        />
      </AppShell>
    );
  return <DashboardReady token={token} data={dashboard.data} catalog={catalog} />;
}

function DashboardReady({
  token,
  data,
  catalog,
}: {
  token: string;
  data: StudentDashboardDto;
  catalog: UseQueryResult<Catalog, Error>;
}) {
  const { state } = useAuth();
  const avatar =
    state.status === 'ready' ? state.session.user?.user_metadata?.avatar_url : undefined;
  const avatarUrl = typeof avatar === 'string' ? avatar : undefined;
  const tryout = useQuery({
    queryKey: ['current-tryout'],
    queryFn: () => learningApi.currentTryout(token),
  });
  const header = <StudentIdentityHeader data={data} avatarUrl={avatarUrl} tryout={tryout.data} />;
  return (
    <AppShell className="student-home-shell" mobileHeader={header}>
      <h1 className="sr-only">Halo, {data.displayName.split(' ')[0] || 'teman belajar'}</h1>
      <div className="student-home-layout">
        <div className="student-home-primary">
          {tryout.isPending ? (
            <HomeTryoutSkeleton />
          ) : tryout.isError ? (
            <Card className="student-home-card home-tryout-state" aria-label="Status Tryout">
              <DataState pending={false} error={tryout.error} retry={() => void tryout.refetch()} />
            </Card>
          ) : (
            <HomeTryoutHero data={tryout.data} />
          )}
          <HomeFeatures data={data} />
          <Card className="student-home-card home-activities">
            <div className="home-card-heading">
              <h2>Aktivitas Terakhir</h2>
              <Link className="section-link" href="/student/assessment">
                Lihat Semua
              </Link>
            </div>
            {data.activities.length ? (
              <div className="home-activity-list">
                {data.activities.map((item, index) => (
                  <HomeActivity
                    key={item.attemptId}
                    item={item}
                    resume={index === 0 ? data.activeDrill : null}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Icon name="clock" />}
                title="Perjalananmu dimulai di sini"
                description="Hasil latihan pertamamu akan tersimpan di bagian ini."
                action={
                  <Link href="/student/learn" className="section-link">
                    Pilih latihan <Icon name="arrow" width={16} height={16} />
                  </Link>
                }
              />
            )}
            {!data.activities.length && data.activeDrill && (
              <HomeResume attempt={data.activeDrill} />
            )}
          </Card>
        </div>
        <aside className="student-home-context" aria-label="Kelas dan catatan belajar">
          <div className="student-home-desktop-identity">{header}</div>
          <HomeClassPodium token={token} data={data} />
          <FeedbackOverview token={token} />
          <Card className="student-home-card home-context-links">
            {data.class && <h2 className="home-context-class">{data.class.name}</h2>}
            <div>
              <span>Nilai Drill terbaik</span>
              <strong>
                {data.bestDrillScore !== null ? `${data.bestDrillScore} / 100` : 'Belum ada'}
              </strong>
            </div>
            <div>
              <span>Nilai Drill terakhir</span>
              <strong>{data.latestDrillScore ?? 'Belum ada'}</strong>
            </div>
            <Link href="/student/assessment">
              <Icon name="chart" width={20} height={20} />
              Progres & Riwayat
              <Icon name="chevron" width={16} height={16} />
            </Link>
            <Link href="/student/leaderboards">
              <Icon name="trophy" width={20} height={20} />
              Peringkat
              <Icon name="chevron" width={16} height={16} />
            </Link>
          </Card>
        </aside>
        {(catalog.isPending || catalog.isError || !catalog.data.chapters.length) && (
          <section className="student-home-catalog-state" aria-label="Status materi">
            {catalog.isPending || catalog.isError ? (
              <DataState
                pending={catalog.isPending}
                error={catalog.error}
                retry={() => void catalog.refetch()}
              />
            ) : (
              <Card className="student-home-card">
                <EmptyState
                  icon={<Icon name="book" />}
                  title="Materi sedang disiapkan"
                  description="Bab yang sudah diterbitkan akan tampil di sini."
                />
              </Card>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}

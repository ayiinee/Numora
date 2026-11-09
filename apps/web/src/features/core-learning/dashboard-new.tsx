'use client';

import Link from 'next/link';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { EmptyState, Icon } from '@tka/ui';
import { StudentMascot } from '@/components/student-mascot';
import { AppShell } from '@/components/shell';
import { useAuth } from '@/features/onboarding/auth';
import { learningApi } from './api';
import { DataState, StudentGate } from './ui';
import type { StudentDashboardDto } from './generated-types';
import type { Catalog } from './types';
import { FeedbackOverview } from './feedback-overview';
import { HomeClassPodium } from './home-class-podium';
import { HomeFeatures, StudentHomeIdentityHeader } from './dashboard-presentation';
import { RecentActivity } from './recent-activity';
import { StudentHomeCarousel } from './student-home-carousel';
import './student-home.css';

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
      <AppShell className="student-home-shell" showTopbarProfile={false}>
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
  const recent = data.activities[0];
  const tryout = useQuery({
    queryKey: ['current-tryout'],
    queryFn: () => learningApi.currentTryout(token),
  });
  const header = (
    <StudentHomeIdentityHeader data={data} avatarUrl={avatarUrl} tryout={tryout.data} />
  );
  return (
    <AppShell className="student-home-shell" mobileHeader={header} showTopbarProfile={false}>
      <div className="sh-layout">
        <div className="sh-desktop-identity">{header}</div>
        <div className="sh-main">
          <StudentHomeCarousel
            activeDrill={data.activeDrill}
            tryout={tryout.data}
            tryoutPending={tryout.isPending}
            tryoutError={tryout.error}
            retryTryout={() => void tryout.refetch()}
          />
          <HomeFeatures data={data} />
          {(catalog.isError || (catalog.isSuccess && !catalog.data.chapters.length)) && (
            <div className="sh-catalog-state">
              {catalog.isError ? (
                <DataState
                  pending={false}
                  error={catalog.error}
                  retry={() => void catalog.refetch()}
                />
              ) : (
                <p>Materi sedang disiapkan.</p>
              )}
            </div>
          )}
          <section className="sh-section sh-activities" aria-labelledby="sh-activities-title">
            <div className="sh-section__heading">
              <h2 id="sh-activities-title">Aktivitas Terakhir</h2>
              <Link href="/student/assessment">
                Lihat Semua <Icon name="chevron" width={16} height={16} />
              </Link>
            </div>
            {recent ? (
              <RecentActivity item={recent} activeDrill={data.activeDrill} />
            ) : (
              <div className="sh-activities__empty">
                <EmptyState
                  compact
                  style={{ gridTemplateColumns: '3.5rem minmax(0, 1fr)' }}
                  icon={<StudentMascot pose="start" compact />}
                  title="Perjalananmu dimulai di sini"
                  description="Hasil latihan pertamamu akan tersimpan di bagian ini."
                />
              </div>
            )}
          </section>
        </div>
        <aside className="sh-aside" aria-label="Kelas dan catatan belajar">
          <HomeClassPodium token={token} data={data} />
          <FeedbackOverview token={token} />
        </aside>
      </div>
    </AppShell>
  );
}

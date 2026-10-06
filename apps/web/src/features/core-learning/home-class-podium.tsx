'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, Icon, Skeleton } from '@tka/ui';
import type { LeaderboardDto, StudentDashboardDto } from './generated-types';
import { request } from './api';
import { DataState } from './ui';
import { LeaderboardPodium, formatLeaderboardPoints } from './leaderboard-podium';

export function HomeClassPodium({ token, data }: { token: string; data: StudentDashboardDto }) {
  const ranking = useQuery({
    queryKey: ['student-leaderboard', 'class', 'easy'],
    queryFn: () => request<LeaderboardDto>(token, '/leaderboards/class'),
    enabled: Boolean(data.class) && data.features.classLeaderboard,
  });
  const pendingPolicy =
    Boolean(data.class) && (!data.features.classLeaderboard || ranking.data?.policyPending);
  return (
    <Card className="student-home-card home-podium" aria-labelledby="home-podium-title">
      <div className="home-card-heading">
        <h2 id="home-podium-title">
          <Icon name="trophy" width={18} height={18} />
          Podium Teratas Kelas
        </h2>
        <Link
          href={data.class ? '/student/leaderboards?tab=class' : '/student/leaderboards'}
          className="home-pill-link"
        >
          Lihat Leaderboard
        </Link>
      </div>
      {!data.class ? (
        <EmptyState
          icon={<Icon name="school" />}
          title="Belajar bersama kelas"
          description="Gabung kelas jika kamu memiliki kode dari guru. Drill dan Tryout tetap tersedia untuk User Mandiri."
          action={
            <Link href="/student/profile" className="section-link">
              Gabung kelas (opsional) <Icon name="arrow" width={16} height={16} />
            </Link>
          }
        />
      ) : pendingPolicy ? (
        <div className="home-podium-pending">
          <div className="home-podium-pending__steps" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <strong>Peringkat belum tersedia</strong>
          <p>
            Ketentuan XP kelas masih menunggu keputusan produk. Progres belajarmu tetap tersimpan.
          </p>
        </div>
      ) : ranking.isPending ? (
        <div className="home-podium-loading" aria-label="Memuat podium kelas">
          <Skeleton height={220} />
        </div>
      ) : ranking.isError ? (
        <DataState pending={false} error={ranking.error} retry={() => void ranking.refetch()} />
      ) : ranking.data.entries.length ? (
        <>
          <LeaderboardPodium
            entries={ranking.data.entries}
            ownEntry={ranking.data.ownEntry}
            unit={ranking.data.unit}
          />
        </>
      ) : (
        <EmptyState
          icon={<Icon name="trophy" />}
          title="Podium masih kosong"
          description="Peringkat akan tampil ketika data kelas tersedia."
        />
      )}
      {data.class &&
        data.features.classLeaderboard &&
        ranking.isSuccess &&
        !ranking.data.policyPending &&
        ranking.data.ownEntry &&
        !ranking.data.entries
          .slice(0, 3)
          .some((item) => item.studentId === ranking.data.ownEntry?.studentId) && (
          <p className="home-podium-own">
            Peringkat kamu <strong>#{ranking.data.ownEntry.rank}</strong>
            <span>
              {formatLeaderboardPoints(ranking.data.ownEntry.points, ranking.data.unit)}{' '}
              {ranking.data.unit === 'xp' ? 'XP' : 'PTS'}
            </span>
          </p>
        )}
    </Card>
  );
}

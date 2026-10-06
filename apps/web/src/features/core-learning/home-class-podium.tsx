'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Avatar, EmptyState, Icon, Skeleton } from '@tka/ui';
import type { LeaderboardDto, StudentDashboardDto } from './generated-types';
import { request } from './api';
import { DataState } from './ui';
import { formatLeaderboardPoints } from './leaderboard-podium';

export function HomeClassPodium({ token, data }: { token: string; data: StudentDashboardDto }) {
  const ranking = useQuery({
    queryKey: ['student-leaderboard', 'class', 'easy'],
    queryFn: () => request<LeaderboardDto>(token, '/leaderboards/class'),
    enabled: Boolean(data.class) && data.features.classLeaderboard,
  });
  const pendingPolicy =
    Boolean(data.class) && (!data.features.classLeaderboard || ranking.data?.policyPending);
  const leaders = ranking.data?.entries.slice(0, 3) ?? [];
  const own = ranking.data?.ownEntry;
  const showOwn = own && !leaders.some((entry) => entry.studentId === own.studentId);
  const unit = ranking.data?.unit ?? 'xp';
  return (
    <section className="sh-section sh-class" aria-labelledby="sh-class-title">
      <div className="sh-section__heading">
        <h2 id="sh-class-title">Kelas</h2>
        {data.class && (
          <Link href="/student/leaderboards?tab=class">
            Peringkat <Icon name="chevron" width={16} height={16} />
          </Link>
        )}
      </div>
      <div className="sh-class__card">
        {!data.class ? (
          <EmptyState
            icon={<Icon name="school" />}
            title="Belajar mandiri"
            description="Gabung kelas dengan kode dari guru jika ingin melihat peringkat kelas. Belajar tetap bisa dilanjutkan."
            action={
              <Link href="/student/profile" className="section-link">
                Gabung kelas (opsional) <Icon name="arrow" width={16} height={16} />
              </Link>
            }
          />
        ) : pendingPolicy || ranking.data?.available === false ? (
          <div className="sh-class__state">
            <Icon name="trophy" width={30} height={30} />
            <strong>Peringkat belum tersedia</strong>
            <p>Progres belajarmu tetap tersimpan.</p>
          </div>
        ) : ranking.isPending ? (
          <div role="status" aria-label="Memuat peringkat kelas">
            <Skeleton height={160} />
          </div>
        ) : ranking.isError ? (
          <DataState pending={false} error={ranking.error} retry={() => void ranking.refetch()} />
        ) : (
          <>
            {leaders.length ? (
              <>
                <ol className="sh-class__list" aria-label="Tiga peringkat teratas kelas">
                  {leaders.map((entry) => (
                    <li
                      key={entry.studentId}
                      className={entry.studentId === own?.studentId ? 'is-self' : ''}
                    >
                      <span
                        className={`sh-class__rank sh-class__rank--${Math.min(entry.rank, 3)}`}
                        aria-label={`Peringkat ${entry.rank}`}
                      >
                        {entry.rank}
                      </span>
                      <Avatar name={entry.displayName} size="sm" />
                      <strong>
                        {entry.displayName}
                        {entry.studentId === own?.studentId ? ' (Kamu)' : ''}
                      </strong>
                      <span>
                        {formatLeaderboardPoints(entry.points, unit)} {unit === 'xp' ? 'XP' : 'PTS'}
                      </span>
                    </li>
                  ))}
                </ol>
                <img
                  className="sh-class__trophy"
                  src="/illustrations/student-home/reference-class-trophy.png"
                  width="159"
                  height="143"
                  alt=""
                />
              </>
            ) : (
              <EmptyState
                icon={<Icon name="trophy" />}
                title="Peringkat masih kosong"
                description="Peringkat akan tampil ketika data kelas tersedia."
              />
            )}
            {showOwn && (
              <div className="sh-class__own">
                <span>#{own.rank}</span>
                <Avatar name={own.displayName || data.displayName} size="sm" />
                <strong>{own.displayName || data.displayName} (Kamu)</strong>
                <span>
                  {formatLeaderboardPoints(own.points, unit)} {unit === 'xp' ? 'XP' : 'PTS'}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

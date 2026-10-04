'use client';

import { Avatar, Icon } from '@tka/ui';
import type { LeaderboardDto } from './generated-types';

/** Presentation only: positions, points and unit come from the server. */
export function LeaderboardPodium({
  entries,
  ownEntry,
  unit,
  label = 'Podium teratas kelas',
  pointsOnPedestal = false,
}: Pick<LeaderboardDto, 'entries' | 'ownEntry' | 'unit'> & {
  label?: string;
  pointsOnPedestal?: boolean;
}) {
  return (
    <ol className="leaderboard-podium" aria-label={label}>
      {[1, 0, 2].map((position) => {
        const entry = entries[position];
        return (
          <li
            key={position}
            className={`leaderboard-podium__place leaderboard-podium__place--${position + 1}`}
          >
            {entry ? (
              <>
                <div className="leaderboard-podium__portrait">
                  <Avatar name={entry.displayName} size={position === 0 ? 'xl' : 'lg'} />
                  <span className="leaderboard-podium__rank" aria-label={`Peringkat ${entry.rank}`}>
                    {entry.rank}
                  </span>
                </div>
                <strong>{entry.displayName}</strong>
                {ownEntry?.studentId === entry.studentId && (
                  <span className="leaderboard-podium__self">Kamu</span>
                )}
                {!pointsOnPedestal && (
                  <span className="leaderboard-podium__points">
                    {entry.points.toLocaleString('id-ID')} {unit === 'xp' ? 'XP' : 'PTS'}
                  </span>
                )}
                <div className="leaderboard-podium__pedestal">
                  {pointsOnPedestal ? (
                    <>
                      <strong className="leaderboard-podium__record">
                        {entry.points.toLocaleString('id-ID')}
                      </strong>
                      <span>{unit === 'xp' ? 'XP' : 'PTS'}</span>
                    </>
                  ) : (
                    <>
                      <Icon
                        name="trophy"
                        width={position === 0 ? 26 : 20}
                        height={position === 0 ? 26 : 20}
                      />
                      <span>Peringkat {entry.rank}</span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="leaderboard-podium__vacant">
                <Icon name="users" />
                <span>Belum ada peserta</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

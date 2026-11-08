'use client';

import { Avatar } from '@tka/ui';
import Image from 'next/image';
import type { LeaderboardDto } from './generated-types';
import './leaderboard-podium.css';

export const formatLeaderboardPoints = (points: number, unit: LeaderboardDto['unit']) =>
  points.toLocaleString('id-ID', { maximumFractionDigits: unit === 'xp' ? 6 : 2 });

export function hasLeaderboardPodiumTie(entries: LeaderboardDto['entries']) {
  return entries.slice(0, 3).some((entry, index) => entry.rank === entries[index + 1]?.rank);
}

/** Presentation only: positions, points and unit come from the server. */
export function LeaderboardPodium({
  entries,
  ownEntry,
  unit,
  label = 'Podium teratas kelas',
}: Pick<LeaderboardDto, 'entries' | 'ownEntry' | 'unit'> & {
  label?: string;
}) {
  const leaders = entries.slice(0, 3);
  return (
    <ol className="student-scoreboard-podium" aria-label={label} role="list">
      {leaders.map((entry) => (
        <li
          key={entry.studentId}
          value={entry.rank}
          className={`student-scoreboard-podium__place--${entry.rank}`}
        >
          <div className="student-scoreboard-podium__student">
            <div className="student-scoreboard-podium__avatar" aria-hidden="true">
              <Avatar name={entry.displayName} size={entry.rank === 1 ? 'xl' : 'lg'} />
            </div>
            <strong>{entry.displayName}</strong>
            {ownEntry?.studentId === entry.studentId && <small>Kamu</small>}
            <span className="student-scoreboard-podium__score">
              {formatLeaderboardPoints(entry.points, unit)}{' '}
              <small>{unit === 'xp' ? 'XP' : 'PTS'}</small>
            </span>
          </div>
          <div className="student-scoreboard-podium__pedestal">
            <Image
              src={`/illustrations/student-leaderboard/medal-${entry.rank}.webp`}
              width={272}
              height={450}
              alt={`Peringkat ${entry.rank}`}
              unoptimized
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function LeaderboardRankingList({
  entries,
  ownEntry,
  unit,
  label,
}: Pick<LeaderboardDto, 'entries' | 'ownEntry' | 'unit'> & { label: string }) {
  return (
    <ol aria-label={label} role="list">
      {entries.map((entry) => (
        <li
          key={entry.studentId}
          value={entry.rank}
          className={entry.studentId === ownEntry?.studentId ? 'is-self' : ''}
        >
          <span className="pvp-rank-number" aria-label={`Peringkat ${entry.rank}`}>
            {entry.rank}
          </span>
          <span aria-hidden="true">
            <Avatar name={entry.displayName} size="sm" />
          </span>
          <div>
            <strong>{entry.displayName}</strong>
            {entry.studentId === ownEntry?.studentId && <small>Kamu</small>}
          </div>
          <span className="pvp-rank-points">
            <strong>{formatLeaderboardPoints(entry.points, unit)}</strong>
            <small>{unit === 'xp' ? 'XP' : 'PTS'}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

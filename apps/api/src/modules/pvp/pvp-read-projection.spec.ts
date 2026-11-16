import { describe, expect, it } from 'vitest';
import { pvpMatches, pvpPlayers, questionVersions } from '@tka/database';
import { pvpReadProjection } from './pvp-read-projection';

describe('PvP native projection driver compatibility', () => {
  it('preserves driver dates, nulls, numeric precision and legacy JSON strings', () => {
    const read = pvpReadProjection(
      {
        startedAt: pvpMatches.startedAt,
        points: pvpPlayers.totalPoints,
        stem: questionVersions.stem,
        snapshot: pvpMatches.scoringSnapshot,
      },
      'm',
      'test_',
    );
    const at = new Date('2026-11-16T10:00:00.123Z');
    const snapshot = { durationSeconds: 150, policy: { mode: 'demo' } };
    expect(
      read.decode({
        test_startedAt: at,
        test_points: '12.50',
        test_stem: JSON.stringify({ text: 'Legacy stem' }),
        test_snapshot: snapshot,
      }),
    ).toEqual({ startedAt: at, points: '12.50', stem: { text: 'Legacy stem' }, snapshot });
    expect(
      read.decode({
        test_startedAt: null,
        test_points: null,
        test_stem: { text: 'Current stem' },
        test_snapshot: JSON.stringify(snapshot),
      }),
    ).toEqual({ startedAt: null, points: null, stem: { text: 'Current stem' }, snapshot });
  });
});

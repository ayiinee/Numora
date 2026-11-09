import { describe, expect, it } from 'vitest';
import { drillReward } from './drill.policy';
import { changeDrillClock, drillClock, elapsedDrillMs, startDrillClock } from './drill-timer';

describe('Drill active clock', () => {
  it('keeps saved time through a pause and uses only active seconds for XP', () => {
    const first = startDrillClock({ elapsedMs: 0, session: null }, 1_000);
    const paused = changeDrillClock(first, 6_500, first.session!.id, 'pause');
    expect(drillClock(paused, 901_000)).toEqual({
      elapsedMs: 5_500,
      remainingMs: 0,
      sessionId: null,
    });
    const resumed = startDrillClock(paused, 901_000);
    const elapsed = elapsedDrillMs(resumed, 906_500);
    expect(elapsed).toBe(11_000);
    expect(
      drillReward(8, 10, new Date(1_000), new Date(906_500), false, elapsed / 1000),
    ).toMatchObject({
      durationSeconds: 11,
      totalXp: 129,
    });
  });

  it('expires a lost connection, and ignores pause or heartbeat from an older session', () => {
    const first = startDrillClock({ elapsedMs: 0, session: null }, 1_000);
    const firstId = first.session!.id;
    const heartbeat = changeDrillClock(first, 11_000, firstId, 'heartbeat');
    expect(drillClock(heartbeat, 90_000)).toMatchObject({ elapsedMs: 40_000, sessionId: null });
    const expired = changeDrillClock(heartbeat, 90_000, firstId, 'heartbeat');
    expect(expired).toEqual({ elapsedMs: 40_000, session: null });
    const resumed = startDrillClock(expired, 91_000);
    expect(changeDrillClock(resumed, 92_000, firstId, 'pause')).toBe(resumed);
    expect(changeDrillClock(resumed, 92_000, firstId, 'heartbeat')).toBe(resumed);
    expect(drillClock(resumed, 92_000)).toMatchObject({ elapsedMs: 41_000 });
  });
});

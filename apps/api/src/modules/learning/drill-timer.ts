import { randomUUID } from 'node:crypto';
import type { assessmentAttempts } from '@tka/database';

type DrillTimer = NonNullable<(typeof assessmentAttempts.$inferSelect)['drillTimer']>;

const leaseMs = 30_000;

export function elapsedDrillMs(timer: DrillTimer, now: number) {
  const session = timer.session;
  return (
    timer.elapsedMs +
    (session ? Math.max(0, Math.min(now, session.endsAtMs) - session.startedAtMs) : 0)
  );
}

export function drillClock(timer: DrillTimer, now: number) {
  const remainingMs = Math.max(0, (timer.session?.endsAtMs ?? now) - now);
  return {
    elapsedMs: elapsedDrillMs(timer, now),
    remainingMs,
    sessionId: remainingMs > 0 ? timer.session!.id : null,
  };
}

export function startDrillClock(timer: DrillTimer, now: number): DrillTimer {
  return {
    elapsedMs: elapsedDrillMs(timer, now),
    session: { id: randomUUID(), startedAtMs: now, endsAtMs: now + leaseMs },
  };
}

export function changeDrillClock(
  timer: DrillTimer,
  now: number,
  sessionId: string,
  action: 'heartbeat' | 'pause',
): DrillTimer {
  const session = timer.session;
  if (!session || session.id !== sessionId) return timer;
  if (action === 'pause' || session.endsAtMs <= now) {
    return { elapsedMs: elapsedDrillMs(timer, now), session: null };
  }
  return { ...timer, session: { ...session, endsAtMs: now + leaseMs } };
}

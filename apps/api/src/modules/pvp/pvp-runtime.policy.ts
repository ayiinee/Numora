import { getDatabase, scoringPolicyVersions } from '@tka/database';
import { and, eq } from 'drizzle-orm';
import { pvpContentMode, pvpMode, type PvpPolicy } from './pvp.policy';

/** Server-only resolver. Published policy identity is never supplied by a client. */
export async function resolvePvpPolicy(): Promise<PvpPolicy | null> {
  pvpContentMode();
  const mode = pvpMode();
  if (mode === 'disabled') return null;
  const [version] = await getDatabase()
    .db.select()
    .from(scoringPolicyVersions)
    .where(
      and(
        eq(scoringPolicyVersions.policyCode, 'PVP_PRD_V06'),
        eq(scoringPolicyVersions.version, 1),
        eq(scoringPolicyVersions.status, 'PUBLISHED'),
      ),
    );
  const expected = {
    correctPoints: 100,
    bonusMax: 50,
    durations: { easy: 30, medium: 45, hard: 60 },
    reconnectSeconds: 20,
    roomLifetimeSeconds: 600,
    inviteLifetimeSeconds: 600,
    simultaneousDisconnect: 'earliest-deadline-or-cancel',
  };
  const config = version?.configuration as Record<string, unknown> | undefined;
  if (
    !version ||
    !config ||
    Object.entries(expected).some(([key, value]) =>
      key === 'durations'
        ? Object.entries(value as Record<string, number>).some(
            ([difficulty, seconds]) =>
              (config.durations as Record<string, number> | undefined)?.[difficulty] !== seconds,
          )
        : config[key] !== value,
    )
  )
    throw new Error(
      'Published PVP_PRD_V06 v1 policy is missing or invalid; apply migrations first.',
    );
  return {
    policyVersionId: version.id,
    roomLifetimeSeconds: 600,
    inviteLifetimeSeconds: 600,
    simultaneousDisconnect: 'earliest-deadline-or-cancel',
    mode,
  };
}

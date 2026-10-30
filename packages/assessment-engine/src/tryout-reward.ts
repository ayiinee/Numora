import { AssessmentFinalizationError } from './errors.js';

export const TRYOUT_XP_POLICY = { version: 1, code: 'TRYOUT_PRD_V06', multiplier: 10 } as const;

/** Consumes graded item facts; does not define a PGK rubric or use IRT scores. */
export function tryoutXp(correctEquivalent: number) {
  if (!Number.isFinite(correctEquivalent) || correctEquivalent < 0)
    throw new AssessmentFinalizationError('TRYOUT_REWARD_INVALID', 'Benar ekuivalen tidak valid.');
  return Math.ceil(correctEquivalent * TRYOUT_XP_POLICY.multiplier);
}

export function pgTryoutReward(grades: { points: number; maximum: number }[]) {
  if (
    !grades.length ||
    grades.some(
      (g) =>
        !Number.isFinite(g.maximum) || g.maximum <= 0 || (g.points !== 0 && g.points !== g.maximum),
    )
  )
    throw new AssessmentFinalizationError('TRYOUT_PACKAGE_INVALID', 'Poin PG tidak valid.');
  return tryoutXp(grades.reduce((sum, g) => sum + g.points / g.maximum, 0));
}

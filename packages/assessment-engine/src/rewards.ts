// PRD v0.6 §§9/12; XP Tryout ×10 confirmed by Reyhan on 5 October 2026.
// Persistence uses numeric(14,6), rather than an unapproved integer rounding rule.
export const DRILL_REWARD_POLICY = 'DRILL_PRD_V06';
export const TRYOUT_REWARD_POLICY = 'TRYOUT_PRD_V06';

export function drillXp(correctCount: number, questionCount: number, durationSeconds: number) {
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0 ||
    !Number.isInteger(questionCount) ||
    questionCount <= 0 ||
    !Number.isInteger(correctCount) ||
    correctCount < 0 ||
    correctCount > questionCount
  )
    throw new Error('Invalid Drill reward inputs.');
  return Math.min(
    150,
    (correctCount / questionCount) * 100 + Math.max(0, ((900 - durationSeconds) / 900) * 50),
  );
}

export function tryoutXp(equivalentCorrect: number) {
  if (!Number.isFinite(equivalentCorrect) || equivalentCorrect < 0)
    throw new Error('Invalid equivalent-correct score.');
  return equivalentCorrect * 10;
}

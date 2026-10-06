// PRD v0.6 §§9/12; XP Tryout ×10 confirmed by Reyhan on 5 October 2026.
// Drill final rounding approved by Aini; PGK rubrics remain a separate dependency.
export { tryoutXp } from './tryout-reward.js';
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
  return Math.round(Math.min(
    150,
    (correctCount / questionCount) * 100 + Math.max(0, ((900 - durationSeconds) / 900) * 50),
  ));
}

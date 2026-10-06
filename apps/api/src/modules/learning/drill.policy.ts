import { ServiceUnavailableException } from '@nestjs/common';

const problem = (code: string, detail: string) => ({ code, detail });

export const DRILL_QUESTION_COUNT = 10;
export const DRILL_MASTERY_SCORE = 80;
export const DRILL_POLICY_CODE = 'DRILL_PRD_V06';
export const DRILL_POLICY_VERSION = 1;
// Independent from package/content scoring pins; null means the historical policy.
export const DRILL_REWARD_POLICY_VERSION = 2;
export const DRILL_REWARD_POLICY_CODE = 'DRILL_PRD_V06';

export function scoreDrill(
  correctCount: number,
  questionCount: number,
  policyVersion: number | null = null,
) {
  const score = Math.round((correctCount * 100) / questionCount);
  return {
    score,
    mastered: score >= DRILL_MASTERY_SCORE,
    stars:
      policyVersion === DRILL_REWARD_POLICY_VERSION
        ? score === 0
          ? 0
          : score <= 50
            ? 1
            : score < 100
              ? 2
              : 3
        : score === 0
          ? null
          : score <= 50
            ? 1
            : score <= 90
              ? 2
              : 3,
  };
}

export function drillReward(
  correctCount: number,
  questionCount: number,
  startedAt: Date,
  finishedAt: Date,
  allowPartial = false,
) {
  if (
    questionCount !== DRILL_QUESTION_COUNT ||
    !(allowPartial ? Number.isFinite(correctCount) : Number.isInteger(correctCount)) ||
    correctCount < 0 ||
    correctCount > questionCount
  )
    throw new Error('Invalid Drill reward inputs.');
  const durationSeconds = Math.max(0, (finishedAt.getTime() - startedAt.getTime()) / 1000);
  if (!Number.isFinite(durationSeconds)) throw new Error('Invalid Drill duration.');
  // ponytail: the one-off override keeps the existing integer base-XP ledger;
  // use a numeric ledger migration before general fractional Drill rewards.
  const baseXp = allowPartial ? Math.round(correctCount * 10) : correctCount * 10;
  const bonusXp = Math.max(0, ((900 - durationSeconds) / 900) * 50);
  return {
    policyCode: DRILL_REWARD_POLICY_CODE,
    policyVersion: DRILL_REWARD_POLICY_VERSION,
    baseXp,
    bonusXp,
    durationSeconds,
    totalXp: Math.round(Math.min(150, baseXp + bonusXp)),
  };
}

export function selectDrillPackage<T extends { id: string }>(
  packages: T[],
  _previousPackageId?: string,
) {
  return packages[0];
}

export function explanationAvailable(completedAt: Date, now = new Date()) {
  // Legacy policy only; newly pinned v2 attempts have no expiry.
  return now.getTime() < completedAt.getTime() + 90 * 24 * 60 * 60 * 1000;
}

export type SingleChoiceContent = {
  stem: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
};

export function decodeSingleChoiceVersion(row: {
  questionType: string;
  stem: unknown;
  optionsOrStatements: unknown;
  answerKey: unknown;
  explanation: unknown;
}): SingleChoiceContent {
  const textOf = (value: unknown) =>
    value && typeof value === 'object' && 'text' in value && typeof value.text === 'string'
      ? value.text
      : null;
  const stem = textOf(row.stem);
  const explanation = textOf(row.explanation);
  const answer =
    row.answerKey && typeof row.answerKey === 'object' && 'optionId' in row.answerKey
      ? row.answerKey.optionId
      : null;
  const options = Array.isArray(row.optionsOrStatements)
    ? row.optionsOrStatements.map((item: unknown) => {
        if (!item || typeof item !== 'object' || !('id' in item) || !('content' in item))
          return null;
        const content = textOf(item.content);
        return typeof item.id === 'string' && content ? { id: item.id, text: content } : null;
      })
    : [];
  const ids = options.map((item) => item?.id).sort();
  if (
    row.questionType !== 'SINGLE_CHOICE' ||
    !stem ||
    !explanation ||
    typeof answer !== 'string' ||
    !['A', 'B', 'C', 'D'].includes(answer) ||
    options.length !== 4 ||
    options.some((item) => item === null) ||
    ids.join(',') !== 'A,B,C,D'
  ) {
    throw new ServiceUnavailableException(
      problem('DRILL_CONTENT_INVALID', 'Konten Drill tidak valid.'),
    );
  }
  return {
    stem,
    options: options as { id: string; text: string }[],
    correctOptionId: answer,
    explanation,
  };
}

export function selectedOptionId(answer: unknown): string | null {
  if (!answer || typeof answer !== 'object' || !('optionId' in answer)) return null;
  return typeof answer.optionId === 'string' ? answer.optionId : null;
}

export function presentActiveQuestion(
  question: SingleChoiceContent & {
    id: string;
    selectedOptionId: string | null;
  },
) {
  return {
    questionInstanceId: question.id,
    stem: question.stem,
    options: question.options,
    selectedOptionId: question.selectedOptionId,
  };
}

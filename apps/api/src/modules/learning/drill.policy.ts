import { ServiceUnavailableException } from '@nestjs/common';

const problem = (code: string, detail: string) => ({ code, detail });

export const DRILL_QUESTION_COUNT = 10;
export const DRILL_MASTERY_SCORE = 80;
export const DRILL_POLICY_CODE = 'DRILL_PRD_V06';
export const DRILL_POLICY_VERSION = 1;

export function scoreDrill(correctCount: number, questionCount: number) {
  const score = Math.round((correctCount * 100) / questionCount);
  return {
    score,
    mastered: score >= DRILL_MASTERY_SCORE,
    stars: score === 0 ? 0 : score <= 50 ? 1 : score < 100 ? 2 : 3,
  };
}

export function selectDrillPackage<T extends { id: string }>(
  packages: T[],
  _previousPackageId?: string,
) {
  // MVP has one package/variant per level; retries reuse its frozen content.
  return packages[0];
}

export function explanationAvailable(_completedAt: Date, _now = new Date()) {
  // v0.6 preserves historical context and introduces no 90-day expiry.
  return true;
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

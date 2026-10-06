import type { DrillQuestionDto, SavedAnswerDto } from './generated-types';
export type AssessmentAnswer = NonNullable<DrillQuestionDto['answer']> | null;
export function answerOf(
  question: Pick<DrillQuestionDto, 'answer' | 'selectedOptionId'>,
): AssessmentAnswer {
  if (question.answer !== undefined) return question.answer;
  return question.selectedOptionId ? { optionId: question.selectedOptionId } : null;
}
export function emptyAnswer(answer: AssessmentAnswer) {
  return (
    answer === null ||
    ('optionIds' in answer && answer.optionIds.length === 0) ||
    ('categoryByStatementId' in answer && Object.keys(answer.categoryByStatementId).length === 0)
  );
}
export function choiceValue(answer: AssessmentAnswer) {
  if (!answer) return null;
  if ('optionId' in answer) return answer.optionId;
  if ('optionIds' in answer) return answer.optionIds;
  return answer.categoryByStatementId;
}
export function answerFromChoice(
  kind: DrillQuestionDto['type'],
  value: string | string[] | Record<string, string> | null,
): AssessmentAnswer {
  if (value === null) return null;
  const answer =
    kind === 'CATEGORY'
      ? { categoryByStatementId: value as Record<string, string> }
      : kind === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
        ? { optionIds: value as string[] }
        : { optionId: value as string };
  return emptyAnswer(answer) ? null : answer;
}
export function incompleteCategory(question: DrillQuestionDto, answer: AssessmentAnswer) {
  return (
    question.type === 'CATEGORY' &&
    !emptyAnswer(answer) &&
    answer !== null &&
    'categoryByStatementId' in answer &&
    Object.keys(answer.categoryByStatementId).length < question.options.length
  );
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => JSON.stringify(key) + ':' + stable(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
export function acknowledgedAnswer(ack: SavedAnswerDto): AssessmentAnswer {
  return answerOf(ack);
}
export function sameAnswer(a: AssessmentAnswer, b: AssessmentAnswer) {
  return stable(a) === stable(b);
}
export const questionTypeLabels = {
  SINGLE_CHOICE: 'Pilihan ganda',
  MULTIPLE_CHOICE_MULTIPLE_ANSWER: 'PGK — pilih beberapa jawaban',
  CATEGORY: 'PGK — kategori',
} as const;

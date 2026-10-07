import { presentFixtureText } from '@tka/database';
import { AssessmentFinalizationError } from './errors.js';

export type AssessmentAnswer =
  | { optionId: string }
  | { optionIds: string[] }
  | { categoryByStatementId: Record<string, string> }
  | null;
export type QuestionKind = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' | 'CATEGORY';
export type AssessmentContent = {
  type: QuestionKind;
  stem: string;
  options: { id: string; text: string }[];
  categories: { id: string; text: string }[];
  answerKey: Exclude<AssessmentAnswer, null>;
  explanation: string;
};
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function text(value: unknown) {
  const item = record(value);
  return typeof item?.text === 'string' ? item.text : '';
}
function invalidContent(): never {
  throw new AssessmentFinalizationError(
    'ASSESSMENT_CONTENT_INVALID',
    'Konten asesmen belum valid.',
  );
}
function invalidAnswer(): never {
  throw new AssessmentFinalizationError(
    'ANSWER_INVALID',
    'Bentuk atau pilihan jawaban tidak valid.',
  );
}

/** Immutable content decoder only; does not approve a rubric or enable PGK grading. */
export function decodeAssessmentContent(row: {
  questionType: string;
  stem: unknown;
  optionsOrStatements: unknown;
  answerKey: unknown;
  explanation: unknown;
}): AssessmentContent {
  const type = row.questionType;
  if (!['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'].includes(type))
    invalidContent();
  const canonical = record(row.optionsOrStatements);
  const rawOptions = Array.isArray(row.optionsOrStatements)
    ? row.optionsOrStatements
    : canonical?.options;
  const decodeOptions = (values: unknown, category = false) => {
    if (!Array.isArray(values)) invalidContent();
    const result = values.map((value: unknown) => {
      const item = record(value);
      const label = category && typeof item?.label === 'string' ? item.label : text(item?.content);
      if (typeof item?.id !== 'string' || !item.id || !label.trim()) invalidContent();
      return { id: item.id, text: label };
    });
    if (!result.length || new Set(result.map((item) => item.id)).size !== result.length)
      invalidContent();
    return result;
  };
  const options = decodeOptions(rawOptions);
  const categories = type === 'CATEGORY' ? decodeOptions(canonical?.categories, true) : [];
  const stem = text(row.stem),
    explanation = text(row.explanation);
  if (!stem.trim() || !explanation.trim()) invalidContent();
  const content = { type: type as QuestionKind, stem, options, categories, explanation };
  let answerKey: AssessmentAnswer;
  try {
    answerKey = normalizeAssessmentAnswer(content, row.answerKey);
  } catch {
    invalidContent();
  }
  if (
    !answerKey ||
    (type === 'CATEGORY' &&
      'categoryByStatementId' in answerKey &&
      Object.keys(answerKey.categoryByStatementId).length !== options.length)
  )
    invalidContent();
  return { ...content, answerKey };
}
/** Validate and canonicalize a replacement answer, including empty arrays/maps. */
export function normalizeAssessmentAnswer(
  content: Pick<AssessmentContent, 'type' | 'options' | 'categories'>,
  value: unknown,
): AssessmentAnswer {
  if (value === null) return null;
  const item = record(value);
  if (!item || Object.keys(item).length !== 1) invalidAnswer();
  const optionIds = new Set(content.options.map((option) => option.id));
  if (content.type === 'SINGLE_CHOICE') {
    if (!Object.hasOwn(item, 'optionId')) invalidAnswer();
    if (item.optionId === null) return null;
    if (typeof item.optionId !== 'string' || !optionIds.has(item.optionId)) invalidAnswer();
    return { optionId: item.optionId };
  }
  if (content.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER') {
    if (
      !Array.isArray(item.optionIds) ||
      item.optionIds.some((id) => typeof id !== 'string' || !optionIds.has(id)) ||
      new Set(item.optionIds).size !== item.optionIds.length
    )
      invalidAnswer();
    const selected = new Set(item.optionIds as string[]);
    return selected.size
      ? {
          optionIds: content.options
            .filter((option) => selected.has(option.id))
            .map((option) => option.id),
        }
      : null;
  }
  const selections = record(item.categoryByStatementId);
  if (!selections) invalidAnswer();
  const categoryIds = new Set(content.categories.map((category) => category.id));
  if (
    Object.entries(selections).some(
      ([id, category]) =>
        !optionIds.has(id) || typeof category !== 'string' || !categoryIds.has(category),
    )
  )
    invalidAnswer();
  const entries = content.options
    .filter((option) => Object.hasOwn(selections, option.id))
    .map((option) => [option.id, selections[option.id] as string] as const);
  return entries.length ? { categoryByStatementId: Object.fromEntries(entries) } : null;
}
export function presentAssessmentQuestion(
  content: AssessmentContent,
  id: string,
  rawAnswer: unknown,
  questionVersionId?: string,
) {
  const answer = normalizeAssessmentAnswer(content, rawAnswer ?? null);
  return {
    questionInstanceId: id,
    type: content.type,
    stem: presentFixtureText(questionVersionId, 'stem', content.stem),
    options: content.options,
    categories: content.categories,
    answer,
    selectedOptionId: answer && 'optionId' in answer ? answer.optionId : null,
  };
}
/** Read persisted grading; never grade an answer or infer partial-credit policy. */
export function presentAssessmentReview(
  content: AssessmentContent,
  id: string,
  rawAnswer: unknown,
  awardedPoints: string | number | null,
  maxPoints: string | number,
  questionVersionId?: string,
) {
  const active = presentAssessmentQuestion(content, id, rawAnswer, questionVersionId);
  const maximum = Number(maxPoints),
    awarded = awardedPoints === null ? null : Number(awardedPoints);
  const valid =
    awarded !== null &&
    Number.isFinite(awarded) &&
    Number.isFinite(maximum) &&
    maximum > 0 &&
    awarded >= 0 &&
    awarded <= maximum;
  const reviewStatus = !valid
    ? null
    : active.answer === null
      ? ('unanswered' as const)
      : awarded === maximum
        ? ('correct' as const)
        : awarded === 0
          ? ('incorrect' as const)
          : ('partial' as const);
  const selected =
    active.answer && 'optionIds' in active.answer
      ? active.answer.optionIds
      : active.answer && 'optionId' in active.answer
        ? [active.answer.optionId]
        : [];
  const expected =
    'optionIds' in content.answerKey
      ? content.answerKey.optionIds
      : 'optionId' in content.answerKey
        ? [content.answerKey.optionId]
        : [];
  const optionReview =
    content.type === 'CATEGORY'
      ? []
      : content.options.map((option) => ({
          optionId: option.id,
          selected: selected.includes(option.id),
          isKey: expected.includes(option.id),
        }));
  const statementReview =
    content.type === 'CATEGORY'
      ? content.options.map((statement) => {
          const given =
            active.answer && 'categoryByStatementId' in active.answer
              ? active.answer.categoryByStatementId[statement.id]
              : undefined;
          const key =
            'categoryByStatementId' in content.answerKey
              ? content.answerKey.categoryByStatementId[statement.id]
              : undefined;
          return {
            statementId: statement.id,
            status: !given
              ? ('unanswered' as const)
              : given === key
                ? ('correct' as const)
                : ('incorrect' as const),
          };
        })
      : [];
  return {
    ...active,
    optionReview,
    statementReview,
    answerKey: content.answerKey,
    correctOptionId: 'optionId' in content.answerKey ? content.answerKey.optionId : null,
    explanation: presentFixtureText(questionVersionId, 'explanation', content.explanation),
    reviewStatus,
    awardedPoints: valid ? awarded : null,
    maximumPoints: valid ? maximum : null,
    correctEquivalent: valid ? awarded / maximum : null,
  };
}

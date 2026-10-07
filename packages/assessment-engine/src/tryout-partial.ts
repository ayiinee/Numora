import { normalizeAssessmentAnswer, type AssessmentContent } from './question-content.js';

export const TRYOUT_PARTIAL_POLICY = 'TRYOUT_PGK_PARTIAL_V1';
export function validateTryoutPartialRubric(
  content: { type: string; options: readonly unknown[] },
  rubric:
    | {
        id: string;
        status: string;
        questionType: string;
        maximumScoreCategory: number;
        approvedAt: Date | null;
        approvedByUserId: string | null;
        definition: unknown;
      }
    | undefined,
) {
  const count = content.options.length;
  const d = rubric?.definition as Record<string, unknown> | undefined;
  if (
    !rubric ||
    rubric.status !== 'SEALED' ||
    !rubric.approvedAt ||
    !rubric.approvedByUserId ||
    rubric.questionType !== content.type ||
    rubric.maximumScoreCategory !== count ||
    d?.policyCode !== TRYOUT_PARTIAL_POLICY ||
    d.version !== 1 ||
    d.questionType !== content.type ||
    d.decisionCount !== count ||
    d.fullyCorrectCategory !== count ||
    d.unanswered !== 0 ||
    d.points !== 'round(correctDecisions / decisionCount * maxPoints, 2)' ||
    d.approvedDecision !== 'PROJECT_OWNER_2026_10_07' ||
    !Array.isArray(d.categories) ||
    d.categories.length !== count + 1 ||
    d.categories.some((v, i) => v !== i)
  )
    throw new Error('Rubrik Tryout parsial tidak sesuai dengan keputusan owner yang dipin.');
  return rubric;
}
/** Owner-approved 7 October 2026: equal weight per option/statement; blank = zero. */
export function tryoutCorrectFraction(content: AssessmentContent, raw: unknown): number {
  const answer = normalizeAssessmentAnswer(content, raw ?? null);
  if (!answer) return 0;
  if ('optionId' in content.answerKey && 'optionId' in answer)
    return answer.optionId === content.answerKey.optionId ? 1 : 0;
  if ('optionIds' in content.answerKey && 'optionIds' in answer) {
    const key = new Set(content.answerKey.optionIds),
      selected = new Set(answer.optionIds);
    return (
      content.options.filter((o) => key.has(o.id) === selected.has(o.id)).length /
      content.options.length
    );
  }
  if ('categoryByStatementId' in content.answerKey && 'categoryByStatementId' in answer) {
    const key = content.answerKey.categoryByStatementId;
    return (
      content.options.filter((o) => answer.categoryByStatementId[o.id] === key[o.id]).length /
      content.options.length
    );
  }
  return 0;
}

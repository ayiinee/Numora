import { normalizeAssessmentAnswer, type AssessmentContent } from './question-content.js';

export const TRYOUT_PARTIAL_POLICY = 'TRYOUT_PGK_PARTIAL_V1';
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

import { normalizeAssessmentAnswer, type AssessmentContent } from '@tka/assessment-engine';

export const CHAPTER3_POLICY_CODE = 'DRILL_CH3_OWNER_ACCEPTED_2026_10_07';

export function allowsChapter3Override(p: {
  id: string;
  policyCode: string | null;
  policyVersion: number | null;
  policyConfiguration: unknown;
}) {
  const config = p.policyConfiguration;
  return (
    p.policyCode === CHAPTER3_POLICY_CODE &&
    p.policyVersion === 1 &&
    config !== null &&
    typeof config === 'object' &&
    'packageIds' in config &&
    Array.isArray(config.packageIds) &&
    config.packageIds.includes(p.id)
  );
}

// ponytail: only the owner-accepted package list uses this existing decision rubric;
// replace with the general approved Drill rubric engine when Curriculum delivers it.
export function gradeChapter3Answer(content: AssessmentContent, input: unknown) {
  const answer = normalizeAssessmentAnswer(content, input ?? null);
  const decisions = content.type === 'SINGLE_CHOICE' ? 1 : content.options.length;
  let correct = 0;
  if (answer) {
    if ('optionId' in answer && 'optionId' in content.answerKey) {
      correct = Number(answer.optionId === content.answerKey.optionId);
    } else if ('optionIds' in answer && 'optionIds' in content.answerKey) {
      const selected = new Set(answer.optionIds),
        expected = new Set(content.answerKey.optionIds);
      correct = content.options.filter((o) => selected.has(o.id) === expected.has(o.id)).length;
    } else if ('categoryByStatementId' in answer && 'categoryByStatementId' in content.answerKey) {
      const expected = content.answerKey.categoryByStatementId;
      correct = content.options.filter(
        (o) => answer.categoryByStatementId[o.id] === expected[o.id],
      ).length;
    }
  }
  const equivalent = correct / decisions;
  return {
    answer:
      answer ??
      (content.type === 'CATEGORY'
        ? { categoryByStatementId: {} }
        : content.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
          ? { optionIds: [] }
          : { optionId: null }),
    awardedPoints: Math.round(equivalent * 100) / 100,
    equivalent,
    scoreCategory: correct,
    fullyCorrect: correct === decisions,
    responseState: answer ? ('RESPONDED' as const) : ('OMITTED' as const),
  };
}

import { isDeepStrictEqual } from 'node:util';
import { tryoutCorrectFraction } from './tryout-partial.js';
import type { AssessmentContent } from './question-content.js';

/** Owner-approved 9 November 2026. Separate pin from historical PG-only Pretest. */
export const PRETEST_PARTIAL_POLICY = 'PRETEST_PGK_PARTIAL_V1';
export const PRETEST_PARTIAL_CONFIGURATION = {
  prdVersion: '0.6',
  questionCount: 20,
  rubric: 'OPTIONS_STATEMENTS_PARTIAL_V1',
  mcma: 'correct_option_decisions/option_count',
  category: 'correct_statements/statement_count',
  unanswered: 0,
  itemWeight: 1,
  placementBasis: 'UNROUNDED_EQUIVALENT_CORRECT',
  initialLevel: { level2MinimumCorrect: 8, level3MinimumCorrect: 19 },
  xp: 0,
  approvedBy: 'PROJECT_OWNER',
  approvedDate: '2026-11-09',
};

export function isPretestPartialPolicy(row: {
  policyCode: string;
  version: number;
  configuration: unknown;
}) {
  return (
    row.policyCode === PRETEST_PARTIAL_POLICY &&
    row.version === 1 &&
    isDeepStrictEqual(row.configuration, PRETEST_PARTIAL_CONFIGURATION)
  );
}

export function pretestPartialRubricDefinition(questionType: string, count: number) {
  return {
    policyCode: PRETEST_PARTIAL_POLICY,
    version: 1,
    questionType,
    decisionCount: count,
    categories: Array.from({ length: count + 1 }, (_, i) => i),
    fullyCorrectCategory: count,
    unanswered: 0,
    points: 'correctDecisions / decisionCount * maxPoints',
    approvedDecision: 'PROJECT_OWNER_2026_11_09',
  };
}

export function validatePretestPartialRubric(
  content: { type: string; options: readonly unknown[] },
  rubric:
    | {
        status: string;
        questionType: string;
        maximumScoreCategory: number;
        approvedAt: Date | null;
        approvedByUserId: string | null;
        definition: unknown;
      }
    | undefined,
) {
  if (
    !rubric ||
    rubric.status !== 'SEALED' ||
    !rubric.approvedAt ||
    !rubric.approvedByUserId ||
    rubric.questionType !== content.type ||
    rubric.maximumScoreCategory !== content.options.length ||
    !isDeepStrictEqual(
      rubric.definition,
      pretestPartialRubricDefinition(content.type, content.options.length),
    )
  ) {
    throw new Error('Rubrik Pretest belum sesuai dengan aturan yang disetujui.');
  }
  return rubric;
}

export function pretestPartialResult(items: { content: AssessmentContent; answer: unknown }[]) {
  const fractions = items.map(({ content, answer }) => tryoutCorrectFraction(content, answer));
  // Remove binary floating-point accumulation noise, without rounding to item points.
  const equivalentCorrect = Number(
    fractions.reduce((sum, fraction) => sum + fraction, 0).toFixed(12),
  );
  return {
    fractions,
    correctCount: fractions.filter((fraction) => fraction === 1).length,
    equivalentCorrect,
    score: Number((equivalentCorrect * 5).toFixed(2)),
    initialLevel: equivalentCorrect >= 19 ? 3 : equivalentCorrect >= 8 ? 2 : 1,
  };
}

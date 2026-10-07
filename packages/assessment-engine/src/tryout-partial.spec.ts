import { describe, expect, it } from 'vitest';
import {
  tryoutCorrectFraction,
  validateTryoutPartialRubric,
  TRYOUT_PARTIAL_POLICY,
} from './tryout-partial.js';
import { readApprovedPolicy } from './approved-policy.js';
import type { AssessmentContent } from './question-content.js';
const mcma: AssessmentContent = {
  type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
  stem: 'test',
  explanation: 'test',
  categories: [],
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: id })),
  answerKey: { optionIds: ['A', 'C'] },
};
describe('owner-approved Tryout partial rubric', () => {
  it('accepts only the exact owner policy and never authorizes Drill with it', () => {
    const row = {
      policyCode: TRYOUT_PARTIAL_POLICY,
      version: 1,
      status: 'PUBLISHED',
      approvedAt: null,
      approvedByUserId: null,
      approvalReference: null,
      configuration: {
        prdVersion: '0.6',
        questionCount: 30,
        rubric: 'OPTIONS_STATEMENTS_PARTIAL_V1',
        mcma: 'correct_option_decisions/option_count',
        category: 'correct_statements/statement_count',
        unanswered: 0,
        awardedPointsDecimals: 2,
        equivalentCorrectXpMultiplier: 10,
        approvedBy: 'PROJECT_OWNER',
        approvedDate: '2026-10-07',
      },
    };
    expect(readApprovedPolicy(row, 'TRYOUT').ownerTryoutPartial).toBe(true);
    expect(() => readApprovedPolicy(row, 'DRILL')).toThrow();
    expect(() =>
      readApprovedPolicy(
        { ...row, configuration: { ...row.configuration, equivalentCorrectXpMultiplier: 100 } },
        'TRYOUT',
      ),
    ).toThrow();
    expect(() => readApprovedPolicy({ ...row, version: 2 }, 'TRYOUT')).toThrow();
  });
  it('requires a sealed rubric matching the pinned type and decision count', () => {
    const rubric = {
      id: 'test',
      status: 'SEALED',
      approvedAt: new Date(),
      approvedByUserId: 'test',
      questionType: mcma.type,
      maximumScoreCategory: 4,
      definition: {
        policyCode: TRYOUT_PARTIAL_POLICY,
        version: 1,
        questionType: mcma.type,
        decisionCount: 4,
        categories: [0, 1, 2, 3, 4],
        fullyCorrectCategory: 4,
        points: 'round(correctDecisions / decisionCount * maxPoints, 2)',
        unanswered: 0,
        approvedDecision: 'PROJECT_OWNER_2026_10_07',
      },
    };
    expect(validateTryoutPartialRubric(mcma, rubric).id).toBe('test');
    expect(() =>
      validateTryoutPartialRubric(mcma, { ...rubric, maximumScoreCategory: 3 }),
    ).toThrow();
    expect(() => validateTryoutPartialRubric(mcma, { ...rubric, status: 'DRAFT' })).toThrow();
    expect(() => validateTryoutPartialRubric(mcma, undefined)).toThrow();
  });
  it('grades selections and exclusions equally and gives blank zero', () => {
    expect(tryoutCorrectFraction(mcma, null)).toBe(0);
    expect(tryoutCorrectFraction(mcma, { optionIds: [] })).toBe(0);
    expect(tryoutCorrectFraction(mcma, { optionIds: ['A', 'C'] })).toBe(1);
    expect(tryoutCorrectFraction(mcma, { optionIds: ['A'] })).toBe(0.75);
    expect(tryoutCorrectFraction(mcma, { optionIds: ['B', 'D'] })).toBe(0);
    expect(tryoutCorrectFraction(mcma, { optionIds: ['A', 'B', 'C', 'D'] })).toBe(0.5);
  });
  it('grades each category statement; missing statements get zero credit', () => {
    const category: AssessmentContent = {
      ...mcma,
      type: 'CATEGORY',
      categories: [
        { id: 'yes', text: 'yes' },
        { id: 'no', text: 'no' },
      ],
      answerKey: { categoryByStatementId: { A: 'yes', B: 'no', C: 'yes', D: 'no' } },
    };
    expect(tryoutCorrectFraction(category, { categoryByStatementId: { A: 'yes', B: 'yes' } })).toBe(
      0.25,
    );
    expect(tryoutCorrectFraction(category, null)).toBe(0);
    expect(() =>
      tryoutCorrectFraction(category, { categoryByStatementId: { A: 'invalid' } }),
    ).toThrow();
  });
  it('rejects unknown or repeated MCMA options', () => {
    expect(() => tryoutCorrectFraction(mcma, { optionIds: ['X'] })).toThrow();
    expect(() => tryoutCorrectFraction(mcma, { optionIds: ['A', 'A'] })).toThrow();
  });
});

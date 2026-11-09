import { describe, expect, it } from 'vitest';
import {
  isPretestPartialPolicy,
  PRETEST_PARTIAL_CONFIGURATION,
  PRETEST_PARTIAL_POLICY,
  pretestPartialResult,
  pretestPartialRubricDefinition,
  validatePretestPartialRubric,
} from './pretest-partial.js';
import type { AssessmentContent } from './question-content.js';

const mcma: AssessmentContent = {
  type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
  stem: 'test',
  explanation: 'test',
  categories: [],
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: id })),
  answerKey: { optionIds: ['A', 'C'] },
};
const pg: AssessmentContent = { ...mcma, type: 'SINGLE_CHOICE', answerKey: { optionId: 'A' } };
const full = { content: pg, answer: { optionId: 'A' } };
describe('owner-approved Pretest partial placement', () => {
  it('rejects an unapproved or mismatched partial rubric', () => {
    const rubric = {
      status: 'SEALED',
      questionType: mcma.type,
      maximumScoreCategory: 4,
      approvedAt: new Date(),
      approvedByUserId: 'reviewer',
      definition: pretestPartialRubricDefinition(mcma.type, 4),
    };
    expect(validatePretestPartialRubric(mcma, rubric)).toBe(rubric);
    expect(() => validatePretestPartialRubric(mcma, { ...rubric, approvedAt: null })).toThrow();
    expect(() =>
      validatePretestPartialRubric(mcma, {
        ...rubric,
        definition: pretestPartialRubricDefinition(mcma.type, 5),
      }),
    ).toThrow();
  });
  it('requires the exact separate policy pin', () => {
    const row = {
      policyCode: PRETEST_PARTIAL_POLICY,
      version: 1,
      configuration: PRETEST_PARTIAL_CONFIGURATION,
    };
    expect(isPretestPartialPolicy(row)).toBe(true);
    expect(isPretestPartialPolicy({ ...row, policyCode: 'PRETEST_PRD_V06' })).toBe(false);
    expect(
      isPretestPartialPolicy({
        ...row,
        configuration: { ...PRETEST_PARTIAL_CONFIGURATION, xp: 1 },
      }),
    ).toBe(false);
  });
  it('scores blank as zero and distinguishes full correctness from partial points', () => {
    const result = pretestPartialResult([
      full,
      { content: mcma, answer: { optionIds: ['A'] } },
      { content: mcma, answer: null },
    ]);
    expect(result.correctCount).toBe(1);
    expect(result.equivalentCorrect).toBe(1.75);
    expect(result.score).toBe(8.75);
  });
  it('does not round partial totals up across placement thresholds', () => {
    for (const [count, expected] of [
      [7, 1],
      [18, 2],
    ] as const) {
      expect(
        pretestPartialResult([
          ...Array.from({ length: count }, () => full),
          { content: mcma, answer: { optionIds: ['A'] } },
        ]).initialLevel,
      ).toBe(expected);
    }
    expect(pretestPartialResult(Array.from({ length: 8 }, () => full)).initialLevel).toBe(2);
    expect(pretestPartialResult(Array.from({ length: 19 }, () => full)).initialLevel).toBe(3);
    expect(pretestPartialResult(Array.from({ length: 20 }, () => full)).score).toBe(100);
  });
  it('scores each category statement and rejects unknown choices', () => {
    const content: AssessmentContent = {
      ...mcma,
      type: 'CATEGORY',
      categories: [
        { id: 'Y', text: 'Ya' },
        { id: 'N', text: 'Tidak' },
      ],
      answerKey: { categoryByStatementId: { A: 'Y', B: 'N', C: 'Y', D: 'N' } },
    };
    expect(
      pretestPartialResult([{ content, answer: { categoryByStatementId: { A: 'Y', B: 'Y' } } }])
        .equivalentCorrect,
    ).toBe(0.25);
    expect(() =>
      pretestPartialResult([{ content, answer: { categoryByStatementId: { A: 'unknown' } } }]),
    ).toThrow();
  });
});

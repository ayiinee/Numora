import { describe, it, expect } from 'vitest';
import {
  decodeRuntimeQuestion,
  validateRuntimeAnswer,
  gradeRuntimeResult,
  validateRubricCoverage,
  activeRuntimeQuestion,
} from './rich-question.js';
import { readApprovedPolicy, assessmentXp, approvedStars } from './approved-policy.js';
import { assessmentDeadline } from './assessment-deadline.js';
const options = ['A', 'B', 'C', 'D'].map((id) => ({ id, content: { text: id } }));
const row = {
  questionType: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
  stem: { text: 'Fixture' },
  optionsOrStatements: { options },
  answerKey: { optionIds: ['A', 'B'] },
  explanation: { text: 'Secret explanation' },
};
const rubric = {
  questionType: row.questionType,
  status: 'SEALED',
  approvedAt: new Date(),
  approvedByUserId: 'test',
  maximumScoreCategory: 2,
  definition: {
    contractVersion: 'NUMORA_PGK_LOOKUP_V1',
    entries: Array.from({ length: 3 }, (_, correct) =>
      Array.from({ length: 3 }, (_, wrong) => ({ correct, wrong, category: wrong ? 0 : correct })),
    ).flat(),
  },
};
const policyRow = {
  policyCode: 'NUMORA_TRYOUT_V06',
  status: 'PUBLISHED',
  approvedAt: new Date(),
  approvedByUserId: 'test',
  approvalReference: 'TEST_ONLY',
  configuration: {
    contractVersion: 'NUMORA_ASSESSMENT_V1',
    assessmentType: 'TRYOUT',
    scoreRounding: 'HALF_UP',
    xpRounding: 'CEIL',
    itemPointRounding: 'HALF_UP',
    tryoutXpMultiplier: 10,
    itemWeights: { SINGLE_CHOICE: 2 },
  },
};
describe('versioned runtime and explicit academic gates', () => {
  it('validates unique IDs and normalizes answer replay without leaking keys', () => {
    const q = decodeRuntimeQuestion(row);
    expect(validateRuntimeAnswer(q, { optionIds: ['B', 'A'] })).toEqual({ optionIds: ['A', 'B'] });
    expect(() => validateRuntimeAnswer(q, { optionIds: ['A', 'A'] })).toThrow();
    expect(() => validateRuntimeAnswer(q, { optionIds: ['E'] })).toThrow();
    expect(() => validateRuntimeAnswer(q, { optionIds: ['A'], optionId: 'B' })).toThrow();
    const active = activeRuntimeQuestion(q, null);
    expect(active).not.toHaveProperty('answerKey');
    expect(active).not.toHaveProperty('explanation');
  });
  it('persists an ordinal category independent from rounded weighted points', () => {
    const q = decodeRuntimeQuestion(row);
    validateRubricCoverage(q, rubric);
    expect(gradeRuntimeResult(q, { optionIds: ['A'] }, 3, rubric)).toEqual({
      points: 1.5,
      category: 1,
      equivalent: 0.5,
      fullyCorrect: false,
    });
    expect(gradeRuntimeResult(q, null, 3, rubric).category).toBe(0);
    expect(gradeRuntimeResult(q, { optionIds: ['A', 'B'] }, 3, rubric).fullyCorrect).toBe(true);
    expect(() =>
      gradeRuntimeResult(q, { optionIds: ['A'] }, 3, { ...rubric, approvedAt: null }),
    ).toThrow();
    expect(() =>
      validateRubricCoverage(q, {
        ...rubric,
        definition: { contractVersion: 'NUMORA_PGK_LOOKUP_V1', entries: [] },
      }),
    ).toThrow();
  });
  it('does not guess rounding or approve a draft policy', () => {
    expect(() => readApprovedPolicy({ ...policyRow, approvedAt: null }, 'TRYOUT')).toThrow();
    expect(() =>
      readApprovedPolicy(
        { ...policyRow, configuration: { ...policyRow.configuration, xpRounding: undefined } },
        'TRYOUT',
      ),
    ).toThrow();
    const policy = readApprovedPolicy(policyRow, 'TRYOUT');
    // PRD example: 24.5 equivalent items yields 245 at x10, regardless of weighted raw total.
    expect(
      assessmentXp(policy, {
        raw: 70,
        maximum: 90,
        equivalentCorrect: 24.5,
        fullyCorrect: 24,
        questionCount: 30,
        durationSeconds: 120,
      }),
    ).toBe(245);
    expect(approvedStars(0, policy)).toBe(0);
    expect(approvedStars(99, policy)).toBe(2);
    expect(() => approvedStars(5, policy)).toThrow();
  });
  it('rejects changes to approved product XP and weights, including source-labelled impostors', () => {
    const mutate = (configuration: object) =>
      readApprovedPolicy(
        { ...policyRow, configuration: { ...policyRow.configuration, ...configuration } },
        'TRYOUT',
      );
    expect(() => mutate({ tryoutXpMultiplier: 100 })).toThrow();
    expect(() => mutate({ xpRounding: 'FLOOR' })).toThrow();
    expect(() => mutate({ itemWeights: { SINGLE_CHOICE: 1 } })).toThrow();
    expect(() =>
      readApprovedPolicy({ ...policyRow, policyCode: 'TRYOUT_PRD_V06', version: 1 }, 'TRYOUT'),
    ).toThrow();
    const policy = readApprovedPolicy(policyRow, 'TRYOUT');
    expect(
      assessmentXp(policy, {
        raw: 0,
        maximum: 90,
        equivalentCorrect: 20.25,
        fullyCorrect: 20,
        questionCount: 30,
        durationSeconds: 0,
      }),
    ).toBe(203);
  });
  it('chooses the earlier batch close or duration deadline', () => {
    const start = new Date('2026-10-11T16:50:00Z'),
      close = new Date('2026-10-11T17:00:00Z');
    expect(assessmentDeadline(start, 3600, close)).toEqual(close);
    expect(assessmentDeadline(start, 60, close)).toEqual(new Date('2026-10-11T16:51:00Z'));
  });
});

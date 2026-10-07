import { describe, expect, it } from 'vitest';
import { tryoutCorrectFraction } from './tryout-partial.js';
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

import { describe, expect, it } from 'vitest';
import {
  decodeAssessmentContent,
  normalizeAssessmentAnswer,
  presentAssessmentQuestion,
  presentAssessmentReview,
} from './question-content.js';

const options = ['A', 'B', 'C'].map((id) => ({ id, content: { text: id } }));
const base = { stem: { text: 'TEST ONLY' }, explanation: { text: 'TEST ONLY explanation' } };
function content(type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' | 'CATEGORY') {
  return decodeAssessmentContent({
    ...base,
    questionType: type,
    optionsOrStatements:
      type === 'SINGLE_CHOICE'
        ? options
        : {
            options,
            categories:
              type === 'CATEGORY'
                ? [
                    { id: 'Y', label: 'Ya' },
                    { id: 'N', label: 'Tidak' },
                  ]
                : [],
          },
    answerKey:
      type === 'SINGLE_CHOICE'
        ? { optionId: 'A' }
        : type === 'CATEGORY'
          ? { categoryByStatementId: { A: 'Y', B: 'N', C: 'Y' } }
          : { optionIds: ['A', 'C'] },
  });
}
describe('typed pinned content (TEST ONLY, no scoring policy)', () => {
  it.each(['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'] as const)(
    'decodes %s without leaking a key in active output',
    (type) => {
      const q = content(type);
      const active = presentAssessmentQuestion(q, 'instance', null);
      expect(active.type).toBe(type);
      expect(JSON.stringify(active)).not.toMatch(
        /answerKey|explanation|correctOptionId|awardedPoints/,
      );
    },
  );
  it('canonicalizes MCMA order and rejects duplicates/foreign options', () => {
    const q = content('MULTIPLE_CHOICE_MULTIPLE_ANSWER');
    expect(normalizeAssessmentAnswer(q, { optionIds: ['C', 'A'] })).toEqual({
      optionIds: ['A', 'C'],
    });
    expect(normalizeAssessmentAnswer(q, { optionIds: [] })).toBeNull();
    for (const ids of [['A', 'A'], ['Z']])
      expect(() => normalizeAssessmentAnswer(q, { optionIds: ids })).toThrow();
  });
  it('accepts partial Category replacements and canonical empty answers, but rejects foreign keys', () => {
    const q = content('CATEGORY');
    expect(normalizeAssessmentAnswer(q, { categoryByStatementId: { B: 'N' } })).toEqual({
      categoryByStatementId: { B: 'N' },
    });
    expect(normalizeAssessmentAnswer(q, { categoryByStatementId: {} })).toBeNull();
    expect(() => normalizeAssessmentAnswer(q, { categoryByStatementId: { Z: 'Y' } })).toThrow();
    expect(() => normalizeAssessmentAnswer(q, { categoryByStatementId: { A: 'OTHER' } })).toThrow();
    expect(() => normalizeAssessmentAnswer(q, { optionId: 'A' })).toThrow();
  });
  it('uses stored grades rather than inferring MCMA grading from the key', () => {
    const q = content('MULTIPLE_CHOICE_MULTIPLE_ANSWER');
    const answer = { optionIds: ['A'] };
    expect(presentAssessmentReview(q, 'q', answer, '0', '3').reviewStatus).toBe('incorrect');
    expect(presentAssessmentReview(q, 'q', answer, '0.75', '3').reviewStatus).toBe('partial');
    expect(presentAssessmentReview(q, 'q', answer, null, '3').reviewStatus).toBeNull();
    expect(presentAssessmentReview(q, 'q', answer, '0.75', '3').correctEquivalent).toBeNull();
  });
  it.each([
    [null, '0', 'unanswered'],
    [{ optionId: 'A' }, '2', 'correct'],
    [{ optionId: 'B' }, '0', 'incorrect'],
  ] as const)('presents historical PG grading without regrading', (answer, points, status) => {
    expect(
      presentAssessmentReview(content('SINGLE_CHOICE'), 'q', answer, points, '2').reviewStatus,
    ).toBe(status);
  });
  it('keeps invalid/missing grade evidence unavailable', () => {
    const q = content('CATEGORY');
    for (const points of ['NaN', 'Infinity', '-1', '4'])
      expect(presentAssessmentReview(q, 'q', null, points, '3').reviewStatus).toBeNull();
  });
});

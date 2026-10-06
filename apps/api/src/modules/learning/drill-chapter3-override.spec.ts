import { expect, it } from 'vitest';
import {
  allowsChapter3Override,
  gradeChapter3Answer,
  CHAPTER3_POLICY_CODE,
} from './drill-chapter3-override';
import { drillReward } from './drill.policy';

it('limits the exception to the explicit package IDs and policy version', () => {
  const p = {
    id: 'published-package',
    policyCode: CHAPTER3_POLICY_CODE,
    policyVersion: 1,
    policyConfiguration: { packageIds: ['published-package'] },
  };
  expect(allowsChapter3Override(p)).toBe(true);
  expect(allowsChapter3Override({ ...p, id: 'another-import' })).toBe(false);
  expect(allowsChapter3Override({ ...p, policyVersion: 2 })).toBe(false);
  expect(allowsChapter3Override({ ...p, policyCode: 'DRILL_PRD_V06' })).toBe(false);
  expect(allowsChapter3Override({ ...p, policyConfiguration: null })).toBe(false);
});

const mcma = {
  type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' as const,
  stem: 'x',
  explanation: 'x',
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: id })),
  categories: [],
  answerKey: { optionIds: ['A', 'C'] },
};
const category = {
  ...mcma,
  type: 'CATEGORY' as const,
  options: mcma.options.slice(0, 3),
  categories: [
    { id: 'TRUE', text: 'Benar' },
    { id: 'FALSE', text: 'Salah' },
  ],
  answerKey: { categoryByStatementId: { A: 'TRUE', B: 'FALSE', C: 'TRUE' } },
};
it('grades selected and unselected MCMA decisions; omitted answers get zero', () => {
  expect(gradeChapter3Answer(mcma, { optionIds: ['C', 'A'] })).toMatchObject({
    awardedPoints: 1,
    scoreCategory: 4,
    fullyCorrect: true,
  });
  expect(gradeChapter3Answer(mcma, { optionIds: ['A'] })).toMatchObject({
    awardedPoints: 0.75,
    equivalent: 0.75,
    scoreCategory: 3,
    fullyCorrect: false,
  });
  expect(gradeChapter3Answer(mcma, { optionIds: [] })).toMatchObject({
    awardedPoints: 0,
    scoreCategory: 0,
    responseState: 'OMITTED',
  });
  expect(() => gradeChapter3Answer(mcma, { optionIds: ['foreign'] })).toThrow();
});
it('grades partial Category answers without treating omitted statements as correct', () => {
  expect(gradeChapter3Answer(category, { categoryByStatementId: { A: 'TRUE' } })).toMatchObject({
    awardedPoints: 0.33,
    equivalent: 1 / 3,
    scoreCategory: 1,
    fullyCorrect: false,
  });
  expect(gradeChapter3Answer(category, null)).toMatchObject({
    awardedPoints: 0,
    scoreCategory: 0,
    responseState: 'OMITTED',
  });
  expect(() =>
    gradeChapter3Answer(category, { categoryByStatementId: { A: 'foreign' } }),
  ).toThrow();
});
it('keeps ordinary Drill rewards strict; the one-off partial reward fits the integer ledger', () => {
  const start = new Date('2026-10-07T00:00:00Z');
  expect(() => drillReward(8.5, 10, start, start)).toThrow();
  expect(drillReward(8.5, 10, start, start, true)).toMatchObject({ baseXp: 85, totalXp: 135 });
  expect(() => drillReward(NaN, 10, start, start, true)).toThrow();
});

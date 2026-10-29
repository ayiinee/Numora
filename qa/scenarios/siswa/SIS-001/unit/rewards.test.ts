import { describe, expect, it } from 'vitest';
import { drillXp } from '../../../../../packages/assessment-engine/src/rewards';
describe('SIS-001 approved PG reward boundaries (PRD v0.6 and once-rounded owner decision)', () => {
  it.each([
    { correct: 0, seconds: 900, xp: 0 },
    { correct: 7, seconds: 900, xp: 70 },
    { correct: 8, seconds: 900, xp: 80 },
    { correct: 10, seconds: 0, xp: 150 },
    { correct: 8, seconds: 450, xp: 105 },
    { correct: 10, seconds: 899, xp: 100 },
    { correct: 10, seconds: 900, xp: 100 },
    { correct: 10, seconds: 901, xp: 100 },
  ])(
    'correct=$correct elapsed=$seconds gives independently specified XP=$xp',
    ({ correct, seconds, xp }) => {
      expect(drillXp(correct, 10, seconds)).toBe(xp);
    },
  );
  it('rejects invalid inputs rather than silently awarding XP', () => {
    expect(() => drillXp(11, 10, 0)).toThrow();
    expect(() => drillXp(8, 10, -1)).toThrow();
    expect(() => drillXp(NaN, 10, 1)).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import {
  explanationAvailable,
  presentActiveQuestion,
  scoreDrill,
  selectDrillPackage,
} from './drill.policy';

describe('Drill domain policy', () => {
  it('keeps 7/10 locked and unlocks at 8/10, independently of stars', () => {
    expect(scoreDrill(7, 10)).toEqual({ score: 70, mastered: false, stars: 2 });
    expect(scoreDrill(8, 10)).toEqual({ score: 80, mastered: true, stars: 2 });
    expect(scoreDrill(10, 10)).toEqual({ score: 100, mastered: true, stars: 3 });
    expect(scoreDrill(0, 10)).toEqual({ score: 0, mastered: false, stars: 0 });
    expect(scoreDrill(95, 100).stars).toBe(2);
  });

  it('reuses the sole MVP variant for retries', () => {
    const packages = [{ id: 'a' }, { id: 'b' }];
    expect(selectDrillPackage(packages)?.id).toBe('a');
    expect(selectDrillPackage(packages, 'a')?.id).toBe('a');
    expect(selectDrillPackage(packages, 'b')?.id).toBe('a');
    expect(selectDrillPackage([{ id: 'a' }], 'a')?.id).toBe('a');
  });

  it('does not expose answer key or explanation in an active attempt', () => {
    expect(
      presentActiveQuestion({
        id: 'instance',
        stem: '$2+3$',
        options: [{ id: 'B', text: '5' }],
        selectedOptionId: null,
        correctOptionId: 'B',
        explanation: '2+3=5',
      }),
    ).toEqual({
      questionInstanceId: 'instance',
      stem: '$2+3$',
      options: [{ id: 'B', text: '5' }],
      selectedOptionId: null,
    });
  });

  it('preserves historical explanation access without an invented 90-day expiry', () => {
    const completed = new Date('2026-01-01T00:00:00.000Z');
    expect(explanationAvailable(completed, new Date('2026-03-31T23:59:59.999Z'))).toBe(true);
    expect(explanationAvailable(completed, new Date('2026-04-01T00:00:00.000Z'))).toBe(true);
  });
});

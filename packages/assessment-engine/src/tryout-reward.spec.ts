import { describe, expect, it } from 'vitest';
import { pgTryoutReward, tryoutXp } from './tryout-reward.js';

describe('TryOut XP policy approved by Aini', () => {
  it('uses equivalent correct ×10, without IRT or time bonus', () => {
    expect(tryoutXp(24.5)).toBe(245);
    expect(tryoutXp(30)).toBe(300);
    expect(tryoutXp(0)).toBe(0);
  });
  it('counts correct PG items independently of package point weights', () => {
    expect(pgTryoutReward([{ points: 2, maximum: 2 }, { points: 0, maximum: 5 }])).toBe(10);
  });
  it('rejects invalid facts and does not invent a PGK partial rubric', () => {
    for (const input of [NaN, Infinity, -1]) expect(() => tryoutXp(input)).toThrow();
    expect(() => pgTryoutReward([])).toThrow();
    expect(() => pgTryoutReward([{ points: 0.5, maximum: 1 }])).toThrow();
    expect(() => pgTryoutReward([{ points: 0, maximum: 0 }])).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { drillXp, tryoutXp } from './rewards.js';

describe('PRD v0.6 rewards', () => {
  it('gives immediate Tryout XP using equivalent correct ×10, including partial scores', () => {
    expect(tryoutXp(24.5)).toBe(245);
    expect(tryoutXp(30)).toBe(300);
    expect(tryoutXp(0.025)).toBe(1);
    expect(tryoutXp(0)).toBe(0);
  });
  it('uses count-up elapsed time for Drill bonus and caps XP at 150', () => {
    expect(drillXp(10, 10, 0)).toBe(150);
    expect(drillXp(8, 10, 450)).toBe(105);
    expect(drillXp(0, 10, 450)).toBe(25);
    expect(drillXp(8, 10, 900)).toBe(80);
    expect(drillXp(8, 10, 901)).toBe(80);
    expect(drillXp(7, 10, 1)).toBe(120);
  });
  it('rejects invalid reward inputs instead of writing invalid ledger entries', () => {
    expect(() => tryoutXp(NaN)).toThrow();
    expect(() => tryoutXp(-1)).toThrow();
    expect(() => drillXp(11, 10, 0)).toThrow();
    expect(() => drillXp(0, 0, 0)).toThrow();
    expect(() => drillXp(1, 10, -1)).toThrow();
  });
});

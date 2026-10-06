import { describe, expect, it } from 'vitest';
import { isJakartaMondayMidnight, normalizedScore, tryoutAttemptDeadline } from './tryout.policy';

describe('Tryout time and PG score policy', () => {
  it('gives ten minutes normally and caps a late Sunday start at 23:59:00 WIB', () => {
    const close = new Date('2026-10-11T16:59:00Z');
    expect(tryoutAttemptDeadline(new Date('2026-10-06T00:00:00Z'), 600, close)?.toISOString()).toBe('2026-10-06T00:10:00.000Z');
    expect(tryoutAttemptDeadline(new Date('2026-10-11T16:58:30Z'), 600, close)?.toISOString()).toBe(close.toISOString());
  });
  it('recognizes Monday 00:00 WIB at Sunday 17:00 UTC', () => {
    expect(isJakartaMondayMidnight(new Date('2026-10-04T17:00:00.000Z'))).toBe(true);
    expect(isJakartaMondayMidnight(new Date('2026-10-04T16:59:59.999Z'))).toBe(false);
    expect(isJakartaMondayMidnight(new Date('2026-10-04T17:00:01.000Z'))).toBe(false);
  });

  it('normalizes earned points against pinned maximum points', () => {
    expect(normalizedScore(1, 2)).toBe(50);
    expect(normalizedScore(7, 10)).toBe(70);
    expect(() => normalizedScore(0, 0)).toThrow();
  });
});

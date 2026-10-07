import { describe, expect, it } from 'vitest';
import { normalizedScore, tryoutAttemptDeadline } from './tryout.policy';

describe('Tryout time and PG score policy', () => {
  it('gives ten minutes normally and caps a late Sunday start at 23:59:00 WIB', () => {
    const close = new Date('2026-10-11T16:59:00Z');
    expect(tryoutAttemptDeadline(new Date('2026-10-06T00:00:00Z'), 600, close)?.toISOString()).toBe(
      '2026-10-06T00:10:00.000Z',
    );
    expect(tryoutAttemptDeadline(new Date('2026-10-11T16:58:30Z'), 600, close)?.toISOString()).toBe(
      close.toISOString(),
    );
  });
  it('normalizes earned points against pinned maximum points', () => {
    expect(normalizedScore(1, 2)).toBe(50);
    expect(normalizedScore(7, 10)).toBe(70);
    expect(() => normalizedScore(0, 0)).toThrow();
  });
});

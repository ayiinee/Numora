import { describe, expect, it } from 'vitest';
import {
  coveragePercent,
  metricNumber,
  snapshotTime,
  type AnalyticsMetric,
} from './analytics-model';
const metric = (
  value: number | null,
  unavailableReason: string | null = null,
): AnalyticsMetric => ({ key: 'test', label: 'TEST', domain: 'CONTENT', value, unavailableReason });
describe('Analytics display integrity', () => {
  it('keeps a valid zero distinct from missing or unreadable values', () => {
    expect(metricNumber(metric(0))).toBe(0);
    for (const input of [
      undefined,
      metric(null),
      metric(-1),
      metric(NaN),
      metric(Infinity),
      metric(4, 'QUERY_UNAVAILABLE'),
    ])
      expect(metricNumber(input)).toBeNull();
  });
  it('computes coverage only for a valid nonempty denominator and consistent counts', () => {
    expect(coveragePercent(metric(48), metric(80))).toBe(60);
    expect(coveragePercent(metric(0), metric(80))).toBe(0);
    for (const [covered, total] of [
      [metric(0), metric(0)],
      [metric(81), metric(80)],
      [metric(null), metric(80)],
      [metric(8), metric(null)],
      [undefined, metric(80)],
    ])
      expect(coveragePercent(covered, total)).toBeNull();
  });
  it('formats the snapshot in Jakarta and handles an invalid timestamp explicitly', () => {
    expect(snapshotTime('2026-10-30T08:00:00Z')).toContain('15.00');
    expect(snapshotTime('2026-10-30T08:00:00Z')).toContain('WIB');
    expect(snapshotTime('invalid')).toBe('Waktu tidak tersedia');
  });
});

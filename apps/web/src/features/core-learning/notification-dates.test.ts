import { describe, expect, it } from 'vitest';
import { notificationDateGroup, notificationTime } from './notification-dates';

describe('Jakarta notification dates', () => {
  it('switches days at Jakarta midnight rather than UTC midnight', () => {
    const now = new Date('2026-10-04T17:01:00Z'); // Monday 00:01 WIB
    expect(notificationDateGroup('2026-10-04T17:00:00Z', now)).toBe('HARI INI');
    expect(notificationDateGroup('2026-10-04T16:59:59Z', now)).toBe('KEMARIN');
    expect(notificationTime('2026-10-04T16:59:00Z', now)).toBe('2 mnt lalu');
  });
  it('uses calendar weeks and retains older archive dates', () => {
    const now = new Date('2026-10-04T08:00:00Z'); // Sunday
    expect(notificationDateGroup('2026-10-02T08:00:00Z', now)).toBe('MINGGU INI');
    expect(notificationDateGroup('2026-09-27T08:00:00Z', now)).toBe('MINGGU LALU');
    expect(notificationDateGroup('2026-09-20T08:00:00Z', now)).toBe('LEBIH LAMA');
    expect(notificationTime('2026-10-03T01:00:00Z', now)).toMatch(/^08[.:]00 WIB$/);
  });
});

import { beforeEach, expect, it, vi } from 'vitest';
import { AdminAnalyticsService } from './analytics.service';
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('@tka/database', () => ({ getDatabase: () => ({ client: mocks.client }) }));
beforeEach(() => vi.resetAllMocks());
it('preserves real zeroes and marks failed aggregates unavailable rather than zero', async () => {
  mocks.client
    .mockResolvedValueOnce([{ schools: 0, classes: 0, memberships: 0, schoolStudents: 0 }])
    .mockRejectedValueOnce(new Error('TEST outage'))
    .mockResolvedValueOnce([
      {
        closedUnpublishedBatches: 0,
        overdueReleases: 0,
        publishedBatches: 0,
        failedIrtRequests: 0,
      },
    ]);
  const result = await new AdminAnalyticsService().summary('CONTENT_DATA_MODERATION');
  expect(result.metrics.find((m) => m.key === 'schools')).toMatchObject({
    value: 0,
    unavailableReason: null,
  });
  expect(
    result.metrics
      .filter((m) => m.domain === 'CONTENT')
      .every((m) => m.value === null && m.unavailableReason === 'QUERY_UNAVAILABLE'),
  ).toBe(true);
  expect(result.metrics.find((m) => m.key === 'overdueReleases')?.value).toBe(0);
  expect(result.metrics.some((m) => m.domain === 'OPERATIONS')).toBe(false);
});

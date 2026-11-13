import { expect, it, vi } from 'vitest';
import { TryoutReleaseService, tryoutResultState } from './tryout-release.service';

it('gates result visibility on both package release and canonical publication for each student attempt', async () => {
  const service = new TryoutReleaseService();
  const now = new Date('2026-11-13T12:00:00Z');
  const result = { score: null, mode: 'UNSCORABLE', version: 1, resultMethod: null, reason: null };
  vi.spyOn(service, 'releasedPackageIds').mockResolvedValue(new Set(['released']));
  vi.spyOn(service, 'publishedResults').mockResolvedValue(
    new Map([
      ['ready', result],
      ['blocked', result],
    ]),
  );
  const { ready, canonical } = await service.studentPublications(
    [
      { id: 'ready', packageId: 'released', status: 'GRADED', isDemo: false },
      { id: 'unpublished', packageId: 'released', status: 'GRADED', isDemo: false },
      { id: 'blocked', packageId: 'unreleased', status: 'GRADED', isDemo: false },
      { id: 'active', packageId: 'released', status: 'IN_PROGRESS', isDemo: true },
      { id: 'demo', packageId: 'released', status: 'GRADED', isDemo: true },
    ],
    now,
  );
  expect(ready).toEqual(new Set(['ready', 'demo']));
  expect(canonical.get('ready')?.score).toBeNull();
  expect(tryoutResultState('SUBMITTED', false, null, now)).toBe('waiting');
  expect(tryoutResultState('GRADED', false, now, now)).toBe('overdue');
  expect(tryoutResultState('GRADED', true, now, now)).toBe('ready');
  expect(tryoutResultState('IN_PROGRESS', false, now, now)).toBeNull();
});

import { describe, expect, it } from 'vitest';
import { batchState, validateBatchInput } from './tryout-batches.service';
import type { SaveTryoutBatchDto } from './tryout-batches.dto';

describe('Tryout batch boundaries', () => {
  const input: SaveTryoutBatchDto = {
    title: 'TEST ONLY batch',
    startsAt: '2026-11-10T01:00:00Z',
    closesAt: '2026-11-10T02:00:00Z',
    packageIds: ['packageA', 'packageB'],
    mandiriPackageId: 'packageA',
    schools: [{ schoolId: 'schoolA', packageId: 'packageB' }],
  };
  it('opens exactly at start and closes exactly at the end', () => {
    const batch = {
      startsAt: new Date(input.startsAt),
      closesAt: new Date(input.closesAt),
      adminPublishedAt: new Date('2026-11-09T00:00:00Z'),
      cancelledAt: null,
    };
    expect(batchState(batch, new Date('2026-11-10T00:59:59Z'))).toBe('SCHEDULED');
    expect(batchState(batch, batch.startsAt)).toBe('OPEN');
    expect(batchState(batch, batch.closesAt)).toBe('CLOSED');
    expect(batchState({ ...batch, adminPublishedAt: null }, batch.startsAt)).toBe('DRAFT');
    expect(batchState({ ...batch, cancelledAt: batch.startsAt }, batch.startsAt)).toBe('CANCELLED');
  });
  it('rejects invalid windows, blank titles, repeated schools and foreign package delegation', () => {
    for (const changed of [
      { title: ' ' },
      { startsAt: 'invalid' },
      { closesAt: input.startsAt },
      { mandiriPackageId: 'foreign' },
      { schools: [input.schools[0]!, input.schools[0]!] },
    ])
      expect(() => validateBatchInput({ ...input, ...changed })).toThrow();
    expect(() =>
      validateBatchInput({
        ...input,
        schools: [
          { schoolId: 'schoolA', packageId: 'packageA' },
          { schoolId: 'schoolB', packageId: 'packageA' },
        ],
      }),
    ).not.toThrow();
  });
});

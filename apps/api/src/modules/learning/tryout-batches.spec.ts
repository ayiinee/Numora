import { describe, expect, it } from 'vitest';
import {
  batchEditable,
  batchStoppable,
  batchState,
  balancedOriginalCount,
  balancedPackageForIndex,
  validateBatchInput,
  validateBatchExtension,
} from './tryout-batches.service';
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
  it('keeps balanced roster split within one student for odd sizes', () => {
    expect(balancedOriginalCount(0)).toBe(0);
    expect(balancedOriginalCount(4)).toBe(2);
    expect(balancedOriginalCount(5)).toBe(3);
    for (let rosterSize = 1; rosterSize <= 200; rosterSize++) {
      const assigned = Array.from({ length: rosterSize }, (_, index) =>
        balancedPackageForIndex(index, rosterSize, 'original', 'variant'),
      );
      const original = assigned.filter((packageId) => packageId === 'original').length;
      const variant = assigned.filter((packageId) => packageId === 'variant').length;
      expect(original).toBe(Math.ceil(rosterSize / 2));
      expect(Math.abs(original - variant)).toBeLessThanOrEqual(1);
    }
    expect(() => balancedPackageForIndex(-1, 2, 'original', 'variant')).toThrow();
    expect(() => balancedPackageForIndex(2, 2, 'original', 'variant')).toThrow();
    expect(() => balancedPackageForIndex(0, 1, 'same', 'same')).toThrow();
  });
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
  it('rejects a start at or before server time while allowing a custom closing date', () => {
    expect(() => validateBatchInput(input, new Date(input.startsAt))).toThrow();
    expect(() => validateBatchInput(input, new Date(input.closesAt))).toThrow();
    expect(() => validateBatchInput(input, new Date('2026-11-09T00:00:00Z'))).not.toThrow();
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
  it('requires two distinct selected packages for balanced school allocation', () => {
    expect(() =>
      validateBatchInput({
        ...input,
        schools: [
          {
            schoolId: 'schoolA',
            packageId: 'packageA',
            allocationMode: 'BALANCED_50_50',
            variantPackageId: 'packageB',
          },
        ],
      }),
    ).not.toThrow();
    for (const school of [
      { schoolId: 'schoolA', packageId: 'packageA', allocationMode: 'BALANCED_50_50' as const },
      {
        schoolId: 'schoolA',
        packageId: 'packageA',
        allocationMode: 'BALANCED_50_50' as const,
        variantPackageId: 'packageA',
      },
      { schoolId: 'schoolA', packageId: 'packageA', variantPackageId: 'packageB' },
    ])
      expect(() => validateBatchInput({ ...input, schools: [school] })).toThrow();
  });
  it('allows expired drafts to be rescheduled but freezes published and cancelled batches', () => {
    const now = new Date(input.closesAt);
    const draft = { adminPublishedAt: null, cancelledAt: null, startsAt: new Date(input.startsAt) };
    expect(batchEditable(draft, now)).toBe(true);
    expect(batchEditable({ ...draft, adminPublishedAt: draft.startsAt }, now)).toBe(false);
    expect(batchEditable({ ...draft, adminPublishedAt: now }, draft.startsAt)).toBe(false);
    expect(batchEditable({ ...draft, cancelledAt: now }, now)).toBe(false);
  });
  it('extends only an open batch and never shortens or reopens a terminal window', () => {
    const b = {
      adminPublishedAt: new Date('2026-11-09T00:00:00Z'),
      cancelledAt: null,
      startsAt: new Date(input.startsAt),
      closesAt: new Date(input.closesAt),
      status: 'PLANNED',
    };
    const later = '2026-11-10T03:00:00Z';
    expect(() => validateBatchExtension(b, later, b.startsAt)).not.toThrow();
    for (const [changed, end, now] of [
      [{}, input.closesAt, b.startsAt],
      [{}, input.startsAt, b.startsAt],
      [{}, 'invalid', b.startsAt],
      [{}, later, new Date('2026-11-10T00:00:00Z')],
      [{}, later, b.closesAt],
      [{ cancelledAt: b.startsAt }, later, b.startsAt],
      [{ adminPublishedAt: null }, later, b.startsAt],
      [{ status: 'PROCESSING' }, later, b.startsAt],
      [{ status: 'PUBLISHED' }, later, b.startsAt],
    ] as const)
      expect(() => validateBatchExtension({ ...b, ...changed }, end, now)).toThrow();
  });
  it('allows stopping only a currently open published batch', () => {
    const b = {
      adminPublishedAt: new Date('2026-11-09T00:00:00Z'),
      cancelledAt: null,
      startsAt: new Date(input.startsAt),
      closesAt: new Date(input.closesAt),
      status: 'PLANNED',
    };
    expect(batchStoppable(b, new Date('2026-11-10T01:30:00Z'))).toBe(true);
    expect(batchStoppable(b, b.startsAt)).toBe(true);
    expect(batchStoppable(b, b.closesAt)).toBe(false);
    expect(batchStoppable({ ...b, cancelledAt: b.startsAt }, b.startsAt)).toBe(false);
    expect(batchStoppable({ ...b, status: 'PUBLISHED' }, b.startsAt)).toBe(false);
  });
});

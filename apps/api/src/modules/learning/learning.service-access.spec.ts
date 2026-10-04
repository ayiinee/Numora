import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getDatabase } from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { DrillAssessmentService } from './drill-assessment.service';

vi.mock('@tka/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tka/database')>();
  return { ...actual, getDatabase: vi.fn() };
});

const studentId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';

function query(rows: unknown[]) {
  const q = {
    from: () => q,
    innerJoin: () => q,
    leftJoin: () => q,
    where: () => q,
    for: () => q,
    limit: async () => rows,
    orderBy: async () => rows,
    then: (resolve: (value: unknown[]) => void) => resolve(rows),
  };
  return q;
}

function learning() {
  const identity = { me: vi.fn().mockResolvedValue({ id: studentId, role: 'STUDENT' }) };
  return new DrillAssessmentService(identity as unknown as IdentityService);
}

beforeEach(() => vi.clearAllMocks());

describe('Drill access and duplicate submit', () => {
  it('does not return another Student’s attempt or its answer data', async () => {
    const select = vi.fn(() =>
      query([
        {
          id: attemptId,
          studentId: otherId,
          levelId: 'level',
          levelTitle: 'Level 1',
          status: 'IN_PROGRESS',
          startedAt: new Date(),
          isDemo: true,
        },
      ]),
    );
    vi.mocked(getDatabase).mockReturnValue({ db: { select } } as never);
    await expect(learning().attempt('Bearer valid', attemptId)).rejects.toThrow(NotFoundException);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('refuses to change an answer after finalization', async () => {
    const tx = {
      select: vi.fn(() =>
        query([{ studentId, assessmentType: 'DRILL', purpose: 'REGULAR', status: 'GRADED' }]),
      ),
    };
    vi.mocked(getDatabase).mockReturnValue({
      db: { transaction: (run: (value: typeof tx) => unknown) => run(tx) },
    } as never);
    await expect(learning().saveAnswer('Bearer valid', attemptId, otherId, 'A')).rejects.toThrow(
      ConflictException,
    );
    expect(tx.select).toHaveBeenCalledTimes(1);
  });

  it('returns the prior result on duplicate submit without writing another outbox event', async () => {
    const completedAt = new Date('2026-01-01T00:00:00.000Z');
    const tx = {
      select: vi.fn(() =>
        query([
          {
            id: attemptId,
            studentId,
            assessmentType: 'DRILL',
            purpose: 'REGULAR',
            status: 'GRADED',
          },
        ]),
      ),
      insert: vi.fn(),
      update: vi.fn(),
    };
    const db = {
      transaction: (run: (value: typeof tx) => unknown) => run(tx),
      select: vi
        .fn()
        .mockImplementationOnce(() =>
          query([
            {
              id: attemptId,
              studentId,
              levelId: 'level',
              levelTitle: 'Level 1',
              status: 'GRADED',
              completedAt,
              score: '80',
              rawPoints: '8',
              stars: 2,
              isDemo: true,
            },
          ]),
        )
        .mockImplementationOnce(() => query([{ levelId: 'next' }])),
    };
    vi.mocked(getDatabase).mockReturnValue({ db } as never);
    await expect(learning().submit('Bearer valid', attemptId)).resolves.toMatchObject({
      score: 80,
      mastered: true,
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});

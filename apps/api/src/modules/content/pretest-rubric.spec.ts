import { describe, expect, it, vi } from 'vitest';
import { pretestPartialRubricDefinition } from '@tka/assessment-engine';
import { ensurePretestRubric, hasPretestRubric } from './pretest-rubric';
import { digest } from './content-import.validation';
import type { AdminTransaction } from '../audit/admin-mutation';

function fixture() {
  const rows: Record<string, unknown>[] = [];
  const tx = {
    execute: vi.fn(),
    select: () => ({ from: () => ({ where: () => ({ for: async () => rows }) }) }),
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          const row = { ...value, id: `rubric-${rows.length}` };
          rows.push(row);
          return [row];
        },
      }),
    }),
  };
  return { rows, tx: tx as unknown as AdminTransaction };
}
describe('automatic Pretest rubrics', () => {
  it('keeps single choice on native binary scoring', async () => {
    const { tx, rows } = fixture();
    expect(
      await ensurePretestRubric(tx, 'actor', { type: 'SINGLE_CHOICE', options: [] }),
    ).toBeUndefined();
    expect(await hasPretestRubric(tx, { type: 'SINGLE_CHOICE', options: [] }, null)).toBe(true);
    expect(rows).toHaveLength(0);
  });
  it.each(['CATEGORY', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'])(
    'seals and reuses %s for each decision count',
    async (type) => {
      for (const count of [2, 4, 5]) {
        const { tx, rows } = fixture();
        const content = { type, options: Array(count).fill({}) };
        expect(await hasPretestRubric(tx, content, null)).toBe(false);
        const id = await ensurePretestRubric(tx, 'actor', content);
        expect(await ensurePretestRubric(tx, 'actor', content)).toBe(id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          status: 'SEALED',
          maximumScoreCategory: count,
          definition: pretestPartialRubricDefinition(type, count),
        });
        expect(await hasPretestRubric(tx, content, id)).toBe(true);
        expect(await hasPretestRubric(tx, { type, options: [] }, id)).toBe(false);
      }
    },
  );
  it('preserves an incompatible existing rubric and creates a correct immutable version', async () => {
    const { tx, rows } = fixture();
    const content = { type: 'CATEGORY', options: [{}, {}] };
    const wrong = {
      id: 'legacy',
      version: 1,
      status: 'SEALED',
      questionType: content.type,
      maximumScoreCategory: 2,
      approvedAt: new Date(),
      approvedByUserId: 'actor',
      definition: { policyCode: 'WRONG' },
      digest: digest({ policyCode: 'WRONG' }),
    };
    rows.push(wrong);
    expect(await hasPretestRubric(tx, content, 'legacy')).toBe(false);
    await ensurePretestRubric(tx, 'actor', content);
    expect(rows[0]).toEqual(wrong);
    expect(rows[1]).toMatchObject({
      version: 2,
      definition: pretestPartialRubricDefinition('CATEGORY', 2),
    });
    await ensurePretestRubric(tx, 'actor', content);
    expect(rows).toHaveLength(2);
  });
});

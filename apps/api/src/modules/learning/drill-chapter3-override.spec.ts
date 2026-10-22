import { afterAll, expect, it, vi } from 'vitest';
import { closeDatabaseConnection, getDatabase } from '@tka/database';
import { sql } from 'drizzle-orm';
import {
  allowsChapter3Override,
  gradeChapter3Answer,
  CHAPTER3_POLICY_CODE,
  chapter3RuntimeEligibility,
} from './drill-chapter3-override';
import { drillReward } from './drill.policy';

afterAll(async () => {
  await closeDatabaseConnection();
  vi.unstubAllEnvs();
});

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'admits only non-demo packages explicitly allowed by the pinned owner policy before manifest approval',
  async () => {
    const testUrl = process.env.TEST_DATABASE_URL!;
    const target = new URL(testUrl);
    expect(['localhost', '127.0.0.1']).toContain(target.hostname);
    expect(target.pathname).toMatch(/^\/numora_test(?:_[a-z0-9_]+)?$/);
    vi.stubEnv('DATABASE_URL', testUrl);
    const cases = [
      { code: CHAPTER3_POLICY_CODE, version: 1, ids: ['package'], demo: false, want: true },
      { code: CHAPTER3_POLICY_CODE, version: 1, ids: ['other'], demo: false, want: false },
      { code: CHAPTER3_POLICY_CODE, version: 2, ids: ['package'], demo: false, want: false },
      { code: 'DRILL_PRD_V06', version: 1, ids: ['package'], demo: false, want: false },
      { code: CHAPTER3_POLICY_CODE, version: 1, ids: ['package'], demo: true, want: false },
      { code: CHAPTER3_POLICY_CODE, version: 1, ids: null, demo: false, want: false },
      { code: CHAPTER3_POLICY_CODE, version: 1, ids: 'package', demo: false, want: false },
    ];
    await getDatabase().db.transaction(
      async (tx) => {
        for (const c of cases) {
          const rows = await tx.execute(sql`
          with assessment_packages(id,is_demo) as (values ('package',${c.demo}::boolean)),
          scoring_policy_versions(policy_code,version,configuration) as (
            values (${c.code}::text,${c.version}::integer,${JSON.stringify({ packageIds: c.ids })}::jsonb)
          )
          select coalesce(${chapter3RuntimeEligibility()},false) as eligible
          from assessment_packages cross join scoring_policy_versions`);
          expect(rows[0]?.eligible, JSON.stringify(c)).toBe(c.want);
        }
      },
      { accessMode: 'read only' },
    );
  },
);

it('limits the exception to the explicit package IDs and policy version', () => {
  const p = {
    id: 'published-package',
    policyCode: CHAPTER3_POLICY_CODE,
    policyVersion: 1,
    policyConfiguration: { packageIds: ['published-package'] },
  };
  expect(allowsChapter3Override(p)).toBe(true);
  expect(allowsChapter3Override({ ...p, id: 'another-import' })).toBe(false);
  expect(allowsChapter3Override({ ...p, policyVersion: 2 })).toBe(false);
  expect(allowsChapter3Override({ ...p, policyCode: 'DRILL_PRD_V06' })).toBe(false);
  expect(allowsChapter3Override({ ...p, policyConfiguration: null })).toBe(false);
});

const mcma = {
  type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' as const,
  stem: 'x',
  explanation: 'x',
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: id })),
  categories: [],
  answerKey: { optionIds: ['A', 'C'] },
};
const category = {
  ...mcma,
  type: 'CATEGORY' as const,
  options: mcma.options.slice(0, 3),
  categories: [
    { id: 'TRUE', text: 'Benar' },
    { id: 'FALSE', text: 'Salah' },
  ],
  answerKey: { categoryByStatementId: { A: 'TRUE', B: 'FALSE', C: 'TRUE' } },
};
it('grades selected and unselected MCMA decisions; omitted answers get zero', () => {
  expect(gradeChapter3Answer(mcma, { optionIds: ['C', 'A'] })).toMatchObject({
    awardedPoints: 1,
    scoreCategory: 4,
    fullyCorrect: true,
  });
  expect(gradeChapter3Answer(mcma, { optionIds: ['A'] })).toMatchObject({
    awardedPoints: 0.75,
    equivalent: 0.75,
    scoreCategory: 3,
    fullyCorrect: false,
  });
  expect(gradeChapter3Answer(mcma, { optionIds: [] })).toMatchObject({
    awardedPoints: 0,
    scoreCategory: 0,
    responseState: 'OMITTED',
  });
  expect(() => gradeChapter3Answer(mcma, { optionIds: ['foreign'] })).toThrow();
});
it('grades partial Category answers without treating omitted statements as correct', () => {
  expect(gradeChapter3Answer(category, { categoryByStatementId: { A: 'TRUE' } })).toMatchObject({
    awardedPoints: 0.33,
    equivalent: 1 / 3,
    scoreCategory: 1,
    fullyCorrect: false,
  });
  expect(gradeChapter3Answer(category, null)).toMatchObject({
    awardedPoints: 0,
    scoreCategory: 0,
    responseState: 'OMITTED',
  });
  expect(() =>
    gradeChapter3Answer(category, { categoryByStatementId: { A: 'foreign' } }),
  ).toThrow();
});
it('keeps ordinary Drill rewards strict; the one-off partial reward fits the integer ledger', () => {
  const start = new Date('2026-10-07T00:00:00Z');
  expect(() => drillReward(8.5, 10, start, start)).toThrow();
  expect(drillReward(8.5, 10, start, start, true)).toMatchObject({ baseXp: 85, totalXp: 135 });
  expect(() => drillReward(NaN, 10, start, start, true)).toThrow();
});

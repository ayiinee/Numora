import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAssessmentMockBank, mockTopics } from './assessment-mock-questions.js';
import { assertAssessmentMockTarget, mockId, mockWeekRelease } from './assessment-mock-seed.js';

describe('DEMO assessment bank', () => {
  const bank = buildAssessmentMockBank();
  it('provides 20 PG questions/chapter and 30 mixed Tryout questions with stable unique codes', () => {
    for (const topic of mockTopics) {
      expect(bank.pretest[topic]).toHaveLength(20);
      expect(bank.pretest[topic].every((q) => q.questionType === 'SINGLE_CHOICE')).toBe(true);
    }
    expect(bank.tryout).toHaveLength(30);
    for (const type of ['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'])
      expect(bank.tryout.filter((q) => q.questionType === type)).toHaveLength(10);
    const questions = [...Object.values(bank.pretest).flat(), ...bank.tryout];
    expect(new Set(questions.map((q) => q.code)).size).toBe(110);
    expect(
      questions.every(
        (q) => q.stem.text.startsWith('DEMO') && q.explanation.text.startsWith('DEMO'),
      ),
    ).toBe(true);
    expect(bank.approvedCurriculum).toBe(false);
    expect(bank.pgkNumericRubric).toBeNull();
    expect(buildAssessmentMockBank()).toEqual(bank);
  });
  it('keeps the readable QA answer-bank artifact identical to seeded content', () => {
    expect(
      JSON.parse(readFileSync(resolve(__dirname, '../seeds/assessment-mocks-v1.json'), 'utf8')),
    ).toEqual(bank);
  });
  it('PG answer keys match independent arithmetic and have distinct options', () => {
    for (const topic of mockTopics)
      for (const [i, q] of bank.pretest[topic].entries()) {
        const n = Math.floor(i / 5) + 2;
        const expected = {
          numbers: [2 * n, `${n + 3}/8`, 10 * n, 2 ** n, 2 * n],
          algebra: [n, 2, n * n, 5 + 2 * n, 2 * n + 1],
          geometry: [5 * n, n ** 3, 4 * n + 6, n * (n + 1), 154 * n],
          statistics: [n + 2, n + 3, n, '1/2', 4 * n],
        }[topic][i % 5];
        if (!Array.isArray(q.optionsOrStatements) || !('optionId' in q.answerKey))
          throw new Error('Expected PG.');
        const labels = q.optionsOrStatements.map((o) => o.content.text);
        expect(new Set(labels).size).toBe(4);
        expect(
          q.optionsOrStatements.find(
            (o) => o.id === ('optionId' in q.answerKey ? q.answerKey.optionId : ''),
          )?.content.text,
        ).toBe(String(expected));
      }
  });
  it('PGK keys select multiple real options and categorize every statement', () => {
    for (const q of bank.tryout.filter((q) => q.questionType !== 'SINGLE_CHOICE')) {
      if (Array.isArray(q.optionsOrStatements)) throw new Error('Expected PGK.');
      const available = q.optionsOrStatements.options.map((o) => o.id);
      if ('optionIds' in q.answerKey) {
        expect(q.answerKey.optionIds).toHaveLength(2);
        expect(q.answerKey.optionIds.every((id) => available.includes(id))).toBe(true);
      } else if ('categoryByStatementId' in q.answerKey) {
        expect(Object.keys(q.answerKey.categoryByStatementId)).toEqual(available);
        expect(Object.values(q.answerKey.categoryByStatementId).sort()).toEqual([
          'N',
          'N',
          'Y',
          'Y',
        ]);
      } else throw new Error('Invalid PGK key.');
    }
  });
  it('uses stable versioned UUIDs and Jakarta Monday midnight', () => {
    expect(mockId('question:test')).toBe(mockId('question:test'));
    expect(mockId('question:test')).toMatch(/^[a-f0-9-]{14}5[a-f0-9-]{21}$/);
    expect(mockWeekRelease(new Date('2026-10-06T10:00:00Z')).toISOString()).toBe(
      '2026-10-04T17:00:00.000Z',
    );
    expect(mockWeekRelease(new Date('2026-10-11T17:00:00Z')).toISOString()).toBe(
      '2026-10-11T17:00:00.000Z',
    );
  });
  it('rejects production, unrecognized remote targets, missing opt-in and transaction poolers', () => {
    const local = {
      NODE_ENV: 'test',
      ALLOW_SYNTHETIC_CONTENT: 'true',
      DATABASE_URL: 'postgres://postgres@127.0.0.1:55442/numora_test_fixture?sslmode=disable',
    };
    expect(() => assertAssessmentMockTarget(local)).not.toThrow();
    expect(() =>
      assertAssessmentMockTarget({ ...local, ALLOW_SYNTHETIC_CONTENT: 'false' }),
    ).toThrow();
    expect(() => assertAssessmentMockTarget({ ...local, NODE_ENV: 'production' })).toThrow();
    const cloud = {
      NODE_ENV: 'development',
      ALLOW_SYNTHETIC_CONTENT: 'true',
      SUPABASE_PROJECT_REF: 'pkamenfnwmoeisccnrnk',
      SUPABASE_URL: 'https://pkamenfnwmoeisccnrnk.supabase.co',
      DATABASE_URL:
        'postgres://postgres.pkamenfnwmoeisccnrnk@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require',
    };
    expect(() => assertAssessmentMockTarget(cloud)).not.toThrow();
    expect(() =>
      assertAssessmentMockTarget({
        ...cloud,
        DATABASE_URL: cloud.DATABASE_URL.replace(':5432', ':6543'),
      }),
    ).toThrow();
    expect(() =>
      assertAssessmentMockTarget({ ...cloud, SUPABASE_URL: 'https://other.supabase.co' }),
    ).toThrow();
  });
});

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as statement } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  instrumentSql,
  runtimeMetricsText,
  runtimeNamespace,
  setRuntimeService,
} from './runtime-metrics.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it('keeps metrics opt-in and namespace free of passwords', () => {
  vi.stubEnv('NUMORA_OBSERVABILITY_ENABLED', 'false');
  const raw = {};
  expect(instrumentSql(raw)).toBe(raw);
  vi.stubEnv('DATABASE_URL', 'postgres://project:SECRET@localhost/db?sslmode=disable');
  const first = runtimeNamespace();
  vi.stubEnv('DATABASE_URL', 'postgres://project:CHANGED@localhost/db?sslmode=require');
  expect(runtimeNamespace()).toBe(first);
  expect(first).not.toContain('SECRET');
  vi.stubEnv('DATABASE_URL', 'postgres://main:secret@db.testproject.supabase.co/postgres');
  const direct = runtimeNamespace();
  vi.stubEnv(
    'DATABASE_URL',
    'postgres://worker.testproject:other@aws-0.test.pooler.supabase.com:6543/postgres',
  );
  expect(runtimeNamespace()).toBe(direct);
});
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'instrumented public postgres-js APIs on localhost',
  () => {
    it('preserves laziness, value chains, parameterization, transactions, rollback and pool acquisition', async () => {
      const url = process.env.TEST_DATABASE_URL!;
      if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
        throw Error('localhost required');
      vi.stubEnv('NUMORA_OBSERVABILITY_ENABLED', 'true');
      setRuntimeService('api');
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const raw = postgres(url, { max: 1, onnotice: () => {} }),
        sql = instrumentSql(raw);
      try {
        await raw`create temporary table metrics_fixture(value integer)`;
        const insert = sql`insert into metrics_fixture values(7)`;
        expect((await raw`select count(*)::integer as n from metrics_fixture`)[0]?.n).toBe(0);
        await insert;
        await insert; // postgres-js executes a query once, even if awaited twice.
        expect((await sql.unsafe('select value from metrics_fixture').values())[0]).toEqual([7]);
        const text = "TEST '); drop table metrics_fixture; --";
        expect((await sql`select ${text}::text as value`)[0]?.value).toBe(text);
        await sql.begin(async (tx) => {
          await tx`insert into metrics_fixture values(8)`;
          await expect(
            tx.savepoint(async (inner) => {
              await inner`insert into metrics_fixture values(9)`;
              throw Error('undo');
            }),
          ).rejects.toThrow('undo');
        });
        await expect(
          sql.begin(async (tx) => {
            await tx`insert into metrics_fixture values(10)`;
            throw Error('rollback');
          }),
        ).rejects.toThrow('rollback');
        expect(
          (await sql`select value from metrics_fixture order by value`).map((r) => r.value),
        ).toEqual([7, 8]);
        const db = drizzle(sql);
        await db.transaction(async (tx) => {
          await tx.execute(statement`insert into metrics_fixture values(11)`);
          await expect(
            tx.transaction(async (inner) => {
              await inner.execute(statement`insert into metrics_fixture values(12)`);
              throw Error('drizzle savepoint');
            }),
          ).rejects.toThrow('drizzle savepoint');
        });
        expect(
          (await db.execute(statement`select value from metrics_fixture order by value`)).map(
            (r) => r.value,
          ),
        ).toEqual([7, 8, 11]);
        const held = await sql.reserve();
        let acquired = false;
        const waiting = sql.reserve().then((next) => {
          acquired = true;
          next.release();
        });
        await new Promise((done) => setTimeout(done, 30));
        expect(acquired).toBe(false);
        held.release();
        await waiting;
        await expect(sql`select 1/0`).rejects.toThrow();
        const report = runtimeMetricsText();
        expect(report).toContain('numora_db_transaction_seconds_count');
        expect(report).toContain('numora_db_acquire_seconds_count');
        expect(report).toContain('numora_db_query_seconds_count');
        expect(report).toContain('numora_db_sampled_json_bytes_count');
        expect(report).not.toContain(text);
        expect(report).toMatch(/numora_db_in_flight\{[^}]+\} 0/);
      } finally {
        await sql.end();
      }
    });
  },
);

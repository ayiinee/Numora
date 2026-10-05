import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

const testUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testUrl)('Supabase default ACL lockdown', () => {
  it('blocks Data API tables, definer views/RPCs and future table grants while retaining runtime/Auth grants', async () => {
    const url = new URL(testUrl!);
    if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(url.hostname))
      throw new Error('Isolated local test PostgreSQL required');
    const database = `numora_test_acl_${randomUUID().replaceAll('-', '')}`;
    const admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
    url.pathname = '/' + database;
    const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
    const roles = ['anon', 'authenticated', 'service_role'];
    try {
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      for (const role of [...roles, 'numora_main_runtime', 'numora_irt_runtime'])
        await admin.unsafe(`DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN
            CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS;
          END IF;
        END $$`);
      await client.unsafe(`
        CREATE SCHEMA auth; CREATE SCHEMA storage;
        CREATE TABLE auth.fixture(value integer); CREATE TABLE storage.fixture(value integer);
        INSERT INTO auth.fixture VALUES(1); INSERT INTO storage.fixture VALUES(2);
        CREATE TABLE public.fixture(value integer);
        INSERT INTO public.fixture VALUES(42);
        ALTER TABLE public.fixture ENABLE ROW LEVEL SECURITY;
        CREATE POLICY server_access ON public.fixture TO numora_main_runtime USING(true);
        CREATE VIEW public.irt_input_fixture_v3 AS SELECT * FROM public.fixture;
        CREATE FUNCTION public.measurement_fixture() RETURNS integer
          LANGUAGE sql SECURITY DEFINER AS 'SELECT value FROM public.fixture';
        GRANT USAGE ON SCHEMA public TO numora_main_runtime,numora_irt_runtime;
        GRANT SELECT ON public.fixture,public.irt_input_fixture_v3 TO numora_main_runtime;
        GRANT SELECT ON public.irt_input_fixture_v3 TO numora_irt_runtime;
        GRANT EXECUTE ON FUNCTION public.measurement_fixture() TO numora_main_runtime;
      `);
      for (const role of roles)
        await client.unsafe(`
          GRANT USAGE ON SCHEMA public,auth,storage TO ${role};
          GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role};
          GRANT SELECT ON auth.fixture,storage.fixture TO ${role};
          GRANT EXECUTE ON FUNCTION public.measurement_fixture() TO ${role};
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role};
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${role};
        `);
      // RLS hides the base table but the owner-executed view/RPC leaks its fixture.
      for (const role of roles)
        await client.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL ROLE ${role}`);
          expect((await tx`SELECT value FROM public.irt_input_fixture_v3`)[0]!.value).toBe(42);
          expect((await tx`SELECT public.measurement_fixture() AS value`)[0]!.value).toBe(42);
        });

      const sql = await readFile(resolve('drizzle/0023_data_api_runtime_lockdown.sql'), 'utf8');
      await client.begin(async (tx) => {
        for (const statement of sql.split('--> statement-breakpoint'))
          if (statement.trim()) await tx.unsafe(statement);
      });
      await client.unsafe(`CREATE TABLE public.future_fixture(value integer);
        CREATE FUNCTION public.measurement_future_fixture() RETURNS integer LANGUAGE sql AS 'SELECT 1';
        REVOKE ALL ON FUNCTION public.measurement_future_fixture() FROM PUBLIC;`);

      for (const role of roles) {
        for (const query of [
          'SELECT * FROM public.fixture',
          'SELECT * FROM public.irt_input_fixture_v3',
          'SELECT public.measurement_fixture()',
          'SELECT * FROM public.future_fixture',
          'SELECT public.measurement_future_fixture()',
        ])
          await expect(
            client.begin(async (tx) => {
              await tx.unsafe(`SET LOCAL ROLE ${role}`);
              await tx.unsafe(query);
            }),
          ).rejects.toMatchObject({ code: '42501' });
        await client.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL ROLE ${role}`);
          expect((await tx`SELECT value FROM auth.fixture`)[0]!.value).toBe(1);
          expect((await tx`SELECT value FROM storage.fixture`)[0]!.value).toBe(2);
        });
      }
      await client.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE numora_main_runtime');
        expect((await tx`SELECT value FROM public.fixture`)[0]!.value).toBe(42);
        expect((await tx`SELECT public.measurement_fixture() AS value`)[0]!.value).toBe(42);
      });
      await client.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE numora_irt_runtime');
        expect((await tx`SELECT value FROM public.irt_input_fixture_v3`)[0]!.value).toBe(42);
      });
      expect((await client`SELECT value FROM public.fixture`)[0]!.value).toBe(42);
    } finally {
      await client.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60000);
});

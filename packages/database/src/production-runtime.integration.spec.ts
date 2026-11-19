import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyProductionDatabase } from './production-runtime.js';

const base = process.env.TEST_DATABASE_URL;
const tlsUrl = process.env.TEST_DATABASE_TLS_URL;
const ca = process.env.TEST_DATABASE_TLS_CA_FILE;
const require = createRequire(resolve('package.json'));

describe.skipIf(!base || !tlsUrl || !ca)(
  'production CLI against isolated real PostgreSQL/TLS',
  { timeout: 30000 },
  () => {
    const suffix = randomUUID().replaceAll('-', '');
    const database = `numora_vps_${suffix}`;
    const login = `vps_runtime_${suffix}`;
    const elevation = `vps_elevated_${suffix}`;
    const objectOwner = `vps_owner_${suffix}`;
    const password = randomUUID();
    let admin: postgres.Sql;
    let owner: postgres.Sql;
    let runtimeUrl: URL;
    let created = false,
      roleCreated = false;
    const additionalRoles: string[] = [];
    const run = async (change: NodeJS.ProcessEnv = {}) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'production',
        NUMORA_DEPLOYMENT_PROFILE: 'production-vps',
        DATABASE_URL: runtimeUrl.toString(),
        DATABASE_EXPECTED_HOST: 'localhost',
        DATABASE_EXPECTED_PORT: runtimeUrl.port || '5432',
        DATABASE_EXPECTED_NAME: database,
        DATABASE_EXPECTED_USER: login,
        DB_POOL_MAX: '1',
        DATABASE_MIGRATION_URL: '',
        PGOPTIONS: '',
        ALLOW_SYNTHETIC_CONTENT: 'false',
        PVP_MODE: 'disabled',
        PVP_CONTENT_MODE: 'strict',
        BULLMQ_PREFIX: `numora:prod:test-${suffix}`,
        REDIS_URL: 'rediss://default:TEST_ONLY@unused.example.test:6379',
        SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST_ONLY',
        NEXT_PUBLIC_SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        NEXT_PUBLIC_TEACHER_TOKEN_PEPPER: '',
        CORS_ORIGINS: 'https://app.example.test',
        TEACHER_TOKEN_PEPPER: 'TEST ONLY retained pepper',
        NODE_EXTRA_CA_CERTS: ca,
        NODE_TLS_REJECT_UNAUTHORIZED: '1',
        NUMORA_OBSERVABILITY_ENABLED: 'false',
        NUMORA_IRT_DATABASE_URL: '',
        ...change,
      };
      return new Promise<{ code: number | null; output: string }>((done, reject) => {
        const child = spawn(
          process.execPath,
          [require.resolve('tsx/cli'), resolve('src/check-production.ts'), '--database'],
          { env, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let output = '';
        child.stdout.on('data', (part: Buffer) => {
          output += part.toString();
        });
        child.stderr.on('data', (part: Buffer) => {
          output += part.toString();
        });
        const timer = setTimeout(() => child.kill(), 15000);
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('close', (code) => {
          clearTimeout(timer);
          done({ code, output });
        });
      });
    };
    beforeAll(async () => {
      if (
        process.env.NODE_ENV !== 'test' ||
        !['localhost', '127.0.0.1'].includes(new URL(base!).hostname) ||
        !/^\/numora_test(?:_[a-z0-9_]+)?$/.test(new URL(base!).pathname) ||
        new URL(base!).pathname !== new URL(tlsUrl!).pathname ||
        !['postgres:', 'postgresql:'].includes(new URL(base!).protocol) ||
        !['postgres:', 'postgresql:'].includes(new URL(tlsUrl!).protocol) ||
        [...new URL(base!).searchParams.keys()].some((key) => key !== 'sslmode') ||
        [...new URL(tlsUrl!).searchParams.keys()].some((key) => key !== 'sslmode') ||
        new URL(tlsUrl!).hostname !== 'localhost' ||
        new URL(base!).port !== new URL(tlsUrl!).port
      )
        throw Error('Dedicated localhost PostgreSQL and matching test TLS endpoint required');
      admin = postgres(base!, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      created = true;
      const plain = new URL(base!);
      plain.pathname = '/' + database;
      owner = postgres(plain.toString(), { max: 1, onnotice: () => {} });
      await owner`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='numora_main_runtime') THEN CREATE ROLE numora_main_runtime NOLOGIN; END IF; END $$`;
      await owner.unsafe(
        `CREATE ROLE "${login}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
      );
      roleCreated = true;
      await owner.unsafe(`CREATE ROLE "${elevation}" NOLOGIN BYPASSRLS`);
      additionalRoles.push(elevation);
      await owner.unsafe(`CREATE ROLE "${objectOwner}" NOLOGIN`);
      additionalRoles.push(objectOwner);
      await owner.unsafe(`GRANT numora_main_runtime TO "${login}"`);
      await owner`CREATE SCHEMA irt_compute`;
      await owner`REVOKE CREATE ON SCHEMA public FROM PUBLIC`;
      await owner`CREATE TABLE public.preflight_fixture(id integer PRIMARY KEY)`;
      await owner`INSERT INTO public.preflight_fixture VALUES(1)`;
      runtimeUrl = new URL(tlsUrl!);
      runtimeUrl.pathname = '/' + database;
      runtimeUrl.username = login;
      runtimeUrl.password = password;
    });
    afterAll(async () => {
      await owner?.end();
      if (created) await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
      if (roleCreated) await admin.unsafe(`DROP ROLE "${login}"`);
      for (const role of additionalRoles) await admin.unsafe(`DROP ROLE "${role}"`);
      await admin?.end();
    });
    it('accepts trusted TLS and restricted Main role without changing business data', async () => {
      const result = await run();
      expect(result.code, result.output).toBe(0);
      expect(result.output).toContain('read-only database preflight passed');
      expect(result.output).not.toContain(password);
      expect(await owner`SELECT id FROM public.preflight_fixture`).toEqual([{ id: 1 }]);
    });
    it('rejects an untrusted CA without exposing credentials', async () => {
      const result = await run({ NODE_EXTRA_CA_CERTS: '' });
      expect(result.code).toBe(1);
      expect(result.output).toContain('Production database preflight failed');
      expect(result.output).not.toContain(password);
    });
    it('reads real catalog identity even with a conflicting default search path', async () => {
      await owner`CREATE SCHEMA preflight_shadow`;
      await owner`CREATE FUNCTION preflight_shadow.current_database() RETURNS name LANGUAGE sql AS $$ SELECT 'unexpected_database'::name $$`;
      await owner.unsafe(`GRANT USAGE ON SCHEMA preflight_shadow TO "${login}"`);
      await owner.unsafe(`ALTER ROLE "${login}" SET search_path=preflight_shadow,pg_catalog`);
      try {
        const result = await run();
        expect(result.code, result.output).toBe(0);
      } finally {
        await owner.unsafe(`ALTER ROLE "${login}" RESET search_path`);
      }
    });
    it('rejects a trusted certificate for a different DNS hostname', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'numora-test-dns-'));
      const file = join(directory, 'lookup.cjs');
      // Simulate a DNS name resolving to this disposable server; preserve the original hostname for TLS SNI.
      await writeFile(
        file,
        `const dns=require('node:dns');const original=dns.lookup;dns.lookup=function(host,...args){return original.call(this,host==='wrong.example.test'?'localhost':host,...args)};`,
      );
      try {
        const wrong = new URL(runtimeUrl);
        wrong.hostname = 'wrong.example.test';
        const result = await run({
          DATABASE_URL: wrong.toString(),
          DATABASE_EXPECTED_HOST: 'wrong.example.test',
          NODE_OPTIONS: `--require "${file.replaceAll('\\', '/')}"`,
        });
        expect(result.code).toBe(1);
        expect(result.output).toContain('Production database preflight failed');
        expect(result.output).not.toContain(password);
      } finally {
        await unlink(file);
        await rmdir(directory);
      }
    });
    it('rejects actual excessive privileges and ownership, including inherited ownership', async () => {
      await owner.unsafe(`ALTER ROLE "${login}" REPLICATION`);
      try {
        expect((await run()).code).toBe(1);
      } finally {
        await owner.unsafe(`ALTER ROLE "${login}" NOREPLICATION`);
      }
      await owner.unsafe(`ALTER ROLE "${login}" BYPASSRLS`);
      try {
        expect((await run()).code).toBe(1);
      } finally {
        await owner.unsafe(`ALTER ROLE "${login}" NOBYPASSRLS`);
      }
      await owner.unsafe(`ALTER TABLE public.preflight_fixture OWNER TO "${login}"`);
      try {
        expect((await run()).code).toBe(1);
      } finally {
        await owner`ALTER TABLE public.preflight_fixture OWNER TO postgres`;
      }
      await owner.unsafe(`GRANT CREATE ON SCHEMA public TO "${login}"`);
      try {
        expect((await run()).code).toBe(1);
      } finally {
        await owner.unsafe(`REVOKE CREATE ON SCHEMA public FROM "${login}"`);
      }
      await owner.unsafe(`GRANT "${elevation}" TO "${login}"`);
      try {
        expect((await run()).code).toBe(1);
      } finally {
        await owner.unsafe(`REVOKE "${elevation}" FROM "${login}"`);
      }
      await owner.unsafe(`GRANT pg_execute_server_program TO "${login}"`);
      try {
        expect((await run()).code).toBe(1);
      } finally {
        await owner.unsafe(`REVOKE pg_execute_server_program FROM "${login}"`);
      }
      await owner.unsafe(`ALTER TABLE public.preflight_fixture OWNER TO "${objectOwner}"`);
      await owner.unsafe(`GRANT "${objectOwner}" TO "${login}"`);
      try {
        expect((await run()).code).toBe(1);
      } finally {
        await owner.unsafe(`REVOKE "${objectOwner}" FROM "${login}"`);
        await owner`ALTER TABLE public.preflight_fixture OWNER TO postgres`;
      }
    });
    it('refuses plaintext sessions and sanitizes driver failures', async () => {
      const url = new URL(runtimeUrl);
      url.search = '?sslmode=disable';
      const plain = postgres(url.toString(), { max: 1 });
      try {
        await expect(
          verifyProductionDatabase(plain, {
            profile: 'production-vps',
            host: 'localhost',
            port: Number(url.port || 5432),
            database,
            login,
            databaseRole: login,
          }),
        ).rejects.toThrow('must use TLS');
      } finally {
        await plain.end();
      }
    });
  },
);

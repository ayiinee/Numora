import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { expect, it } from 'vitest';
import { migrateIntegratedDatabase } from './integrated-migrations.js';
import { verifyProductionDatabase, type ProductionTarget } from './production-runtime.js';

const base = process.env.TEST_DATABASE_URL;
const tlsUrl = process.env.TEST_DATABASE_TLS_URL;
const caFile = process.env.TEST_DATABASE_TLS_CA_FILE;

it.skipIf(!base || !tlsUrl || !caFile)(
  'VPS bootstrap preserves canonical migrations, role boundaries and rerun state on real PostgreSQL',
  { timeout: 90000 },
  async () => {
    const source = new URL(base!);
    const tls = new URL(tlsUrl!);
    if (
      process.env.NODE_ENV !== 'test' ||
      !['localhost', '127.0.0.1'].includes(source.hostname) ||
      !/^\/numora_test(?:_[a-z0-9_]+)?$/.test(source.pathname) ||
      source.port !== tls.port ||
      source.pathname !== tls.pathname ||
      tls.hostname !== 'localhost' ||
      !['postgres:', 'postgresql:'].includes(source.protocol) ||
      !['postgres:', 'postgresql:'].includes(tls.protocol) ||
      [...source.searchParams.keys(), ...tls.searchParams.keys()].some(
        (key) => key !== 'sslmode',
      ) ||
      source.searchParams.getAll('sslmode').length !== 1 ||
      source.searchParams.get('sslmode') !== 'disable' ||
      tls.searchParams.getAll('sslmode').length !== 1 ||
      tls.searchParams.get('sslmode') !== 'verify-full'
    )
      throw Error('Dedicated localhost PostgreSQL 16 admin and matching TLS fixture required');
    const admin = postgres(base!, { max: 1, onnotice: () => {} });
    const managed = [
      'numora_owner',
      'numora_api',
      'numora_worker',
      'numora_compute',
      'numora_migrator',
    ];
    const allRoles = [...managed, 'numora_main_runtime', 'numora_irt_runtime'];
    const database = `numora_test_bootstrap_${randomUUID().replaceAll('-', '')}`;
    const clients: postgres.Sql[] = [];
    let created = false;
    const newRoles: string[] = [];
    try {
      const existing = await admin<
        { rolname: string }[]
      >`SELECT rolname FROM pg_roles WHERE rolname=ANY(${allRoles})`;
      if (existing.some((role) => managed.includes(role.rolname)))
        throw Error('Bootstrap fixture refuses existing named service/owner roles');
      newRoles.push(...allRoles.filter((name) => !existing.some((role) => role.rolname === name)));
      const psql = async (file: string) =>
        promisify(execFile)(
          process.env.TEST_PSQL_PATH ?? 'psql',
          [
            '-X',
            '--no-password',
            '-v',
            'ON_ERROR_STOP=1',
            '-v',
            `database_name=${database}`,
            '-f',
            resolve('../../deploy/postgres', file),
          ],
          {
            timeout: 20000,
            env: {
              PATH: process.env.PATH,
              SystemRoot: process.env.SystemRoot,
              PGHOST: source.hostname,
              PGPORT: source.port || '5432',
              PGDATABASE: source.pathname.slice(1),
              PGUSER: decodeURIComponent(source.username),
              PGPASSWORD: decodeURIComponent(source.password),
              PGSSLMODE: 'disable',
              PGCONNECT_TIMEOUT: '5',
            },
          },
        );
      await psql('roles.sql');
      const initialPasswords = await admin<{ unprovisioned: boolean }[]>`
        SELECT bool_and(rolpassword IS NULL) AS unprovisioned FROM pg_authid WHERE rolname=ANY(${managed})`;
      expect(initialPasswords[0]!.unprovisioned).toBe(true);
      created = true;
      await psql('database.sql');
      const password = randomUUID();
      const ca = await readFile(caFile!, 'utf8');
      for (const login of ['numora_api', 'numora_worker', 'numora_compute', 'numora_migrator']) {
        await admin.unsafe(`ALTER ROLE ${login} PASSWORD '${password}'`);
      }
      const connect = (login: string) => {
        const url = new URL(tlsUrl!);
        url.pathname = '/' + database;
        url.username = login;
        url.password = password;
        const client = postgres(url.toString(), {
          max: 1,
          ssl: { ca, rejectUnauthorized: true },
          onnotice: () => {},
        });
        clients.push(client);
        return client;
      };
      const migrator = connect('numora_migrator');
      const [identity] = await migrator`SELECT session_user AS login,current_user AS actor`;
      expect(identity).toEqual({ login: 'numora_migrator', actor: 'numora_owner' });
      await migrateIntegratedDatabase(migrator, resolve('drizzle'));
      const history = await migrator<
        { count: number }[]
      >`SELECT count(*)::int FROM drizzle.__drizzle_migrations`;
      const count = history[0]!.count;
      expect(count).toBeGreaterThan(70);
      await migrateIntegratedDatabase(migrator, resolve('drizzle'));
      expect(
        (await migrator`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`)[0]!.count,
      ).toBe(count);
      const objects = await migrator`
        SELECT count(*)::int AS invalid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','irt_compute','drizzle') AND c.relowner<>'numora_owner'::regrole`;
      expect(objects[0]!.invalid).toBe(0);
      const target = (login: string): ProductionTarget => ({
        profile: 'production-vps',
        host: 'localhost',
        port: Number(tls.port || 5432),
        database,
        login,
        databaseRole: login,
      });
      const api = connect('numora_api'),
        worker = connect('numora_worker'),
        compute = connect('numora_compute');
      await verifyProductionDatabase(api, target('numora_api'));
      await verifyProductionDatabase(worker, target('numora_worker'));
      await expect(verifyProductionDatabase(migrator, target('numora_migrator'))).rejects.toThrow(
        /identity|non-owner/,
      );
      const fixtureId = randomUUID();
      await api`INSERT INTO public.users (id,auth_user_id,email,display_name,role)
        VALUES(${fixtureId},${randomUUID()},'bootstrap@example.test','Bootstrap fixture','STUDENT')`;
      expect((await worker`SELECT id FROM public.users WHERE id=${fixtureId}`)[0]!.id).toBe(
        fixtureId,
      );
      for (const statement of [
        'CREATE TABLE public.bootstrap_forbidden(id int)',
        'SET ROLE numora_owner',
        'SET ROLE numora_irt_runtime',
        'DELETE FROM irt_compute.compute_outputs',
        'SELECT * FROM drizzle.__drizzle_migrations',
      ]) {
        await expect(api.unsafe(statement)).rejects.toMatchObject({ code: '42501' });
      }
      await expect(compute`SELECT * FROM public.users`).rejects.toMatchObject({ code: '42501' });
      await expect(compute`DELETE FROM public.users`).rejects.toMatchObject({ code: '42501' });
      await expect(
        compute.unsafe('CREATE TABLE irt_compute.bootstrap_forbidden(id int)'),
      ).rejects.toMatchObject({ code: '42501' });
      await compute`SELECT * FROM public.irt_input_principals_v3 LIMIT 1`;
      // Reruns never rotate passwords, rewrite history or change fixture business records.
      const [before] = await admin`SELECT rolpassword FROM pg_authid WHERE rolname='numora_api'`;
      await psql('roles.sql');
      await psql('database.sql');
      const [after] = await admin`SELECT rolpassword FROM pg_authid WHERE rolname='numora_api'`;
      expect(before!.rolpassword === after!.rolpassword).toBe(true);
      expect((await api`SELECT id FROM public.users WHERE id=${fixtureId}`)[0]!.id).toBe(fixtureId);
      expect(
        (await migrator`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`)[0]!.count,
      ).toBe(count);
      // Unexpected existing privileges fail closed; bootstrap does not silently repair them.
      await admin`ALTER ROLE numora_worker CREATEROLE`;
      await expect(psql('roles.sql')).rejects.toThrow();
      expect(
        (await admin`SELECT rolcreaterole FROM pg_roles WHERE rolname='numora_worker'`)[0]!
          .rolcreaterole,
      ).toBe(true);
      await admin`ALTER ROLE numora_worker NOCREATEROLE`;
      await admin`GRANT numora_irt_runtime TO numora_api`;
      await expect(psql('roles.sql')).rejects.toThrow();
      await admin`REVOKE numora_irt_runtime FROM numora_api`;
      await admin`GRANT numora_owner TO postgres`;
      await expect(psql('roles.sql')).rejects.toThrow();
      await admin`REVOKE numora_owner FROM postgres`;
      await admin.unsafe(`ALTER DATABASE ${database} OWNER TO postgres`);
      await expect(psql('database.sql')).rejects.toThrow();
      await admin.unsafe(`ALTER DATABASE ${database} OWNER TO numora_owner`);
    } finally {
      for (const client of clients) await client.end({ timeout: 5 });
      if (created) await admin.unsafe(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
      for (const role of newRoles.reverse()) await admin.unsafe(`DROP ROLE IF EXISTS ${role}`);
      await admin.end({ timeout: 5 });
    }
  },
);

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, chmod, readFile, writeFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import { expect, it } from 'vitest';
import { createBackup, database, verifyBackup } from './backup-runtime.js';
import { writerKinds } from './backup-config.js';
import { prepareVpsRestore, restoreVps } from './restore-vps.js';
import { migrateIntegratedDatabase } from './integrated-migrations.js';
import { verifyProductionDatabase } from './production-runtime.js';

const base = process.env.TEST_DATABASE_URL,
  tls = process.env.TEST_DATABASE_TLS_URL,
  ca = process.env.TEST_DATABASE_TLS_CA_FILE;
it.skipIf(!base || !tls || !ca || process.platform === 'win32')(
  'restores source owners into restricted VPS roles, preserves column/default grants and keeps connection quarantine',
  { timeout: 180000 },
  async () => {
    const sourceBase = new URL(base!),
      sourceTls = new URL(tls!);
    if (
      process.env.NODE_ENV !== 'test' ||
      sourceBase.hostname !== 'localhost' ||
      sourceTls.hostname !== 'localhost' ||
      !/^\/numora_test(?:_[a-z0-9_]+)?$/.test(sourceBase.pathname) ||
      sourceBase.pathname !== sourceTls.pathname ||
      sourceBase.port !== sourceTls.port ||
      sourceBase.search !== '?sslmode=disable' ||
      sourceTls.search !== '?sslmode=verify-full'
    )
      throw Error('Dedicated localhost PostgreSQL/TLS fixture required');
    const suffix = randomUUID().replaceAll('-', ''),
      sourceName = 'numora_test_restore_source_' + suffix,
      targetName = 'numora_test_vps_restore_' + suffix;
    const provider = 'restore_provider_' + suffix;
    const admin = postgres(base!, { max: 1, onnotice: () => {} }),
      clients: postgres.Sql[] = [];
    const root = await mkdtemp(join(tmpdir(), 'numora-vps-restore-'));
    await chmod(root, 0o700);
    const folder = join(root, 'archive'),
      writerFile = join(root, 'writers.json'),
      mapFile = join(root, 'mapping.json'),
      planFile = join(root, 'plan.json'),
      report = join(root, 'report.json');
    const newRoles: string[] = [];
    let sourceCreated = false,
      targetCreated = false;
    const oldCa = process.env.NUMORA_BACKUP_CA_FILE;
    process.env.NUMORA_BACKUP_CA_FILE = ca;
    const psql = async (file: string, dbname = sourceBase.pathname.slice(1)) =>
      promisify(execFile)(
        process.env.TEST_PSQL_PATH ?? 'psql',
        [
          '-X',
          '--no-password',
          '-v',
          'ON_ERROR_STOP=1',
          '-v',
          'database_name=' + targetName,
          '-f',
          resolve('../../deploy/postgres', file),
        ],
        {
          timeout: 20000,
          env: {
            PATH: process.env.PATH,
            PGHOST: sourceBase.hostname,
            PGPORT: sourceBase.port || '5432',
            PGDATABASE: dbname,
            PGUSER: decodeURIComponent(sourceBase.username),
            PGPASSWORD: decodeURIComponent(sourceBase.password),
            PGSSLMODE: 'disable',
            PGCONNECT_TIMEOUT: '5',
          },
        },
      );
    try {
      await admin`SELECT pg_advisory_lock(1940261115)`;
      const roles = [
        'numora_owner',
        'numora_main_runtime',
        'numora_irt_runtime',
        'numora_api',
        'numora_worker',
        'numora_compute',
        'numora_migrator',
      ];
      const existing = await admin<
        { rolname: string }[]
      >`SELECT rolname FROM pg_roles WHERE rolname=ANY(${roles})`;
      if (
        existing.some(
          (role) => !['numora_main_runtime', 'numora_irt_runtime'].includes(role.rolname),
        )
      )
        throw Error('Fixed bootstrap fixture roles already exist');
      newRoles.push(...roles.filter((role) => !existing.some((row) => row.rolname === role)));
      await psql('roles.sql');
      await admin.unsafe(`CREATE ROLE ${provider} NOLOGIN`);
      newRoles.push(provider);
      await admin.unsafe(`CREATE DATABASE ${sourceName}`);
      sourceCreated = true;
      const url = new URL(base!);
      url.pathname = '/' + sourceName;
      const source = postgres(url.toString(), { max: 1, onnotice: () => {} });
      clients.push(source);
      await migrateIntegratedDatabase(source, resolve('drizzle'));
      const id = randomUUID(),
        authId = randomUUID();
      await source`INSERT INTO public.users(id,auth_user_id,email,display_name,role) VALUES(${id},${authId},'restore@example.test','TEST ONLY','STUDENT')`;
      await source.unsafe(`GRANT SELECT ON public.users TO ${provider};
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO numora_main_runtime;
        ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
        CREATE FUNCTION public.restore_probe() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS 'SELECT count(*) FROM public.users';
        GRANT EXECUTE ON FUNCTION public.restore_probe() TO numora_main_runtime;`);
      const input = { reviewedBy: 'TEST_ONLY', reviewedAt: new Date().toISOString() };
      await writeFile(
        writerFile,
        JSON.stringify({
          ...input,
          writers: writerKinds.map((kind) => ({
            kind,
            id: kind,
            owner: 'TEST_ONLY',
            state: 'stopped',
          })),
        }),
        { mode: 0o600 },
      );
      await writeFile(
        mapFile,
        JSON.stringify({
          format: 'NUMORA_VPS_OWNER_MAPPING_V1',
          ...input,
          owners: { postgres: 'numora_owner', pg_database_owner: 'numora_owner' },
          dropGrantees: [provider],
        }),
        { mode: 0o600 },
      );
      const sourceUrl = new URL(tls!);
      sourceUrl.pathname = '/' + sourceName;
      await createBackup(sourceUrl, folder, writerFile);
      expect((await verifyBackup(folder)).inventory.restoreAccess.length).toBeGreaterThan(1000);
      const sequence = (await verifyBackup(folder)).inventory.restoreAccess.find(
        (item) => item.kind === 'SEQUENCE' && item.schema === 'drizzle',
      );
      expect(
        sequence!.grants
          .filter((grant) => grant.grantee === 'postgres')
          .map((grant) => grant.privilege)
          .sort(),
      ).toEqual(['SELECT', 'UPDATE', 'USAGE']);
      await prepareVpsRestore(folder, mapFile, planFile);
      targetCreated = true;
      await psql('database.sql');
      const password = randomUUID();
      for (const login of ['numora_migrator', 'numora_api', 'numora_worker', 'numora_compute'])
        await admin.unsafe(`ALTER ROLE ${login} PASSWORD '${password}'`);
      const targetUrl = new URL(tls!);
      targetUrl.pathname = '/' + targetName;
      targetUrl.username = 'numora_migrator';
      targetUrl.password = password;
      const originalPlan = await readFile(planFile, 'utf8');
      const editedPlan = JSON.parse(originalPlan);
      editedPlan.access.pop();
      await writeFile(planFile, JSON.stringify(editedPlan));
      await expect(restoreVps(targetUrl, folder, planFile, report)).rejects.toThrow(/edited/);
      await writeFile(planFile, originalPlan);
      await expect(restoreVps(targetUrl, folder, planFile, report)).rejects.toThrow(
        /connection-fenced/,
      );
      await psql('restore-quarantine.sql', targetName);
      const runtimeUrl = (login: string) => {
        const value = new URL(targetUrl);
        value.username = login;
        return value;
      };
      const denied = database(runtimeUrl('numora_api'));
      await expect(denied`SELECT 1`).rejects.toMatchObject({ code: '42501' });
      await denied.end({ timeout: 2 });
      await restoreVps(targetUrl, folder, planFile, report);
      const result = JSON.parse(await readFile(report, 'utf8'));
      expect(result.result).toBe('PASS');
      expect(result.connectionFence).toBe('REMAINS_CLOSED');
      expect(result.runtimeReady).toBe(false);
      await expect(
        restoreVps(targetUrl, folder, planFile, join(root, 'repeat.json')),
      ).rejects.toThrow(/empty bootstrap/);
      const targetAdminUrl = new URL(base!);
      targetAdminUrl.pathname = '/' + targetName;
      const targetAdmin = postgres(targetAdminUrl.toString(), { max: 1, onnotice: () => {} });
      clients.push(targetAdmin);
      expect(
        (
          await targetAdmin`SELECT has_database_privilege('numora_api',current_database(),'CONNECT') AS allowed`
        )[0]!.allowed,
      ).toBe(false);
      expect(
        (
          await targetAdmin`SELECT has_table_privilege(${provider},'public.users','SELECT') AS allowed`
        )[0]!.allowed,
      ).toBe(false);
      expect(
        (await targetAdmin`SELECT auth_user_id FROM public.users WHERE id=${id}`)[0]!.auth_user_id,
      ).toBe(authId);
      // Test-only opening after PASS. The restore command never performs this step.
      await targetAdmin.unsafe(
        `GRANT CONNECT ON DATABASE ${targetName} TO numora_api,numora_worker,numora_compute`,
      );
      const api = database(runtimeUrl('numora_api')),
        worker = database(runtimeUrl('numora_worker')),
        compute = database(runtimeUrl('numora_compute'));
      clients.push(api, worker, compute);
      for (const [client, login] of [
        [api, 'numora_api'],
        [worker, 'numora_worker'],
      ] as const)
        await verifyProductionDatabase(client, {
          profile: 'production-vps',
          host: 'localhost',
          port: Number(sourceBase.port || 5432),
          database: targetName,
          login,
          databaseRole: login,
        });
      expect((await api`SELECT public.restore_probe() AS count`)[0]!.count).toBe('1');
      await expect(compute`SELECT * FROM public.users`).rejects.toMatchObject({ code: '42501' });
      await expect(compute`SELECT public.restore_probe()`).rejects.toMatchObject({ code: '42501' });
      await expect(
        api.begin('READ WRITE', async (tx) => tx.unsafe('CREATE TABLE public.forbidden(id int)')),
      ).rejects.toMatchObject({
        code: '42501',
      });
      await expect(api.unsafe('SET ROLE numora_owner')).rejects.toMatchObject({ code: '42501' });
      await expect(
        api.begin(
          'READ WRITE',
          async (tx) => tx`UPDATE irt_compute.compute_outputs SET sequence_number=1 WHERE false`,
        ),
      ).rejects.toMatchObject({ code: '42501' });
      const before = (await api`SELECT revision FROM public.pvp_content_revision`)[0]!.revision;
      await api.begin('READ WRITE', async (tx) => {
        await tx`INSERT INTO public.chapters(code,slug,name,display_order) VALUES('RESTORE-TEST','restore-test','TEST ONLY',1)`;
      });
      expect((await api`SELECT revision FROM public.pvp_content_revision`)[0]!.revision).not.toBe(
        before,
      );
      const owner = database(targetUrl);
      clients.push(owner);
      await owner.begin('READ WRITE', async (tx) => {
        await tx.unsafe('CREATE TABLE public.future_restore_probe(id int)');
        await tx.unsafe(
          "CREATE FUNCTION public.future_restore_function() RETURNS int LANGUAGE sql AS 'SELECT 1'",
        );
      });
      expect((await api`SELECT * FROM public.future_restore_probe`).length).toBe(0);
      expect(
        (
          await targetAdmin`SELECT NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.future_restore_function()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS closed`
        )[0]!.closed,
      ).toBe(true);
      expect(
        (
          await targetAdmin`SELECT has_column_privilege('numora_main_runtime','public.content_imports','report','UPDATE') AS allowed`
        )[0]!.allowed,
      ).toBe(true);
    } finally {
      if (oldCa === undefined) delete process.env.NUMORA_BACKUP_CA_FILE;
      else process.env.NUMORA_BACKUP_CA_FILE = oldCa;
      for (const client of clients) await client.end({ timeout: 5 });
      if (targetCreated) await admin.unsafe(`DROP DATABASE IF EXISTS ${targetName} WITH(FORCE)`);
      if (sourceCreated) await admin.unsafe(`DROP DATABASE IF EXISTS ${sourceName} WITH(FORCE)`);
      for (const role of newRoles.reverse()) await admin.unsafe(`DROP ROLE IF EXISTS ${role}`);
      await admin.end({ timeout: 5 });
      for (const name of await readdir(folder).catch(() => [])) await unlink(join(folder, name));
      await rmdir(folder).catch(() => {});
      for (const path of [writerFile, mapFile, planFile, report])
        await unlink(path).catch(() => {});
      await rmdir(root).catch(() => {});
    }
  },
);

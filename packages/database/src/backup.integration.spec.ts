import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, chmod, unlink, rmdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import { expect, it } from 'vitest';
import {
  createBackup,
  inspectBackupSource,
  rehearseBackup,
  verifyBackup,
} from './backup-runtime.js';
import { tableProofs, catalog } from './backup-catalog.js';
import { writerKinds } from './backup-config.js';
import { migrateIntegratedDatabase } from './integrated-migrations.js';

const base = process.env.TEST_DATABASE_URL,
  tlsUrl = process.env.TEST_DATABASE_TLS_URL,
  ca = process.env.TEST_DATABASE_TLS_CA_FILE;

it.skipIf(!base || !tlsUrl || !ca || process.platform === 'win32')(
  'round-trips a full canonical application archive, verifies evidence, refuses unsafe restores and detects corruption',
  { timeout: 120000 },
  async () => {
    const sourceBase = new URL(base!),
      sourceTls = new URL(tlsUrl!);
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
      sourceName = 'numora_test_backup_' + suffix,
      targetName = 'numora_restore_test_' + suffix;
    const admin = postgres(base!, { max: 1, onnotice: () => {} }),
      connections: postgres.Sql[] = [];
    const root = await mkdtemp(join(tmpdir(), 'numora-backup-test-'));
    await chmod(root, 0o700);
    const folder = join(root, 'archive'),
      writers = join(root, 'writers-input.json'),
      report = join(root, 'restore-report.json');
    const previousCa = process.env.NUMORA_BACKUP_CA_FILE;
    process.env.NUMORA_BACKUP_CA_FILE = ca;
    let sourceCreated = false,
      targetCreated = false;
    try {
      await admin.unsafe(`CREATE DATABASE ${sourceName}`);
      sourceCreated = true;
      await admin.unsafe(`CREATE DATABASE ${targetName}`);
      targetCreated = true;
      const connect = (name: string) => {
        const url = new URL(base!);
        url.pathname = '/' + name;
        const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
        connections.push(client);
        return client;
      };
      const source = connect(sourceName),
        target = connect(targetName);
      await target.unsafe('DROP SCHEMA public');
      await migrateIntegratedDatabase(source, resolve('drizzle'));
      const id = randomUUID(),
        authId = randomUUID();
      await source`INSERT INTO public.users(id,auth_user_id,email,display_name,role)
        VALUES(${id},${authId},'backup@example.test','TEST ONLY','STUDENT')`;
      // Additional opaque historical payload/sequence in each application namespace.
      // All actual canonical tables, functions, policies and migration hashes are also round-tripped.
      await source.unsafe(`CREATE TABLE public.backup_history_fixture(id bigserial PRIMARY KEY,user_id uuid REFERENCES public.users(id),payload jsonb);
        CREATE TABLE irt_compute.backup_artifact_fixture(id bigserial PRIMARY KEY,payload jsonb);
        REVOKE ALL ON public.backup_history_fixture,irt_compute.backup_artifact_fixture FROM PUBLIC;
        GRANT SELECT ON public.backup_history_fixture TO numora_main_runtime;
        GRANT SELECT ON irt_compute.backup_artifact_fixture TO numora_irt_runtime;`);
      await source`INSERT INTO public.backup_history_fixture(user_id,payload) VALUES(${id},
        ${source.json({ xp: '137.25', policyVersion: 3, rubricVersion: 2, score: '82.50', contentVersion: 7 })})`;
      await source`INSERT INTO irt_compute.backup_artifact_fixture(payload) VALUES(${source.json({ digest: 'TEST_ONLY', historical: true })})`;
      await writeFile(
        writers,
        JSON.stringify({
          reviewedBy: 'TEST_ONLY',
          reviewedAt: new Date().toISOString(),
          writers: writerKinds.map((kind) => ({
            kind,
            id: kind,
            owner: 'TEST_ONLY',
            state: 'stopped',
          })),
        }),
        { mode: 0o600 },
      );
      const url = new URL(tlsUrl!);
      url.pathname = '/' + sourceName;
      // Tests use CI-only credentials, never a source/VPS URL.
      await inspectBackupSource(url, join(root, 'source-inventory.json'), writers);
      expect(
        JSON.parse(await readFile(join(root, 'source-inventory.json'), 'utf8')).inventory.tableSizes
          .length,
      ).toBeGreaterThan(100);
      await createBackup(url, folder, writers);
      const { manifest, inventory } = await verifyBackup(folder);
      expect(manifest.schemas).toEqual(['public', 'irt_compute', 'drizzle']);
      expect(
        inventory.tableProofs.find((row) => row.schema === 'public' && row.name === 'users')?.rows,
      ).toBe('1');
      expect(
        inventory.tableProofs.some((row) => row.schema === 'irt_compute' && row.rows === '1'),
      ).toBe(true);
      expect(inventory.history.length).toBeGreaterThan(70);
      expect(inventory.dependencies).toEqual([]);
      expect(await readFile(join(folder, 'inventory.json'), 'utf8')).not.toContain(
        decodeURIComponent(url.password),
      );
      expect((await lstat(folder)).mode & 0o077).toBe(0);
      expect((await lstat(join(folder, 'application.dump'))).mode & 0o077).toBe(0);
      const restore = new URL(url);
      restore.pathname = '/' + targetName;
      // A user schema whose name starts with "pg" is not a system schema.
      await target.unsafe('CREATE SCHEMA pgx_user_data');
      await expect(rehearseBackup(restore, folder, report)).rejects.toThrow(/no user schemas/);
      await target.unsafe('DROP SCHEMA pgx_user_data');
      await rehearseBackup(restore, folder, report);
      expect(JSON.parse(await readFile(report, 'utf8')).result).toBe('PASS');
      expect(
        (await target`SELECT auth_user_id FROM public.users WHERE id=${id}`)[0]!.auth_user_id,
      ).toBe(authId);
      expect(
        (await target`SELECT payload->>'xp' AS xp FROM public.backup_history_fixture`)[0]!.xp,
      ).toBe('137.25');
      expect(await tableProofs(target)).toEqual(await tableProofs(source));
      await target.begin('READ ONLY', async (sql) => {
        await sql.unsafe('SET LOCAL ROLE numora_main_runtime');
        expect(
          (await sql`SELECT auth_user_id FROM public.users WHERE id=${id}`)[0]!.auth_user_id,
        ).toBe(authId);
      });
      await expect(
        target.begin('READ ONLY', async (sql) => {
          await sql.unsafe('SET LOCAL ROLE numora_irt_runtime');
          await sql`SELECT * FROM public.users`;
        }),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        rehearseBackup(restore, folder, join(root, 'second-report.json')),
      ).rejects.toThrow(/no user schemas/);
      await expect(rehearseBackup(url, folder, join(root, 'same-source.json'))).rejects.toThrow(
        /separate owned/,
      );
      // File corruption never reaches a restore connection; no automatic overwrite/removal.
      await chmod(join(folder, 'inventory.json'), 0o644);
      await expect(verifyBackup(folder)).rejects.toThrow(/private/);
      await chmod(join(folder, 'inventory.json'), 0o600);
      await writeFile(join(folder, 'unfinished.tmp'), 'TEST_ONLY', { mode: 0o600 });
      await expect(verifyBackup(folder)).rejects.toThrow(/unexpected/);
      await unlink(join(folder, 'unfinished.tmp'));
      await writeFile(join(folder, 'archive.list'), 'CORRUPTED', { mode: 0o600 });
      await expect(verifyBackup(folder)).rejects.toThrow(/checksum/);
      await expect(
        rehearseBackup(restore, folder, join(root, 'corrupt-report.json')),
      ).rejects.toThrow(/checksum/);
      await expect(createBackup(url, folder, writers)).rejects.toThrow();
      const partial = join(root, 'partial');
      await mkdir(partial, { mode: 0o700 });
      await expect(verifyBackup(partial)).rejects.toThrow();
      await rmdir(partial);
      // An unresolved FK to an excluded schema is surfaced in inventory.
      await source.unsafe(
        'CREATE SCHEMA external_fixture; CREATE TABLE external_fixture.ids(id int PRIMARY KEY); CREATE TABLE public.external_reference(id int REFERENCES external_fixture.ids(id))',
      );
      expect(
        (await catalog(source)).dependencies.some(
          (item) => item.targetSchema === 'external_fixture',
        ),
      ).toBe(true);
    } finally {
      if (previousCa === undefined) delete process.env.NUMORA_BACKUP_CA_FILE;
      else process.env.NUMORA_BACKUP_CA_FILE = previousCa;
      for (const client of connections) await client.end({ timeout: 5 });
      if (targetCreated) await admin.unsafe(`DROP DATABASE ${targetName} WITH (FORCE)`);
      if (sourceCreated) await admin.unsafe(`DROP DATABASE ${sourceName} WITH (FORCE)`);
      await admin.end({ timeout: 5 });
      // Remove only known regular files created by this run; never recursive-delete arbitrary paths.
      for (const name of [
        'application.dump',
        'archive.list',
        'inventory.json',
        'writers.json',
        'manifest.json',
        '.pgpass',
      ])
        await unlink(join(folder, name)).catch(() => {});
      await rmdir(folder).catch(() => {});
      for (const path of [writers, report, join(root, 'source-inventory.json')])
        await unlink(path).catch(() => {});
      await rmdir(root).catch(() => {});
    }
  },
);

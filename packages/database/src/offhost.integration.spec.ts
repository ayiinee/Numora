import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  chmod,
  writeFile,
  readFile,
  mkdir,
  lstat,
  unlink,
  rmdir,
  readdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import postgres from 'postgres';
import { expect, it } from 'vitest';
import { createBackup, fileHash, rehearseBackup, verifyBackup } from './backup-runtime.js';
import { migrateIntegratedDatabase } from './integrated-migrations.js';
import { writerKinds } from './backup-config.js';
import { offhostConfig } from './offhost-config.js';
import { publishOffhost, recoverOffhost, resticRun, type ResticRunner } from './offhost-runtime.js';

const base = process.env.TEST_DATABASE_URL,
  tls = process.env.TEST_DATABASE_TLS_URL,
  ca = process.env.TEST_DATABASE_TLS_CA_FILE,
  restic = process.env.TEST_RESTIC_PATH;
it.skipIf(!base || !tls || !ca || !restic || process.platform === 'win32')(
  'encrypts a verified archive, retrieves its exact snapshot and restores the recovered database without accepting wrong identities or corruption',
  { timeout: 180000 },
  async () => {
    const url = new URL(base!),
      tlsUrl = new URL(tls!);
    if (
      process.env.NODE_ENV !== 'test' ||
      url.hostname !== 'localhost' ||
      tlsUrl.hostname !== 'localhost' ||
      !/^\/numora_test(?:_[a-z0-9_]+)?$/.test(url.pathname) ||
      url.pathname !== tlsUrl.pathname ||
      url.port !== tlsUrl.port ||
      url.search !== '?sslmode=disable' ||
      tlsUrl.search !== '?sslmode=verify-full'
    )
      throw Error('Dedicated localhost PostgreSQL/TLS fixture required');
    const suffix = randomUUID().replaceAll('-', ''),
      sourceName = 'numora_test_offhost_' + suffix,
      targetName = 'numora_restore_test_' + suffix;
    const root = await mkdtemp(join(tmpdir(), 'numora-offhost-'));
    await chmod(root, 0o700);
    const repo = join(root, 'encrypted-repository'),
      password = join(root, 'password'),
      writers = join(root, 'writers.json'),
      archive = join(root, 'archive'),
      recovered = join(root, 'recovered'),
      receipt = join(root, 'publication.json'),
      report = join(root, 'recovery.json');
    const admin = postgres(base!, { max: 1, onnotice: () => {} }),
      clients: postgres.Sql[] = [];
    const oldCa = process.env.NUMORA_BACKUP_CA_FILE;
    process.env.NUMORA_BACKUP_CA_FILE = ca;
    let sourceCreated = false,
      targetCreated = false;
    try {
      await writeFile(password, randomUUID() + randomUUID() + '\n', { mode: 0o600 });
      const storageEnv = {
        PATH: process.env.PATH,
        RESTIC_REPOSITORY: repo,
        RESTIC_PASSWORD_FILE: password,
        GOMAXPROCS: '2',
      };
      await promisify(execFile)(restic!, ['--json', 'init'], { env: storageEnv, timeout: 20000 });
      const configOutput = await promisify(execFile)(restic!, ['--json', 'cat', 'config'], {
        env: storageEnv,
        timeout: 20000,
      });
      const config = offhostConfig({
        RESTIC_REPOSITORY: 's3:https://storage.example.test/backup-bucket/numora',
        NUMORA_OFFHOST_EXPECTED_ORIGIN: 'https://storage.example.test',
        NUMORA_OFFHOST_EXPECTED_PATH: '/backup-bucket/numora',
        NUMORA_OFFHOST_REPOSITORY_ID: JSON.parse(configOutput.stdout).id,
        NUMORA_OFFHOST_RESTIC: restic,
        RESTIC_PASSWORD_FILE: password,
        NUMORA_OFFHOST_HOST_ALIAS: 'test-only',
        NUMORA_OFFHOST_LIMIT_KIB: '1048576',
        AWS_ACCESS_KEY_ID: 'TEST_ONLY_KEY',
        AWS_SECRET_ACCESS_KEY: 'TEST_ONLY_SECRET',
        AWS_DEFAULT_REGION: 'auto',
      });
      // Real restic encryption/retrieval on owned local storage, not an S3 transport/provider acceptance claim.
      const localStorage: ResticRunner = (settings, args, temp) =>
        resticRun({ ...settings, repository: repo }, args, temp);
      await admin.unsafe(`CREATE DATABASE ${sourceName}`);
      sourceCreated = true;
      await admin.unsafe(`CREATE DATABASE ${targetName}`);
      targetCreated = true;
      const connect = (name: string) => {
        const value = new URL(base!);
        value.pathname = '/' + name;
        const client = postgres(value.toString(), { max: 1, onnotice: () => {} });
        clients.push(client);
        return client;
      };
      const source = connect(sourceName),
        target = connect(targetName);
      await target.unsafe('DROP SCHEMA public');
      await migrateIntegratedDatabase(source, resolve('drizzle'));
      const id = randomUUID(),
        authId = randomUUID();
      await source`INSERT INTO public.users(id,auth_user_id,email,display_name,role) VALUES(${id},${authId},'encrypted@example.test','TEST ONLY','STUDENT')`;
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
      const sourceUrl = new URL(tls!);
      sourceUrl.pathname = '/' + sourceName;
      await createBackup(sourceUrl, archive, writers);
      const manifest = await fileHash(join(archive, 'manifest.json'));
      await expect(
        publishOffhost(
          { ...config, repositoryId: 'f'.repeat(64) },
          archive,
          join(root, 'wrong-repo.json'),
          localStorage,
        ),
      ).rejects.toThrow(/identity/);
      await publishOffhost(config, archive, receipt, localStorage);
      const published = JSON.parse(await readFile(receipt, 'utf8'));
      expect(published).toMatchObject({
        result: 'PASS',
        manifestSha256: manifest,
        recoveryReady: false,
      });
      expect(published.snapshotId).toMatch(/^[a-f0-9]{64}$/);
      await expect(publishOffhost(config, archive, receipt, localStorage)).rejects.toThrow(
        /exists/,
      );
      await expect(
        recoverOffhost(config, receipt, 'c'.repeat(64), recovered, report, localStorage),
      ).rejects.toThrow(/receipt/);
      await expect(lstat(recovered)).rejects.toMatchObject({ code: 'ENOENT' });
      const wrongPassword = join(root, 'wrong-password');
      await writeFile(wrongPassword, randomUUID() + randomUUID(), { mode: 0o600 });
      await expect(
        recoverOffhost(
          { ...config, passwordFile: wrongPassword },
          receipt,
          manifest,
          recovered,
          report,
          localStorage,
        ),
      ).rejects.toThrow(/operation failed/);
      await recoverOffhost(config, receipt, manifest, recovered, report, localStorage);
      expect(JSON.parse(await readFile(report, 'utf8'))).toMatchObject({
        result: 'PASS',
        databaseRestored: false,
        cutoverReady: false,
      });
      expect(await fileHash(join(recovered, 'application.dump'))).toBe(
        await fileHash(join(archive, 'application.dump')),
      );
      await expect(
        recoverOffhost(
          config,
          receipt,
          manifest,
          recovered,
          join(root, 'repeat.json'),
          localStorage,
        ),
      ).rejects.toThrow(/already exists/);
      const targetUrl = new URL(tls!);
      targetUrl.pathname = '/' + targetName;
      await rehearseBackup(targetUrl, recovered, join(root, 'database-rehearsal.json'));
      expect(
        (await target`SELECT auth_user_id FROM public.users WHERE id=${id}`)[0]!.auth_user_id,
      ).toBe(authId);
      // Recovered corruption is not accepted as a valid archive.
      await writeFile(join(recovered, 'application.dump'), 'CORRUPTED');
      await expect(verifyBackup(recovered)).rejects.toThrow(/checksum/);
      const badArchive = join(root, 'unsafe-archive');
      await mkdir(badArchive, { mode: 0o700 });
      await expect(
        publishOffhost(config, badArchive, join(root, 'unsafe-receipt.json'), localStorage),
      ).rejects.toThrow();
      await expect(lstat(join(root, 'unsafe-receipt.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      if (oldCa === undefined) delete process.env.NUMORA_BACKUP_CA_FILE;
      else process.env.NUMORA_BACKUP_CA_FILE = oldCa;
      for (const client of clients) await client.end({ timeout: 5 });
      if (targetCreated) await admin.unsafe(`DROP DATABASE IF EXISTS ${targetName} WITH(FORCE)`);
      if (sourceCreated) await admin.unsafe(`DROP DATABASE IF EXISTS ${sourceName} WITH(FORCE)`);
      await admin.end({ timeout: 5 });
      // Only the mkdtemp-owned tree; do not follow links during cleanup.
      const removeOwned = async (path: string): Promise<void> => {
        const entry = await lstat(path);
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          for (const child of await readdir(path)) await removeOwned(join(path, child));
          await rmdir(path);
        } else await unlink(path);
      };
      await removeOwned(root);
    }
  },
);

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  BackupError,
  backupCheck,
  backupLoginRole,
  backupSchemas,
  writerInventory,
} from './backup-config.js';
import {
  catalog,
  qualifiedRelation,
  sequenceProofs,
  stableCatalog,
  tableProofs,
} from './backup-catalog.js';

const files = ['application.dump', 'archive.list', 'inventory.json', 'writers.json'] as const;
const checkoutRoot = fileURLToPath(new URL('../../../', import.meta.url));
const toolPath = (tool: 'pg_dump' | 'pg_restore') =>
  process.env.NUMORA_BACKUP_PG_BIN ? join(process.env.NUMORA_BACKUP_PG_BIN, tool) : tool;

async function privatePath(path: string, directory: boolean) {
  backupCheck(
    process.platform !== 'win32',
    'Backup artifacts require a POSIX host with verified private filesystem permissions',
  );
  const location = relative(checkoutRoot, resolve(path));
  backupCheck(
    location === '..' || location.startsWith('..' + sep) || isAbsolute(location),
    'Backup artifacts and reports must stay outside the repository checkout',
  );
  const info = await lstat(path);
  backupCheck(
    !info.isSymbolicLink() &&
      (directory ? info.isDirectory() : info.isFile()) &&
      info.uid === process.getuid!() &&
      (info.mode & 0o077) === 0 &&
      (!directory ? info.nlink === 1 : true),
    'Backup artifacts must be private, owned regular files/directories without links',
  );
}

async function privateWrite(path: string, content: string) {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
}

async function fileHash(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// Build a minimal libpq environment. No URL/password appears in argv or child error output.
async function toolEnvironment(url: URL, directory: string) {
  const passfile = join(directory, '.pgpass');
  const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
  await privateWrite(
    passfile,
    [
      url.hostname,
      url.port || '5432',
      decodeURIComponent(url.pathname.slice(1)),
      decodeURIComponent(url.username),
      decodeURIComponent(url.password),
    ]
      .map(escape)
      .join(':') + '\n',
  );
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: 'C',
    LC_ALL: 'C',
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSFILE: passfile,
    PGSSLMODE: 'verify-full',
    PGCONNECT_TIMEOUT: '10',
    PGAPPNAME: 'numora-backup',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=300000',
    ...(process.env.NUMORA_BACKUP_CA_FILE
      ? { PGSSLROOTCERT: resolve(process.env.NUMORA_BACKUP_CA_FILE) }
      : {}),
  };
  return { env, cleanup: () => unlink(passfile) };
}

async function toolRun(tool: 'pg_dump' | 'pg_restore', args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<string>((done, reject) => {
    const child = spawn(toolPath(tool), args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '',
      errorBytes = 0,
      tooLarge = false;
    child.stdout.on('data', (data: Buffer) => {
      if (output.length + data.length > 16 * 1024 * 1024) {
        tooLarge = true;
        child.kill('SIGKILL');
      } else output += data.toString('utf8');
    });
    child.stderr.on('data', (data: Buffer) => {
      errorBytes += data.length;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 900000);
    child.once('error', () => {
      clearTimeout(timer);
      reject(new BackupError('PostgreSQL utility could not start; verify the pinned client tools'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || tooLarge || errorBytes)
        reject(
          new BackupError(
            'PostgreSQL utility failed or warned; the backup/rehearsal is not accepted',
          ),
        );
      else done(output);
    });
  });
}

async function toolVersion(tool: 'pg_dump' | 'pg_restore') {
  const value = await toolRun(tool, ['--version'], {
    PATH: process.env.PATH,
    LANG: 'C',
    LC_ALL: 'C',
  });
  const version = value.match(/PostgreSQL\) (\d+)\./)?.[1];
  backupCheck(version, 'Cannot identify PostgreSQL client major version');
  return Number(version);
}

function database(url: URL) {
  return postgres(url.toString(), {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => {},
    connection: { application_name: 'numora-backup', default_transaction_read_only: true },
  });
}

async function sessionSettings(sql: postgres.TransactionSql) {
  await sql.unsafe('SET LOCAL search_path=pg_catalog,public,irt_compute,drizzle');
  await sql.unsafe("SET LOCAL timezone='UTC'");
  await sql.unsafe("SET LOCAL datestyle='ISO, YMD'");
  await sql.unsafe('SET LOCAL extra_float_digits=3');
  await sql.unsafe('SET LOCAL row_security=off');
  await sql.unsafe("SET LOCAL lock_timeout='5s'");
  await sql.unsafe("SET LOCAL statement_timeout='5min'");
}

async function assertIdentity(sql: postgres.TransactionSql, url: URL) {
  const [state] = await sql`SELECT current_database() AS name,session_user AS login,
    current_setting('server_version_num')::int AS version,
    (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls`;
  backupCheck(
    state &&
      state.name === decodeURIComponent(url.pathname.slice(1)) &&
      state.login === backupLoginRole(url) &&
      state.tls === true,
    'Connected database identity or TLS differs from the pinned target',
  );
  backupCheck(state.version >= 160000, 'Backup inventory requires PostgreSQL 16 or newer');
  return Math.floor(Number(state.version) / 10000);
}

export async function inspectBackupSource(url: URL, report: string, writersFile: string) {
  backupCheck(isAbsolute(report), 'Use an absolute private inventory report path');
  await privatePath(dirname(report), true);
  backupCheck(
    (await realpath(dirname(report))) === resolve(dirname(report)),
    'Inventory parent must not traverse symbolic links',
  );
  const writers = writerInventory(JSON.parse(await readFile(writersFile, 'utf8')));
  const client = database(url);
  try {
    const inventory = await client.begin(
      'ISOLATION LEVEL REPEATABLE READ READ ONLY',
      async (sql) => {
        await sessionSettings(sql);
        await assertIdentity(sql, url);
        const metadata = await catalog(sql);
        const tableSizes =
          await sql`SELECT n.nspname AS schema,c.relname AS name,pg_total_relation_size(c.oid)::text AS bytes,
        c.reltuples::bigint::text AS "estimatedRows" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=ANY(${[...backupSchemas]}) AND c.relkind IN ('r','p','m') ORDER BY 1,2`;
        return { ...metadata, tableSizes };
      },
    );
    await privateWrite(
      report,
      JSON.stringify(
        {
          format: 'NUMORA_SOURCE_INVENTORY_V1',
          capturedAt: new Date().toISOString(),
          writers,
          inventory,
          scope: 'CATALOG_ONLY_NOT_BACKUP_OR_QUIESCENCE_PROOF',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function createBackup(url: URL, output: string, writersFile: string) {
  backupCheck(isAbsolute(output), 'Use an absolute backup output path');
  const parent = dirname(output);
  await privatePath(parent, true);
  backupCheck(
    (await realpath(parent)) === resolve(parent),
    'Backup parent must not traverse symbolic links',
  );
  const writers = writerInventory(JSON.parse(await readFile(writersFile, 'utf8')));
  await mkdir(output, { mode: 0o700 }); // Exclusive: never reuse/overwrite a prior run.
  await privatePath(output, true);
  const credentials = await toolEnvironment(url, output);
  const client = database(url);
  const startedAt = new Date().toISOString();
  try {
    const dumpMajor = await toolVersion('pg_dump'),
      restoreMajor = await toolVersion('pg_restore');
    const inventory = await client.begin(
      'ISOLATION LEVEL REPEATABLE READ READ ONLY',
      async (sql) => {
        await sessionSettings(sql);
        const major = await assertIdentity(sql, url);
        backupCheck(
          major === dumpMajor && major === restoreMajor,
          'Source and pg_dump/pg_restore major versions must match',
        );
        const tables = await sql<{ schema: string; name: string }[]>`
        SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=ANY(${[...backupSchemas]}) AND c.relkind IN ('r','p','m') ORDER BY 1,2`;
        for (const table of tables)
          await sql`LOCK TABLE ${qualifiedRelation(sql, table.schema, table.name)} IN ACCESS SHARE MODE`;
        const metadata = await catalog(sql);
        const before = await sequenceProofs(sql);
        const tablesProof = await tableProofs(sql);
        const [snapshot] = await sql<
          { snapshot: string }[]
        >`SELECT pg_export_snapshot() AS snapshot`;
        await privateWrite(join(output, 'application.dump'), '');
        await toolRun(
          'pg_dump',
          [
            '--format=custom',
            '--strict-names',
            ...backupSchemas.map((schema) => `--schema=${schema}`),
            '--no-password',
            '--lock-wait-timeout=5s',
            `--snapshot=${snapshot!.snapshot}`,
            `--file=${join(output, 'application.dump')}`,
          ],
          credentials.env,
        );
        const after = await sequenceProofs(sql);
        return {
          ...metadata,
          tableProofs: tablesProof,
          sequenceBefore: before,
          sequenceAfter: after,
          sequencesStable: JSON.stringify(before) === JSON.stringify(after),
        };
      },
    );
    await privateWrite(join(output, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
    await privateWrite(join(output, 'writers.json'), JSON.stringify(writers, null, 2) + '\n');
    const list = await toolRun(
      'pg_restore',
      ['--list', join(output, 'application.dump')],
      credentials.env,
    );
    for (const schema of backupSchemas)
      backupCheck(list.includes(schema), 'Archive list lacks a required schema');
    await privateWrite(join(output, 'archive.list'), list);
    const artifacts = [];
    for (const name of files) {
      await privatePath(join(output, name), false);
      artifacts.push({
        name,
        bytes: (await lstat(join(output, name))).size,
        sha256: await fileHash(join(output, name)),
      });
    }
    // Commit marker is last. A failed/partial directory must never count as a complete backup.
    await privateWrite(
      join(output, 'manifest.json'),
      JSON.stringify(
        {
          format: 'NUMORA_APPLICATION_BACKUP_V1',
          startedAt,
          completedAt: new Date().toISOString(),
          schemas: backupSchemas,
          sourceMajor: dumpMajor,
          archiveFormat: 'postgresql-custom',
          ownership: 'original-source-owners-and-acls',
          artifacts,
          excluded: [
            'Supabase Auth/Storage',
            'cluster role passwords',
            'Redis',
            'R2 object bytes',
            'server files/WAL',
          ],
          recoveryStatus: 'NOT_REHEARSED',
          sequenceConsistency: inventory.sequencesStable
            ? 'OBSERVED_STABLE'
            : 'CHANGED_DURING_BACKUP',
          externalDependencies: inventory.dependencies.length,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await client.end({ timeout: 5 });
    await credentials.cleanup();
  }
}

type Inventory = Awaited<ReturnType<typeof catalog>> & {
  tableProofs: Awaited<ReturnType<typeof tableProofs>>;
  sequenceBefore: Awaited<ReturnType<typeof sequenceProofs>>;
  sequenceAfter: Awaited<ReturnType<typeof sequenceProofs>>;
  sequencesStable: boolean;
};

export async function verifyBackup(folder: string) {
  backupCheck(isAbsolute(folder), 'Use an absolute backup path');
  await privatePath(folder, true);
  backupCheck(
    (await realpath(folder)) === resolve(folder),
    'Backup path must not traverse symbolic links',
  );
  await privatePath(join(folder, 'manifest.json'), false);
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  backupCheck(
    manifest.format === 'NUMORA_APPLICATION_BACKUP_V1' &&
      JSON.stringify(manifest.schemas) === JSON.stringify(backupSchemas) &&
      Number.isInteger(manifest.sourceMajor) &&
      Array.isArray(manifest.artifacts) &&
      manifest.artifacts.length === files.length,
    'Unsupported backup manifest or incomplete scope',
  );
  backupCheck(
    (await readdir(folder)).sort().join(',') === [...files, 'manifest.json'].sort().join(','),
    'Backup directory has missing, unexpected or unfinished files',
  );
  for (const name of files) {
    const artifact = manifest.artifacts.filter((item: { name: string }) => item?.name === name);
    backupCheck(artifact.length === 1, 'Manifest has missing or duplicate artifacts');
    const path = join(folder, name);
    await privatePath(path, false);
    backupCheck(
      (await lstat(path)).size === artifact[0].bytes &&
        (await fileHash(path)) === artifact[0].sha256,
      'Backup checksum or byte length mismatch',
    );
  }
  const inventory = JSON.parse(await readFile(join(folder, 'inventory.json'), 'utf8')) as Inventory;
  writerInventory(JSON.parse(await readFile(join(folder, 'writers.json'), 'utf8')));
  return { manifest, inventory };
}

/** Only restores original owners/ACLs to a new, empty localhost rehearsal target. No production cutover. */
export async function rehearseBackup(url: URL, folder: string, report: string) {
  const { manifest, inventory } = await verifyBackup(folder);
  backupCheck(
    url.hostname === 'localhost' &&
      /^\/numora_restore_test_[a-f0-9]{32}$/.test(url.pathname) &&
      decodeURIComponent(url.pathname.slice(1)) !== inventory.identity.database,
    'Rehearsal target must be a separate owned localhost database',
  );
  backupCheck(
    inventory.dependencies.length === 0 && inventory.sequencesStable,
    'External dependencies or changing sequences require a reviewed expanded rehearsal',
  );
  backupCheck(
    isAbsolute(report) && basename(report) !== 'manifest.json' && dirname(report) !== folder,
    'Use a new report outside the immutable backup directory',
  );
  await privatePath(dirname(report), true);
  backupCheck(
    (await realpath(dirname(report))) === resolve(dirname(report)),
    'Report parent must not traverse symbolic links',
  );
  try {
    await lstat(report);
    throw new BackupError('Restore report already exists; use a new report path');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  const client = database(url);
  const temporary = join(dirname(report), `.numora-restore-${process.pid}`);
  await mkdir(temporary, { mode: 0o700 });
  const credentials = await toolEnvironment(url, temporary);
  try {
    backupCheck(
      (await toolVersion('pg_restore')) === manifest.sourceMajor,
      'Restore tool must match archive major',
    );
    await client.begin('READ ONLY', async (sql) => {
      await sessionSettings(sql);
      backupCheck(
        (await assertIdentity(sql, url)) === manifest.sourceMajor,
        'Rehearsal server major must match source',
      );
      const schemas =
        await sql`SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema'`;
      backupCheck(
        schemas.length === 0,
        'Rehearsal database must have no user schemas, including public; never overwrite an existing target',
      );
      const [ownership] =
        await sql`SELECT pg_get_userbyid(datdba)=session_user AS owned FROM pg_database WHERE datname=current_database()`;
      backupCheck(
        ownership?.owned === true,
        'Rehearsal login must own its disposable target database',
      );
      const available = await sql<{ rolname: string }[]>`SELECT rolname FROM pg_roles`;
      const needed = new Set<string>([
        ...inventory.namespaces.map((row) => row.owner),
        ...inventory.relations.map((row) => row.owner),
        ...inventory.functions.map((row) => row.owner),
        ...inventory.types.map((row) => row.owner),
        'numora_main_runtime',
        'numora_irt_runtime',
      ]);
      backupCheck(
        [...needed].every((role) => available.some((item) => item.rolname === role)),
        'Restore requires reviewed source owner/runtime roles; no cluster roles are automatically imported',
      );
    });
    // The read-only source defaults never carry into the restore utility.
    const env = { ...credentials.env, PGOPTIONS: '-c statement_timeout=300000' };
    await toolRun(
      'pg_restore',
      [
        '--no-password',
        '--exit-on-error',
        '--single-transaction',
        `--dbname=${decodeURIComponent(url.pathname.slice(1))}`,
        join(folder, 'application.dump'),
      ],
      env,
    );
    // pg_dump treats PUBLIC USAGE on the initdb public schema as its initial baseline.
    // A truly empty target has no such schema; reproduce only the source's recorded baseline.
    if (
      inventory.namespaces.some((schema) => schema.name === 'public' && schema.publicUsage === true)
    )
      await client.begin('READ WRITE', async (sql) => {
        await sql.unsafe('GRANT USAGE ON SCHEMA public TO PUBLIC');
      });
    await client.begin('ISOLATION LEVEL REPEATABLE READ READ ONLY', async (sql) => {
      await sessionSettings(sql);
      const restored = await catalog(sql);
      backupCheck(
        stableCatalog(restored) === stableCatalog(inventory),
        'Restored schema, ACL, policy, trigger or migration evidence differs',
      );
      backupCheck(
        JSON.stringify(await tableProofs(sql)) === JSON.stringify(inventory.tableProofs),
        'Restored table counts or row fingerprints differ',
      );
      backupCheck(
        JSON.stringify(await sequenceProofs(sql)) === JSON.stringify(inventory.sequenceAfter),
        'Restored sequence values differ',
      );
    });
    await privateWrite(
      report,
      JSON.stringify(
        {
          format: 'NUMORA_RESTORE_REHEARSAL_V1',
          completedAt: new Date().toISOString(),
          manifestSha256: await fileHash(join(folder, 'manifest.json')),
          result: 'PASS',
          checked: [
            'schema-definitions-and-acls',
            'table-counts-and-row-fingerprints',
            'migration-history',
            'sequence-values',
          ],
          scope: 'LOCAL_ORIGINAL_OWNER_REHEARSAL_NOT_VPS_CUTOVER',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await client.end({ timeout: 5 });
    await credentials.cleanup();
    // Own empty temporary directory only; no recursive delete or database drop.
    const { rmdir } = await import('node:fs/promises');
    await rmdir(temporary);
  }
}

export function backupFailure(error: unknown) {
  return error instanceof BackupError
    ? error.message
    : 'Backup operation failed; no recovery acceptance is recorded. Check private configuration, permissions and utility compatibility.';
}

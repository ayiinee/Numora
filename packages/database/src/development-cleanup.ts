import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { allowSyntheticContent, developmentProjectRef } from './package-runtime.js';

async function main() {
  const root = resolve(__dirname, '../../..');
  const manifestBytes = await readFile(
    resolve(root, 'packages/database/seeds/development-cleanup.json'),
  );
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const manifest = JSON.parse(manifestBytes.toString()) as {
    projectRef: string;
    changes: { table: string; field: string; id: string; original: string; replacement: string }[];
  };
  const fields: Record<string, string[]> = {
    users: ['display_name'],
    schools: ['name'],
    classes: ['name'],
    chapters: ['name'],
    subchapters: ['name'],
    levels: ['description'],
    competencies: ['description'],
    feedback: ['body'],
    notifications: ['title', 'body'],
    assessment_packages: ['status'],
  };
  if (!allowSyntheticContent() || manifest.projectRef !== developmentProjectRef)
    throw new Error('Cleanup requires verified Development/test isolation.');
  const apply = process.argv.includes('--apply');
  const local = process.env.NODE_ENV === 'test';
  let backupHash: string | null = null;
  if (apply) {
    const path = process.env.CLEANUP_BACKUP_PATH;
    if (!path || !process.env.CLEANUP_BACKUP_SHA256)
      throw new Error('A checked backup is required.');
    backupHash = hash(await readFile(path));
    if (backupHash !== process.env.CLEANUP_BACKUP_SHA256)
      throw new Error('Backup checksum mismatch.');
    if (!local) {
      const rehearsal = JSON.parse(
        await readFile(process.env.CLEANUP_REHEARSAL_PATH ?? '', 'utf8'),
      );
      if (
        !rehearsal.applied ||
        !rehearsal.local ||
        rehearsal.backupHash !== backupHash ||
        rehearsal.manifestHash !== hash(manifestBytes) ||
        !rehearsal.integrityPreserved
      )
        throw new Error('Matching isolated restore rehearsal is required.');
    }
  }
  const client = postgres(process.env.DATABASE_URL!, {
    max: 1,
    ssl: local ? false : 'require',
    onnotice: () => {},
  });
  try {
    const report = await client.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('numora-development-cleanup-20261006'))`;
      const tables = await tx<
        { table_name: string }[]
      >`select table_name from information_schema.tables
      where table_schema='public' and table_type='BASE TABLE' order by table_name`;
      // Exclude only the explicitly mutable presentation/status fields. All other truth stays identical.
      const fingerprints = async () => {
        const result: Record<string, unknown> = {};
        for (const { table_name: table } of tables) {
          const [row] = await tx.unsafe(
            `select count(*)::int as count,
          md5(coalesce(string_agg(value::text, '' order by value::text),'')) as digest
          from (select to_jsonb(t) - $1::text[] as value from public."${table}" t) checked`,
            [fields[table] ?? []],
          );
          result[table] = row;
        }
        return result;
      };
      const before = await fingerprints();
      const changed: Record<string, number> = {},
        replay: Record<string, number> = {};
      for (const entry of manifest.changes) {
        if (!fields[entry.table]?.includes(entry.field)) throw new Error('Invalid cleanup field.');
        const [row] = await tx.unsafe(
          `select "${entry.field}" as value from public."${entry.table}"
        where id=$1::uuid for update`,
          [entry.id],
        );
        if (row?.value === entry.replacement) {
          replay[entry.table] = (replay[entry.table] ?? 0) + 1;
          continue;
        }
        if (row?.value !== entry.original)
          throw new Error(`Expected-value mismatch: ${entry.table}/${entry.id}`);
        changed[entry.table] = (changed[entry.table] ?? 0) + 1;
        if (apply)
          await tx.unsafe(
            `update public."${entry.table}" set "${entry.field}"=$1
        where id=$2::uuid and "${entry.field}"::text=$3`,
            [entry.replacement, entry.id, entry.original],
          );
      }
      const after = await fingerprints();
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error('Protected data changed; rollback.');
      return {
        applied: apply,
        local,
        manifestHash: hash(manifestBytes),
        backupHash,
        integrityPreserved: true,
        changed,
        replay,
        before,
        after,
      };
    });
    if (process.env.CLEANUP_REPORT_PATH)
      await writeFile(process.env.CLEANUP_REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, before: undefined, after: undefined }));
  } catch (error) {
    console.error(
      error instanceof Error &&
        /^(Expected-value|Protected data|Invalid cleanup)/.test(error.message)
        ? error.message
        : 'Cleanup failed; transaction rolled back. Connection details suppressed.',
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
void main().catch(() => {
  console.error('Cleanup preflight failed. No data changed.');
  process.exitCode = 1;
});

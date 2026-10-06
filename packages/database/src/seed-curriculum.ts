import postgres from 'postgres';
import { requireTlsDatabaseUrl } from './client.js';
import {
  CurriculumConflict,
  loadCurriculumMaster,
  postgresCurriculumDatabase,
  readCurriculumPlan,
  seedCurriculumMaster,
} from './curriculum-master.js';

export function curriculumCloudTarget(env: NodeJS.ProcessEnv) {
  const ref = env.SUPABASE_PROJECT_REF;
  const raw = env.DATABASE_MIGRATION_URL;
  if (!ref || !/^[a-z0-9]{20}$/.test(ref) || !raw)
    throw new Error('SUPABASE_PROJECT_REF and DATABASE_MIGRATION_URL are required.');
  const url = new URL(requireTlsDatabaseUrl(raw));
  const direct = url.hostname === `db.${ref}.supabase.co` && url.username === 'postgres';
  const pooler =
    /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    decodeURIComponent(url.username) === `postgres.${ref}`;
  if ((!direct && !pooler) || (url.port || '5432') !== '5432' || url.pathname !== '/postgres')
    throw new Error(
      'Database connection must match the Supabase project ref and session port 5432.',
    );
  return { ref, databaseUrl: url.toString() };
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !['--dry-run', '--check', '--apply'].includes(args[0]!)))
    throw new Error('Use --dry-run, --check, or --apply.');
  const mode = args[0] ?? '--dry-run';
  const master = await loadCurriculumMaster();
  if (mode === '--dry-run') {
    console.log(
      JSON.stringify(
        {
          mode,
          databaseAccessed: false,
          status: master.status,
          source: master.source,
          chapters: master.chapters,
          subchapters: master.subchapters,
        },
        null,
        2,
      ),
    );
    return;
  }
  const { ref, databaseUrl } = curriculumCloudTarget(process.env);
  const client = postgres(databaseUrl, { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    const db = postgresCurriculumDatabase(client);
    if (mode === '--check') {
      const plan = await db.transaction(async (tx) => {
        await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await tx.query("SET LOCAL statement_timeout='30s'");
        return readCurriculumPlan(tx, master);
      });
      console.log(JSON.stringify({ mode, projectRef: ref, writes: false, plan }, null, 2));
      if (plan.conflicts.length) process.exitCode = 1;
    } else {
      const report = await seedCurriculumMaster(db, master);
      console.log(
        JSON.stringify({ mode, projectRef: ref, newStatus: 'DRAFT', ...report }, null, 2),
      );
    }
  } catch (error) {
    if (error instanceof CurriculumConflict) console.error(error.message);
    else
      console.error(
        'Curriculum operation failed. No partial seed is committed; check target, migrations and database permissions.',
      );
    process.exitCode = 1;
  } finally {
    await client.end({ timeout: 2 });
  }
}

// Importing the target validator in tests must never open a connection.
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/seed-curriculum.ts')) {
  void run().catch(() => {
    console.error(
      'Invalid curriculum seed arguments, manifest, or cloud connection configuration.',
    );
    process.exitCode = 1;
  });
}

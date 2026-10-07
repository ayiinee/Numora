import { allowSyntheticContent } from './package-runtime.js';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { resolve } from 'node:path';
import { requireTlsDatabaseUrl } from './client.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { seedPrdV06Demo } from './prd-v06-demo.js';

async function run() {
  if (!allowSyntheticContent()) throw new Error('Verified development fixture isolation required.');
  const ref = 'pkamenfnwmoeisccnrnk';
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.ALLOW_DEMO_SEED !== 'true' ||
    process.env.SUPABASE_URL !== `https://${ref}.supabase.co` ||
    !(
      (url.hostname === `db.${ref}.supabase.co` && url.username === 'postgres') ||
      (url.hostname.endsWith('.pooler.supabase.com') && url.username === `postgres.${ref}`)
    )
  ) {
    throw new Error(
      'Redesign seed requires explicit DEMO opt-in and the configured NUMORA development project.',
    );
  }
  const sql = postgres(requireTlsDatabaseUrl(url.toString()), { max: 1, connect_timeout: 10 });
  try {
    const seed = await readFile(resolve(__dirname, '../seeds/redesign-learning.sql'), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL lock_timeout='5s'");
      await tx.unsafe("SET LOCAL statement_timeout='30s'");
      await tx.unsafe(seed);
    });
    await drizzle(sql).transaction(async (tx) => seedPrdV06Demo(tx));
    const counts = await sql.unsafe(`SELECT
    (SELECT count(*)::int FROM levels WHERE subchapter_id='03000000-0000-4000-8000-000000000101') AS levels,
    count(*)::int AS packages,
    (SELECT count(*)::int FROM package_items pi JOIN assessment_packages p ON p.id=pi.package_id WHERE p.family_code LIKE 'DEMO-UI-L%') AS items
    FROM assessment_packages WHERE family_code LIKE 'DEMO-UI-L%' AND is_demo=true`);
    const rows = await sql.unsafe<
      {
        stem: { text: string };
        options: { id: string; content: { text: string } }[];
        key: { optionId: string };
        explanation: { text: string };
      }[]
    >(`SELECT v.stem, v.options_or_statements AS options, v.answer_key AS key, v.explanation
       FROM question_versions v
       JOIN package_items pi ON pi.question_version_id=v.id
       JOIN assessment_packages p ON p.id=pi.package_id
       WHERE p.family_code LIKE 'DEMO-UI-L%' AND p.is_demo=true`);
    for (const row of rows) {
      const constant = /x\^2 - (\d+)/.exec(row.stem.text);
      const coefficient = /x\^2 \+ (\d+)x/.exec(row.stem.text);
      const answer = constant
        ? Math.sqrt(Number(constant[1]))
        : (Number(coefficient?.[1]) / 2) ** 2;
      const correct = row.options.find((option) => option.id === row.key.optionId);
      if (
        row.options.length !== 4 ||
        new Set(row.options.map((option) => option.content.text)).size !== 4 ||
        Number(correct?.content.text) !== answer ||
        !row.explanation.text
      ) {
        throw new Error('DEMO question key or content verification failed.');
      }
    }
    if (
      counts[0]?.levels !== 5 ||
      counts[0]?.packages !== 10 ||
      counts[0]?.items !== 100 ||
      rows.length !== 100
    ) {
      throw new Error('DEMO content count verification failed.');
    }
    console.log(
      JSON.stringify({
        demoContent: counts,
        verifiedQuestionKeys: rows.length,
        usersOrProgressModified: false,
      }),
    );
  } catch {
    // Avoid logging connection details or arbitrary database error payloads.
    console.error('Redesign DEMO seed failed; transaction rolled back or verification failed.');
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 2 });
  }
}
void run().catch(() => {
  console.error('Redesign seed configuration is invalid.');
  process.exitCode = 1;
});

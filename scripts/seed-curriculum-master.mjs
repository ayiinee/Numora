import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const stagingProjectRef = 'pkamenfnwmoeisccnrnk';
export const masterPath = resolve(root, 'docs/data/curriculum-master.v0.6.json');
export const loadMaster = async () => JSON.parse(await readFile(masterPath, 'utf8'));

const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;
const unique = (items, key) => {
  if (new Set(items.map(key)).size !== items.length) throw new Error('Duplicate master key');
};

/** Fixed, reviewed fixture only; not a general-purpose Curriculum importer. */
export function validateMaster(m) {
  if (m?.schemaVersion !== 1 || m.status !== 'DRAFT' || !nonempty(m.batchCode))
    throw new Error('Expected version-1 DRAFT curriculum master');
  if (
    m.source?.documentId !== '1xqdU-DLVW3dlscxKOCb1H1MNPqIPgQFtgpGc-1Jbexg' ||
    m.source.primaryTabId !== 't.0' ||
    m.source.prdVersion !== '0.6' ||
    !nonempty(m.source.revisionId)
  )
    throw new Error('Missing primary source provenance');
  for (const [table, count] of Object.entries({
    chapters: 4,
    subchapters: 10,
    competencies: 23,
    levels: 50,
  })) {
    if (!Array.isArray(m[table]) || m[table].length !== count)
      throw new Error(`Expected ${count} ${table}`);
  }
  if (!Array.isArray(m.reviewItems) || !m.reviewItems.length)
    throw new Error('Keep Curriculum review flags');
  const chapterCodes = new Set(m.chapters.map((c) => c.code));
  for (const row of [...m.chapters, ...m.subchapters, ...m.competencies]) {
    if (!/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/.test(row.code)) throw new Error('Invalid code');
  }
  for (const row of [...m.chapters, ...m.subchapters]) {
    if (
      !nonempty(row.name) ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug) ||
      !Number.isInteger(row.sourceOrder) ||
      row.sourceOrder < 1 ||
      !Number.isInteger(row.sourceTableRow) ||
      row.sourceTableRow < 1
    )
      throw new Error('Invalid chapter/subchapter metadata');
  }
  unique(m.chapters, (c) => c.code);
  unique(m.chapters, (c) => c.slug);
  unique(m.chapters, (c) => c.sourceOrder);
  unique(m.subchapters, (s) => s.code);
  unique(m.subchapters, (s) => `${s.chapterCode}:${s.slug}`);
  unique(m.subchapters, (s) => `${s.chapterCode}:${s.sourceOrder}`);
  for (const s of m.subchapters) {
    if (!chapterCodes.has(s.chapterCode)) throw new Error('Unknown parent chapter');
  }
  const scope = (row) =>
    m.subchapters.some((s) => s.chapterCode === row.chapterCode && s.code === row.subchapterCode);
  unique(m.competencies, (c) => c.code);
  unique(m.competencies, (c) => c.sourceIndicatorNumber);
  for (const c of m.competencies) {
    if (
      !scope(c) ||
      !Number.isInteger(c.sourceIndicatorNumber) ||
      c.sourceIndicatorNumber < 1 ||
      c.sourceIndicatorNumber > 23 ||
      c.code !== `IND-${String(c.sourceIndicatorNumber).padStart(3, '0')}` ||
      !nonempty(c.description) ||
      !nonempty(c.sourceDescription) ||
      !Number.isInteger(c.sourceTableRow) ||
      c.sourceTableRow < 1
    )
      throw new Error('Invalid indicator scope/provenance');
  }
  const disputed = m.competencies.find((c) => c.code === 'IND-022');
  if (disputed.subchapterCode !== 'SC-DATA' || disputed.reviewRequired !== true)
    throw new Error('Indicator 22 must retain primary-table placement and review flag');
  unique(m.levels, (l) => `${l.chapterCode}:${l.subchapterCode}:${l.levelNumber}`);
  for (const l of m.levels) {
    if (
      !scope(l) ||
      !Number.isInteger(l.levelNumber) ||
      l.levelNumber < 1 ||
      l.levelNumber > 5 ||
      l.description !== null ||
      l.difficultyCriteria !== null
    )
      throw new Error('Levels must be 1–5 without invented difficulty criteria');
  }
  return m;
}

/** Operator connection only: matching Staging, TLS, direct/session port 5432. */
export function requireSeedTarget(env, apply = false) {
  if (env.SUPABASE_PROJECT_REF !== stagingProjectRef)
    throw new Error('Target must be Numora-Staging');
  if (apply && env.ALLOW_CURRICULUM_MASTER_SEED !== 'true')
    throw new Error('Apply requires ALLOW_CURRICULUM_MASTER_SEED=true');
  let url;
  try {
    url = new URL(env.DATABASE_MIGRATION_URL);
  } catch {
    throw new Error('DATABASE_MIGRATION_URL is required');
  }
  const direct =
    url.hostname === `db.${stagingProjectRef}.supabase.co` && url.username === 'postgres';
  const pooler =
    url.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(url.username) === `postgres.${stagingProjectRef}`;
  const tls = url.searchParams.getAll('sslmode');
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    (!direct && !pooler) ||
    (url.port || '5432') !== '5432' ||
    url.pathname !== '/postgres' ||
    !url.password ||
    url.hash ||
    [...url.searchParams.keys()].some((k) => k !== 'sslmode') ||
    tls.length !== 1 ||
    !['require', 'verify-full'].includes(tls[0])
  )
    throw new Error('Use the matching Staging operator URL on port 5432 with TLS');
  return env.DATABASE_MIGRATION_URL;
}

const literal = (value) =>
  `E'${JSON.stringify(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'::jsonb`;
export const masterFingerprint = (m) =>
  createHash('sha256').update(JSON.stringify(m)).digest('hex');

/** Transaction body: caller must BEGIN and COMMIT, or ROLLBACK for rehearsal. */
export function buildMasterSeedSql(m, runId = randomUUID()) {
  validateMaster(m);
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error('Invalid run ID');
  const payload = literal(m);
  let tag = '$curriculum_master$';
  while (payload.includes(tag)) tag = tag.slice(0, -1) + '_$';
  const audit = (type) => `INSERT INTO public.audit_logs(action,entity_type,entity_id,metadata)
    VALUES('CURRICULUM_MASTER_CREATED','${type}',entity_uuid,
      jsonb_build_object('batchCode',master->>'batchCode','runId','${runId}',
        'fingerprint','${masterFingerprint(m)}','operator','CLI','source',master->'source',
        'sourceItem',item,'reviewItems',master->'reviewItems','databaseDisplayOrder',actual_order));`;
  return `SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtext('numora:curriculum-master'));
LOCK TABLE public.chapters, public.subchapters, public.competencies, public.levels IN SHARE ROW EXCLUSIVE MODE;
DO ${tag}
DECLARE
  master jsonb := ${payload}; item jsonb; existing record;
  chapter_uuid uuid; subchapter_uuid uuid; entity_uuid uuid; actual_order integer;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(master->'chapters') ORDER BY (value->>'sourceOrder')::int LOOP
    SELECT * INTO existing FROM public.chapters WHERE code=item->>'code';
    entity_uuid := NULL; actual_order := NULL;
    IF FOUND THEN
      IF existing.slug IS DISTINCT FROM item->>'slug' OR existing.name IS DISTINCT FROM item->>'name'
        OR existing.status='ARCHIVED' THEN RAISE EXCEPTION 'Chapter mapping conflict: %',item->>'code'; END IF;
    ELSE
      IF EXISTS(SELECT 1 FROM public.chapters WHERE slug=item->>'slug'
        OR lower(trim(name)) IN (lower(trim(item->>'name')),lower(trim(item->>'sourceName'))))
        THEN RAISE EXCEPTION 'Chapter alias/slug conflict: %',item->>'code'; END IF;
      SELECT coalesce(max(display_order),0)+1 INTO actual_order FROM public.chapters;
      INSERT INTO public.chapters(code,slug,name,display_order,status)
        VALUES(item->>'code',item->>'slug',item->>'name',actual_order,'DRAFT') RETURNING id INTO entity_uuid;
      ${audit('chapter')}
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(master->'subchapters') LOOP
    SELECT id INTO STRICT chapter_uuid FROM public.chapters WHERE code=item->>'chapterCode';
    IF EXISTS(SELECT 1 FROM public.subchapters WHERE code=item->>'code' AND chapter_id<>chapter_uuid)
      THEN RAISE EXCEPTION 'Subchapter parent/alias/slug conflict: %',item->>'code'; END IF;
    SELECT * INTO existing FROM public.subchapters WHERE chapter_id=chapter_uuid AND code=item->>'code';
    entity_uuid := NULL; actual_order := NULL;
    IF FOUND THEN
      IF existing.slug IS DISTINCT FROM item->>'slug' OR existing.name IS DISTINCT FROM item->>'name'
        OR existing.status='ARCHIVED' THEN RAISE EXCEPTION 'Subchapter mapping conflict: %',item->>'code'; END IF;
    ELSE
      IF EXISTS(SELECT 1 FROM public.subchapters WHERE code=item->>'code'
        OR (chapter_id=chapter_uuid AND (slug=item->>'slug' OR lower(trim(name))=lower(trim(item->>'name')))))
        THEN RAISE EXCEPTION 'Subchapter parent/alias/slug conflict: %',item->>'code'; END IF;
      SELECT coalesce(max(display_order),0)+1 INTO actual_order FROM public.subchapters WHERE chapter_id=chapter_uuid;
      INSERT INTO public.subchapters(chapter_id,code,slug,name,display_order,status)
        VALUES(chapter_uuid,item->>'code',item->>'slug',item->>'name',actual_order,'DRAFT') RETURNING id INTO entity_uuid;
      ${audit('subchapter')}
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(master->'competencies') LOOP
    SELECT s.id INTO STRICT subchapter_uuid FROM public.subchapters s JOIN public.chapters c ON c.id=s.chapter_id
      WHERE c.code=item->>'chapterCode' AND s.code=item->>'subchapterCode';
    IF EXISTS(SELECT 1 FROM public.competencies WHERE code=item->>'code' AND subchapter_id<>subchapter_uuid)
      THEN RAISE EXCEPTION 'Indicator parent conflict: %',item->>'code'; END IF;
    SELECT * INTO existing FROM public.competencies WHERE subchapter_id=subchapter_uuid AND code=item->>'code';
    entity_uuid := NULL; actual_order := NULL;
    IF FOUND THEN
      IF existing.description IS DISTINCT FROM item->>'description' OR existing.status='ARCHIVED'
        THEN RAISE EXCEPTION 'Indicator mapping conflict: %',item->>'code'; END IF;
    ELSE
      IF EXISTS(SELECT 1 FROM public.competencies WHERE code=item->>'code')
        THEN RAISE EXCEPTION 'Indicator parent conflict: %',item->>'code'; END IF;
      INSERT INTO public.competencies(subchapter_id,code,description,status)
        VALUES(subchapter_uuid,item->>'code',item->>'description','DRAFT') RETURNING id INTO entity_uuid;
      ${audit('competency')}
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(master->'levels') LOOP
    SELECT s.id INTO STRICT subchapter_uuid FROM public.subchapters s JOIN public.chapters c ON c.id=s.chapter_id
      WHERE c.code=item->>'chapterCode' AND s.code=item->>'subchapterCode';
    SELECT * INTO existing FROM public.levels WHERE subchapter_id=subchapter_uuid AND level_number=(item->>'levelNumber')::int;
    entity_uuid := NULL; actual_order := NULL;
    IF FOUND THEN
      IF existing.status='ARCHIVED' THEN RAISE EXCEPTION 'Archived level conflict: %',item->>'subchapterCode'; END IF;
      -- Existing approved descriptions/criteria are retained; null in fixture means unspecified.
    ELSE
      INSERT INTO public.levels(subchapter_id,level_number,status)
        VALUES(subchapter_uuid,(item->>'levelNumber')::int,'DRAFT') RETURNING id INTO entity_uuid;
      ${audit('level')}
    END IF;
  END LOOP;
END ${tag};`;
}

export async function seedMaster(client, m, { apply = false } = {}) {
  const runId = randomUUID();
  const rollback = new Error('CURRICULUM_DRY_RUN_ROLLBACK');
  let report;
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(buildMasterSeedSql(m, runId));
      const created = await tx`SELECT entity_type, count(*)::int AS count FROM public.audit_logs
        WHERE action='CURRICULUM_MASTER_CREATED' AND metadata->>'runId'=${runId} GROUP BY entity_type ORDER BY entity_type`;
      report = {
        mode: apply ? 'APPLIED' : 'ROLLED_BACK_DRY_RUN',
        runId,
        created,
        fixture: { chapters: 4, subchapters: 10, competencies: 23, levels: 50 },
      };
      if (!apply) throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !['--dry-run', '--apply', '--help'].includes(args[0])))
    throw new Error('Use no arguments (offline plan), --dry-run, or --apply');
  if (args[0] === '--help') {
    console.log(
      'db:seed:curriculum [--dry-run | --apply]\nDefault: validate fixture offline. Dry-run: transaction rolled back. Apply: Staging + explicit env flag.',
    );
    return;
  }
  const m = validateMaster(await loadMaster());
  if (!args.length) {
    console.log(
      JSON.stringify(
        {
          mode: 'OFFLINE_PLAN',
          status: m.status,
          batchCode: m.batchCode,
          counts: {
            chapters: m.chapters.length,
            subchapters: m.subchapters.length,
            competencies: m.competencies.length,
            levels: m.levels.length,
          },
          reviewItems: m.reviewItems,
        },
        null,
        2,
      ),
    );
    return;
  }
  const apply = args[0] === '--apply';
  const url = requireSeedTarget(process.env, apply);
  const require = createRequire(resolve(root, 'packages/database/package.json'));
  const postgres = require('postgres');
  const client = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    connection: { application_name: 'numora-curriculum-master-seeder' },
  });
  try {
    console.log(JSON.stringify(await seedMaster(client, m, { apply }), null, 2));
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Connection errors may contain secrets: emit only our validation messages or SQLSTATE.
    const safe = [
      'Expected',
      'Missing',
      'Keep',
      'Duplicate',
      'Invalid',
      'Unknown',
      'Indicator',
      'Levels',
      'Target',
      'Apply',
      'DATABASE_MIGRATION_URL',
      'Use',
    ];
    const mapping =
      /^(Chapter mapping|Chapter alias\/slug|Subchapter mapping|Subchapter parent\/alias\/slug|Indicator mapping|Indicator parent|Archived level) conflict: [A-Z0-9-]+$/;
    console.error(
      safe.some((s) => error.message.startsWith(s)) || mapping.test(error.message)
        ? error.message
        : `Curriculum seed failed (SQLSTATE ${/^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'unavailable'}); inspect target before retry.`,
    );
    process.exitCode = 1;
  });
}

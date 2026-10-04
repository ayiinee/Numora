import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { verifyReceipt } from './upload-question-media.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sampleDir = resolve(root, 'docs/data/samples/2026-10-03');
const quote = (value) =>
  `E'${JSON.stringify(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'::jsonb`;
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
};
export const fingerprint = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

export async function loadSampleBundle() {
  const load = async (name) => JSON.parse(await readFile(resolve(sampleDir, name), 'utf8'));
  return {
    questions: await load('questions.draft.json'),
    master: await load('master-data.proposed.json'),
  };
}

export async function validateSampleBundle(bundle) {
  const schema = JSON.parse(
    await readFile(resolve(root, 'packages/contracts/questions/question.schema.json'), 'utf8'),
  );
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  const ids = new Set();
  if (bundle.questions.length !== 10)
    throw new Error('This operator fixture imports exactly ten samples.');
  for (const q of bundle.questions) {
    if (!validate(q)) throw new Error(`${q.externalId}: ${JSON.stringify(validate.errors)}`);
    if (ids.has(q.externalId)) throw new Error('Duplicate externalId');
    ids.add(q.externalId);
    if (
      q.metadata.contentStatus !== 'DRAFT' ||
      q.metadata.variantKind !== 'ORIGINAL' ||
      q.difficulty !== null
    )
      throw new Error('Fixture must be ORIGINAL/DRAFT with null difficulty.');
    if (
      q.metadata.sourceNamespace !== 'CURRICULUM_SHEETS_SAMPLE' ||
      !/^CURR-IND\d+-L01-Q\d+$/.test(q.externalId)
    )
      throw new Error('Unsupported source identity');
    if (q.metadata.sourceLevelNumber !== 1 || q.levelCode !== null)
      throw new Error('Unexpected source level');
    if (
      !bundle.master.competencies.some(
        (c) =>
          c.chapterCode === q.chapterCode &&
          c.subchapterCode === q.subchapterCode &&
          c.code === q.competencyCode,
      )
    )
      throw new Error('Unknown competency scope');
    if (
      !bundle.master.levels.some(
        (l) =>
          l.chapterCode === q.chapterCode &&
          l.subchapterCode === q.subchapterCode &&
          l.levelNumber === q.metadata.sourceLevelNumber,
      )
    )
      throw new Error('Unknown level scope');
    const optionIds = q.options.map((o) => o.id);
    if (new Set(optionIds).size !== optionIds.length || !optionIds.length)
      throw new Error('Invalid option IDs');
    const validOption = (id) => optionIds.includes(id);
    if (
      q.type === 'SINGLE_CHOICE' &&
      (Object.keys(q.answer).join() !== 'optionId' || !validOption(q.answer.optionId))
    )
      throw new Error('Invalid PG key');
    if (q.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER') {
      const keys = q.answer.optionIds;
      if (
        Object.keys(q.answer).join() !== 'optionIds' ||
        !Array.isArray(keys) ||
        !keys.length ||
        new Set(keys).size !== keys.length ||
        !keys.every(validOption)
      )
        throw new Error('Invalid MCMA key');
    }
    if (q.type === 'CATEGORY') {
      const categories = q.metadata.categories?.map((c) => c.id) ?? [];
      const answers = q.answer.categoryByStatementId;
      if (
        Object.keys(q.answer).join() !== 'categoryByStatementId' ||
        !categories.length ||
        new Set(categories).size !== categories.length ||
        !answers ||
        Object.keys(answers).length !== optionIds.length ||
        !optionIds.every((id) => categories.includes(answers[id]))
      )
        throw new Error('Invalid category key');
    }
    const assets = q.metadata.assetManifest;
    if (!Array.isArray(assets) || new Set(assets.map((a) => a.assetId)).size !== assets.length)
      throw new Error('Invalid media manifest');
    const referencedAssets = new Set();
    const blocks = [
      { rich: q.stem, placement: 'STEM', itemId: null },
      { rich: q.explanation, placement: 'EXPLANATION', itemId: null },
      ...q.options.map((o) => ({
        rich: o.content,
        placement: q.type === 'CATEGORY' ? 'STATEMENT' : 'OPTION',
        itemId: o.id,
      })),
    ];
    for (const { rich, placement, itemId } of blocks) {
      const markers = [...rich.text.matchAll(/\[\[asset:([^\]]+)\]\]/g)].map((m) => m[1]);
      const expected = assets.filter((a) => a.placement === placement && a.itemId === itemId);
      const keys = expected
        .filter((a) => a.uploadedToR2 === true)
        .sort((a, b) => a.assetOrder - b.assetOrder)
        .map((a) => a.objectKey);
      if (JSON.stringify(rich.assetKeys ?? []) !== JSON.stringify(keys))
        throw new Error('Media keys do not match verified placement/order');
      for (const id of markers) {
        if (!expected.some((a) => a.assetId === id))
          throw new Error('Unresolved or misplaced asset');
        referencedAssets.add(id);
      }
    }
    for (const a of assets) {
      if (
        !referencedAssets.has(a.assetId) ||
        a.bucket !== 'numora-bucket' ||
        a.externalId !== q.externalId ||
        !Number.isInteger(a.assetOrder) ||
        a.assetOrder < 1
      )
        throw new Error('Invalid referenced R2 asset identity/order');
      if (a.uploadedToR2 === true) {
        if (
          a.uploadStatus !== 'VERIFIED_BY_BACKEND' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            a.uploadId ?? '',
          ) ||
          !Number.isFinite(Date.parse(a.verifiedAt))
        )
          throw new Error('Uploaded asset needs a valid backend receipt');
        verifyReceipt(a, { ...a, status: 'VERIFIED' });
      } else if (
        a.uploadedToR2 !== false ||
        a.objectKey !== null ||
        a.uploadId != null ||
        a.verifiedAt != null
      ) {
        throw new Error('Pending asset must not claim a final key/receipt');
      }
      if (!/^images\/[A-Za-z0-9_-]+\.png$/.test(a.fileReference))
        throw new Error('Unsafe asset path');
      const bytes = await readFile(resolve(sampleDir, a.fileReference));
      if (
        createHash('sha256').update(bytes).digest('hex') !== a.sha256 ||
        bytes.length !== a.byteLength
      )
        throw new Error('Asset checksum/length mismatch');
    }
  }
}

/** Generates operator SQL only. It does not connect to a database or apply migrations. */
export async function prepareSampleImport(bundle) {
  bundle ??= await loadSampleBundle();
  await validateSampleBundle(bundle);
  const payload = bundle.questions.map((q) => ({ source: q, fingerprint: fingerprint(q) }));
  let blockTag = '$sample_import$';
  let suffix = 0;
  const literals = quote(bundle.master) + quote(payload);
  while (literals.includes(blockTag)) blockTag = `$sample_import_${++suffix}$`;
  return `-- Ten Curriculum preview samples. DRAFT only; no package, scoring or auth writes.
-- Apply tracked 0023_draft_difficulty first on a reconciled, backed-up test target.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('numora:curriculum-sample-2026-10-03'));
LOCK TABLE public.chapters, public.subchapters, public.competencies, public.levels,
  public.questions, public.question_variants, public.question_versions IN SHARE ROW EXCLUSIVE MODE;
DO ${blockTag}
DECLARE
  master jsonb := ${quote(bundle.master)};
  payload jsonb := ${quote(payload)};
  item jsonb; source jsonb; asset jsonb; existing public.question_versions%ROWTYPE;
  chapter_uuid uuid; subchapter_uuid uuid; competency_uuid uuid; level_uuid uuid;
  question_uuid uuid; variant_uuid uuid; version_uuid uuid; n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='question_versions' AND column_name='difficulty' AND is_nullable='NO')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.question_versions'::regclass
      AND conname='question_versions_ready_difficulty_ck') THEN
    RAISE EXCEPTION 'Apply the reviewed draft-difficulty migration before importing';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(master->'chapters') LOOP
    SELECT id INTO chapter_uuid FROM public.chapters WHERE code=item->>'code';
    IF chapter_uuid IS NULL THEN
      INSERT INTO public.chapters(code,slug,name,display_order,status)
      SELECT item->>'code',item->>'slug',item->>'name',coalesce(max(display_order),0)+1,'DRAFT'
      FROM public.chapters RETURNING id INTO chapter_uuid;
    ELSIF NOT EXISTS (SELECT 1 FROM public.chapters WHERE id=chapter_uuid AND slug=item->>'slug' AND name=item->>'name') THEN
      RAISE EXCEPTION 'Chapter mapping conflict: %', item->>'code';
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(master->'subchapters') LOOP
    SELECT id INTO STRICT chapter_uuid FROM public.chapters WHERE code=item->>'chapterCode';
    SELECT id INTO subchapter_uuid FROM public.subchapters WHERE chapter_id=chapter_uuid AND code=item->>'code';
    IF subchapter_uuid IS NULL THEN
      INSERT INTO public.subchapters(chapter_id,code,slug,name,display_order,status)
      SELECT chapter_uuid,item->>'code',item->>'slug',item->>'name',coalesce(max(display_order),0)+1,'DRAFT'
      FROM public.subchapters WHERE chapter_id=chapter_uuid;
    ELSIF NOT EXISTS (SELECT 1 FROM public.subchapters WHERE id=subchapter_uuid AND slug=item->>'slug' AND name=item->>'name') THEN
      RAISE EXCEPTION 'Subchapter mapping conflict: %', item->>'code';
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(master->'competencies') LOOP
    SELECT s.id INTO STRICT subchapter_uuid FROM public.subchapters s JOIN public.chapters c ON c.id=s.chapter_id
      WHERE c.code=item->>'chapterCode' AND s.code=item->>'subchapterCode';
    SELECT id INTO competency_uuid FROM public.competencies WHERE subchapter_id=subchapter_uuid AND code=item->>'code';
    IF competency_uuid IS NULL THEN
      INSERT INTO public.competencies(subchapter_id,code,description,status)
      VALUES(subchapter_uuid,item->>'code',item->>'description','DRAFT');
    ELSIF NOT EXISTS (SELECT 1 FROM public.competencies WHERE id=competency_uuid AND description=item->>'description') THEN
      RAISE EXCEPTION 'Competency mapping conflict: %', item->>'code';
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(master->'levels') LOOP
    SELECT s.id INTO STRICT subchapter_uuid FROM public.subchapters s JOIN public.chapters c ON c.id=s.chapter_id
      WHERE c.code=item->>'chapterCode' AND s.code=item->>'subchapterCode';
    INSERT INTO public.levels(subchapter_id,level_number,status)
      VALUES(subchapter_uuid,(item->>'levelNumber')::integer,'DRAFT')
      ON CONFLICT(subchapter_id,level_number) DO NOTHING;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
    source := item->'source';
    -- Local JSON is not proof of upload: confirm every claimed receipt on this same database target.
    FOR asset IN SELECT value FROM jsonb_array_elements(source->'metadata'->'assetManifest') LOOP
      IF asset->>'uploadedToR2'='true' THEN
        PERFORM id FROM public.content_media_uploads
          WHERE id=(asset->>'uploadId')::uuid AND status='VERIFIED'
            AND external_id=source->>'externalId' AND asset_id=asset->>'assetId'
            AND content_version=1 AND bucket=asset->>'bucket' AND object_key=asset->>'objectKey'
            AND content_type=asset->>'contentType' AND byte_length=(asset->>'byteLength')::integer
            AND sha256=asset->>'sha256' AND verified_at=(asset->>'verifiedAt')::timestamptz
          FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Media receipt not verified on target: %/%',source->>'externalId',asset->>'assetId'; END IF;
      END IF;
    END LOOP;
    SELECT k.id,l.id INTO STRICT competency_uuid,level_uuid FROM public.competencies k
      JOIN public.subchapters s ON s.id=k.subchapter_id JOIN public.chapters c ON c.id=s.chapter_id
      JOIN public.levels l ON l.subchapter_id=s.id AND l.level_number=(source->'metadata'->>'sourceLevelNumber')::integer
      WHERE c.code=source->>'chapterCode' AND s.code=source->>'subchapterCode' AND k.code=source->>'competencyCode';
    SELECT count(*), (array_agg(id))[1] INTO n,question_uuid FROM public.questions WHERE source_ref=source->>'externalId';
    IF n>1 THEN RAISE EXCEPTION 'Duplicate source identity: %',source->>'externalId'; END IF;
    IF n=1 THEN
      IF NOT EXISTS (SELECT 1 FROM public.questions WHERE id=question_uuid AND primary_competency_id=competency_uuid
        AND curriculum_level_number=(source->'metadata'->>'sourceLevelNumber')::integer AND status='DRAFT') THEN
        RAISE EXCEPTION 'Question mapping/status conflict: %',source->>'externalId';
      END IF;
      SELECT v.* INTO STRICT existing FROM public.question_versions v JOIN public.question_variants r ON r.id=v.variant_id
        WHERE r.question_id=question_uuid AND r.variant_code='ORIGINAL' AND r.kind='ORIGINAL' AND v.version_number=1;
      IF existing.content_fingerprint IS DISTINCT FROM item->>'fingerprint'
        OR existing.content_status<>'DRAFT' OR existing.difficulty IS NOT NULL
        OR existing.level_id IS DISTINCT FROM level_uuid
        OR existing.stem IS DISTINCT FROM source->'stem'
        OR existing.options_or_statements IS DISTINCT FROM jsonb_build_object('options',source->'options','categories',coalesce(source->'metadata'->'categories','[]'::jsonb))
        OR existing.answer_key IS DISTINCT FROM source->'answer' OR existing.explanation IS DISTINCT FROM source->'explanation'
        OR existing.media IS DISTINCT FROM source->'metadata'->'assetManifest'
        OR existing.question_type::text IS DISTINCT FROM source->>'type'
        OR (SELECT count(*) FROM public.question_versions v JOIN public.question_variants r ON r.id=v.variant_id WHERE r.question_id=question_uuid)<>1 THEN
        RAISE EXCEPTION 'Existing content changed; use a reviewed revision importer: %',source->>'externalId';
      END IF;
      CONTINUE;
    END IF;
    INSERT INTO public.questions(primary_competency_id,curriculum_level_number,source_ref,status)
      VALUES(competency_uuid,(source->'metadata'->>'sourceLevelNumber')::integer,source->>'externalId','DRAFT') RETURNING id INTO question_uuid;
    INSERT INTO public.question_variants(question_id,variant_code,kind,origin)
      VALUES(question_uuid,'ORIGINAL','ORIGINAL','CURRICULUM_SHEETS_SAMPLE') RETURNING id INTO variant_uuid;
    INSERT INTO public.question_versions(variant_id,version_number,question_type,stem,options_or_statements,
      answer_key,explanation,media,difficulty,level_id,content_fingerprint,content_status,validation_state)
      VALUES(variant_uuid,1,(source->>'type')::public.question_type,source->'stem',
        jsonb_build_object('options',source->'options','categories',coalesce(source->'metadata'->'categories','[]'::jsonb)),
        source->'answer',source->'explanation',source->'metadata'->'assetManifest',NULL,level_uuid,item->>'fingerprint','DRAFT','DRAFT')
      RETURNING id INTO version_uuid;
    INSERT INTO public.audit_logs(action,entity_type,entity_id,metadata)
      VALUES('CURRICULUM_SAMPLE_DRAFT_IMPORTED','question_version',version_uuid,
        jsonb_build_object('operator','Reyhan / Data Engineering','execution','OPERATOR_SQL_FIXTURE',
          'sourceNamespace','CURRICULUM_SHEETS_SAMPLE','externalId',source->>'externalId',
          'fingerprint',item->>'fingerprint','sourcePayload',source));
  END LOOP;
END ${blockTag};
COMMIT;
SELECT q.source_ref,q.id AS question_id,v.id AS question_version_id,v.question_type,v.content_status,
  v.difficulty,q.curriculum_level_number,jsonb_array_length(v.media) AS media_count
FROM public.questions q JOIN public.question_variants r ON r.question_id=q.id
JOIN public.question_versions v ON v.variant_id=r.id
WHERE q.source_ref IN (SELECT value->'source'->>'externalId' FROM jsonb_array_elements(${quote(payload)}))
ORDER BY q.source_ref;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3)
    throw new Error('Usage: node scripts/prepare-draft-sample-import.mjs <output.sql>');
  const sql = await prepareSampleImport();
  await writeFile(resolve(process.argv[2]), sql, { flag: 'wx' });
  console.log(
    'Validated 10 DRAFT samples and asset checksums/receipts; SQL prepared. No database writes.',
  );
}

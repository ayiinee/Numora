import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { contentFingerprint } = requireApi('@tka/irt-orchestration');
const { decodeAssessmentContent } = requireApi('@tka/assessment-engine');

const request = '0516b1ce-9738-448e-8f0a-133ff513e9e7';
const sourcePackageId = 'c235f2e2-3057-4279-a97e-efd399799e57';
const originalPackageId = '331115ad-8569-468d-9382-e8577c7afd55';
const operation = 'tryout_curriculum_revision_20261124';
const pins = new Map([
  [10, '7046e1377883e20de6cc3210e9c1dd73798d11f39501949dd3ffb83c34902e58'],
  [16, 'e325d7585e57cef80c9cf5e2a9df1d4fce82e029500bdb1e18507f5762553bc9'],
  [17, '0d3ff25149123fd74720ff7cb30f1c5091ac360449332002c6408d0560044796'],
  [27, 'd1b9829365f49555dc69723abc193e3da3b07b3991554914151939624b891c59'],
]);

function replaceOnce(text, old, replacement) {
  if (typeof text !== 'string' || text.split(old).length !== 2)
    throw new Error('SOURCE_TEXT_MISMATCH');
  return text.replace(old, replacement);
}

export function reviseContent(position, source) {
  const revised = structuredClone(source);
  const stem = revised.stem;
  switch (position) {
    case 10:
      stem.text = replaceOnce(
        stem.text,
        '(27.000, 27.000, 31.000, 35.000)',
        '{23.000, 27.000, 31.000, 35.000}',
      );
      revised.answerKey = { optionId: 'B' };
      revised.explanation.text =
        'Untuk x=1, 2, 3, 4, nilai f(x) berturut-turut 23.000, 27.000, 31.000, dan 35.000. Klaim I benar. Pembayaran Rp39.000,00 memberi x=(39.000\u221219.000)/4.000=5 jam, di luar domain 1\u20134. Klaim II salah.\n\nJawaban: B.';
      break;
    case 16:
      stem.text = replaceOnce(
        stem.text,
        'Pemutar fair diputar satu kali.',
        'Sebuah pemutar seimbang diputar satu kali.',
      );
      break;
    case 17:
      stem.text = replaceOnce(
        stem.text,
        'Frekuensi waktu belajar harian: 1 jam=5 siswa; 2 jam=10; 3 jam=3; 4 jam=5; 5 jam=7. ',
        'Frekuensi waktu belajar harian:\n' +
          [5, 10, 3, 5, 7]
            .map((count, index) => `\u2022 ${index + 1} jam = ${count} siswa`)
            .join('\n') +
          '\n\n',
      );
      break;
    case 27:
      stem.text = replaceOnce(stem.text, 'Q=1x+24', 'Q=x+24');
      revised.explanation.text = replaceOnce(revised.explanation.text, '=1x+24=Q', '=x+24=Q');
      break;
    default:
      throw new Error('UNEXPECTED_REVISION_POSITION');
  }
  return revised;
}

function readItems(tx, packageId, lock) {
  return tx`select i.display_order, i.question_version_id, i.max_points, i.rubric_version_id,
    i.maximum_score_category, i.item_role, q.variant_id, q.parent_original_question_version_id,
    q.revised_from_question_version_id, q.level_id, q.content_fingerprint,
    v.question_id, v.kind, v.original_variant_id,
    jsonb_build_object('questionType',q.question_type,'stem',q.stem,
      'optionsOrStatements',q.options_or_statements,'answerKey',q.answer_key,
      'explanation',q.explanation,'media',q.media,'difficulty',q.difficulty,
      'rubricVersionId',q.scoring_rubric_version_id) as payload
    from public.package_items i join public.question_versions q on q.id=i.question_version_id
    join public.question_variants v on v.id=q.variant_id
    where i.package_id=${packageId} order by i.display_order ${lock ? tx`for share of i,q,v` : tx``}`;
}

export async function revisePackage(client, { expectedDigest = null } = {}) {
  const apply = expectedDigest !== null;
  return client.begin(apply ? '' : 'isolation level repeatable read read only', async (tx) => {
    await tx`set local statement_timeout='15s'`;
    await tx`set local lock_timeout='5s'`;
    const [source] = await tx`select p.content_revision,to_jsonb(p) as envelope
      from public.assessment_packages p join public.generator_packages g on g.canonical_package_id=p.id
      where p.id=${sourcePackageId} and g.id=${request} and g.source_package_id=${originalPackageId}
        and p.assessment_type='TRYOUT' and p.purpose='REGULAR' and not p.is_demo
      ${apply ? tx`for update of p` : tx``}`;
    if (!source) throw new Error('SOURCE_PACKAGE_MISMATCH');

    const rows = await readItems(tx, sourcePackageId, apply);
    const originals = await readItems(tx, originalPackageId, apply);
    if (
      rows.length !== 30 ||
      originals.length !== 30 ||
      new Set(rows.map((row) => row.question_id)).size !== 30 ||
      rows.some(
        (row, index) =>
          row.display_order !== index + 1 ||
          row.kind !== 'VARIANT' ||
          originals[index].display_order !== row.display_order ||
          originals[index].kind !== 'ORIGINAL' ||
          row.original_variant_id !== originals[index].variant_id ||
          row.parent_original_question_version_id !== originals[index].question_version_id ||
          row.rubric_version_id !== row.payload.rubricVersionId ||
          row.content_fingerprint !== contentFingerprint(row.payload),
      )
    )
      throw new Error('PACKAGE_COMPOSITION_MISMATCH');

    const edits = rows
      .filter((row) => pins.has(row.display_order))
      .map((row) => {
        if (
          pins.get(row.display_order) !== row.content_fingerprint ||
          row.payload.media?.length !== 0
        )
          throw new Error('SOURCE_QUESTION_MISMATCH');
        const payload = reviseContent(row.display_order, row.payload);
        decodeAssessmentContent(payload);
        return { row, payload, digest: contentFingerprint(payload) };
      });
    const digest = contentFingerprint({ source, rows, originals, edits });
    if (apply && expectedDigest !== digest) throw new Error('STALE_REVISION_PREVIEW');

    const [prior] = await tx`select entity_id,metadata from public.audit_logs
      where action=${operation} and metadata->>'sourcePackageId'=${sourcePackageId}
      order by created_at limit 1`;
    if (prior) {
      if (prior.metadata.digest !== digest) throw new Error('PREVIOUS_REVISION_CONFLICT');
      const [draft] = await tx`select to_jsonb(p) as envelope from public.assessment_packages p
        where p.id=${prior.entity_id} ${apply ? tx`for share of p` : tx``}`;
      if (!draft || contentFingerprint(draft.envelope) !== prior.metadata.draftFingerprint)
        throw new Error('PREVIOUS_DRAFT_CHANGED');
      const actual = await readItems(tx, prior.entity_id, apply);
      assertComposition(actual, rows, edits);
      return { status: 'REPLAYED', draftId: prior.entity_id, digest };
    }

    const changes = edits.map(({ row, payload, digest: fingerprint }) => ({
      position: row.display_order,
      previousVersionId: row.question_version_id,
      before: row.content_fingerprint,
      after: fingerprint,
      answer: payload.answerKey,
    }));
    if (!apply)
      return {
        status: 'DRY_RUN',
        digest,
        sourceRevision: source.content_revision,
        changes,
        reused: 26,
      };

    const versions = new Map();
    for (const { row, payload, digest: fingerprint } of [...edits].sort((a, b) =>
      a.row.variant_id.localeCompare(b.row.variant_id),
    )) {
      await tx`select id from public.question_variants where id=${row.variant_id} for update`;
      const [version] = await tx`insert into public.question_versions
        (variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,
          parent_original_question_version_id,revised_from_question_version_id,level_id,scoring_rubric_version_id,content_fingerprint)
        select q.variant_id,
          (select max(k.version_number)+1 from public.question_versions k where k.variant_id=q.variant_id),
          q.question_type,${tx.json(payload.stem)},q.options_or_statements,${tx.json(payload.answerKey)},
          ${tx.json(payload.explanation)},q.media,q.difficulty,q.parent_original_question_version_id,
          q.id,q.level_id,q.scoring_rubric_version_id,${fingerprint} from public.question_versions q
        where q.id=${row.question_version_id} returning id`;
      versions.set(row.display_order, version.id);
    }
    const [draft] = await tx`insert into public.assessment_packages
      (family_code,package_version,name,assessment_type,purpose,chapter_id,level_id,variant_index,duration_seconds,
        import_source,scoring_policy_version_id,content_revision,status)
      select p.family_code,
        (select max(s.package_version)+1 from public.assessment_packages s where s.family_code=p.family_code),
        p.name || ' - Revisi Kurikulum',p.assessment_type,p.purpose,p.chapter_id,p.level_id,p.variant_index,
        p.duration_seconds,jsonb_build_object('sourceNamespace','TRYOUT_CURRICULUM_REVISION','sourceName',p.name,
          'sourceReference',jsonb_build_object('sourcePackageId',p.id,'originalPackageId',${originalPackageId}::uuid,
            'generatorPackageId',${request}::uuid,'digest',${digest}::text)::text),
        p.scoring_policy_version_id,1,'DRAFT'
      from public.assessment_packages p where p.id=${sourcePackageId} returning id,to_jsonb(assessment_packages) as envelope`;
    const positions = rows.map((row) => versions.get(row.display_order) ?? row.question_version_id);
    await tx`insert into public.package_items
      (package_id,question_version_id,display_order,max_points,rubric_version_id,maximum_score_category,item_role)
      select ${draft.id},(${positions}::uuid[])[i.display_order],i.display_order,i.max_points,
        i.rubric_version_id,i.maximum_score_category,i.item_role
      from public.package_items i where i.package_id=${sourcePackageId}`;
    assertComposition(await readItems(tx, draft.id, false), rows, edits);
    await tx`insert into public.audit_logs(action,entity_type,entity_id,metadata)
      values(${operation},'assessment_package',${draft.id},
        jsonb_build_object('operatorDatabaseRole',current_user) || ${tx.json({ sourcePackageId, digest, changes, draftFingerprint: contentFingerprint(draft.envelope) })}::jsonb)`;
    return { status: 'CREATED', draftId: draft.id, digest, changes, reused: 26 };
  });
}

function assertComposition(actual, source, edits) {
  if (actual.length !== source.length) throw new Error('REVISED_COVERAGE_MISMATCH');
  const expected = new Map(edits.map((edit) => [edit.row.display_order, edit.digest]));
  for (const [index, row] of actual.entries()) {
    const before = source[index];
    const revisedDigest = expected.get(before.display_order);
    if (
      row.display_order !== before.display_order ||
      row.variant_id !== before.variant_id ||
      row.parent_original_question_version_id !== before.parent_original_question_version_id ||
      row.max_points !== before.max_points ||
      row.rubric_version_id !== before.rubric_version_id ||
      row.maximum_score_category !== before.maximum_score_category ||
      row.item_role !== before.item_role ||
      (revisedDigest
        ? row.revised_from_question_version_id !== before.question_version_id ||
          row.content_fingerprint !== revisedDigest ||
          contentFingerprint(row.payload) !== revisedDigest
        : row.question_version_id !== before.question_version_id)
    )
      throw new Error('REVISED_ITEM_MISMATCH');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (
    args.length &&
    (args.length !== 2 || args[0] !== '--apply' || !/^[a-f0-9]{64}$/.test(args[1]))
  )
    throw new Error('Usage: node scripts/revise-tryout-curriculum.mjs [--apply <dry-run digest>]');
  const require = createRequire(new URL('../packages/database/package.json', import.meta.url));
  const postgres = require('postgres');
  if (!process.env.TRYOUT_REVISION_DATABASE_URL)
    throw new Error('TRYOUT_REVISION_DATABASE_URL_REQUIRED');
  const client = postgres(process.env.TRYOUT_REVISION_DATABASE_URL, {
    max: 1,
    connect_timeout: 10,
  });
  try {
    console.log(
      JSON.stringify(await revisePackage(client, { expectedDigest: args[1] ?? null }), null, 2),
    );
  } catch (error) {
    console.error(error.code ?? error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

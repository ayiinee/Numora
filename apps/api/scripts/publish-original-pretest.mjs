// Owner-approved original Pretest release, 9 November 2026. Read-only unless --apply.
// Creates new package/question versions; never rewrites source versions or attempts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  decodeAssessmentContent,
  PRETEST_PARTIAL_POLICY,
  PRETEST_PARTIAL_CONFIGURATION,
  pretestPartialRubricDefinition,
} from '@tka/assessment-engine';
const require = createRequire(import.meta.url);
const postgres = require('postgres');
const apply = process.argv.includes('--apply');
const actor = process.argv.find((arg) => arg.startsWith('--actor='))?.slice(8);
const sources = [
  'ba11cea2-929d-4c1d-98ad-8703dfd16262',
  '6b51c9fa-ed80-41cf-931a-05e9a5e6f4bd',
  '8589e53d-444b-4f67-b163-71bd24c69037',
  '9219f548-09cd-4e77-adbd-7fb7931a22bb',
];
const reference = 'PROJECT_OWNER_2026_11_09_PRETEST_ORIGINAL_PARTIAL_AND_TWO_CORRECTIONS';
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const hash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
if (apply && !process.env.DATABASE_MIGRATION_URL)
  throw new Error('DATABASE_MIGRATION_URL is required for publication.');
if (apply && !actor)
  throw new Error('--apply requires an explicit --actor=<active-content-admin-id>');
const sql = postgres(apply ? process.env.DATABASE_MIGRATION_URL : process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 15,
  onnotice: () => {},
});

function correction(externalId, version) {
  const corrected = structuredClone(version);
  if (externalId === 'pretest-b3-q05') {
    const options = Array.isArray(corrected.options_or_statements)
      ? corrected.options_or_statements
      : corrected.options_or_statements.options;
    const option = options.find((item) => item.id === '3');
    assert(option, 'Statement 3 missing');
    const text =
      'Secara umum, kesamaan dua sisi dan satu sudut yang bukan sudut apit selalu menjamin dua segitiga kongruen.';
    if (option.content) option.content.text = text;
    else option.text = text;
    corrected.explanation = {
      text: 'Pernyataan 1 benar: kedua sisi bersesuaian dan sudut apitnya sama, sehingga kedua segitiga kongruen berdasarkan SAS. Pernyataan 2 benar: sisi bersesuaian AC dan PR sama panjang. Pernyataan 3 salah: secara umum, dua sisi dan sudut bukan apit (SSA) dapat menghasilkan dua segitiga berbeda, sehingga bukan jaminan kekongruenan untuk semua ukuran. Pernyataan 4 salah: sudut A bersesuaian dengan P, sedangkan R bersesuaian dengan C; sisi BC=8 dan AB=6 menyebabkan sudut A dan C berbeda. Kunci: 1 dan 2.',
    };
  }
  if (externalId === 'pretest-b4-q08') {
    const options = Array.isArray(corrected.options_or_statements)
      ? corrected.options_or_statements
      : corrected.options_or_statements.options;
    const option = options.find((item) => item.id === 'A');
    assert(option, 'Option A missing');
    const text = 'Selisih nilai tertinggi dan terendah kelompok A lebih kecil daripada kelompok B.';
    if (option.content) option.content.text = text;
    else option.text = text;
    corrected.explanation = {
      text: 'Jangkauan adalah selisih nilai tertinggi dan terendah. Karena 20 < 35, selisih tersebut pada kelompok A lebih kecil daripada kelompok B. Rata-rata dan jangkauan saja tidak cukup untuk menyimpulkan data lebih terkumpul di sekitar rata-rata atau kelompok mana yang lebih pandai. Kunci: A.',
    };
  }
  decodeAssessmentContent({
    questionType: corrected.question_type,
    stem: corrected.stem,
    optionsOrStatements: corrected.options_or_statements,
    answerKey: corrected.answer_key,
    explanation: corrected.explanation,
  });
  return corrected;
}

try {
  const result = await sql.begin(apply ? '' : 'read only', async (tx) => {
    if (apply) {
      await tx`select pg_advisory_xact_lock(hashtext(${reference}))`;
      const [operator] =
        await tx`select id from users where id=${actor} and role='ADMIN' and status='ACTIVE' and admin_role in ('SUPER_ADMIN','CONTENT_DATA_MODERATION') for share`;
      assert(operator, 'Active content operator required');
    }
    const operators =
      await tx`select distinct u.id from content_imports c join users u on u.id=c.actor_user_id where c.source_namespace like 'NUMORA_PRETEST_BAB_%_20261028' and u.role='ADMIN' and u.status='ACTIVE' and u.admin_role in ('SUPER_ADMIN','CONTENT_DATA_MODERATION')`;
    const report = {
      mode: apply ? 'apply' : 'read-only',
      reference,
      candidateOperatorIds: operators.map((row) => row.id),
      packages: [],
    };
    let policy;
    if (apply) {
      [policy] =
        await tx`insert into scoring_policy_versions(policy_code,version,configuration,status,approved_by_user_id,approved_at,approval_reference) values(${PRETEST_PARTIAL_POLICY},1,${tx.json(PRETEST_PARTIAL_CONFIGURATION)},'PUBLISHED',${actor},now(),${reference}) on conflict(policy_code,version) do nothing returning *`;
      if (!policy)
        [policy] =
          await tx`select * from scoring_policy_versions where policy_code=${PRETEST_PARTIAL_POLICY} and version=1`;
      assert(
        policy.status === 'PUBLISHED' &&
          hash(policy.configuration) === hash(PRETEST_PARTIAL_CONFIGURATION),
        'Existing policy differs',
      );
    }
    for (const sourceId of sources) {
      const [source] =
        await tx`select * from assessment_packages where id=${sourceId} and assessment_type='PRETEST' and purpose='REGULAR' and not is_demo`;
      assert(source?.chapter_id, 'Unexpected source package');
      const [chapter] =
        await tx`select id from chapters where id=${source.chapter_id} and status='READY'`;
      assert(chapter, 'Chapter not ready');
      const [released] =
        await tx`select id,status from assessment_packages where family_code=${source.family_code} and curriculum_approval->>'reference'=${reference}`;
      if (released) {
        assert.equal(released.status, 'PUBLISHED');
        report.packages.push({ sourceId, id: released.id, status: 'already-published' });
        continue;
      }
      const rows =
        await tx`select i.display_order, to_jsonb(v) as version, q.id as question_id, ident.id as identity_id, ident.external_id, imported.import_id, imported.provenance
        from package_items i join question_versions v on v.id=i.question_version_id join question_variants a on a.id=v.variant_id join questions q on q.id=a.question_id
        join content_import_identities ident on ident.question_id=q.id join content_import_versions imported on imported.question_version_id=v.id
        where i.package_id=${sourceId} and q.usage_type='PRETEST' and a.kind='ORIGINAL' order by i.display_order`;
      assert.equal(rows.length, 20, 'Expected 20 original questions');
      assert.equal(new Set(rows.map((r) => r.question_id)).size, 20);
      const revised = rows.map((row) => ({
        ...row,
        corrected: correction(row.external_id, row.version),
      }));
      const images = rows.filter(
        (row) => Array.isArray(row.version.media) && row.version.media.length,
      ).length;
      report.packages.push({
        sourceId,
        questions: 20,
        imageQuestions: images,
        corrections: rows
          .filter((r) => ['pretest-b3-q05', 'pretest-b4-q08'].includes(r.external_id))
          .map((r) => r.external_id),
      });
      if (!apply) continue;
      const [{ next }] =
        await tx`select max(package_version)+1 as next from assessment_packages where family_code=${source.family_code}`;
      const [pkg] =
        await tx`insert into assessment_packages(family_code,package_version,name,chapter_id,assessment_type,purpose,status,is_demo,scoring_policy_version_id) values(${source.family_code},${next},${source.name},${source.chapter_id},'PRETEST','REGULAR','DRAFT',false,${policy.id}) returning id`;
      const versionIds = [];
      for (const row of revised) {
        const v = row.corrected;
        let rubric = null;
        const options = Array.isArray(v.options_or_statements)
          ? v.options_or_statements
          : v.options_or_statements.options;
        if (v.question_type !== 'SINGLE_CHOICE') {
          const definition = pretestPartialRubricDefinition(v.question_type, options.length);
          const code = `${PRETEST_PARTIAL_POLICY}_${v.question_type}_${options.length}`;
          [rubric] =
            await tx`insert into scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest,status,approved_by_user_id,approved_at) values(${code},1,${v.question_type},${options.length},${tx.json(definition)},${hash(definition)},'SEALED',${actor},now()) on conflict(code,version) do nothing returning *`;
          if (!rubric)
            [rubric] =
              await tx`select * from scoring_rubric_versions where code=${code} and version=1`;
          assert(
            rubric.status === 'SEALED' && hash(rubric.definition) === hash(definition),
            'Rubric differs',
          );
        }
        const [{ next: number }] =
          await tx`select max(version_number)+1 as next from question_versions where variant_id=${v.variant_id}`;
        const [version] =
          await tx`insert into question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,level_id,scoring_rubric_version_id,revised_from_question_version_id,content_status,reviewed_by_user_id,reviewed_at)
          values(${v.variant_id},${number},${v.question_type},${tx.json(v.stem)},${tx.json(v.options_or_statements)},${tx.json(v.answer_key)},${tx.json(v.explanation)},${tx.json(v.media)},${v.difficulty},${v.level_id},${rubric?.id ?? null},${v.id},'READY',${actor},now()) returning id`;
        await tx`insert into content_import_versions(question_version_id,identity_id,import_id,content_hash,provenance) values(${version.id},${row.identity_id},${row.import_id},${hash(v)},${tx.json({ ...row.provenance, ownerPretestRelease: { reference, sourceQuestionVersionId: v.id, correction: ['pretest-b3-q05', 'pretest-b4-q08'].includes(row.external_id), retainedClarification: row.provenance?.academicAudit?.disposition === 'DRAFT_WITH_CLARIFICATION' } })})`;
        await tx`insert into package_items(package_id,question_version_id,display_order,max_points,rubric_version_id,maximum_score_category) values(${pkg.id},${version.id},${row.display_order},1,${rubric?.id ?? null},${rubric?.maximum_score_category ?? 1})`;
        await tx`update questions set status='READY' where id=${row.question_id}`;
        versionIds.push(version.id);
      }
      const definition = {
        assessmentType: 'PRETEST',
        questionCount: 20,
        chapterId: source.chapter_id,
        questionVersionIds: versionIds,
        reference,
      };
      const [blueprint] =
        await tx`insert into assessment_blueprint_versions(code,version,definition,digest,status,approved_by_user_id,approved_at,approval_reference) values(${`PRETEST-OWNER-${pkg.id}`},1,${tx.json(definition)},${hash(definition)},'SEALED',${actor},now(),${reference}) returning id`;
      await tx`update assessment_packages set blueprint_version_id=${blueprint.id} where id=${pkg.id}`;
      const [{ digest }] =
        await tx`select irt_compute.payload_digest(jsonb_build_object('packageId',p.id,'blueprintVersionId',p.blueprint_version_id,'scoringPolicyVersionId',p.scoring_policy_version_id,'items',(select jsonb_agg(to_jsonb(i) order by i.display_order,i.id) from package_items i where i.package_id=p.id))) as digest from assessment_packages p where p.id=${pkg.id}`;
      await tx`update assessment_packages set frozen_at=now(),status='PUBLISHED',release_at=now(),curriculum_approval=${tx.json({ source: 'PROJECT_OWNER_ORIGINAL_PRETEST_REVIEW_V1', reference, approvedAt: new Date().toISOString(), manifestDigest: digest, sourcePackageId: sourceId })} where id=${pkg.id}`;
      await tx`insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(${actor},'PRETEST_ORIGINAL_OWNER_RELEASE','assessment_package',${pkg.id},${tx.json({ reference, sourcePackageId: sourceId, questionVersionIds: versionIds })})`;
      report.packages.at(-1).id = pkg.id;
    }
    return report;
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    'Pretest release failed:',
    error.code ?? error.name,
    error instanceof assert.AssertionError
      ? error.message
      : 'No credentials printed; transaction rolled back.',
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}

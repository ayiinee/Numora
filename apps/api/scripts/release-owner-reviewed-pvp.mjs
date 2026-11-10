// Bounded owner-approved content operation; default is READ ONLY.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { decodeAssessmentContent } from '@tka/assessment-engine';
const batch = process.argv.find((a) => a.startsWith('--batch='))?.slice(8) ?? '1';
const approvedBatches = {
  9: {
    file: './data/pvp-owner-reviewed-2026-11-10-batch09.json',
    digest: '94f10588feb1639b82341477c34554b31154015b34c89e13db9555808d81d932',
    counts: { EASY: 9, MEDIUM: 17, HARD: 4 },
    corrections: 4,
  },
  8: {
    file: './data/pvp-owner-reviewed-2026-11-10-batch08.json',
    digest: '74b83789ff6b30dd19d9a729afb0a8bc281d693ef2e3d668c4759367dfedaab1',
    counts: { EASY: 10, MEDIUM: 16, HARD: 4 },
    corrections: 3,
  },
  7: {
    file: './data/pvp-owner-reviewed-2026-11-10-batch07.json',
    digest: 'f181a7d7785293846e4b9743570d4cc00e425848e30940954232b6f98d9fabeb',
    counts: { EASY: 11, MEDIUM: 14, HARD: 5 },
    corrections: 5,
  },
  6: {
    file: './data/pvp-owner-reviewed-2026-11-10-batch06.json',
    digest: '81c96427f2c1bdf0936e7ba447a4cd2c021d61c5fa2200d860aab86daa4cafcd',
    counts: { EASY: 9, MEDIUM: 19, HARD: 1 },
    corrections: 5,
  },
  5: {
    file: './data/pvp-owner-reviewed-2026-11-10-batch05.json',
    digest: '2059539d2d8bda260b72042ff448b01f01cc16b6dc74a9ea36803e18b4b83daa',
    counts: { EASY: 6, MEDIUM: 17, HARD: 7 },
    corrections: 8,
  },
  1: {
    file: './data/pvp-owner-reviewed-2026-11-10.json',
    digest: 'a48515b4cb8d46aaa30c3e5ed71731627d01a732a25a91e5be62819b9200bb1a',
    counts: { EASY: 10, MEDIUM: 10, HARD: 10 },
    corrections: 7,
  },
  2: {
    file: './data/pvp-owner-reviewed-2026-11-10-batch02.json',
    digest: 'b829e863b6474d86c3e610cd4ad30c2e2f5dd22fce038839d9190552c6dffc0f',
    counts: { EASY: 7, MEDIUM: 23, HARD: 0 },
    corrections: 7,
  },
  3: {
    file: './data/pvp-owner-reviewed-2026-11-10-batch03.json',
    digest: '959c8b5544d515ca4510e53624a4a57c192e85a617bedaf761e9ab985001a540',
    counts: { EASY: 7, MEDIUM: 19, HARD: 4 },
    corrections: 3,
  },
  4: {
    file: './data/pvp-owner-reviewed-2026-11-10-batch04.json',
    digest: '0b38b415ab3ffb86911244fce03b9662d3dc4d4547d44cf24632bc0d6cf817a2',
    counts: { EASY: 12, MEDIUM: 13, HARD: 5 },
    corrections: 5,
  },
};
assert(Object.hasOwn(approvedBatches, batch), 'Unknown approved batch');
const approved = approvedBatches[batch];
const expectedItems = Object.values(approved.counts).reduce((sum, count) => sum + count, 0);
const manifest = JSON.parse(readFileSync(new URL(approved.file, import.meta.url), 'utf8'));
const apply = process.argv.includes('--apply');
const rehearse = process.argv.includes('--rehearse');
const production = process.argv.includes('--production');
assert(!(apply && rehearse), 'Choose apply or rehearse');
const write = apply || rehearse;
const requestedActor = process.argv.find((a) => a.startsWith('--actor='))?.slice(8);
if (production)
  assert(
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestedActor ?? ''),
    'Production requires --actor=<active Super Admin user UUID>',
  );
else if (write)
  assert.equal(
    requestedActor,
    manifest.operatorId,
    'Explicit approved existing content operator required',
  );
const actor = production ? requestedActor : manifest.operatorId;
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const hash = (v) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(v)))
    .digest('hex');
assert.equal(hash(manifest), approved.digest, 'Approved manifest changed; obtain a new approval');
const payload = (v) => ({
  stem: v.stem,
  optionsOrStatements: v.options_or_statements,
  answerKey: v.answer_key,
  explanation: v.explanation,
});
assert.equal(manifest.items.length, expectedItems);
assert.equal(new Set(manifest.items.map((i) => i.familyId)).size, expectedItems);
for (const held of manifest.held ?? []) {
  assert(
    !manifest.items.some(
      (i) => i.familyId === held.familyId || i.sourceVersionId === held.sourceVersionId,
    ),
    'Held content must not be released',
  );
}
assert.equal(manifest.items.filter((i) => i.correctionReason).length, approved.corrections);
for (const difficulty of ['EASY', 'MEDIUM', 'HARD'])
  assert.equal(
    manifest.items.filter((i) => i.difficulty === difficulty).length,
    approved.counts[difficulty],
  );
for (const item of manifest.items) {
  assert.deepEqual(
    item.replacement.answerKey,
    item.source.answerKey,
    'Approved keys must not change',
  );
  assert.deepEqual(
    item.replacement.optionsOrStatements,
    item.source.optionsOrStatements,
    'Approved options must not change',
  );
  if (!item.correctionReason)
    assert.deepEqual(item.replacement, item.source, 'Unapproved editorial change');
  decodeAssessmentContent({ questionType: 'SINGLE_CHOICE', ...item.replacement });
}
const connection = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
assert(connection && URL.canParse(connection), 'Valid database connection required');
const target = new URL(connection);
assert(['require', 'verify-full'].includes(target.searchParams.get('sslmode')), 'TLS required');
const productionRef = 'bfvbstmkcpanqqehfevr';
const directProductionHost = target.hostname === `db.${productionRef}.supabase.co`;
const targetUser = decodeURIComponent(target.username);
const poolerProductionUser = targetUser.endsWith(`.${productionRef}`);
if (production) {
  assert(
    process.env.SUPABASE_PROJECT_REF === productionRef &&
      process.env.DATABASE_MIGRATION_URL === connection &&
      ['postgres:', 'postgresql:'].includes(target.protocol) &&
      (target.port || '5432') === '5432' &&
      target.pathname === '/postgres' &&
      target.searchParams.getAll('sslmode').length === 1 &&
      [...target.searchParams.keys()].every((key) =>
        ['sslmode', 'connect_timeout'].includes(key),
      ) &&
      ((directProductionHost && targetUser === 'postgres') ||
        (/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(target.hostname) &&
          targetUser === `postgres.${productionRef}`)),
    'Production requires DATABASE_MIGRATION_URL for the Numora production project and matching SUPABASE_PROJECT_REF',
  );
} else {
  assert(
    !directProductionHost &&
      !poolerProductionUser &&
      process.env.SUPABASE_PROJECT_REF !== productionRef,
    'Use --production to target the Numora production project',
  );
}
const db = postgres(connection, {
  max: 1,
  connect_timeout: 15,
  onnotice: () => {},
  ...(production ? { port: 5432 } : {}),
});
const rollback = new Error('REHEARSAL_ROLLBACK');
let result;
try {
  await db.begin(write ? '' : 'read only', async (tx) => {
    await tx`set local statement_timeout='30000'`;
    await tx`set local lock_timeout='10000'`;
    if (write) await tx`select pg_advisory_xact_lock(hashtext(${manifest.reference}))`;
    const operatorRole = production ? 'SUPER_ADMIN' : 'CONTENT_DATA_MODERATION';
    const lockOperator = write ? tx`for share` : tx``;
    const [operator] =
      await tx`select id from users where id=${actor} and role='ADMIN' and status='ACTIVE' and admin_role=${operatorRole} ${lockOperator}`;
    assert(operator, `Release operator must be an active ${operatorRole}`);
    const sourceIds = manifest.items.map((i) => i.sourceVersionId);
    if (write)
      await tx`select id from question_variants where id in (select variant_id from question_versions where id in ${tx(sourceIds)}) order by id for update`;
    const sources =
      await tx`select v.*, q.id family_id, q.usage_type, q.status family_status, c.status competency_status, s.status subchapter_status, ch.status chapter_status, l.status level_status, imported.identity_id, imported.provenance
   from question_versions v join question_variants va on va.id=v.variant_id join questions q on q.id=va.question_id join competencies c on c.id=q.primary_competency_id join subchapters s on s.id=c.subchapter_id join chapters ch on ch.id=s.chapter_id left join levels l on l.id=v.level_id join content_import_versions imported on imported.question_version_id=v.id where v.id in ${tx(sourceIds)} order by v.id`;
    assert.equal(sources.length, expectedItems);
    const sourceHash = hash(sources);
    const previousImports =
      await tx`select * from content_imports where idempotency_key=${manifest.reference} and (${production} or actor_user_id=${actor})`;
    assert(previousImports.length <= 1, 'Multiple releases exist for this batch; reconcile first');
    const [previousImport] = previousImports;
    if (previousImport)
      assert.equal(previousImport.fingerprint, hash(manifest), 'Release manifest drift');
    let releaseImport = previousImport;
    const sourceAttribution = production ? { sourceManifestOperatorId: manifest.operatorId } : {};
    if (write && !releaseImport)
      [releaseImport] =
        await tx`insert into content_imports(actor_user_id,idempotency_key,fingerprint,source_namespace,report) values(${actor},${manifest.reference},${hash(manifest)},${manifest.reference},${tx.json({ reference: manifest.reference, approvalSource: manifest.approvalSource, scope: manifest.scope, operatorBasis: manifest.operatorBasis, items: expectedItems, corrections: approved.corrections, ...sourceAttribution })}) returning *`;
    result = {
      mode: apply ? 'apply' : rehearse ? 'rehearse-rollback' : 'read-only',
      ...(production ? { targetProjectRef: productionRef } : {}),
      reference: manifest.reference,
      manifestDigest: hash(manifest),
      items: [],
      originalVersionsUnchanged: false,
    };
    for (const item of manifest.items) {
      const v = sources.find((s) => s.id === item.sourceVersionId);
      assert.equal(v.family_id, item.familyId);
      assert.equal(v.usage_type, 'DRILL');
      assert.equal(v.question_type, 'SINGLE_CHOICE');
      assert.equal(v.difficulty, 'OWNER_ACCEPTED_UNCALIBRATED');
      if (!production) assert.equal(v.reviewed_by_user_id, manifest.operatorId);
      for (const status of [
        v.content_status,
        v.family_status,
        v.competency_status,
        v.subchapter_status,
        v.chapter_status,
      ])
        assert.equal(status, 'READY');
      if (v.level_id) assert.equal(v.level_status, 'READY');
      assert.deepEqual(payload(v), item.source, 'Source snapshot drift');
      assert(
        v.media === null || (typeof v.media === 'object' && Object.keys(v.media).length === 0),
        'Unsupported media',
      );
      const existingVersions = previousImport
        ? await tx`select q.* from question_versions q join content_import_versions i on i.question_version_id=q.id where i.import_id=${previousImport.id} and q.revised_from_question_version_id=${v.id}`
        : [];
      assert(existingVersions.length <= 1, 'Multiple revisions exist for this source version');
      const [existing] = existingVersions;
      if (existing) {
        assert.deepEqual(payload(existing), item.replacement);
        assert.equal(existing.difficulty, item.difficulty);
        assert.equal(existing.content_status, 'READY');
        result.items.push({ reviewId: item.reviewId, id: existing.id, status: 'already-released' });
        continue;
      }
      assert(!previousImport, 'Partial release detected');
      const [{ n }] =
        await tx`select max(version_number)::int n from question_versions where variant_id=${v.variant_id}`;
      assert.equal(n, v.version_number, 'Newer version exists; review again');
      if (!write) {
        result.items.push({
          reviewId: item.reviewId,
          sourceId: v.id,
          difficulty: item.difficulty,
          status: 'validated-for-release',
        });
        continue;
      }
      const p = item.replacement;
      const [created] =
        await tx`insert into question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,parent_original_question_version_id,revised_from_question_version_id,level_id,scoring_rubric_version_id,content_fingerprint,content_status,reviewed_by_user_id,reviewed_at)
    values(${v.variant_id},${n + 1},'SINGLE_CHOICE',${tx.json(p.stem)},${tx.json(p.optionsOrStatements)},${tx.json(p.answerKey)},${tx.json(p.explanation)},${v.media === null ? null : tx.json(v.media)},${item.difficulty},${v.parent_original_question_version_id},${v.id},${v.level_id},${v.scoring_rubric_version_id},${hash({ ...p, difficulty: item.difficulty })},'READY',${actor},now()) returning *`;
      assert.equal(created.validation_state, 'CONTENT_VALID');
      const provenance = {
        ...v.provenance,
        ownerPvpRelease: {
          reference: manifest.reference,
          reviewId: item.reviewId,
          sourceQuestionVersionId: v.id,
          sourcePayloadDigest: hash(item.source),
          approvalSource: manifest.approvalSource,
          operatorBasis: manifest.operatorBasis,
          ...sourceAttribution,
          ...(production ? { sourceReviewedByUserId: v.reviewed_by_user_id } : {}),
          empiricallyCalibrated: false,
          correctionReason: item.correctionReason,
        },
      };
      await tx`insert into content_import_versions(question_version_id,identity_id,import_id,content_hash,provenance) values(${created.id},${v.identity_id},${releaseImport.id},${hash({ ...p, difficulty: item.difficulty })},${tx.json(provenance)})`;
      await tx`insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(${actor},'PVP_OWNER_REVIEW_RELEASE','question_version',${created.id},${tx.json(provenance.ownerPvpRelease)})`;
      result.items.push({
        reviewId: item.reviewId,
        sourceId: v.id,
        id: created.id,
        difficulty: item.difficulty,
        status: 'released',
      });
    }
    const after =
      await tx`select v.*, q.id family_id, q.usage_type, q.status family_status, c.status competency_status, s.status subchapter_status, ch.status chapter_status, l.status level_status, imported.identity_id, imported.provenance
   from question_versions v join question_variants va on va.id=v.variant_id join questions q on q.id=va.question_id join competencies c on c.id=q.primary_competency_id join subchapters s on s.id=c.subchapter_id join chapters ch on ch.id=s.chapter_id left join levels l on l.id=v.level_id join content_import_versions imported on imported.question_version_id=v.id where v.id in ${tx(sourceIds)} order by v.id`;
    assert.equal(hash(after), sourceHash, 'Source rows changed');
    result.originalVersionsUnchanged = true;
    if (releaseImport && (write || production)) {
      const [{ n }] =
        await tx`select count(*)::int n from content_import_versions where import_id=${releaseImport.id}`;
      assert.equal(n, expectedItems);
      const [{ n: audits }] =
        await tx`select count(*)::int n from audit_logs where action='PVP_OWNER_REVIEW_RELEASE' and metadata->>'reference'=${manifest.reference}`;
      assert.equal(audits, expectedItems);
    }
    if (rehearse) throw rollback;
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error === rollback) console.log(JSON.stringify({ ...result, rolledBack: true }, null, 2));
  else {
    console.error(
      'PvP release failed:',
      error.code ?? error.name,
      error instanceof assert.AssertionError
        ? error.message
        : 'Transaction rolled back; credentials withheld.',
    );
    process.exitCode = 1;
  }
} finally {
  await db.end();
}

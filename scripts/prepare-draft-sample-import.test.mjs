import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { plannedKey, applyReceipt } from './upload-question-media.mjs';
import {
  loadSampleBundle,
  prepareSampleImport,
  validateSampleBundle,
} from './prepare-draft-sample-import.mjs';

// TEST ONLY receipts: never persist them into the real sample files or contact R2.
async function uploadedFixture() {
  const bundle = await loadSampleBundle();
  for (const q of bundle.questions) {
    for (const asset of q.metadata.assetManifest) {
      applyReceipt(asset, {
        ...asset,
        status: 'VERIFIED',
        uploadId: randomUUID(),
        objectKey: plannedKey(asset),
        verifiedAt: '2026-10-04T00:00:00.000Z',
      });
    }
    for (const block of [q.stem, q.explanation, ...q.options.map((o) => o.content)]) {
      block.assetKeys = [...block.text.matchAll(/\[\[asset:([^\]]+)\]\]/g)].map(
        (m) => q.metadata.assetManifest.find((a) => a.assetId === m[1]).objectKey,
      );
    }
  }
  return bundle;
}

test('ten source samples validate, including three answer formats and six pending assets', async () => {
  const bundle = await loadSampleBundle();
  await validateSampleBundle(bundle);
  assert.deepEqual(
    bundle.questions.reduce((counts, q) => {
      counts[q.type] = (counts[q.type] ?? 0) + 1;
      return counts;
    }, {}),
    { SINGLE_CHOICE: 7, MULTIPLE_CHOICE_MULTIPLE_ANSWER: 2, CATEGORY: 1 },
  );
  assert.equal(bundle.questions.flatMap((q) => q.metadata.assetManifest).length, 6);
});

test('rejects incomplete keys, duplicate identities, unmapped level and claimed uploads before generating SQL', async () => {
  const source = await loadSampleBundle();
  for (const mutate of [
    (b) => {
      b.questions[0].answer.optionId = 'Z';
    },
    (b) => {
      b.questions[1].externalId = b.questions[0].externalId;
    },
    (b) => {
      b.questions[0].metadata.sourceLevelNumber = 2;
    },
    (b) => {
      b.questions.find(
        (q) => q.metadata.assetManifest.length,
      ).metadata.assetManifest[0].uploadedToR2 = true;
    },
    (b) => {
      b.questions.find((q) => q.type === 'CATEGORY').answer.categoryByStatementId.A = 'UNKNOWN';
    },
    (b) => {
      b.questions.find((q) => q.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER').answer.optionIds = [
        'A',
        'A',
      ];
    },
    (b) => {
      b.questions[0].metadata.contentStatus = 'READY';
    },
  ]) {
    const bundle = structuredClone(source);
    mutate(bundle);
    await assert.rejects(validateSampleBundle(bundle));
  }
});

test('SQL quotes source text as data and keeps null difficulty and draft workflow', async () => {
  const bundle = await loadSampleBundle();
  bundle.questions[0].stem.text = "Siswa's teks; DROP TABLE questions; $sample_import$ \\";
  const sql = await prepareSampleImport(bundle);
  assert.ok(sql.includes("Siswa''s teks; DROP TABLE questions;"));
  assert.ok(sql.includes('DO $sample_import_1$'));
  assert.ok(sql.includes("NULL,level_uuid,item->>'fingerprint','DRAFT','DRAFT'"));
});

test('verified upload keys are accepted in placement order; malformed claims are rejected', async () => {
  const uploaded = await uploadedFixture();
  await validateSampleBundle(uploaded);
  const sql = await prepareSampleImport(uploaded);
  assert.ok(sql.includes('Media receipt not verified on target'));
  for (const mutate of [
    (a, q) => {
      a.objectKey += '-tampered';
      q.explanation.assetKeys[0] = a.objectKey;
    },
    (a) => {
      a.uploadId = 'not-a-receipt';
    },
    (a) => {
      a.verifiedAt = 'invalid-date';
    },
    (a) => {
      a.externalId = 'ANOTHER-QUESTION';
    },
    (a) => {
      a.placement = 'STEM';
    },
    (_a, q) => {
      q.explanation.assetKeys.reverse();
    },
  ]) {
    const bundle = structuredClone(uploaded);
    const q = bundle.questions.find((row) => row.metadata.assetManifest.length > 1);
    mutate(q.metadata.assetManifest[0], q);
    await assert.rejects(validateSampleBundle(bundle));
  }
});

test(
  'PostgreSQL requires matching VERIFIED upload records before importing image references',
  { skip: !process.env.CURRICULUM_TEST_PGLITE_MODULE },
  async () => {
    const { PGlite } = await import(
      pathToFileURL(resolve(process.env.CURRICULUM_TEST_PGLITE_MODULE)).href
    );
    const db = new PGlite();
    const run = async (sql) => {
      try {
        await db.exec(sql);
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    };
    const count = async (table) =>
      (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    try {
      await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
      const folder = new URL('../packages/database/drizzle/', import.meta.url);
      const journal = JSON.parse(await readFile(new URL('meta/_journal.json', folder), 'utf8'));
      for (const entry of journal.entries)
        await run(
          `BEGIN;\n${await readFile(new URL(`${entry.tag}.sql`, folder), 'utf8')}\nCOMMIT;`,
        );
      const bundle = await uploadedFixture();
      const sql = await prepareSampleImport(bundle);
      await assert.rejects(run(sql), /Media receipt not verified on target/);
      assert.equal(await count('questions'), 0);
      assert.equal(await count('chapters'), 0);
      const actor = (
        await db.query(`INSERT INTO users(auth_user_id,role,display_name,email)
        VALUES(gen_random_uuid(),'ADMIN','Test Media Operator','media-test@example.test') RETURNING id`)
      ).rows[0].id;
      for (const asset of bundle.questions.flatMap((q) => q.metadata.assetManifest)) {
        await db.query(
          `INSERT INTO content_media_uploads(id,actor_user_id,idempotency_key,external_id,asset_id,
          content_version,bucket,pending_object_key,object_key,content_type,byte_length,sha256,status,expires_at,verified_at)
          VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$11,'VERIFIED',now()+interval '1 hour',$12)`,
          [
            asset.uploadId,
            actor,
            `test-${asset.uploadId}`,
            asset.externalId,
            asset.assetId,
            asset.bucket,
            `question-media/_pending/test/${asset.uploadId}.png`,
            asset.objectKey,
            asset.contentType,
            asset.byteLength,
            asset.sha256,
            asset.verifiedAt,
          ],
        );
      }
      const first = bundle.questions.flatMap((q) => q.metadata.assetManifest)[0];
      await db.query(
        "UPDATE content_media_uploads SET status='PENDING',verified_at=NULL WHERE id=$1",
        [first.uploadId],
      );
      await assert.rejects(run(sql), /Media receipt not verified on target/);
      assert.equal(await count('questions'), 0);
      await db.query(
        "UPDATE content_media_uploads SET status='VERIFIED',verified_at=$2 WHERE id=$1",
        [first.uploadId, first.verifiedAt],
      );
      await run(sql);
      assert.equal(await count('questions'), 10);
      assert.equal(await count('audit_logs'), 10);
      await run(sql);
      assert.equal(await count('questions'), 10);
      assert.equal(await count('audit_logs'), 10);
      const stored = (
        await db.query(`SELECT q.source_ref,v.stem,v.explanation,v.media FROM question_versions v
        JOIN question_variants r ON r.id=v.variant_id JOIN questions q ON q.id=r.question_id`)
      ).rows;
      for (const q of bundle.questions) {
        const version = stored.find((row) => row.source_ref === q.externalId);
        assert.deepEqual(version.stem, q.stem);
        assert.deepEqual(version.explanation, q.explanation);
        assert.deepEqual(version.media, q.metadata.assetManifest);
      }
    } finally {
      await db.close();
    }
  },
);

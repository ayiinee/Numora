import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadSampleBundle,
  prepareSampleImport,
  validateSampleBundle,
} from './prepare-draft-sample-import.mjs';

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

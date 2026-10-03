import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, cp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  loadSamples,
  plannedKey,
  uploadAsset,
  applyReceipt,
  persistSamples,
} from './upload-question-media.mjs';

test('ten samples and six images have consistent manifests and exact checksums', async () => {
  const batch = await loadSamples('docs/data/samples/2026-10-03');
  assert.equal(batch.questions.length, 10);
  assert.equal(batch.files.length, 6);
  assert.equal(
    batch.files.reduce((n, f) => n + f.bytes.length, 0),
    9191,
  );
});

const asset = {
  externalId: 'TEST-ONLY',
  assetId: 'soal-1',
  sha256: 'a'.repeat(64),
  contentType: 'image/png',
  byteLength: 3,
  objectKey: null,
  uploadedToR2: false,
};
const receipt = {
  ...asset,
  status: 'VERIFIED',
  uploadId: '00000000-0000-4000-8000-000000000001',
  verifiedAt: '2026-10-03T00:00:00.000Z',
  bucket: 'numora-bucket',
  objectKey: plannedKey(asset),
};
const reservation = {
  ...receipt,
  status: 'PENDING',
  uploadUrl: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/test-only`,
  method: 'PUT',
  headers: { 'Content-Type': 'image/png', 'Content-Length': '3' },
};
const jsonResponse = (value) => new Response(JSON.stringify(value), { status: 200 });
const settings = { baseUrl: 'http://localhost:4000/api/v1', token: 'TEST_ONLY' };

test('sends Admin token only to API and confirms before applying final keys', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1
      ? jsonResponse(reservation)
      : calls.length === 2
        ? new Response(null, { status: 200 })
        : jsonResponse(receipt);
  };
  const result = await uploadAsset(asset, Buffer.from('123'), { ...settings, fetchImpl });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer TEST_ONLY');
  assert.equal(calls[0].init.redirect, 'error');
  const copy = structuredClone(asset);
  applyReceipt(copy, result);
  assert.equal(copy.uploadedToR2, true);
  assert.equal(copy.objectKey, plannedKey(asset));
});

test('failed PUT never completes or changes JSON', async () => {
  const copy = structuredClone(asset);
  let calls = 0;
  await assert.rejects(
    uploadAsset(copy, Buffer.from('123'), {
      ...settings,
      fetchImpl: async () =>
        ++calls === 1 ? jsonResponse(reservation) : new Response(null, { status: 403 }),
    }),
    /R2 upload failed/,
  );
  assert.equal(calls, 2);
  assert.equal(copy.objectKey, null);
  assert.equal(copy.uploadedToR2, false);
});

test('mismatched checksum/unverified receipt cannot confirm a local key', () => {
  for (const change of [
    { status: 'PENDING' },
    { sha256: 'b'.repeat(64) },
    { objectKey: 'foreign/path' },
    { bucket: 'foreign-bucket' },
  ]) {
    const copy = structuredClone(asset);
    assert.throws(() => applyReceipt(copy, { ...receipt, ...change }), /matching verified/);
    assert.equal(copy.objectKey, null);
  }
});

test('replay of already verified reservation skips PUT and completion', async () => {
  let calls = 0;
  await uploadAsset(asset, Buffer.from('123'), {
    ...settings,
    fetchImpl: async () => {
      calls++;
      return jsonResponse(receipt);
    },
  });
  assert.equal(calls, 1);
});

test('rejects foreign PUT hosts without sending credentials or file bytes', async () => {
  let calls = 0;
  await assert.rejects(
    uploadAsset(asset, Buffer.from('123'), {
      ...settings,
      fetchImpl: async () => {
        calls++;
        return jsonResponse({ ...reservation, uploadUrl: 'https://foreign.example/private' });
      },
    }),
    /expected R2/,
  );
  assert.equal(calls, 1);
});

test('verified receipts update aggregate/per-question keys in placement order without closing import blockers', async () => {
  const temporaryRoot = resolve('.tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(join(temporaryRoot, 'media-test-'));
  try {
    await cp('docs/data/samples/2026-10-03', directory, { recursive: true });
    const batch = await loadSamples(directory);
    for (const item of batch.assets)
      applyReceipt(item, {
        ...item,
        status: 'VERIFIED',
        uploadId: receipt.uploadId,
        verifiedAt: receipt.verifiedAt,
        bucket: 'numora-bucket',
        objectKey: plannedKey(item),
        uploadUrl: 'PRIVATE_SIGNED_URL_TEST_ONLY',
      });
    await persistSamples(batch);
    const aggregate = JSON.parse(await readFile(join(directory, 'questions.draft.json'), 'utf8'));
    const question = aggregate.find((q) => q.externalId === 'CURR-IND17-L01-Q05');
    const single = JSON.parse(
      await readFile(join(directory, 'questions', `${question.externalId}.draft.json`), 'utf8'),
    );
    assert.deepEqual(question, single);
    assert.equal(question.explanation.assetKeys.length, 3);
    assert.equal(question.stem.assetKeys.length, 1);
    assert.match(question.explanation.assetKeys[0], /\/bahas-1-/);
    assert.match(question.explanation.assetKeys[2], /\/bahas-3-/);
    assert.equal(question.metadata.importReady, false);
    assert.ok(question.metadata.importBlockers.includes('CURRICULUM_REVIEW_PENDING'));
    assert.ok(!question.metadata.importBlockers.includes('R2_UPLOAD_PENDING'));
    assert.ok(!JSON.stringify(aggregate).includes('PRIVATE_SIGNED_URL_TEST_ONLY'));
    assert.equal(
      JSON.parse(await readFile(join(directory, 'r2-upload-plan.json'), 'utf8')).uploadConfirmed,
      true,
    );
  } finally {
    if (!directory.startsWith(join(temporaryRoot, 'media-test-')))
      throw new Error('Unexpected test cleanup directory.');
    await rm(directory, { recursive: true, force: true });
  }
});

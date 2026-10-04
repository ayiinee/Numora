import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const defaultSamples = 'docs/data/samples/2026-10-03';
class MediaUploadError extends Error {}
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export function plannedKey(asset) {
  return `question-media/${asset.externalId}/v1/${asset.assetId}-${asset.sha256}.${extensions[asset.contentType]}`;
}

export async function loadSamples(directory) {
  const root = await realpath(resolve(directory));
  const readJson = async (name) => JSON.parse(await readFile(join(root, name), 'utf8'));
  const assets = await readJson('assets.draft.json');
  const questions = await readJson('questions.draft.json');
  const plan = await readJson('r2-upload-plan.json');
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(
    await readJson('question-preview.proposed.schema.json'),
  );
  const questionIds = new Set();
  for (const question of questions) {
    if (!validate(question))
      throw new MediaUploadError(`Invalid proposed preview JSON: ${question.externalId}`);
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(question.externalId) ||
      questionIds.has(question.externalId)
    )
      throw new MediaUploadError('Invalid or duplicate question identifier.');
    questionIds.add(question.externalId);
    const ids = (question.options ?? []).map((option) => option.id);
    if (ids.length < 1 || new Set(ids).size !== ids.length)
      throw new MediaUploadError('Options/statements must have unique IDs.');
    const answers =
      question.type === 'SINGLE_CHOICE'
        ? [question.answer.optionId]
        : question.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
          ? question.answer.optionIds
          : Object.keys(question.answer.categoryByStatementId);
    if (answers.some((id) => !ids.includes(id)))
      throw new MediaUploadError('Answer references an unknown option/statement.');
    if (question.type === 'CATEGORY') {
      const categories = question.metadata.categories.map((category) => category.id);
      if (
        new Set(categories).size !== categories.length ||
        answers.length !== ids.length ||
        Object.values(question.answer.categoryByStatementId).some((id) => !categories.includes(id))
      )
        throw new MediaUploadError('Incomplete or invalid category answer mapping.');
    }
  }
  const seen = new Set();
  const files = [];
  for (const asset of assets) {
    const identity = `${asset.externalId}:${asset.assetId}`;
    if (
      !questionIds.has(asset.externalId) ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(asset.assetId) ||
      seen.has(identity)
    )
      throw new MediaUploadError('Invalid or duplicate asset identity.');
    seen.add(identity);
    if (
      !extensions[asset.contentType] ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isInteger(asset.byteLength) ||
      asset.byteLength < 1 ||
      asset.byteLength > 5_242_880
    )
      throw new MediaUploadError('Invalid asset metadata.');
    const filename = await realpath(resolve(root, asset.fileReference));
    const pathFromRoot = relative(root, filename);
    if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot))
      throw new MediaUploadError('Asset path escapes sample directory.');
    const bytes = await readFile(filename);
    if (bytes.length !== asset.byteLength || sha256(bytes) !== asset.sha256)
      throw new MediaUploadError(`Image checksum/size mismatch: ${identity}`);
    if (asset.proposedObjectKey !== plannedKey(asset))
      throw new MediaUploadError(`Unexpected planned key: ${identity}`);
    const question = questions.find((q) => q.externalId === asset.externalId);
    const block =
      asset.placement === 'STEM'
        ? question.stem
        : asset.placement === 'EXPLANATION'
          ? question.explanation
          : (asset.placement === 'OPTION' && question.type !== 'CATEGORY') ||
              (asset.placement === 'STATEMENT' && question.type === 'CATEGORY')
            ? question.options.find((option) => option.id === asset.itemId)?.content
            : undefined;
    if (
      !block ||
      !block.text.includes(asset.textMarker) ||
      asset.textMarker !== `[[asset:${asset.assetId}]]` ||
      !Number.isInteger(asset.assetOrder) ||
      asset.assetOrder < 1
    )
      throw new MediaUploadError('Invalid media placement or missing text marker.');
    const manifest = question.metadata.assetManifest.filter((a) => a.assetId === asset.assetId);
    if (
      manifest.length !== 1 ||
      manifest[0].sha256 !== asset.sha256 ||
      manifest[0].fileReference !== asset.fileReference ||
      manifest[0].placement !== asset.placement ||
      manifest[0].itemId !== asset.itemId
    )
      throw new MediaUploadError(`Asset manifest mismatch: ${identity}`);
    files.push({ asset, bytes });
  }
  if (questions.flatMap((q) => q.metadata.assetManifest).length !== assets.length)
    throw new MediaUploadError('Unlisted question asset.');
  return { root, assets, questions, plan, files };
}

export function verifyReceipt(asset, receipt) {
  if (
    receipt.status !== 'VERIFIED' ||
    !receipt.verifiedAt ||
    !receipt.uploadId ||
    receipt.bucket !== 'numora-bucket' ||
    receipt.objectKey !== plannedKey(asset) ||
    receipt.externalId !== asset.externalId ||
    receipt.assetId !== asset.assetId ||
    receipt.sha256 !== asset.sha256 ||
    receipt.byteLength !== asset.byteLength ||
    receipt.contentType !== asset.contentType
  ) {
    throw new MediaUploadError('Backend did not return a matching verified media receipt.');
  }
  return {
    uploadId: receipt.uploadId,
    bucket: receipt.bucket,
    objectKey: receipt.objectKey,
    verifiedAt: receipt.verifiedAt,
  };
}

export function applyReceipt(asset, receipt) {
  const verified = verifyReceipt(asset, receipt);
  Object.assign(asset, verified, { uploadedToR2: true, uploadStatus: 'VERIFIED_BY_BACKEND' });
}

export async function uploadAsset(
  asset,
  bytes,
  { baseUrl, token, runId = 'sample-v1', fetchImpl = fetch },
) {
  const base = new URL(baseUrl);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname.replace(/\/$/, '') !== '/api/v1' ||
    (base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))
  )
    throw new MediaUploadError('API_BASE_URL must be HTTPS (or local HTTP), ending in /api/v1.');
  if (!token || /[\r\n]/.test(token))
    throw new MediaUploadError(
      'ADMIN_AUTH_TOKEN is required in the local ignored environment file.',
    );
  const endpoint = `${base.href.replace(/\/$/, '')}/admin/content/media/uploads`;
  const requestApi = async (url, body, headers = {}) => {
    const response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new MediaUploadError(
        `Media API failed (HTTP ${response.status}); no JSON keys were confirmed. For 410, use a new MEDIA_UPLOAD_RUN_ID.`,
      );
    return response.json();
  };
  const key = `media-${sha256(`${runId}:${asset.externalId}:${asset.assetId}:${asset.sha256}`)}`;
  const reservation = await requestApi(
    endpoint,
    {
      externalId: asset.externalId,
      assetId: asset.assetId,
      contentVersion: 1,
      contentType: asset.contentType,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
    },
    { 'Idempotency-Key': key },
  );
  if (reservation.status === 'VERIFIED') {
    verifyReceipt(asset, reservation);
    return reservation;
  }
  if (
    !/^[a-f0-9-]{36}$/i.test(reservation.uploadId ?? '') ||
    reservation.status !== 'PENDING' ||
    reservation.method !== 'PUT' ||
    reservation.objectKey !== plannedKey(asset) ||
    reservation.bucket !== 'numora-bucket' ||
    reservation.headers?.['Content-Type'] !== asset.contentType ||
    reservation.headers?.['Content-Length'] !== String(bytes.length)
  )
    throw new MediaUploadError('Invalid backend upload reservation.');
  const target = new URL(reservation.uploadUrl);
  if (
    target.protocol !== 'https:' ||
    !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/i.test(target.hostname) ||
    target.username ||
    target.password
  )
    throw new MediaUploadError('Backend upload URL is not an expected R2 endpoint.');
  const put = await fetchImpl(target.href, {
    method: 'PUT',
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': asset.contentType, 'Content-Length': String(bytes.length) },
    body: bytes,
  });
  if (!put.ok)
    throw new MediaUploadError(`R2 upload failed (HTTP ${put.status}); sample remains pending.`);
  const receipt = await requestApi(`${endpoint}/${reservation.uploadId}/complete`);
  verifyReceipt(asset, receipt);
  return receipt;
}

async function atomicJson(filename, value) {
  const temporary = `${filename}.upload-tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filename);
}

export async function persistSamples(batch) {
  const { root, assets, questions, plan } = batch;
  // Assets are the checkpoint. If interrupted between files, rerun to reconcile copies.
  await atomicJson(join(root, 'assets.draft.json'), assets);
  for (const q of questions) {
    const media = assets.filter((a) => a.externalId === q.externalId);
    q.metadata.assetManifest = media.map((a) => ({ ...a }));
    const keys = (placement, itemId = null) =>
      media
        .filter((a) => a.placement === placement && a.itemId === itemId && a.uploadedToR2)
        .sort((a, b) => a.assetOrder - b.assetOrder)
        .map((a) => a.objectKey);
    q.stem.assetKeys = keys('STEM');
    q.explanation.assetKeys = keys('EXPLANATION');
    for (const option of q.options ?? [])
      option.content.assetKeys = keys(q.type === 'CATEGORY' ? 'STATEMENT' : 'OPTION', option.id);
    if (media.every((a) => a.uploadedToR2))
      q.metadata.importBlockers = q.metadata.importBlockers.filter(
        (b) => !['R2_UPLOAD_PENDING', 'R2_UPLOAD_NOT_CONFIRMED'].includes(b),
      );
    q.metadata.pendingFields = (q.metadata.pendingFields ?? []).filter(
      (field) => field !== 'metadata.assetManifest.objectKey',
    );
    // Upload does not close curriculum/master/schema/importer review blockers.
    q.metadata.importReady = false;
    await atomicJson(join(root, 'questions', `${q.externalId}.draft.json`), q);
  }
  await atomicJson(join(root, 'questions.draft.json'), questions);
  plan.uploadConfirmed = assets.every((a) => a.uploadedToR2);
  plan.status = plan.uploadConfirmed ? 'VERIFIED_BY_BACKEND' : 'PARTIAL_BACKEND_UPLOAD';
  plan.files = plan.files.map((file) => {
    const asset = assets.find(
      (a) => a.externalId === file.externalId && a.assetId === file.assetId,
    );
    return { ...file, objectKey: asset.objectKey, uploadedToR2: asset.uploadedToR2 };
  });
  await atomicJson(join(root, 'r2-upload-plan.json'), plan);
}

async function main() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--samples' && args[i + 1] && !args[i + 1].startsWith('--')) {
      i++;
      continue;
    }
    if (args[i] !== '--dry-run')
      throw new MediaUploadError('Use --dry-run and/or --samples <directory>.');
  }
  const index = args.indexOf('--samples');
  const batch = await loadSamples(index >= 0 ? args[index + 1] : defaultSamples);
  console.log(
    `Validated ${batch.questions.length} review questions and ${batch.assets.length} images (${batch.files.reduce((n, f) => n + f.bytes.length, 0)} bytes).`,
  );
  if (args.includes('--dry-run')) {
    console.log('Dry run: no Cloud requests or file writes.');
    return;
  }
  for (const { asset, bytes } of batch.files) {
    // Always replay reservation through backend; never trust a local uploaded flag alone.
    const receipt = await uploadAsset(asset, bytes, {
      baseUrl: process.env.API_BASE_URL,
      token: process.env.ADMIN_AUTH_TOKEN,
      runId: process.env.MEDIA_UPLOAD_RUN_ID,
    });
    applyReceipt(asset, receipt);
    await persistSamples(batch);
    console.log(`Verified ${asset.externalId}/${asset.assetId}.`);
  }
  console.log(
    'Media keys confirmed. Questions remain DRAFT and require the documented import/review steps.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof MediaUploadError
        ? error.message
        : 'Upload/validation failed. Check server configuration, Admin session, sample checksums and reservation expiry. Signed URLs/tokens are not logged.',
    );
    process.exitCode = 1;
  });
}

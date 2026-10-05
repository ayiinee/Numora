import { createHash } from 'node:crypto';
import Ajv from 'ajv/dist/2020';
import {
  contentImportSchema,
  type ImportQuestion,
  type ContentAnswer,
  type PreviewSnapshot,
  type ContentAsset,
} from '@tka/database';
import { BadRequestException } from '@nestjs/common';

const validate = new Ajv({ strict: true, allErrors: true }).compile(contentImportSchema);
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
export function digest(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function cleanAsset(a: ContentAsset): ContentAsset {
  return {
    externalId: a.externalId,
    assetId: a.assetId,
    textMarker: a.textMarker,
    placement: a.placement,
    itemId: a.itemId,
    assetOrder: a.assetOrder,
    altText: a.altText,
    objectKey: a.objectKey,
    sha256: a.sha256,
    contentType: a.contentType,
    byteLength: a.byteLength,
    bucket: a.bucket,
  };
}
export function snapshot(q: ImportQuestion): PreviewSnapshot {
  return {
    externalId: q.externalId,
    type: q.type,
    stem: { text: q.stem.text },
    options: q.options.map((o) => ({ id: o.id, content: { text: o.content.text } })),
    categories: q.metadata.categories ?? [],
    answerKey: normalizeAnswer(
      q.type,
      q.answer,
      q.options.map((o) => o.id),
      (q.metadata.categories ?? []).map((c) => c.id),
    )!,
    explanation: { text: q.explanation.text },
    assets: (q.metadata.assetManifest ?? []).map(cleanAsset),
  };
}
export function structuralErrors(input: unknown): string[] {
  if (!validate(input)) return ['INVALID_SCHEMA'];
  const q = input as ImportQuestion;
  const errors: string[] = [];
  if (
    !q.stem.text.trim() ||
    !q.explanation.text.trim() ||
    q.options.some((o) => !o.content.text.trim())
  )
    errors.push('CONTENT_EMPTY');
  if (new Set(q.options.map((o) => o.id)).size !== q.options.length)
    errors.push('DUPLICATE_OPTION');
  const categories = q.metadata.categories ?? [];
  if (new Set(categories.map((c) => c.id)).size !== categories.length)
    errors.push('DUPLICATE_CATEGORY');
  if (q.type === 'CATEGORY' && categories.length < 2) errors.push('CATEGORIES_REQUIRED');
  if (q.type !== 'CATEGORY' && categories.length) errors.push('UNEXPECTED_CATEGORIES');
  try {
    normalizeAnswer(
      q.type,
      q.answer,
      q.options.map((o) => o.id),
      categories.map((c) => c.id),
    );
    if (
      q.type === 'CATEGORY' &&
      (!('categoryByStatementId' in q.answer) ||
        Object.keys(q.answer.categoryByStatementId).length !== q.options.length)
    )
      errors.push('INCOMPLETE_KEY');
  } catch {
    errors.push('INVALID_KEY');
  }
  const assets = q.metadata.assetManifest ?? [];
  if (new Set(assets.map((a) => a.assetId)).size !== assets.length) errors.push('DUPLICATE_ASSET');
  const placements = [
    { text: q.stem, placement: 'STEM', itemId: null },
    { text: q.explanation, placement: 'EXPLANATION', itemId: null },
    ...q.options.map((o) => ({
      text: o.content,
      placement: q.type === 'CATEGORY' ? 'STATEMENT' : 'OPTION',
      itemId: o.id,
    })),
  ];
  const seen = new Set<string>();
  for (const p of placements) {
    const markers = [...p.text.text.matchAll(/\[\[asset:([^\]]+)\]\]/g)].map((m) => m[1]);
    for (const id of markers) {
      const a = assets.find((a) => a.assetId === id);
      if (!a || a.placement !== p.placement || a.itemId !== p.itemId)
        errors.push('INVALID_ASSET_MARKER');
      else seen.add(a.assetId);
    }
    if (
      (p.text.assetKeys ?? []).some(
        (k) =>
          !assets.some(
            (a) => a.objectKey === k && a.placement === p.placement && a.itemId === p.itemId,
          ),
      )
    )
      errors.push('INVALID_ASSET_REFERENCE');
  }
  for (const a of assets)
    if (
      a.externalId !== q.externalId ||
      a.textMarker !== `[[asset:${a.assetId}]]` ||
      !seen.has(a.assetId)
    )
      errors.push('INVALID_ASSET_MANIFEST');
  return [...new Set(errors)];
}
export function normalizeAnswer(
  kind: string,
  answer: unknown,
  ids: string[],
  categories: string[],
): ContentAnswer {
  const invalid = () => {
    throw new BadRequestException({
      code: 'INVALID_ANSWER',
      detail: 'Answer shape or identifiers do not match this item.',
    });
  };
  if (answer === null) return null;
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return invalid();
  const a = answer as Record<string, unknown>;
  const field =
    kind === 'SINGLE_CHOICE'
      ? 'optionId'
      : kind === 'CATEGORY'
        ? 'categoryByStatementId'
        : 'optionIds';
  if (Object.keys(a).length !== 1 || !(field in a)) return invalid();
  if (kind === 'SINGLE_CHOICE') {
    if (typeof a.optionId !== 'string' || !ids.includes(a.optionId)) return invalid();
    return { optionId: a.optionId };
  }
  if (kind === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER') {
    if (
      !Array.isArray(a.optionIds) ||
      a.optionIds.some((id) => typeof id !== 'string' || !ids.includes(id)) ||
      new Set(a.optionIds).size !== a.optionIds.length
    )
      return invalid();
    return a.optionIds.length ? { optionIds: [...a.optionIds].sort() } : null;
  }
  if (
    !a.categoryByStatementId ||
    typeof a.categoryByStatementId !== 'object' ||
    Array.isArray(a.categoryByStatementId)
  )
    return invalid();
  const map = a.categoryByStatementId as Record<string, unknown>;
  if (
    Object.entries(map).some(
      ([id, c]) => !ids.includes(id) || typeof c !== 'string' || !categories.includes(c),
    )
  )
    return invalid();
  return Object.keys(map).length ? { categoryByStatementId: map as Record<string, string> } : null;
}

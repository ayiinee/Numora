import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { contentImportSchema, type ImportQuestion } from '@tka/database';
import { digest, snapshot, structuralErrors, normalizeAnswer } from './content-import.validation';
describe('question import contract semantics', () => {
  it('allows Pretest without a Drill level while retaining required academic mapping', async () => {
    const q = JSON.parse(
      await readFile(
        resolve('../../docs/data/samples/2026-10-03/questions/CURR-IND20-L01-Q07.draft.json'),
        'utf8',
      ),
    ) as ImportQuestion;
    const pretest = { ...q, metadata: { ...q.metadata, sourceLevelNumber: null } };
    expect(structuralErrors(pretest, false, false, true)).toEqual([]);
    expect(structuralErrors(pretest)).toContain('INVALID_SCHEMA');
    expect(structuralErrors({ ...pretest, chapterCode: null }, false, false, true)).toContain(
      'INVALID_SCHEMA',
    );
  });
  it('runtime schema equals its machine-readable source', async () => {
    expect(contentImportSchema).toEqual(
      JSON.parse(
        await readFile(
          resolve('../../packages/contracts/questions/question-import-v2.schema.json'),
          'utf8',
        ),
      ),
    );
  });
  it('keeps content hash stable across provenance, reviewer claims and MCMA key ordering', async () => {
    const q = JSON.parse(
      await readFile(
        resolve('../../docs/data/samples/2026-10-03/questions/CURR-IND20-L01-Q07.draft.json'),
        'utf8',
      ),
    ) as ImportQuestion;
    const reordered = {
      ...q,
      answer: { optionIds: [...('optionIds' in q.answer ? q.answer.optionIds : [])].reverse() },
      metadata: { ...q.metadata, importReady: true, reviewer: 'untrusted' },
    };
    expect(digest(snapshot(q))).toBe(digest(snapshot(reordered)));
    expect(structuralErrors(q)).toEqual([]);
    expect(structuralErrors({ ...q, options: [...q.options, q.options[0]] })).toContain(
      'DUPLICATE_OPTION',
    );
    expect(() => normalizeAnswer(q.type, { optionIds: ['FOREIGN'] }, ['A'], [])).toThrow();
  });

  it('accepts asset IDs and durable object keys in rich content references', async () => {
    const q = JSON.parse(
      await readFile(
        resolve('../../docs/data/samples/2026-10-03/questions/CURR-IND20-L01-Q07.draft.json'),
        'utf8',
      ),
    ) as ImportQuestion;
    const asset = {
      externalId: q.externalId,
      assetId: 'diagram-1',
      textMarker: '[[asset:diagram-1]]',
      placement: 'STEM' as const,
      itemId: null,
      assetOrder: 1,
      altText: 'Diagram',
      objectKey: 'question-media/GEN-image/v1/diagram-1.png',
      sha256: 'a'.repeat(64),
      contentType: 'image/png' as const,
      byteLength: 1,
      bucket: 'numora-prod',
    };
    const withAsset = {
      ...q,
      stem: { ...q.stem, text: `${q.stem.text}\n[[asset:diagram-1]]` },
      metadata: { ...q.metadata, assetManifest: [asset] },
    };
    expect(structuralErrors(withAsset)).toEqual([]);
    expect(
      structuralErrors({
        ...withAsset,
        stem: { ...withAsset.stem, assetKeys: [asset.objectKey] },
      }),
    ).toEqual([]);
  });
});

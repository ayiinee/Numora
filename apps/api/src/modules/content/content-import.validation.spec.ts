import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { contentImportSchema, type ImportQuestion } from '@tka/database';
import { digest, snapshot, structuralErrors, normalizeAnswer } from './content-import.validation';
describe('question import contract semantics', () => {
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
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateGeneratorCandidate } from './generator.service';
import { verifyFingerprint } from '@tka/irt-orchestration';
const fixtures = JSON.parse(
  readFileSync(
    resolve('../../packages/contracts/generator-service-v1/candidates.fixture.json'),
    'utf8',
  ),
) as { name: string; payload: Record<string, unknown> }[];
describe('generation candidate boundary uses the Numora decoder', () => {
  for (const f of fixtures)
    it(f.name, () => {
      const original = JSON.stringify(f.payload);
      verifyFingerprint(validateGeneratorCandidate(f.payload));
      expect(JSON.stringify(f.payload)).toBe(original);
    });
  it('rejects tampered content without silently normalizing a sealed payload', () => {
    const p = structuredClone(fixtures[0]!.payload);
    p.stem = { text: 'Tampered' };
    expect(() => verifyFingerprint(validateGeneratorCandidate(p))).toThrow();
  });
  it('rejects unknown fields, media, invalid keys, empty text and unknown rubric UUID', () => {
    for (const extra of [
      { extra: true },
      { media: [{ assetId: 'x' }] },
      { answerKey: { optionId: 'foreign' } },
      { stem: { text: ' ' } },
      { rubricVersionId: 'wrong' },
    ]) {
      expect(() => validateGeneratorCandidate({ ...fixtures[0]!.payload, ...extra })).toThrow();
    }
  });
  it('requires complete category keys and unique statements', () => {
    const f = fixtures.find((f) => f.payload.questionType === 'CATEGORY')!;
    expect(() =>
      validateGeneratorCandidate({
        ...f.payload,
        answerKey: { categoryByStatementId: { A: 'foreign' } },
      }),
    ).toThrow();
  });
});

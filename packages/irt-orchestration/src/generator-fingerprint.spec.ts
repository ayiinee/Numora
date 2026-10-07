import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentFingerprint, fingerprint, type Json } from './generator-fingerprint.js';
const fixtures = JSON.parse(
  readFileSync(resolve('../contracts/generator-service-v1/fingerprints.fixture.json'), 'utf8'),
);
const candidates = JSON.parse(
  readFileSync(resolve('../contracts/generator-service-v1/candidates.fixture.json'), 'utf8'),
);
describe('Python/Numora compact content fingerprint', () => {
  for (const f of fixtures) it(f.name, () => expect(fingerprint(f.input as Json)).toBe(f.sha256));
  for (const f of candidates)
    it(f.name, () => expect(contentFingerprint(f.payload)).toBe(f.payload.contentFingerprint));
  it('rejects unsafe numeric values', () => {
    for (const n of [1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => fingerprint(n)).toThrow('NON_CANONICAL_NUMBER');
  });
});

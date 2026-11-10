// Read-only cross-repo contract/fingerprint check; Python runtime is tested separately.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const main = resolve(import.meta.dirname, '..');
assert.ok(process.env.NUMORA_AI_SERVICE_PATH, 'NUMORA_AI_SERVICE_PATH required');
const ai = resolve(process.env.NUMORA_AI_SERVICE_PATH);
for (const version of ['v1', 'v2']) {
  const left = resolve(main, `packages/contracts/generator-service-${version}`);
  const right = resolve(ai, `contracts/generator-service-${version}`);
  const names = (await readdir(left)).filter((n) => n.endsWith('.json'));
  assert.deepEqual(names.sort(), (await readdir(right)).filter((n) => n.endsWith('.json')).sort());
  for (const name of names)
    assert.deepEqual(
      await readFile(resolve(left, name)),
      await readFile(resolve(right, name)),
      name,
    );
  if (version === 'v1') {
    const modules = await Promise.all(
      [left, right].map((p) => import(pathToFileURL(resolve(p, 'fingerprint.ts')).href)),
    );
    const vectors = JSON.parse(await readFile(resolve(left, 'fingerprints.fixture.json'), 'utf8'));
    for (const mod of modules) {
      for (const vector of vectors) {
        assert.equal(mod.canonical(vector.input), vector.canonical);
        assert.equal(mod.fingerprint(vector.input), vector.sha256);
      }
      const input = { stem: { text: 'TEST' }, contentFingerprint: 'obsolete' };
      assert.equal(mod.contentFingerprint(input), mod.fingerprint({ stem: input.stem }));
      assert.equal(input.contentFingerprint, 'obsolete');
      for (const number of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])
        assert.throws(() => mod.canonical(number), /NON_CANONICAL_NUMBER/);
    }
    console.log(`Fingerprint vectors: ${vectors.length} per repo PASS`);
  }
}
console.log('Generator v1/v2 JSON byte parity and fingerprint behavior PASS');

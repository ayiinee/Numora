import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(new URL('../../../apps/api/package.json', import.meta.url));
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);
const read = async (name) => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
for (const [file, schema] of [
  ['notification', 'notification'],
  ['response', 'response'],
  ['numeric-candidate', 'candidate'],
  ['stock-candidate', 'candidate'],
  ['media-candidate', 'candidate'],
]) {
  test(`v2 sanitized ${file} matches shared ${schema}`, async () => {
    const definition = await read(`${schema}.schema.json`);
    const validate = ajv.getSchema(definition.$id) ?? ajv.compile(definition);
    assert(validate(await read(`examples/${file}.json`)), JSON.stringify(validate.errors));
  });
}
test('v1 and v2 notification schemas preserve compute v3 envelope', async () => {
  const example = await read('examples/notification.json');
  assert.equal(example.contractVersion, 3);
  assert.deepEqual(Object.keys(example).sort(), [
    'contractVersion',
    'dispatchGeneration',
    'inputDigest',
    'requestId',
  ]);
});

test('optional Drill wave manifest enforces ten slots and three anchors', async () => {
  const validate = ajv.compile(await read('drill-variant-manifest.schema.json'));
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const sha = 'a'.repeat(64);
  const manifest = {
    contractVersion: 'generator-service-v2',
    ecosystem: 'DRILL',
    dimension: 'LEVEL',
    armKind: 'VARIANT',
    sourcePackageId: uuid(1),
    sourcePackageVersion: 1,
    sourceDigest: sha,
    levelId: uuid(2),
    contextId: uuid(3),
    contextRevision: 1,
    policyVersionId: uuid(4),
    originalRevisionId: uuid(5),
    variantArmId: uuid(6),
    blueprintVersionId: uuid(7),
    manifestDigest: sha,
    runtime: { runtimeProfile: 'test-only', imageDigest: 'sha256:' + sha },
    items: Array.from({ length: 10 }, (_, i) => {
      const anchor = [1, 4, 8].includes(i);
      return {
        role: anchor ? 'ANCHOR' : 'FOCAL',
        displayOrder: i + 1,
        questionVersionId: uuid(20 + i),
        familyId: uuid(40 + i),
        rubricVersionId: uuid(60 + i),
        contentHash: sha,
        sourceFingerprint: sha,
        competencyCode: 'TEST',
        maxPoints: '1.00',
        maximumScoreCategory: 1,
        seed: anchor ? null : 321,
        mapping: anchor
          ? null
          : {
              approvalId: uuid(80 + i),
              configId: uuid(100 + i),
              configVersion: 1,
              configDigest: sha,
              mode: 'NUMERIC',
              sourceFingerprint: sha,
              originalHash: sha.slice(0, 16),
              originalVersion: 1,
              mediaProfile: null,
            },
      };
    }),
  };
  assert(validate(manifest), JSON.stringify(validate.errors));
  assert(!validate({ ...manifest, items: manifest.items.slice(1) }));
  assert(
    !validate({
      ...manifest,
      items: manifest.items.map((item, i) =>
        i === 0 ? { ...item, role: 'ANCHOR', mapping: null, seed: null } : item,
      ),
    }),
  );
  assert(!validate({ ...manifest, ecosystem: 'TRYOUT' }));
});

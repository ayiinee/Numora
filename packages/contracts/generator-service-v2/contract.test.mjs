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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateInput, validateResult } from './validate.mjs';

const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const fixture = read('conformance.fixture.json');

function change(targets, patch) {
  let at = targets[patch.target];
  for (const key of patch.path.slice(0, -1)) at = at[key];
  const key = patch.path.at(-1);
  if (patch.op === 'remove') {
    if (Array.isArray(at)) at.splice(key, 1);
    else delete at[key];
  } else if (patch.op === 'append') at[key].push(structuredClone(patch.value));
  else at[key] = structuredClone(patch.value);
}

for (const vector of fixture.cases) {
  test(vector.name, () => {
    const targets = {
      input: read(vector.input),
      result: vector.result ? read(vector.result) : null,
      dispatch: read('dispatch.fixture.json'),
    };
    for (const patch of vector.patches) change(targets, patch);
    const run = () =>
      vector.kind === 'input'
        ? validateInput(targets.input)
        : validateResult(targets.result, targets.input, targets.dispatch);
    if (vector.expectedError) assert.throws(run, (e) => e.message === vector.expectedError);
    else assert.doesNotThrow(run);
  });
}

test('non-finite JSON numbers are rejected', () => {
  const input = read('examples/drill-input.json');
  const output = read('examples/drill-result.json');
  output.outcome.items[0].parameters.discriminationA = Infinity;
  assert.throws(
    () => validateResult(output, input, read('dispatch.fixture.json')),
    /IRT_SCHEMA_INVALID/,
  );
});

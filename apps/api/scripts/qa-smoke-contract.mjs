import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const openapi = JSON.parse(
  await readFile(
    new URL('../../../packages/contracts/openapi/openapi.json', import.meta.url),
    'utf8',
  ),
);
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validateCurrentTryout = ajv.compile(openapi.components.schemas.CurrentTryoutDto);

// Validate server state rather than inferring access from Class affiliation or seed contents.
export function assertCurrentTryoutResponse(response, actor) {
  assert.equal(response.status, 200, `${actor}: current Tryout request failed`);
  const value = response.value;
  // Do not include response bodies or validator errors in diagnostics: they may contain private data.
  assert.ok(validateCurrentTryout(value), `${actor}: current Tryout response violates OpenAPI`);
  if (value.state === 'unavailable') {
    assert.equal(Object.keys(value).length, 1, `${actor}: unavailable must return only state`);
    return;
  }
  for (const key of [
    'id',
    'title',
    'releaseAt',
    'eligible',
    'attemptId',
    'questionCount',
    'durationSeconds',
  ]) {
    assert.ok(Object.hasOwn(value, key), `${actor}: available Tryout is missing ${key}`);
  }
  if (value.state === 'open') {
    assert.equal(value.eligible, true, `${actor}: open Tryout must allow a new attempt`);
    assert.equal(value.attemptId, null, `${actor}: open Tryout must not have an existing attempt`);
  } else {
    assert.equal(value.eligible, false, `${actor}: existing attempt must prevent another start`);
    assert.equal(typeof value.attemptId, 'string', `${actor}: existing attempt must have an ID`);
  }
}

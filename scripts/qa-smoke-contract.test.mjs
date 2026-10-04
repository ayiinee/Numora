import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCurrentTryoutResponse } from '../apps/api/scripts/qa-smoke-contract.mjs';

const packageId = '00000000-0000-4000-8000-000000000001';
const attemptId = '00000000-0000-4000-8000-000000000002';
const open = {
  id: packageId,
  title: 'TEST ONLY Tryout',
  releaseAt: '2026-09-27T17:00:00Z',
  state: 'open',
  eligible: true,
  attemptId: null,
  questionCount: 2,
  durationSeconds: null,
};
const response = (value, status = 200) => ({ status, value });

test('both QA affiliations accept no package without requiring eligible', () => {
  for (const actor of ['studentB', 'studentA']) {
    assertCurrentTryoutResponse(response({ state: 'unavailable' }), actor);
    for (const eligible of [true, false]) {
      assert.throws(() =>
        assertCurrentTryoutResponse(response({ state: 'unavailable', eligible }), actor),
      );
    }
  }
});

test('smoke accepts package publication and each existing-attempt lifecycle for either affiliation', () => {
  for (const actor of ['studentB', 'studentA']) {
    assertCurrentTryoutResponse(response(open), actor);
    for (const state of ['inProgress', 'waitingIrt', 'resultReady']) {
      const current = { ...open, state, eligible: false, attemptId };
      assertCurrentTryoutResponse(response(current), actor);
      assert.throws(() =>
        assertCurrentTryoutResponse(response({ ...current, eligible: true }), actor),
      );
      assert.throws(() =>
        assertCurrentTryoutResponse(response({ ...current, attemptId: null }), actor),
      );
    }
  }
  assert.throws(() =>
    assertCurrentTryoutResponse(response({ ...open, eligible: false }), 'studentB'),
  );
  assert.throws(() => assertCurrentTryoutResponse(response({ ...open, attemptId }), 'studentA'));
});

test('smoke rejects HTTP failures, malformed contracts, and missing available-package metadata', () => {
  assert.throws(() => assertCurrentTryoutResponse(response(open, 403), 'studentB'));
  for (const value of [
    null,
    {},
    { state: 'policyPending' },
    { ...open, id: 'bad-uuid' },
    { ...open, releaseAt: 'bad-date' },
    { ...open, eligible: 'true' },
    { ...open, questionCount: '2' },
    { ...open, durationSeconds: 'pending' },
  ]) {
    assert.throws(() => assertCurrentTryoutResponse(response(value), 'studentA'));
  }
  for (const key of Object.keys(open)) {
    const missing = { ...open };
    delete missing[key];
    assert.throws(() => assertCurrentTryoutResponse(response(missing), 'studentB'));
  }
});

test('failure diagnostics do not echo a malformed response containing private data', () => {
  const privateValue = 'TEST_ONLY_private_response_value';
  const value = { ...open, id: privateValue, email: privateValue, token: privateValue };
  assert.throws(
    () => assertCurrentTryoutResponse(response(value), 'studentB'),
    (error) => {
      assert.ok(error.message.includes('violates OpenAPI'));
      assert.ok(!String(error.stack).includes(privateValue));
      assert.ok(!JSON.stringify(error).includes(privateValue));
      return true;
    },
  );
});

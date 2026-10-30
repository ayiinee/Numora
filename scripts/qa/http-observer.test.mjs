import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import {
  safeErrorFingerprint,
  responseMetadata,
  createHttpObserver,
} from '../../qa/runtime/http-observer.mjs';

test('QA error observer captures SQLSTATE through wrappers without sensitive content', () => {
  const cause = {
    code: '53200',
    message: 'password=private',
    parameters: ['secret'],
    stack: 'token',
    query: 'select record_assessment_delivery($1)',
  };
  const error = {
    cause,
    query: 'select record_assessment_delivery($1)',
    message: 'Bearer private',
  };
  cause.cause = error;
  assert.deepEqual(safeErrorFingerprint(error), {
    sqlStates: ['53200'],
    databaseOperations: ['assessment_delivery'],
  });
  assert.deepEqual(safeErrorFingerprint({ code: 'INVALID_SESSION', message: 'private' }), {
    sqlStates: [],
    databaseOperations: [],
  });
});

test('QA response observer retains start/result metadata but excludes content and identities outside attempts', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const value = responseMetadata({
    id,
    status: 'completed',
    questions: [],
    answerKey: 'B',
    studentEmail: 'private@example.test',
    reward: { totalXp: 130 },
    authorization: 'secret',
  });
  assert.deepEqual(value, {
    responseId: id,
    attemptStatus: 'completed',
    questionCount: 0,
    totalXp: 130,
  });
  assert.deepEqual(responseMetadata({ id: 'not-uuid', status: 'secret', score: Infinity }), {});
});

test('QA observer cannot write outside local artifact directory', () => {
  assert.throws(
    () => createHttpObserver(process.cwd(), '../elsewhere/evidence.jsonl'),
    /LOCAL_ARTIFACT_REQUIRED/,
  );
});

test('QA observer keeps the response unchanged and records finish/close without secrets', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'numora-qa-http-observer-'));
  t.after(() => {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('numora-qa-http-observer-'));
    rmSync(root, { recursive: true, force: true });
  });
  const directory = resolve(root, 'qa/.local');
  assert.equal(existsSync(directory), false);
  mkdirSync(directory, { recursive: true });
  const file = resolve(directory, 'events.jsonl');
  const observer = createHttpObserver(root, file);
  const body = {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'inProgress',
    questions: [{ stem: 'PRIVATE_CONTENT' }],
  };
  const server = createServer((req, res) => {
    res.json = function (data) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(data));
    };
    observer.middleware(req, res, () => {
      res.statusCode = 201;
      res.json(body);
    });
  });
  let observerClosed = false;
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const response = await fetch(
      'http://127.0.0.1:' + server.address().port + '/api/v1/assessments/drill/attempts',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer PRIVATE_TOKEN', 'x-qa-operation-id': 'test:1:0' },
      },
    );
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), body);
    await new Promise((done) => server.close(done));
    await observer.close();
    observerClosed = true;
    const text = readFileSync(file, 'utf8');
    assert.ok(!/PRIVATE_TOKEN|PRIVATE_CONTENT|Authorization/.test(text));
    const events = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(events.find((e) => e.event === 'response_prepared').questionCount, 1);
    assert.equal(events.find((e) => e.event === 'response_finished').httpStatus, 201);
    assert.equal(events.find((e) => e.event === 'response_closed').writableFinished, true);
    assert.ok(events.every((e) => e.operationId === 'test:1:0'));
  } finally {
    server.closeAllConnections();
    server.close();
    if (!observerClosed) await observer.close();
  }
});

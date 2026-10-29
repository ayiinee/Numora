import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { EventEmitter } from 'node:events';
import { uuid, readJson } from './core.mjs';
import { trackOwnedProcess } from './process.mjs';
test('process ledger records owned lifecycle without credentials and rejects unsafe run IDs', (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'numora-qa-process-'));
  t.after(() => {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('numora-qa-process-'));
    rmSync(root, { recursive: true, force: true });
  });
  const child = Object.assign(new EventEmitter(), { pid: 12345 }),
    runId = uuid();
  trackOwnedProcess(root, child, { QA_RUN_ID: runId, SECRET: 'must-not-appear' }, 'API fixture');
  const path = resolve(root, 'qa/.local/processes', runId, '12345.json');
  assert.equal(readJson(path).endedAt, null);
  child.emit('close', 0);
  assert.equal(readJson(path).code, 0);
  assert.ok(readJson(path).endedAt);
  assert.ok(!JSON.stringify(readJson(path)).includes('must-not-appear'));
  assert.throws(
    () => trackOwnedProcess(root, child, { QA_RUN_ID: '../other' }, 'fixture'),
    /INVALID_PROCESS_RUN_ID/,
  );
});

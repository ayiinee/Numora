import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  inside,
  readJson,
  writeJson,
  digest,
  uuid,
  sanitize,
  validateScenario,
  discover,
  identity,
  sameIdentity,
  enforceMinimum,
  newSession,
  loadSession,
  evaluateEvidence,
  summarize,
  writeReport,
  publicationRequest,
  publicationReadback,
  nextActions,
} from './core.mjs';
const repository = fileURLToPath(new URL('../../', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'numora-qa-test-'));
  t.after(() => {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('numora-qa-test-'));
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(resolve(root, 'qa/schemas'), { recursive: true });
  for (const name of ['scenario', 'session', 'result'])
    copyFileSync(
      resolve(repository, 'qa/schemas/' + name + '.schema.json'),
      resolve(root, 'qa/schemas/' + name + '.schema.json'),
    );
  writeJson(resolve(root, 'qa/config.json'), { rules: ['AGENTS.md'] });
  writeFileSync(resolve(root, 'AGENTS.md'), 'Approved policy v1');
  writeJson(resolve(root, 'package.json'), { name: 'fixture' });
  writeFileSync(resolve(root, '.gitignore'), 'qa/.local/\nqa/**/reports/\n');
  const scenario = {
    schemaVersion: 1,
    id: 'SIS-001',
    role: 'siswa',
    title: 'Fixture',
    priority: 1,
    sources: [{ id: 'PRD', path: 'AGENTS.md' }],
    cases: [
      {
        id: 'TC-001',
        title: 'Expected from independent source',
        source: 'PRD',
        checks: ['quality'],
        applicability: 'required',
      },
    ],
    checks: [
      {
        id: 'quality',
        adapter: 'quality',
        profile: 'quick',
        evidence: 'static',
        files: ['package.json'],
        minimumTests: 1,
      },
    ],
    manifestPath: 'qa/scenarios/siswa/SIS-001/scenario.json',
  };
  const { manifestPath, ...manifest } = scenario;
  writeJson(resolve(root, manifestPath), manifest);
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init');
  git('add', '.');
  git('-c', 'user.name=QA Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'fixture');
  return { root, scenario };
}
test('valid scenario is discoverable and source/check references are grounded', (t) => {
  const { root, scenario } = fixture(t);
  assert.equal(validateScenario(root, scenario).id, 'SIS-001');
  assert.equal(discover(root).length, 1);
});
test('manifest rejects a missing implementation, invalid role path and unknown adapter', (t) => {
  const { root, scenario } = fixture(t);
  const missing = structuredClone(scenario);
  missing.checks[0].files = ['missing.test.ts'];
  assert.throws(() => validateScenario(root, missing), /TEST_FILE_NOT_FOUND/);
  assert.throws(() => validateScenario(root, { ...scenario, role: 'admin' }), /ROLE_PATH/);
  const unknown = structuredClone(scenario);
  unknown.checks[0].adapter = 'shell';
  assert.throws(() => validateScenario(root, unknown), /INVALID_SCENARIO/);
});
test('path traversal, Windows absolute paths and command-like missing paths are rejected', (t) => {
  const { root, scenario } = fixture(t);
  for (const path of ['../outside', '/etc/passwd', 'C:\\outside', 'qa/../../outside'])
    assert.throws(() => inside(root, path));
  const bad = structuredClone(scenario);
  bad.checks[0].files = ['--reporter=skip'];
  assert.throws(() => validateScenario(root, bad), /TEST_FILE_NOT_FOUND/);
});
test('duplicate IDs, missing requirement references and unexplained N/A are rejected', (t) => {
  const { root, scenario } = fixture(t);
  const duplicate = structuredClone(scenario);
  duplicate.checks.push(duplicate.checks[0]);
  assert.throws(() => validateScenario(root, duplicate), /DUPLICATE_CHECK/);
  const source = structuredClone(scenario);
  source.cases[0].source = 'UNKNOWN';
  assert.throws(() => validateScenario(root, source), /SOURCE_NOT_FOUND/);
  const na = structuredClone(scenario);
  na.cases[0].applicability = 'not-applicable';
  assert.throws(() => validateScenario(root, na), /REASON_REQUIRED/);
});
test('zero exit cannot turn empty, skipped, missing or inconsistent evidence green', () => {
  for (const data of [
    null,
    { passed: 0, failed: 0, skipped: 0, total: 0 },
    { passed: 1, failed: 0, skipped: 1, total: 2 },
    { passed: 3, failed: 0, skipped: 0, total: 2 },
  ])
    assert.equal(evaluateEvidence(0, data, 1).status, 'BLOCKED');
  assert.equal(
    evaluateEvidence(0, { passed: 2, failed: 0, skipped: 0, total: 2 }, 3).status,
    'BLOCKED',
  );
});
test('assertion failure is retained and legitimate positive evidence can pass', () => {
  assert.equal(
    evaluateEvidence(1, { passed: 1, failed: 1, skipped: 0, total: 2 }, 1).status,
    'FAIL',
  );
  assert.equal(
    evaluateEvidence(0, { passed: 2, failed: 0, skipped: 0, total: 2 }, 2).status,
    'PASS',
  );
});
test('each member/session is independent and ambiguity requires explicit selection', (t) => {
  const { root } = fixture(t);
  const first = newSession(root, 'siswa'),
    other = newSession(root, 'guru');
  assert.notEqual(first.id, other.id);
  assert.equal(loadSession(root, first.id).role, 'siswa');
  assert.throws(() => loadSession(root), /AMBIGUOUS_SESSION/);
  newSession(root, 'siswa');
  assert.throws(() => loadSession(root, undefined, 'siswa'), /AMBIGUOUS_SESSION/);
});
test('code and rule changes invalidate evidence while generated reports do not', (t) => {
  const { root, scenario } = fixture(t),
    original = identity(root, scenario);
  writeJson(resolve(root, 'qa/scenarios/siswa/SIS-001/reports/one/result.json'), { ignored: true });
  assert.equal(sameIdentity(original, identity(root, scenario)), true);
  writeFileSync(resolve(root, 'AGENTS.md'), 'Approved policy v2');
  assert.equal(sameIdentity(original, identity(root, scenario)), false);
  writeFileSync(resolve(root, 'AGENTS.md'), 'Approved policy v1');
  writeFileSync(resolve(root, 'new-code.mjs'), 'export const changed = true;\n');
  assert.equal(sameIdentity(original, identity(root, scenario)), false);
});

test('local environment changes invalidate evidence without exposing configuration', (t) => {
  const { root, scenario } = fixture(t);
  writeFileSync(resolve(root, '.env.test.local'), 'QA_LOCAL_ENV_LABEL=before');
  const before = identity(root, scenario);
  writeFileSync(resolve(root, '.env.test.local'), 'QA_LOCAL_ENV_LABEL=after');
  assert.equal(sameIdentity(before, identity(root, scenario)), false);
  assert.match(before.environmentHash, /^[a-f0-9]{64}$/);
});

test('every adapter needs the declared minimum evidence before claiming PASS', () => {
  assert.equal(
    enforceMinimum({ minimumTests: 2 }, { status: 'PASS', observedTests: 1 }).status,
    'BLOCKED',
  );
  assert.equal(
    enforceMinimum({ minimumTests: 2 }, { status: 'PASS', observedTests: 2 }).status,
    'PASS',
  );
  assert.equal(
    enforceMinimum({ minimumTests: 2 }, { status: 'FAIL', observedTests: 1 }).status,
    'FAIL',
  );
});
test('partial report distinguishes selected-profile success from pending full/manual work', (t) => {
  const { root, scenario } = fixture(t);
  const checks = [
    { ...scenario.checks[0], status: 'PASS', observedTests: 1, reason: null },
    {
      id: 'manual',
      adapter: 'manual',
      profile: 'full',
      evidence: 'manual',
      status: 'NOT_RUN',
      observedTests: 0,
      reason: 'HUMAN_REVIEW_REQUIRED',
    },
  ];
  const result = {
    schemaVersion: 1,
    id: uuid(),
    scenarioId: scenario.id,
    role: 'siswa',
    profile: 'quick',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    identity: identity(root, scenario),
    checks,
    verdict: summarize(checks, 'quick'),
    limitations: ['No production acceptance.'],
  };
  const path = writeReport(root, scenario, result);
  assert.equal(readJson(path).verdict, 'PASS');
  assert.equal(summarize(checks, 'full'), 'INCOMPLETE');
  assert.ok(existsSync(resolve(dirname(path), 'handoff.md')));
  const original = readFileSync(path, 'utf8');
  writeReport(root, scenario, { ...result, verdict: 'FAIL' }, { persistResult: false });
  assert.equal(readFileSync(path, 'utf8'), original);
});
test('publication failure remains pending; retry reuses verified doc for the same content', () => {
  const input = { runId: uuid(), reportHash: digest('report'), title: 'run report' };
  const pending = publicationRequest({}, input);
  assert.equal(pending.status, 'PENDING_CONNECTOR');
  const url = 'https://docs.google.com/document/d/verified_document_id/edit';
  const published = publicationReadback(pending, input.runId, url, input.reportHash);
  assert.equal(publicationRequest(published, input).documentUrl, url);
  assert.equal(publicationRequest(published, input).status, 'PUBLISHED');
  assert.equal(
    publicationRequest(published, { ...input, reportHash: digest('correction') }).status,
    'PENDING_CONNECTOR',
  );
});
test('publication rejects stale reports, wrong run readback and forged destinations', () => {
  const request = publicationRequest({}, { runId: uuid(), reportHash: digest('current') });
  const url = 'https://docs.google.com/document/d/verified_document_id/edit';
  assert.throws(() => publicationReadback(request, uuid(), url, request.reportHash));
  assert.throws(() => publicationReadback(request, request.runId, url, digest('changed')));
  assert.throws(() =>
    publicationReadback(
      request,
      request.runId,
      'https://evil.example/document',
      request.reportHash,
    ),
  );
});
test('report sanitizer removes tokens, credentials and personal email', () => {
  const text = sanitize(
    'postgres://alice:secret@localhost/db Bearer token-value password=secret person@example.com',
  );
  assert.ok(!text.includes('alice:secret'));
  assert.ok(!text.includes('token-value'));
  assert.ok(!text.includes('password=secret'));
  assert.ok(!text.includes('person@example.com'));
});

test('documented N/A cases need no fake test folder and optional failure does not mask required coverage', (t) => {
  const { root, scenario } = fixture(t);
  scenario.cases.push({
    id: 'TC-002',
    title: 'Not applicable with reason',
    source: 'PRD',
    applicability: 'not-applicable',
    reason: 'This flow has no upload operation',
    checks: [],
  });
  assert.equal(validateScenario(root, scenario).id, 'SIS-001');
  assert.equal(
    summarize(
      [
        { profile: 'quick', required: true, status: 'PASS' },
        { profile: 'quick', required: false, status: 'FAIL' },
      ],
      'quick',
    ),
    'PASS',
  );
  assert.equal(
    summarize([{ profile: 'quick', required: false, status: 'PASS' }], 'quick'),
    'INCOMPLETE',
  );
});

test('benchmark exhaustion and zero-test startup failure are blocked, not product defects', () => {
  assert.equal(
    evaluateEvidence(2, { passed: 1, failed: 0, blocked: 1, skipped: 0, total: 2 }, 2).status,
    'BLOCKED',
  );
  assert.equal(
    evaluateEvidence(1, { passed: 0, failed: 0, skipped: 0, total: 0 }, 1).status,
    'BLOCKED',
  );
});

test('continuation advances quick coverage before manual review and does not loop doctor on experiment bounds', () => {
  const scenario = { id: 'SIS-001', role: 'siswa' };
  const base = {
    id: uuid(),
    profile: 'quick',
    verdict: 'PASS',
    checks: [
      { adapter: 'quality', status: 'PASS', profile: 'quick' },
      { adapter: 'playwright', status: 'NOT_RUN', profile: 'standard' },
      { adapter: 'manual', status: 'NOT_RUN', profile: 'full' },
    ],
  };
  assert.match(nextActions(scenario, base)[0], /--profile standard/);
  assert.equal(nextActions(scenario, base).length, 3);
  assert.match(
    nextActions(scenario, {
      ...base,
      profile: 'full',
      verdict: 'BLOCKED',
      checks: [{ status: 'BLOCKED', reason: 'EXPERIMENT_BOUND_REACHED' }],
    })[0],
    /Triase/,
  );
  assert.match(
    nextActions(scenario, {
      ...base,
      profile: 'full',
      verdict: 'FAIL',
      checks: [{ status: 'FAIL' }, { status: 'BLOCKED' }],
    })[0],
    /findings/,
  );
});

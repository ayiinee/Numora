import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  REQUIRED_JOBS,
  evaluateNeeds,
  projectDiagnostics,
  readDiagnostics,
  renderSummary,
} from './ci-quality.mjs';

const success = () =>
  Object.fromEntries(REQUIRED_JOBS.map((name) => [name, { result: 'success' }]));
const context = { repository: 'owner/repo', runId: '123', attempt: '2', sha: 'a'.repeat(40) };

test('quality requires every job to succeed, including when validate prevents dependent jobs', () => {
  assert.equal(evaluateNeeds(success()).passed, true);
  for (const name of REQUIRED_JOBS) {
    for (const result of [
      'failure',
      'cancelled',
      'skipped',
      'in_progress',
      null,
      true,
      'SUCCESS',
    ]) {
      assert.equal(
        evaluateNeeds({ ...success(), [name]: { result } }).passed,
        false,
        `${name}: ${result}`,
      );
    }
    const missing = success();
    delete missing[name];
    assert.equal(evaluateNeeds(missing).passed, false);
    assert.equal(evaluateNeeds({ ...success(), [name]: {} }).passed, false);
  }
  for (const missing of [undefined, null, {}, [], 'success'])
    assert.equal(evaluateNeeds(missing).passed, false);
  const prevented = Object.fromEntries(
    REQUIRED_JOBS.map((name) => [name, { result: name === 'validate' ? 'failure' : 'skipped' }]),
  );
  assert.equal(evaluateNeeds(prevented).passed, false);
});

test('diagnostics project durations and allowlisted current-attempt artifacts without raw API data', () => {
  const diagnostics = projectDiagnostics(
    [
      {
        name: 'browser',
        id: 456,
        conclusion: 'failure',
        started_at: '2026-10-27T01:00:00Z',
        completed_at: '2026-10-27T01:15:00Z',
        secret: 'DO_NOT_EXPORT',
        steps: [
          {
            name: 'Browser E2E',
            conclusion: 'failure',
            started_at: '2026-10-27T01:00:00Z',
            completed_at: '2026-10-27T01:15:00Z',
          },
          {
            name: 'Later step',
            conclusion: 'skipped',
            started_at: '2026-10-27T01:15:00Z',
            completed_at: '2026-10-27T01:15:00Z',
          },
          { name: 'Interrupted', conclusion: null },
        ],
      },
    ],
    [
      {
        id: 789,
        name: `browser-${context.sha}-2`,
        expired: false,
        archive_download_url: 'DO_NOT_EXPORT',
      },
      { id: 790, name: `connected-job10-${context.sha}-2`, expired: true },
      { id: 791, name: `connected-job06-${context.sha}-1`, expired: false },
      { id: 792, name: 'unrelated-secret-artifact', expired: false },
    ],
    context,
  );
  const browser = diagnostics.jobs.find((job) => job.name === 'browser');
  assert.equal(browser.seconds, 900);
  assert.equal(browser.steps[1].seconds, null);
  assert.equal(browser.steps[2].result, 'not_completed');
  assert.equal(
    diagnostics.artifacts[0].url,
    'https://github.com/owner/repo/actions/runs/123/artifacts/789',
  );
  assert.equal(diagnostics.artifacts[1].url, null);
  assert.equal(diagnostics.artifacts[2].url, null);
  assert.doesNotMatch(JSON.stringify(diagnostics), /DO_NOT_EXPORT|unrelated-secret/);
  const summary = renderSummary({
    ...context,
    node: 'v24',
    runner: 'Linux',
    checkoutMatches: true,
    gate: evaluateNeeds({ ...success(), browser: { result: 'failure' } }),
    diagnostics,
  });
  assert.match(summary, /Gate: FAIL/);
  assert.match(summary, /browser \| failure \| 900s/);
  assert.match(summary, /Later step \| skipped \| —/);
  assert.match(summary, /unavailable or expired/);
});

test('API metadata is scoped to the current attempt, paginated and stripped of unknown fields', async () => {
  const calls = [];
  const response = (body) => ({ ok: true, json: async () => body });
  const diagnostics = await readDiagnostics(context, 'TEST_ONLY_TOKEN', async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer TEST_ONLY_TOKEN');
    if (url.includes('/attempts/2/jobs')) {
      return response({ jobs: [{ name: 'build-contract', id: 1, conclusion: 'success' }] });
    }
    return response({
      artifacts: url.endsWith('page=1')
        ? Array.from({ length: 100 }, () => ({ name: 'unrelated' }))
        : [{ id: 2, name: `browser-${context.sha}-2`, expired: false }],
    });
  });
  assert.equal(calls.length, 3);
  assert.ok(diagnostics.artifacts[0].url.endsWith('/artifacts/2'));
  for (const fetcher of [
    async () => ({ ok: false }),
    async () => response({ jobs: null, artifacts: [] }),
    async () => {
      throw new Error('secret provider response');
    },
  ])
    await assert.rejects(readDiagnostics(context, 'TEST_ONLY_TOKEN', fetcher));
  await assert.rejects(readDiagnostics(context, ''), /CI_METADATA_UNAVAILABLE/);
});

test('summary keeps authoritative gate results when optional metadata is unavailable', () => {
  const report = {
    ...context,
    node: 'v24',
    runner: 'Linux',
    checkoutMatches: true,
    gate: evaluateNeeds(success()),
    diagnostics: null,
  };
  assert.match(renderSummary(report), /Gate: PASS/);
  assert.match(renderSummary(report), /metadata is unavailable/);
  assert.match(renderSummary({ ...report, checkoutMatches: false }), /Gate: FAIL/);
  assert.match(renderSummary({ ...report, gate: evaluateNeeds(null) }), /validate \| missing/);
});

test('CLI exits nonzero on malformed/missing needs and mismatched SHA without printing untrusted input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'numora-ci-quality-'));
  try {
    execFileSync('git', ['init', directory], { stdio: 'ignore' });
    execFileSync(
      'git',
      [
        '-C',
        directory,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        'commit',
        '--allow-empty',
        '-m',
        'fixture',
      ],
      { stdio: 'ignore' },
    );
    const sha = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const run = (needs, expectedSha = sha) =>
      spawnSync(process.execPath, [resolve('scripts/ci-quality.mjs')], {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_REPOSITORY: context.repository,
          GITHUB_RUN_ID: '123',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_SHA: expectedSha,
          GITHUB_TOKEN: '',
          CI_NEEDS_JSON: needs,
          GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
        },
      });
    assert.equal(run(JSON.stringify(success())).status, 0);
    for (const [needs, expectedSha] of [
      ['{"SECRET_DO_NOT_PRINT":', sha],
      ['null', sha],
      [JSON.stringify(success()), '0'.repeat(40)],
    ]) {
      const result = run(needs, expectedSha);
      assert.equal(result.status, 1);
      assert.doesNotMatch(result.stdout + result.stderr, /SECRET_DO_NOT_PRINT/);
    }
    const artifact = JSON.parse(
      await readFile(join(directory, '.tmp/ci-diagnostics/quality.json'), 'utf8'),
    );
    assert.equal(artifact.sha, sha);
    assert.equal(artifact.checkoutMatches, false);
    assert.match(await readFile(join(directory, 'summary.md'), 'utf8'), /Checkout SHA/);
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir()));
    assert.match(basename(directory), /^numora-ci-quality-/);
    await rm(directory, { recursive: true, force: true });
  }
});

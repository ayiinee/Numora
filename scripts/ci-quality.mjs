import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_JOBS = Object.freeze([
  'validate',
  'tests',
  'connected',
  'browser',
  'build-contract',
]);
const RESULTS = new Set(['success', 'failure', 'cancelled', 'skipped']);

export function evaluateNeeds(needs) {
  const jobs = REQUIRED_JOBS.map((name) => {
    const value = needs?.[name]?.result;
    return {
      name,
      result: value === undefined ? 'missing' : RESULTS.has(value) ? value : 'invalid',
    };
  });
  return { passed: jobs.every((job) => job.result === 'success'), jobs };
}

function seconds(start, end) {
  const value = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function status(value) {
  return RESULTS.has(value) ? value : 'not_completed';
}

export function projectDiagnostics(jobs, artifacts, context) {
  const runUrl = `https://github.com/${context.repository}/actions/runs/${context.runId}`;
  const expectedArtifacts = ['browser', 'connected-job10', 'connected-job06'].map(
    (name) => `${name}-${context.sha}-${context.attempt}`,
  );
  return {
    jobs: REQUIRED_JOBS.map((name) => {
      const job = jobs.find((entry) => entry.name === name);
      return {
        name,
        result: job ? status(job.conclusion) : 'unavailable',
        seconds: seconds(job?.started_at, job?.completed_at),
        url: Number.isSafeInteger(job?.id) ? `${runUrl}/job/${job.id}` : runUrl,
        steps: (job?.steps ?? []).map((step) => ({
          name: step.name,
          result: status(step.conclusion),
          seconds:
            step.conclusion === 'skipped' ? null : seconds(step.started_at, step.completed_at),
        })),
      };
    }),
    artifacts: expectedArtifacts.map((name) => {
      const artifact = artifacts.find((entry) => entry.name === name && !entry.expired);
      return {
        name,
        url: Number.isSafeInteger(artifact?.id) ? `${runUrl}/artifacts/${artifact.id}` : null,
      };
    }),
  };
}

export async function readDiagnostics(context, token, fetcher = fetch) {
  if (!token) throw new Error('CI_METADATA_UNAVAILABLE');
  async function pages(resource, key) {
    const collected = [];
    for (let page = 1; page <= 10; page++) {
      const response = await fetcher(
        `https://api.github.com/repos/${context.repository}/actions/runs/${context.runId}/${resource}?per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error('CI_METADATA_UNAVAILABLE');
      const rows = (await response.json())[key];
      if (!Array.isArray(rows)) throw new Error('CI_METADATA_UNAVAILABLE');
      collected.push(...rows);
      if (rows.length < 100) return collected;
    }
    throw new Error('CI_METADATA_LIMIT');
  }
  const [jobs, artifacts] = await Promise.all([
    pages(`attempts/${context.attempt}/jobs`, 'jobs'),
    pages('artifacts', 'artifacts'),
  ]);
  return projectDiagnostics(jobs, artifacts, context);
}

const cell = (value) => String(value).replace(/[\r\n|`<>]/g, ' ');
const elapsed = (value) => (value === null ? '—' : `${value}s`);

export function renderSummary(report) {
  const lines = [
    '# CI quality',
    '',
    `Checkout SHA: \`${report.sha}\` · attempt ${report.attempt}`,
    `Node: ${report.node} · runner: ${cell(report.runner)}`,
    '',
    `**Gate: ${report.gate.passed && report.checkoutMatches ? 'PASS' : 'FAIL'}**`,
    '',
    '| Required job | Gate result | Duration | Evidence |',
    '| --- | --- | --- | --- |',
  ];
  for (const job of report.gate.jobs) {
    const metadata = report.diagnostics?.jobs.find((entry) => entry.name === job.name);
    lines.push(
      `| ${job.name} | ${job.result} | ${elapsed(metadata?.seconds ?? null)} | ${metadata ? `[job log](${metadata.url})` : 'unavailable'} |`,
    );
  }
  if (!report.checkoutMatches) lines.push('', '**Checkout SHA does not match the workflow SHA.**');
  if (!report.diagnostics) {
    lines.push(
      '',
      'GitHub timing/artifact metadata is unavailable. Gate results above still come from required-job results; consult the Actions logs.',
    );
  } else {
    for (const job of report.diagnostics.jobs) {
      lines.push('', `## ${job.name}`, '', '| Step | Result | Duration |', '| --- | --- | --- |');
      for (const step of job.steps) {
        lines.push(`| ${cell(step.name)} | ${step.result} | ${elapsed(step.seconds)} |`);
      }
      if (!job.steps.length)
        lines.push('| No step metadata; job may not have started | unavailable | — |');
    }
    lines.push('', '## Diagnostic artifacts', '');
    for (const artifact of report.diagnostics.artifacts) {
      lines.push(
        artifact.url
          ? `- [${artifact.name}](${artifact.url})`
          : `- ${artifact.name}: unavailable or expired; do not assume evidence was collected.`,
      );
    }
  }
  lines.push(
    '',
    'Skipped/not_completed steps are not passes. A timed-out suite is not full coverage. Fixture evidence is not real-user release acceptance.',
    '',
  );
  return lines.join('\n');
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const runId = process.env.GITHUB_RUN_ID ?? '';
  const attempt = process.env.GITHUB_RUN_ATTEMPT ?? '';
  const expectedSha = process.env.GITHUB_SHA ?? '';
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !/^\d+$/.test(runId) ||
    !/^\d+$/.test(attempt) ||
    !/^[a-f0-9]{40}$/.test(expectedSha)
  ) {
    throw new Error('CI_CONTEXT_INVALID');
  }
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  let needs;
  try {
    needs = JSON.parse(process.env.CI_NEEDS_JSON ?? 'null');
  } catch {
    needs = null;
  }
  const context = { repository, runId, attempt, sha };
  const report = {
    ...context,
    node: process.version,
    runner: process.env.RUNNER_OS ?? process.platform,
    checkoutMatches: sha === expectedSha,
    gate: evaluateNeeds(needs),
    diagnostics: null,
  };
  try {
    report.diagnostics = await readDiagnostics(context, process.env.GITHUB_TOKEN);
  } catch {
    console.warn('CI timing/artifact metadata unavailable; consult Actions logs.');
  }
  await mkdir('.tmp/ci-diagnostics', { recursive: true });
  await writeFile('.tmp/ci-diagnostics/quality.json', JSON.stringify(report, null, 2) + '\n');
  const summary = renderSummary(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
  if (!report.checkoutMatches || !report.gate.passed) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error('CI quality diagnostics failed; required checks are not approved.');
    process.exitCode = 1;
  });
}

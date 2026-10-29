import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  runProcess,
  terminate,
  requireFrom,
  cloneExperimentDatabase,
  trackOwnedProcess,
} from './process.mjs';
import { evaluateEvidence, inside, readJson, sanitize } from './core.mjs';
import { readLoadReceipts, reconcileLoadReceipts } from './load-receipts.mjs';

export function parsePlaywright(data) {
  const stats = data.stats || {};
  return {
    passed: stats.expected || 0,
    failed: (stats.unexpected || 0) + (stats.flaky || 0),
    skipped: stats.skipped || 0,
    total:
      (stats.expected || 0) + (stats.unexpected || 0) + (stats.flaky || 0) + (stats.skipped || 0),
  };
}
export function parseVitest(data, files) {
  const seen = (data.testResults || []).map((r) =>
    String(r.name || '')
      .replaceAll('\\', '/')
      .toLowerCase(),
  );
  if (files.some((file) => !seen.some((s) => s.endsWith(file.replaceAll('\\', '/').toLowerCase()))))
    return null;
  return data;
}
export async function prepare(root, context) {
  const qaConfig = readJson(resolve(root, 'qa/config.json'));
  const stages = [];
  let databaseReady = false;
  for (const target of [
    '@tka/database',
    '@tka/assessment-engine',
    '@tka/irt-orchestration',
    '@tka/api',
    '@tka/worker',
    '@tka/web',
  ]) {
    if (target === '@tka/web') {
      context.onProgress?.('migrate owned database');
      const migration = await runProcess(
        root,
        'pnpm',
        ['--filter', '@tka/database', 'db:migrate'],
        {
          env: context.environment,
          signal: context.signal,
          timeoutMs: 180000,
          log: resolve(context.artifacts, 'migration.log'),
        },
      );
      databaseReady = migration.code === 0;
      stages.push({ name: 'migration', ready: databaseReady });
      if (!databaseReady)
        return {
          ready: false,
          databaseReady: false,
          stages,
          reason: 'TEST_DATABASE_MIGRATION_FAILED',
        };
    }
    context.onProgress?.('build ' + target);
    const web = target === '@tka/web';
    const env = web
      ? {
          ...context.environment,
          NODE_ENV: 'production',
          NUMORA_WEB_DIST_DIR: '.next-qa',
          NUMORA_LOW_MEMORY: qaConfig.runtime?.lowMemoryBuild === false ? 'false' : 'true',
          NEXT_PUBLIC_API_URL: 'http://localhost:3501/api/v1',
          API_INTERNAL_URL: 'http://localhost:3501/api/v1',
          NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:3502',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'qa-local-fixture-public-key',
        }
      : context.environment;
    const result = await runProcess(root, 'pnpm', ['--filter', target, 'build'], {
      env,
      signal: context.signal,
      timeoutMs: 600000,
      log: resolve(context.artifacts, 'build-' + target.split('/')[1] + '.log'),
    });
    stages.push({ name: target, ready: result.code === 0 });
    if (result.code !== 0)
      return { ready: false, databaseReady, stages, reason: 'BUILD_FAILED: ' + target };
  }
  return { ready: true, databaseReady, stages, reason: null };
}
async function apiService(root, context, operation) {
  // Only this child process tree is owned/terminated by the harness.
  const child = spawn(process.execPath, ['qa/runtime/serve.mjs'], {
    cwd: root,
    env: context.environment,
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    trackOwnedProcess(root, child, context.environment, 'test-only API and auth fixture');
  } catch (error) {
    terminate(child);
    throw error;
  }
  let logs = '';
  const capture = (chunk) => {
    logs = (logs + chunk.toString()).slice(-1_000_000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', () => {});
  const abort = () => terminate(child);
  context.signal?.addEventListener('abort', abort, { once: true });
  try {
    let ready = false;
    const end = Math.min(Date.now() + 120000, context.deadline);
    while (Date.now() < end && child.exitCode === null && !context.signal?.aborted) {
      try {
        const response = await fetch('http://localhost:3501/api/v1/health', {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          const fixtures = await fetch('http://localhost:3502/fixtures', {
            signal: AbortSignal.timeout(1000),
          });
          if (fixtures.ok && (await fixtures.json()).runId === context.runId) {
            ready = true;
            break;
          }
        }
      } catch {
        /* wait for our API child */
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (!ready) return { status: 'BLOCKED', reason: 'QA_API_STARTUP_FAILED', observedTests: 0 };
    return await operation();
  } finally {
    context.signal?.removeEventListener('abort', abort);
    terminate(child);
    writeFileSync(resolve(context.artifacts, 'api-service.log'), sanitize(logs));
  }
}
export async function executeCheck(root, check, context) {
  const machine = resolve(context.artifacts, check.id + '.json');
  if (existsSync(machine)) unlinkSync(machine);
  const options = {
    env: { ...context.environment, QA_EVIDENCE_FILE: machine, QA_RUN_ID: context.runId },
    timeoutMs: Math.max(1, context.deadline - Date.now()),
    signal: context.signal,
    log: resolve(context.artifacts, check.id + '.log'),
  };
  if (check.adapter === 'manual')
    return {
      status: 'NOT_RUN',
      observedTests: 0,
      reason: 'HUMAN_KEYBOARD_AND_USABILITY_REVIEW_REQUIRED',
    };
  if (check.adapter === 'quality') {
    const results = [];
    for (const args of [
      ['lint'],
      ['exec', 'turbo', 'run', 'typecheck', '--concurrency=1', '--env-mode=loose'],
      ['exec', 'tsc', '-p', 'qa/tsconfig.json'],
      ['contracts:validate'],
      ['contracts:types:check'],
    ]) {
      if (context.signal?.aborted || Date.now() >= context.deadline)
        return {
          status: 'BLOCKED',
          reason: 'BUDGET_OR_INTERRUPTION',
          observedTests: results.length,
        };
      const result = await runProcess(root, 'pnpm', args, {
        ...options,
        timeoutMs: Math.max(1, context.deadline - Date.now()),
        log: resolve(
          context.artifacts,
          'quality-' + (args[0] === 'exec' ? args[1] : args[0]).replaceAll(':', '-') + '.log',
        ),
      });
      results.push({ name: args.join(' '), code: result.code, timedOut: result.timedOut });
    }
    return {
      status: results.every((r) => r.code === 0) ? 'PASS' : 'FAIL',
      observedTests: results.length,
      reason: results.some((r) => r.code !== 0) ? 'REPOSITORY_QUALITY_CHECK_FAILED' : null,
      counts: results,
    };
  }
  if (check.adapter.startsWith('vitest-')) {
    const kind = check.adapter.slice(7);
    const cwd =
      kind === 'domain' ? root : resolve(root, 'apps/' + (kind === 'web' ? 'web' : 'api'));
    const config = resolve(root, 'qa/configs/vitest-' + kind + '.mts');
    const result = await runProcess(
      root,
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--config',
        config,
        '--reporter=json',
        '--outputFile=' + machine,
        ...check.files.map((p) => inside(root, p)),
      ],
      { ...options, cwd },
    );
    const evidence = existsSync(machine) ? parseVitest(readJson(machine), check.files) : null;
    return {
      ...evaluateEvidence(result.code, evidence, check.minimumTests),
      ...(result.timedOut ? { status: 'BLOCKED', reason: 'BUDGET_OR_INTERRUPTION' } : {}),
      counts: evidence
        ? {
            passed: evidence.numPassedTests,
            failed: evidence.numFailedTests,
            skipped: evidence.numPendingTests,
          }
        : null,
      failures: evidence?.testResults?.flatMap((file) =>
        (file.assertionResults || [])
          .filter((item) => item.status === 'failed')
          .map((item) => ({
            name: sanitize(item.fullName),
            reason: sanitize((item.failureMessages || []).join('\n')).slice(0, 2000),
          })),
      ),
    };
  }
  if (['playwright', 'accessibility'].includes(check.adapter)) {
    const result = await runProcess(
      root,
      'pnpm',
      ['exec', 'playwright', 'test', '--config', 'qa/configs/playwright.config.ts', ...check.files],
      options,
    );
    const raw = existsSync(machine) ? readJson(machine) : null;
    const evidence = raw ? parsePlaywright(raw) : null;
    const failures = [];
    const visit = (suite) => {
      for (const item of suite.specs || [])
        for (const test of item.tests || [])
          for (const attempt of test.results || [])
            if (attempt.status !== 'passed' && attempt.error)
              failures.push({
                name: sanitize(item.title),
                reason: sanitize(attempt.error.message || '').slice(0, 2000),
              });
      for (const child of suite.suites || []) visit(child);
    };
    for (const suite of raw?.suites || []) visit(suite);
    return {
      ...evaluateEvidence(result.code, evidence, check.minimumTests),
      ...(result.timedOut ? { status: 'BLOCKED', reason: 'BUDGET_OR_INTERRUPTION' } : {}),
      counts: evidence,
      failures,
    };
  }
  if (['volume', 'velocity', 'variety', 'recovery'].includes(check.adapter)) {
    const experimentEnvironment = await cloneExperimentDatabase(
      root,
      context.runId,
      check.adapter,
      context.environment,
    );
    const result = await runProcess(
      root,
      process.execPath,
      ['qa/runtime/pipeline.mjs', check.adapter],
      { ...options, env: { ...experimentEnvironment, QA_EVIDENCE_FILE: machine } },
    );
    const evidence = existsSync(machine) ? readJson(machine) : null;
    return {
      ...evaluateEvidence(result.code, evidence, check.minimumTests),
      ...(result.timedOut ? { status: 'BLOCKED', reason: 'BUDGET_OR_INTERRUPTION' } : {}),
      metrics: evidence?.metrics,
      failures: evidence?.checks?.filter((c) => c.status === 'FAIL'),
    };
  }
  if (check.adapter === 'audit') {
    const result = await runProcess(root, 'pnpm', ['audit', '--json'], options);
    let data;
    try {
      data = JSON.parse(result.output.slice(result.output.indexOf('{')));
    } catch {
      /* offline or tool failure */
    }
    if (!data?.metadata?.vulnerabilities)
      return {
        status: 'BLOCKED',
        reason: 'AUDIT_SERVICE_OR_EVIDENCE_UNAVAILABLE',
        observedTests: 0,
      };
    const vulnerabilities = data.metadata.vulnerabilities;
    return {
      status: result.code === 0 ? 'PASS' : 'FAIL',
      reason: result.code === 0 ? null : 'DEPENDENCY_VULNERABILITIES_REQUIRE_TRIAGE',
      observedTests: 1,
      metrics: { vulnerabilities },
    };
  }
  if (check.adapter === 'k6') {
    return apiService(root, context, async () => {
      const postgres = requireFrom(root, 'packages/database')('postgres');
      const before = postgres(context.environment.TEST_DATABASE_URL, {
        max: 1,
        onnotice: () => {},
      });
      let baselineIds;
      try {
        baselineIds = (await before.unsafe('select id from assessment_attempts')).map(
          (row) => row.id,
        );
      } finally {
        await before.end();
      }
      const config = readJson(resolve(root, 'qa/config.json')).performance,
        phases = [],
        failures = [],
        receiptFiles = [];
      let experimentIncomplete = false;
      for (const [phase, vus] of [
        ['load', config.vus],
        ['stress', [config.stressVus]],
      ]) {
        const file = resolve(context.artifacts, 'k6-' + phase + '.json');
        const receiptsFile = resolve(context.artifacts, 'k6-' + phase + '-receipts.jsonl');
        if (existsSync(file)) unlinkSync(file);
        if (existsSync(receiptsFile)) unlinkSync(receiptsFile);
        const result = await runProcess(
          root,
          context.environment.QA_K6_BIN || 'k6',
          ['run', '--out', 'json=' + receiptsFile, ...check.files.map((p) => inside(root, p))],
          {
            ...options,
            timeoutMs: Math.max(1, context.deadline - Date.now()),
            env: {
              ...options.env,
              QA_VUS: JSON.stringify(vus),
              QA_STAGE_SECONDS: String(config.stageSeconds),
              QA_EVIDENCE_FILE: file,
              QA_LOAD_PHASE: phase,
            },
          },
        );
        if (!existsSync(file))
          return { status: 'BLOCKED', reason: 'K6_EVIDENCE_MISSING', observedTests: 0 };
        const data = readJson(file),
          metrics = data.metrics || {};
        const completed = metrics.qa_completed?.values?.count || 0,
          integrity = metrics.qa_integrity_errors?.values?.count || 0;
        if (!existsSync(receiptsFile))
          return { status: 'BLOCKED', reason: 'K6_RECEIPTS_MISSING', observedTests: phases.length };
        receiptFiles.push(receiptsFile);
        phases.push({
          phase,
          vus,
          completed,
          integrityErrors: integrity,
          duration: metrics.http_req_duration?.values,
          errorRate: metrics.http_req_failed?.values?.rate,
          throughput: metrics.http_reqs?.values?.rate,
          iterations: metrics.iterations?.values?.count || 0,
        });
        if (integrity > 0) failures.push('ACCEPTED_SUBMISSION_INTEGRITY_FAILURE');
        if (result.code !== 0 || completed < 1 || result.timedOut) {
          experimentIncomplete = true;
          break;
        }
      }
      const sql = postgres(context.environment.TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
      let reconciliation;
      try {
        const rows = await sql.unsafe(
          `select a.id, a.student_id as "studentId", a.status, a.score_0_100 as score,
            coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'studentId',x.student_id,'sourceType',x.source_type,'xp',x.xp_amount))
              from xp_ledger x where x.attempt_id=a.id),'[]'::jsonb) as ledger,
            coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'actorId',o.actor_user_id,'correlationId',o.correlation_id,'payload',o.payload))
              from analytics_outbox o where o.entity_id=a.id and o.event_name='drill_completed'),'[]'::jsonb) as events
            from assessment_attempts a where a.assessment_type='DRILL' and not(a.id=any($1::uuid[]))`,
          [baselineIds],
        );
        const receipts = await readLoadReceipts(receiptFiles);
        const identity = reconcileLoadReceipts(
          receipts,
          rows,
          phases.reduce((sum, phase) => sum + phase.completed, 0),
        );
        writeFileSync(
          resolve(context.artifacts, 'load-client-receipts.json'),
          JSON.stringify(receipts),
        );
        writeFileSync(
          resolve(context.artifacts, 'load-durable-snapshot.json'),
          JSON.stringify(rows),
        );
        writeFileSync(
          resolve(context.artifacts, 'load-identity-reconciliation.json'),
          JSON.stringify(identity, null, 2),
        );
        reconciliation = {
          ...identity.counts,
          accepted: identity.counts.acceptedCounter,
          identityStatus: identity.status,
          failureCount: identity.failures.length,
          incompleteCount: identity.incomplete.length,
          unacknowledgedGraded: identity.unacknowledgedGraded.length,
          classifications: Object.fromEntries(
            [...new Set(identity.unacknowledgedGraded.map((x) => x.classification))].map((kind) => [
              kind,
              identity.unacknowledgedGraded.filter((x) => x.classification === kind).length,
            ]),
          ),
          sampleUnacknowledged: identity.unacknowledgedGraded.slice(0, 20),
        };
        if (identity.status === 'FAIL') failures.push('DATABASE_RECONCILIATION_FAILED');
        if (identity.status === 'BLOCKED') experimentIncomplete = true;
      } finally {
        await sql.end();
      }
      return {
        status: failures.length ? 'FAIL' : experimentIncomplete ? 'BLOCKED' : 'PASS',
        reason:
          failures.join('; ') ||
          (experimentIncomplete ? 'EXPERIMENT_INCOMPLETE_OR_SAFETY_STOP' : null),
        observedTests: phases.length + 1,
        metrics: {
          phases,
          reconciliation,
          slo: 'NOT_DEFINED',
          environment: 'LOCAL_SHARED_GENERATOR_AND_SERVER',
        },
      };
    });
  }
  return { status: 'BLOCKED', reason: 'ADAPTER_NOT_IMPLEMENTED', observedTests: 0 };
}

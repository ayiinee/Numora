import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  countsFor,
  data,
  prepare,
  phaseActors,
  refreshPhaseActors,
  httpStartupSeconds,
  httpGraceSeconds,
  phaseBudgetSeconds,
} from './config.mjs';
import { capture, readReceipts, validateEvidenceUrl } from './reconcile.mjs';
import { runPvp } from './pvp.mjs';
import { sampleBrowser } from './browser.mjs';
import { statGroup } from '../../../qa/performance/catalog.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const ignored = resolve(root, 'qa/.local');
const writeJson = (path, result) =>
  writeFileSync(path, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });

function localPath(value) {
  const path = resolve(root, value);
  const child = relative(ignored, path);
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    throw new Error('Run inputs must be below qa/.local');
  }
  return path;
}

export function summarize(result, exit, plan, expected, targeted) {
  const metrics = result?.metrics ?? {};
  const operations = plan.operations
    .map((key, index) => {
      const count = metrics['http_reqs{op:' + index + '}']?.values?.count ?? 0;
      const errorRate = metrics['numora_unexpected{op:' + index + '}']?.values?.rate ?? 0;
      const times = metrics['numora_duration_ms{op:' + index + '}']?.values;
      return {
        key,
        group: statGroup(key),
        count,
        errorRate,
        p95: times?.['p(95)'],
        p99: times?.['p(99)'],
      };
    })
    .filter((item) => item.count);
  const participants = metrics.numora_participants?.values?.count ?? 0;
  const peakVus = metrics.vus?.values?.max ?? null;
  const spikes = metrics.numora_spike_started?.values?.count ?? 0;
  const successRate = metrics.numora_journey_success?.values?.rate ?? 0;
  const dropped = metrics.dropped_iterations?.values?.count ?? 0;
  const integrityErrors = metrics.numora_integrity_errors?.values?.count ?? 0;
  const budgetPass = operations.every((item) =>
    item.count >= 100
      ? item.errorRate < 0.01 && item.p95 <= plan.budgets[item.group]
      : item.errorRate === 0,
  );
  return {
    exit,
    participants,
    peakVus,
    expected,
    spikes,
    targeted,
    successRate,
    dropped,
    integrityErrors,
    throughput: metrics.http_reqs?.values?.rate ?? 0,
    operations,
    pass:
      exit === 0 &&
      participants === expected &&
      spikes === targeted &&
      dropped === 0 &&
      integrityErrors === 0 &&
      successRate >= 0.99 &&
      operations.length > 0 &&
      budgetPass,
  };
}

function submittedCoverage(plan, phase, actors, receipts) {
  const targeted = plan.suite.startsWith('spike-') ? plan.suite.split('-')[1] : null;
  if (
    !targeted &&
    phase.seconds < 600 &&
    !['drill-smoke', 'drill-capacity', 'drill-scale', 'drill-steady', 'mixed-local'].includes(
      plan.suite,
    )
  )
    return null;
  const accepted = plan.suite.endsWith('-start') ? 'start' : 'submit';
  const completed = Object.fromEntries(plan.assessmentWrites.map((role) => [role, new Set()]));
  for (const receipt of receipts) {
    if (
      receipt.event === accepted &&
      (accepted === 'start' || [200, 201].includes(receipt.status))
    ) {
      completed[receipt.kind]?.add(receipt.actor);
    }
  }
  const cohorts = Object.entries(completed)
    .filter(([role]) => !targeted || role === targeted)
    .map(([role, ids]) => ({ role, observed: ids.size, expected: actors[role]?.length ?? 0 }));
  return {
    cohorts,
    pass: cohorts.every(
      ({ observed, expected }) => observed >= Math.ceil(expected * (targeted ? 1 : 0.99)),
    ),
  };
}
async function probeHealth(plan, signal) {
  const response = await fetch(plan.api + '/api/v1/health', {
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(4500)]),
  });
  await response.body?.cancel();
  if (response.status !== 200) throw new Error('Health endpoint returned an unexpected status');
}
async function watchHealth(plan, stopFile, signal, stop, info) {
  let failures = 0;
  while (!signal.aborted) {
    if (existsSync(stopFile)) {
      stop('operator-stop');
      return;
    }
    try {
      await probeHealth(plan, signal);
      failures = 0;
    } catch {
      if (signal.aborted) return;
      if (++failures === 2) {
        stop('two-failed-health-checks');
        return;
      }
    }
    info.probes++;
    try {
      await delay(5000, undefined, { signal });
    } catch {
      return;
    }
  }
}

export function httpRunClock(seconds, stop) {
  let running = false;
  let closed = false;
  let timer = setTimeout(() => stop('http-startup-timeout'), httpStartupSeconds * 1000);
  return {
    ready() {
      if (running || closed) return false;
      running = true;
      clearTimeout(timer);
      timer = setTimeout(() => stop('runner-timeout'), (seconds + httpGraceSeconds) * 1000);
      return true;
    },
    close() {
      closed = true;
      clearTimeout(timer);
    },
  };
}

function runHttp(plan, phase, actors, folder, signal, stop, onReady) {
  const input = resolve(folder, 'input.local.json');
  const actorInput = resolve(folder, 'actors.local.json');
  const output = resolve(folder, 'k6-summary.json');
  const receiptPath = resolve(folder, 'receipts.ndjson');
  writeJson(input, { plan, phase });
  writeJson(actorInput, actors);
  const allowedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA)$/i.test(
        key,
      ),
    ),
  );
  const processHandle = spawn(
    process.env.QA_K6_BIN || 'k6',
    [
      'run',
      '--quiet',
      '--no-color',
      '--log-format',
      'raw',
      '--log-output',
      'stdout',
      resolve(root, 'qa/performance/http.js'),
    ],
    {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...allowedEnvironment,
        NUMORA_CAPACITY_INPUT: input,
        NUMORA_CAPACITY_ACTORS: actorInput,
        NUMORA_CAPACITY_SUMMARY: output,
      },
    },
  );
  const failuresByOperation = {};
  const clock = httpRunClock(phase.seconds, stop);
  const startedAt = performance.now();
  let startupMs = null;
  const receipts = createWriteStream(receiptPath, { flags: 'wx', mode: 0o600 });
  // Suppress raw runner output. The tool writes structured evidence without auth headers or bodies.
  processHandle.stderr.resume();
  const lines = createInterface({ input: processHandle.stdout, crlfDelay: Infinity });
  lines.on('line', (line) => {
    if (!line.startsWith('{')) return;
    try {
      const record = JSON.parse(line);
      if (record.event === 'http-ready' && record.phase === phase.name && clock.ready()) {
        startupMs = performance.now() - startedAt;
        onReady(true);
      }
      if (record.event === 'http-failure' && plan.operations.includes(record.operation)) {
        const key = record.operation + ' | ' + record.status + ' | ' + record.code;
        failuresByOperation[key] = (failuresByOperation[key] ?? 0) + 1;
      }
      if (['start', 'save', 'submit', 'integrity'].includes(record.event)) {
        receipts.write(JSON.stringify(record) + '\n');
        if (record.event === 'integrity') stop('integrity');
      }
    } catch {
      /* Terminal progress and warnings are outside structured evidence. */
    }
  });
  const abort = () => processHandle.kill();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  return new Promise((done) => {
    processHandle.once('error', () => stop('k6-could-not-start'));
    processHandle.once('close', (code) => {
      clock.close();
      onReady(false);
      signal.removeEventListener('abort', abort);
      receipts.end(() => {
        rmSync(input, { force: true });
        rmSync(actorInput, { force: true });
        const result = existsSync(output) ? data(output) : null;
        const expected = Object.values(actors).flat().length;
        const wanted = plan.suite.startsWith('spike-') ? phase.students : 0;
        const summary = summarize(result, code, plan, expected, wanted);
        done({
          ...summary,
          pass: summary.pass && startupMs !== null,
          startupMs,
          receiptPath,
          failuresByOperation,
        });
      });
    });
  });
}

export function validateCohorts(plan, fixtures) {
  const cohorts = plan.phases.map((phase) => phaseActors(fixtures, phase, plan));
  const keys = new Set();
  for (const phase of cohorts) {
    for (const role of ['pretest', 'tryout'].filter((kind) =>
      plan.assessmentWrites.includes(kind),
    )) {
      for (const actor of phase[role] ?? []) {
        const key =
          role +
          ':' +
          actor.id +
          ':' +
          (role === 'pretest'
            ? actor.vars.chapterId
            : (actor.vars.batchId ?? actor.vars.packageId));
        if (keys.has(key))
          throw new Error('A one-time assessment fixture is reused across plateaus');
        keys.add(key);
      }
    }
  }
  return cohorts;
}

async function execute(config, plan, cohorts, actorsPath, evidenceUrl, samples) {
  const folder = resolve(
    ignored,
    'capacity',
    new Date().toISOString().slice(0, 10) + '-' + randomUUID(),
  );
  mkdirSync(folder, { recursive: true });
  const stopFile = resolve(folder, 'STOP');
  const reportFile = resolve(folder, 'report.json');
  const report = {
    result: 'RUNNING',
    deployment: config.deployment,
    startedAt: new Date().toISOString(),
    environment: plan.environment,
    suite: plan.suite,
    targets: { web: plan.web, api: plan.api },
    approvalReference: config.authorization?.reference ?? null,
    phases: [],
  };
  writeJson(reportFile, report);
  console.log(JSON.stringify({ event: 'start', report: reportFile, stopFile }));
  const stopController = new AbortController();
  let stopReason = null;
  const stop = (reason) => {
    stopReason ??= reason;
    stopController.abort();
  };
  const interrupt = () => stop('interrupt');
  const authorizationDeadline =
    plan.environment === 'dev'
      ? null
      : setTimeout(
          () => stop('authorization-window-ended'),
          Math.max(0, Date.parse(config.authorization.endsAt) - Date.now()),
        );
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    for (let index = 0; index < plan.phases.length; index++) {
      if (existsSync(stopFile) || stopReason) {
        stop('operator-stop');
        break;
      }
      try {
        await probeHealth(plan, stopController.signal);
      } catch {
        stop('preflight-health-check-failed');
        break;
      }
      if (existsSync(stopFile) || stopReason) {
        stop('operator-stop');
        break;
      }
      const phase = plan.phases[index];
      const phaseFolder = resolve(folder, phase.name);
      mkdirSync(phaseFolder);
      const { pvp, ...httpActors } = refreshPhaseActors(
        data(actorsPath),
        phase,
        plan,
        cohorts[index],
      );
      const { signal } = stopController;
      const watcher = new AbortController();
      const health = { probes: 0 };
      const since = new Date().toISOString();
      const monitor = watchHealth(plan, stopFile, watcher.signal, stop, health);
      let http, socket, durable, browser, completion;
      console.log(
        JSON.stringify({ event: 'phase-start', phase: phase.name, students: phase.students }),
      );
      try {
        const tasks = [];
        let ready;
        const httpReady = Object.keys(httpActors).length
          ? new Promise((done) => (ready = done))
          : Promise.resolve(true);
        if (Object.keys(httpActors).length)
          tasks.push(
            runHttp(plan, phase, httpActors, phaseFolder, signal, stop, ready).then(
              (result) => {
                http = result;
              },
              () => stop('http-runner-failure'),
            ),
          );
        if (pvp?.length)
          tasks.push(
            httpReady
              .then((started) => started && runPvp(plan, phase, pvp, signal, stop))
              .then(
                (result) => {
                  socket = result;
                },
                () => stop('socket-runner-failure'),
              ),
          );
        if (samples.length && (index === 0 || index === plan.phases.length - 1)) {
          tasks.push(
            httpReady
              .then(
                (started) =>
                  started && sampleBrowser(plan, samples, index === 0 ? 1000 : 20000, signal, stop),
              )
              .then(
                (result) => {
                  browser = result;
                },
                () => stop('browser-sample-failure'),
              ),
          );
        }
        await Promise.all(tasks);
        const writers = Object.entries(httpActors)
          .filter(([role]) => plan.assessmentWrites.includes(role))
          .flatMap(([, actors]) => actors);
        if (http && writers.length) {
          const receipts = await readReceipts(http.receiptPath);
          completion = submittedCoverage(plan, phase, httpActors, receipts);
          const ids = writers.map((actor) => actor.id);
          const explicit = [
            ...new Set(writers.map((actor) => actor.vars.attemptId).filter(Boolean)),
          ];
          durable = await capture(evidenceUrl, ids, explicit, since, receipts).catch((error) => ({
            pass: false,
            reason: 'durable-snapshot-unavailable',
            code: /^[A-Z0-9_]{1,40}$/.test(error?.code ?? '') ? error.code : 'UNAVAILABLE',
          }));
          if (!durable.attempts && !durable.reason)
            durable = { ...durable, pass: false, reason: 'empty-durable-evidence' };
        }
        const pass =
          !stopReason &&
          (http || socket) &&
          (http?.pass ?? true) &&
          (socket?.pass ?? true) &&
          (durable?.pass ?? true) &&
          (completion?.pass ?? true) &&
          (browser?.pass ?? true);
        if (http) delete http.receiptPath;
        report.phases.push({
          ...phase,
          pass: Boolean(pass),
          startedAt: since,
          endedAt: new Date().toISOString(),
          health,
          http,
          socket,
          durable,
          completion,
          browser,
        });
        writeJson(reportFile, report);
        console.log(JSON.stringify({ event: 'phase-end', phase: phase.name, pass: Boolean(pass) }));
        if (!pass) break;
      } finally {
        watcher.abort();
        await monitor;
      }
    }
  } finally {
    if (authorizationDeadline !== null) clearTimeout(authorizationDeadline);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    report.endedAt = new Date().toISOString();
    report.stopReason = stopReason;
    report.result =
      report.phases.length === plan.phases.length && report.phases.every((phase) => phase.pass)
        ? 'PASS'
        : stopReason
          ? 'STOPPED'
          : 'FAIL';
    writeJson(reportFile, report);
    console.log(JSON.stringify({ event: 'finish', result: report.result, report: reportFile }));
  }
  return report.result === 'PASS';
}

async function main([action, environment, suite, file, actorsFile, ...rest]) {
  if (
    !['plan', 'check', 'run'].includes(action) ||
    !environment ||
    !suite ||
    !file ||
    rest.length ||
    (action !== 'plan' && !actorsFile) ||
    (action === 'plan' && actorsFile)
  ) {
    throw new Error(
      'Usage: node scripts/qa/capacity/run.mjs plan|check|run dev|staging|prod <suite> <config.json> [actors.json]',
    );
  }
  const config = data(localPath(file));
  const actorsPath = actorsFile ? localPath(actorsFile) : null;
  const actors = actorsPath ? data(actorsPath) : null;
  const contracts = data(resolve(root, 'packages/contracts/openapi/openapi.json'));
  const now = Date.now();
  const checkTime =
    action === 'check' && environment !== 'dev'
      ? Math.max(now, Date.parse(config.authorization?.startsAt))
      : now;
  const plan = prepare(config, actors, environment, suite, contracts, {
    execute: action !== 'plan',
    now: checkTime,
  });
  if (action === 'plan') {
    console.log(
      JSON.stringify(
        {
          ...plan,
          extras: Object.keys(plan.extras),
          cohorts: Object.fromEntries(
            plan.phases.map((phase) => [phase.name, countsFor(phase, plan)]),
          ),
          deployment: config.deployment,
        },
        null,
        2,
      ),
    );
    return;
  }
  const rawUrl = plan.assessmentWrites.length
    ? validateEvidenceUrl(process.env.QA_CAPACITY_EVIDENCE_URL, config, environment)
    : null;
  const samples = config.browserSamples ?? [];
  if (samples.length && environment === 'prod')
    throw new Error('Production browser smoke uses the operator checklist');
  if (
    environment === 'staging' &&
    suite === 'load' &&
    !['mobile', 'desktop'].every((device) => samples.some((sample) => sample.device === device))
  ) {
    throw new Error('Staging load requires mobile and desktop browser samples');
  }
  const browserSamples = samples.map((sample) => {
    const pathPattern = /^\/[A-Za-z0-9_/-]*$/;
    if (
      !pathPattern.test(sample.path) ||
      sample.path.startsWith('//') ||
      !Array.isArray(sample.readPaths) ||
      !sample.readPaths.every((path) => pathPattern.test(path)) ||
      !['student', 'teacher', 'admin'].includes(sample.role) ||
      !['desktop', 'mobile'].includes(sample.device) ||
      typeof sample.heading !== 'string' ||
      !sample.heading
    )
      throw new Error('Invalid browser sample');
    const storageState = localPath(sample.storageState);
    const state = data(storageState);
    if (
      !Array.isArray(state.cookies) ||
      !Array.isArray(state.origins) ||
      (!state.cookies.length && !state.origins.length)
    )
      throw new Error('Browser sample needs authenticated Playwright storage state');
    return { ...sample, storageState };
  });
  const cohorts = validateCohorts(plan, actors);
  if (action === 'check') {
    let stageStart = checkTime;
    const phases = plan.phases.map((phase, index) => {
      const fixtures = refreshPhaseActors(actors, phase, plan, cohorts[index], stageStart);
      stageStart += phaseBudgetSeconds(phase) * 1000;
      return {
        ...phase,
        cohorts: Object.fromEntries(
          Object.entries(fixtures).map(([role, group]) => [role, group.length]),
        ),
      };
    });
    console.log(
      JSON.stringify(
        {
          result: 'LOCAL_PREFLIGHT_PASS',
          environment,
          suite,
          checkedFrom: new Date(checkTime).toISOString(),
          deployment: config.deployment,
          phases,
          browserSamples: browserSamples.length,
        },
        null,
        2,
      ),
    );
    return;
  }
  const pass = await execute(config, plan, cohorts, actorsPath, rawUrl, browserSamples);
  if (!pass) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    // All preflight errors are locally authored; never print a parsed document or request body.
    const message =
      error instanceof SyntaxError
        ? 'Input JSON is malformed'
        : error.code
          ? 'Could not read or write a run file'
          : error.message;
    console.error(message);
    process.exitCode = 1;
  });
}

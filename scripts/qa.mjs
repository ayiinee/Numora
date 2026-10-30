#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative } from 'node:path';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
} from 'node:fs';
import {
  ROLES,
  PROFILES,
  uuid,
  now,
  digest,
  readJson,
  writeJson,
  inside,
  sanitize,
  discover,
  validateScenario,
  loadScenario,
  identity,
  sameIdentity,
  enforceMinimum,
  newSession,
  saveSession,
  loadSession,
  resultPath,
  summarize,
  writeReport,
  nextActions,
  publicationRequest,
  publicationReadback,
} from './qa/core.mjs';
import {
  doctor,
  testEnvironment,
  createRunDatabase,
  requireFrom,
  ownedProcesses,
} from './qa/process.mjs';
import { executeCheck, prepare } from './qa/adapters.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: {
    role: { type: 'string' },
    scenario: { type: 'string' },
    profile: { type: 'string' },
    session: { type: 'string' },
    run: { type: 'string' },
    check: { type: 'string' },
    note: { type: 'string' },
    reviewer: { type: 'string' },
    status: { type: 'string' },
    'document-url': { type: 'string' },
    'verified-run': { type: 'string' },
    'folder-id': { type: 'string' },
    diagnostic: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
});
const operation = positionals[0] || 'help';
if (positionals.length > 1) throw new Error('Unexpected positional arguments');
function emit(value) {
  console.log(JSON.stringify(value, null, 2));
}
function selectedSession(create = false, role = flags.role) {
  try {
    return loadSession(root, flags.session, role);
  } catch (error) {
    if (create && !flags.session && String(error.message).startsWith('SESSION_NOT_FOUND'))
      return newSession(root, role);
    throw error;
  }
}
function selectedRun() {
  const session = !flags.scenario || !flags.run ? selectedSession() : null;
  const scenario = loadScenario(root, flags.scenario || session.scenarioId);
  const id = flags.run || session.runId;
  const path = resultPath(root, scenario, id);
  if (!existsSync(path)) throw new Error('RUN_NOT_FOUND');
  return { session, scenario, result: readJson(path), path };
}
function effectiveResult(scenario, result) {
  const path = resolve(dirname(resultPath(root, scenario, result.id)), 'manual.json');
  if (!existsSync(path)) return result;
  const manual = readJson(path),
    current = identity(root, scenario);
  if (!sameIdentity(result.identity, current))
    return {
      ...result,
      limitations: [...result.limitations, 'Manual evidence is stale after a version change.'],
    };
  const checks = result.checks.map((check) =>
    manual[check.id]
      ? {
          ...check,
          status: manual[check.id].status,
          observedTests: 1,
          reason: 'HUMAN_REVIEW_RECORDED_SEPARATELY',
        }
      : check,
  );
  return { ...result, checks, manualReviews: manual, verdict: summarize(checks, result.profile) };
}
async function runScenario(retest = false) {
  const scenario = loadScenario(root, flags.scenario || selectedSession().scenarioId);
  const role = flags.role || scenario.role;
  if (role !== scenario.role) throw new Error('SCENARIO_ROLE_MISMATCH');
  const session = selectedSession(true, role);
  const profile = flags.profile || session.profile || 'standard';
  if (!Object.hasOwn(PROFILES, profile)) throw new Error('INVALID_PROFILE');
  const selected = scenario.checks.filter((c) => PROFILES[c.profile] <= PROFILES[profile]);
  if (!selected.length) throw new Error('EMPTY_TEST_SELECTION');
  const originalIdentity = identity(root, scenario);
  if (retest && session.runId) {
    const oldScenario = loadScenario(root, session.scenarioId);
    const previous = readJson(resultPath(root, oldScenario, session.runId));
    if (sameIdentity(previous.identity, originalIdentity) && !flags.diagnostic)
      throw new Error('UNCHANGED_VERSION: use --diagnostic only for an intentional investigation');
  }
  const lockPath = inside(root, 'qa/.local/locks/' + session.id + '.lock');
  mkdirSync(dirname(lockPath), { recursive: true });
  let lock;
  try {
    lock = openSync(lockPath, 'wx');
    writeFileSync(lock, JSON.stringify({ pid: process.pid }));
  } catch {
    throw new Error('SESSION_LOCKED: use status to identify an active or interrupted session');
  }
  const id = uuid(),
    artifacts = inside(root, 'qa/.local/artifacts/' + id);
  mkdirSync(artifacts, { recursive: true });
  const config = readJson(inside(root, 'qa/config.json'));
  const result = {
    schemaVersion: 1,
    id,
    scenarioId: scenario.id,
    role,
    profile,
    startedAt: now(),
    finishedAt: null,
    parentRunId: session.runId,
    identity: originalIdentity,
    environment: null,
    checks: scenario.checks.map((c) => ({
      ...c,
      required: scenario.cases.some(
        (item) => item.applicability === 'required' && item.checks.includes(c.id),
      ),
      status: 'NOT_RUN',
      observedTests: 0,
      reason: PROFILES[c.profile] > PROFILES[profile] ? 'OUTSIDE_SELECTED_PROFILE' : 'PENDING',
    })),
    verdict: 'INCOMPLETE',
    limitations: [
      'Synthetic PG content and email auth fixtures; not Google login, academic content approval or staging acceptance.',
      'Local performance is a baseline with no approved production SLO; generator and application share one machine.',
      'Manual keyboard/UAT evidence is separate; automated accessibility is not a complete accessibility certification.',
      'Variety invalid-envelope rejection is contract/generator evidence; connected tests cover API input rejection.',
      'Recovery is local database/worker/transport rehearsal, not cloud failover, R2 recovery or production RTO/RPO.',
    ],
  };
  session.phase = 'RUNNING';
  session.scenarioId = scenario.id;
  session.runId = id;
  session.profile = profile;
  session.pid = process.pid;
  saveSession(root, session);
  writeReport(root, scenario, result);
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const readiness = await doctor(root, profile);
    result.environment = readiness;
    const { environment } = testEnvironment(root);
    const serviceFailures = readiness.checks.filter(
      (c) =>
        ['test-environment', 'existing-test-guard', 'postgres', 'create-test-database'].includes(
          c.id,
        ) && !c.ready,
    );
    const databaseReady =
      profile !== 'quick' &&
      !serviceFailures.length &&
      readiness.checks.some((c) => c.id === 'postgres' && c.ready);
    const redisReady = readiness.checks.some((c) => c.id === 'redis' && c.ready);
    let prepared = { ready: false, reason: 'LOCAL_TEST_SERVICES_NOT_READY' },
      isolated;
    if (databaseReady) {
      try {
        isolated = await createRunDatabase(root, id, environment);
        writeJson(inside(root, 'qa/.local/resources/' + id + '.json'), {
          runId: id,
          database: isolated.name,
          restoreDatabase: isolated.name + '_recovery_restore',
          experimentDatabases: ['volume', 'velocity', 'variety', 'recovery'].map(
            (mode) => isolated.name + '_' + mode,
          ),
          redisPrefix: isolated.environment.BULLMQ_PREFIX,
        });
        prepared = await prepare(root, {
          environment: isolated.environment,
          artifacts,
          signal: controller.signal,
          onProgress: (step) => {
            session.runningCheck = step;
            saveSession(root, session);
            (flags.json ? console.error : console.log)(JSON.stringify({ event: 'prepare', step }));
          },
        });
      } catch {
        prepared = { ready: false, reason: 'TEST_DATABASE_PREPARATION_FAILED' };
      }
    }
    // Setup/build is complete before the automated execution budget begins.
    result.preparation = prepared;
    result.executionStartedAt = now();
    const deadline = Date.now() + config.fullBudgetSeconds * 1000;
    const context = {
      environment: isolated?.environment || environment,
      artifacts,
      deadline,
      runId: id,
      signal: controller.signal,
    };
    for (const check of selected) {
      const current = result.checks.find((c) => c.id === check.id);
      if (
        !scenario.cases.some(
          (item) => item.applicability !== 'not-applicable' && item.checks.includes(check.id),
        )
      ) {
        current.reason = 'NOT_APPLICABLE_WITH_DOCUMENTED_REASON';
        continue;
      }
      if (controller.signal.aborted || Date.now() >= deadline) {
        current.reason = 'BUDGET_OR_INTERRUPTION_BEFORE_CHECK';
        writeReport(root, scenario, result);
        continue;
      }
      session.runningCheck = check.id;
      saveSession(root, session);
      (flags.json ? console.error : console.log)(
        JSON.stringify({ event: 'check-started', run: id, check: check.id }),
      );
      const needsServices = [
        'vitest-api',
        'playwright',
        'accessibility',
        'k6',
        'volume',
        'velocity',
        'variety',
        'recovery',
      ].includes(check.adapter);
      const prerequisites = [];
      if (
        check.adapter !== 'manual' &&
        readiness.checks.some(
          (item) => ['node', 'pnpm', 'dependencies'].includes(item.id) && !item.ready,
        )
      )
        prerequisites.push('CORE_TOOLCHAIN_NOT_READY');
      const needsWeb = ['playwright', 'accessibility', 'k6'].includes(check.adapter);
      if (needsServices && !(needsWeb ? prepared.ready : prepared.databaseReady))
        prerequisites.push(prepared.reason);
      if (needsWeb && readiness.checks.some((item) => item.id.startsWith('port-') && !item.ready))
        prerequisites.push('QA_PORTS_NOT_FREE');
      if (['playwright', 'accessibility', 'k6', 'recovery'].includes(check.adapter) && !redisReady)
        prerequisites.push('REDIS_7_NOT_READY');
      if (
        ['playwright', 'accessibility'].includes(check.adapter) &&
        !readiness.checks.some((c) => c.id === 'chromium' && c.ready)
      )
        prerequisites.push('CHROMIUM_NOT_READY');
      if (
        check.adapter === 'accessibility' &&
        !readiness.checks.some((c) => c.id === 'axe' && c.ready)
      )
        prerequisites.push('AXE_NOT_READY');
      if (check.adapter === 'k6' && !readiness.checks.some((c) => c.id === 'k6' && c.ready))
        prerequisites.push('K6_NOT_READY');
      if (
        check.adapter === 'recovery' &&
        readiness.checks.some((c) => ['pg_dump', 'pg_restore'].includes(c.id) && !c.ready)
      )
        prerequisites.push('POSTGRES_BACKUP_TOOLS_NOT_READY');
      const start = Date.now();
      try {
        Object.assign(
          current,
          prerequisites.length
            ? { status: 'BLOCKED', observedTests: 0, reason: prerequisites.join('; ') }
            : enforceMinimum(check, await executeCheck(root, check, context)),
        );
      } catch (error) {
        Object.assign(current, {
          status: 'BLOCKED',
          observedTests: 0,
          reason: 'HARNESS_ERROR: ' + sanitize(error.message).slice(0, 500),
        });
      }
      current.durationMs = Date.now() - start;
      const machinePath = resolve(artifacts, check.id + '.json');
      if (existsSync(machinePath))
        current.artifact = relative(root, machinePath).replaceAll('\\', '/');
      const logPath = resolve(artifacts, check.id + '.log');
      if (existsSync(logPath)) current.log = relative(root, logPath).replaceAll('\\', '/');
      result.verdict = summarize(result.checks, profile);
      writeReport(root, scenario, result);
      (flags.json ? console.error : console.log)(
        JSON.stringify({ event: 'check-completed', check: check.id, status: current.status }),
      );
    }
    if (!sameIdentity(originalIdentity, identity(root, scenario))) {
      result.limitations.push(
        'SOURCE_CHANGED_DURING_RUN: result cannot establish acceptance for a single version.',
      );
      for (const check of result.checks)
        if (check.status === 'PASS') {
          check.status = 'BLOCKED';
          check.reason = 'SOURCE_CHANGED_DURING_RUN';
        }
    }
  } catch (error) {
    result.limitations.push('HARNESS_INTERRUPTED: ' + sanitize(error.message));
    const pending = result.checks.find(
      (check) => check.status === 'NOT_RUN' && check.reason === 'PENDING',
    );
    if (pending) {
      pending.status = 'BLOCKED';
      pending.reason = 'HARNESS_INTERRUPTED';
    }
  } finally {
    result.finishedAt = now();
    result.verdict = summarize(result.checks, profile);
    writeReport(root, scenario, result);
    session.phase = controller.signal.aborted ? 'INTERRUPTED' : 'AWAITING_SELECTION';
    delete session.runningCheck;
    delete session.pid;
    saveSession(root, session);
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    closeSync(lock);
    unlinkSync(lockPath);
  }
  emit({
    session: session.id,
    run: id,
    scenario: scenario.id,
    verdict: result.verdict,
    report: relative(root, resolve(dirname(resultPath(root, scenario, id)), 'report.md')),
    next: nextActions(scenario, result),
  });
  if (result.verdict !== 'PASS') process.exitCode = result.verdict === 'FAIL' ? 1 : 2;
}
try {
  if (operation === 'help')
    emit({
      usage:
        'pnpm qa <start|list|validate|doctor|setup|run|retest|status|continue|report|manual|share|publication|configure-drive|cleanup>',
      examples: [
        'pnpm qa start --role siswa',
        'pnpm qa setup --profile full',
        'pnpm qa run --scenario SIS-001 --profile full',
      ],
    });
  else if (operation === 'list' || operation === 'validate') {
    const scenarios = discover(root);
    const ids = new Set();
    for (const s of scenarios) {
      validateScenario(root, s);
      if (ids.has(s.id)) throw new Error('DUPLICATE_SCENARIO_ID');
      ids.add(s.id);
    }
    emit({
      valid: true,
      scenarios: scenarios
        .filter((s) => !flags.role || s.role === flags.role)
        .map((s) => ({ id: s.id, role: s.role, title: s.title, checks: s.checks.length })),
    });
    if (!scenarios.length) throw new Error('NO_SCENARIOS_FOUND');
  } else if (operation === 'start') {
    const role = flags.role;
    if (!ROLES.includes(role)) throw new Error('Choose --role siswa|guru|admin|cross-role');
    const session = newSession(root, role);
    emit({
      session,
      next: 'pnpm qa doctor --profile full',
      scenarios: discover(root)
        .filter((s) => s.role === role)
        .map((s) => s.id),
    });
  } else if (operation === 'doctor' || operation === 'setup') {
    const profile = flags.profile || 'standard';
    if (!Object.hasOwn(PROFILES, profile)) throw new Error('INVALID_PROFILE');
    if (operation === 'setup' && !existsSync(resolve(root, '.env.test.local')))
      copyFileSync(resolve(root, '.env.test.example'), resolve(root, '.env.test.local'));
    const readiness = await doctor(root, profile);
    if (operation === 'setup') {
      const { inspectWindowsSetup } = await import('./qa/windows.mjs');
      const { runProcess } = await import('./qa/process.mjs');
      readiness.windowsSetup = await inspectWindowsSetup(root, runProcess);
    }
    emit(readiness);
    try {
      const session = selectedSession(false);
      if (session.phase !== 'RUNNING') {
        session.phase = readiness.ready ? 'READY' : 'SETUP_REQUIRED';
        saveSession(root, session);
      }
    } catch {
      /* A machine check need not choose or create an ambiguous session. */
    }
    if (!readiness.ready) process.exitCode = 2;
  } else if (operation === 'run' || operation === 'retest')
    await runScenario(operation === 'retest');
  else if (operation === 'status' || operation === 'continue') {
    const session = selectedSession();
    if (session.phase === 'RUNNING') {
      let active = true;
      try {
        process.kill(session.pid, 0);
      } catch {
        active = false;
      }
      if (!active) {
        session.phase = 'INTERRUPTED';
        if (session.runId) {
          const interruptedScenario = loadScenario(root, session.scenarioId);
          const interruptedResult = readJson(resultPath(root, interruptedScenario, session.runId));
          if (!interruptedResult.finishedAt) {
            interruptedResult.finishedAt = now();
            for (const check of interruptedResult.checks)
              if (check.status === 'NOT_RUN' && check.reason === 'PENDING')
                check.reason = 'RUN_INTERRUPTED_BEFORE_COMPLETION';
            interruptedResult.verdict = summarize(
              interruptedResult.checks,
              interruptedResult.profile,
            );
            writeReport(root, interruptedScenario, interruptedResult);
          }
        }
        delete session.pid;
        saveSession(root, session);
        const lock = inside(root, 'qa/.local/locks/' + session.id + '.lock');
        if (existsSync(lock)) unlinkSync(lock);
      }
    }
    let stale = false,
      next =
        session.phase === 'READY'
          ? 'pnpm qa list --role ' + session.role
          : 'pnpm qa doctor --profile full';
    if (session.runId) {
      const scenario = loadScenario(root, session.scenarioId),
        result = readJson(resultPath(root, scenario, session.runId));
      stale = !sameIdentity(result.identity, identity(root, scenario));
      next =
        session.phase === 'INTERRUPTED'
          ? 'pnpm qa run --scenario ' +
            scenario.id +
            ' --profile ' +
            session.profile +
            ' --session ' +
            session.id
          : stale
            ? 'pnpm qa retest --scenario ' + scenario.id + ' --session ' + session.id
            : nextActions(scenario, effectiveResult(scenario, result))[0];
    }
    if (session.phase === 'RUNNING')
      next = 'WAIT_FOR_ACTIVE_RUN: do not start another action on this session';
    emit({
      session,
      stale,
      ownedProcesses: session.runId ? ownedProcesses(root, session.runId) : [],
      next,
      note: 'continue returns the next explicit local action; Codex executes it after checking prerequisites. Sharing is always a separate Bagikan action.',
    });
  } else if (operation === 'report') {
    const { scenario, result } = selectedRun();
    const effective = effectiveResult(scenario, result);
    // Preserve the original result.json as the automated-run record.
    writeReport(root, scenario, effective, { persistResult: false });
    emit({ run: result.id, verdict: effective.verdict, next: nextActions(scenario, effective) });
  } else if (operation === 'manual') {
    const { scenario, result, path } = selectedRun();
    if (!sameIdentity(result.identity, identity(root, scenario)))
      throw new Error('STALE_RUN: repeat affected automated tests before recording acceptance');
    const check = result.checks.find((c) => c.id === flags.check && c.adapter === 'manual');
    if (!check || !['PASS', 'FAIL'].includes(flags.status) || !flags.note || !flags.reviewer)
      throw new Error('Manual review requires --check, --status PASS|FAIL, --reviewer and --note');
    const manualPath = resolve(dirname(path), 'manual.json'),
      records = existsSync(manualPath) ? readJson(manualPath) : {};
    records[check.id] = {
      status: flags.status,
      reviewer: sanitize(flags.reviewer),
      note: sanitize(flags.note),
      at: now(),
      identity: result.identity,
    };
    writeJson(manualPath, records);
    emit({
      recorded: true,
      next: 'pnpm qa report --scenario ' + scenario.id + ' --run ' + result.id,
    });
  } else if (operation === 'share') {
    const { scenario, result, path } = selectedRun(),
      config = readJson(resolve(root, 'qa/config.json'));
    writeReport(root, scenario, effectiveResult(scenario, result), { persistResult: false });
    const report = sanitize(readFileSync(resolve(dirname(path), 'report.md'), 'utf8'));
    const publicationPath = inside(root, 'qa/.local/publications/' + result.id + '.json');
    const previous = existsSync(publicationPath) ? readJson(publicationPath) : {};
    const reportHash = digest(report);
    const request = publicationRequest(previous, {
      runId: result.id,
      scenarioId: scenario.id,
      role: result.role,
      reportHash,
      folderId: config.drive.folderId,
      title: scenario.id + ' — ' + result.id,
      reportPath: relative(root, resolve(dirname(path), 'report.md')).replaceAll('\\', '/'),
      requestedAt: now(),
    });
    writeJson(publicationPath, request);
    emit({
      publication: request,
      next:
        request.status === 'PUBLISHED'
          ? 'Reuse verified document URL; do not create a duplicate.'
          : 'Codex uses connected Google Drive/Docs tools, searches exact run ID before create, verifies readback, then records publication. No credentials or raw artifacts are uploaded.',
    });
  } else if (operation === 'publication') {
    const { result, path: originalPath } = selectedRun(),
      path = inside(root, 'qa/.local/publications/' + result.id + '.json');
    const currentHash = digest(
      sanitize(readFileSync(resolve(dirname(originalPath), 'report.md'), 'utf8')),
    );
    const request = publicationReadback(
      readJson(path),
      flags['verified-run'],
      flags['document-url'],
      currentHash,
    );
    writeJson(path, request);
    const { scenario, path: resultFile } = selectedRun();
    writeJson(resolve(dirname(resultFile), 'publication.json'), request);
    emit({
      run: result.id,
      status: request.status,
      url: request.documentUrl,
      scenario: scenario.id,
    });
  } else if (operation === 'configure-drive') {
    const id = flags['folder-id'];
    if (!/^[A-Za-z0-9_-]{10,}$/.test(id || '')) throw new Error('INVALID_DRIVE_FOLDER_ID');
    const path = resolve(root, 'qa/config.json'),
      config = readJson(path);
    config.drive.folderId = id;
    config.drive.teamAccessVerified = false;
    writeJson(path, config);
    emit({
      configured: true,
      teamAccess: 'Verify the three members access during onboarding; never use public sharing.',
    });
  } else if (operation === 'staging') {
    const config = readJson(resolve(root, 'qa/config.json'));
    emit({
      status: 'BLOCKED',
      configured: config.staging.enabled,
      reason: config.staging.enabled
        ? 'MANUAL_DEPLOYMENT_AND_GOOGLE_VERIFICATION_REQUIRED'
        : 'STAGING_NOT_CONFIGURED',
      prerequisites: [
        'Approved dedicated QA deployment URL',
        'Verified matching web/API deployment SHA',
        'Authorized synthetic QA accounts and data ownership',
        'Google OAuth callback and real sign-in evidence',
        'Permission and isolated target before load/fault/restore',
      ],
      configuration: {
        baseUrl: config.staging.baseUrl,
        deploymentSha: config.staging.deploymentSha,
      },
      next: 'Follow docs/testing/QA_WORKFLOW.md staging checklist; do not reuse cloud Development as staging.',
    });
    process.exitCode = 2;
  } else if (operation === 'cleanup') {
    if (!/^[a-f0-9-]{36}$/.test(flags.run || '')) throw new Error('Choose an owned --run');
    if (ownedProcesses(root, flags.run).some((record) => record.needsInspection))
      throw new Error(
        'OWNED_PROCESS_NEEDS_INSPECTION: verify command/start time before cleanup; never kill a possibly reused PID automatically',
      );
    const sessionsDir = inside(root, 'qa/.local/sessions');
    if (existsSync(sessionsDir)) {
      const { readdirSync } = await import('node:fs');
      for (const name of readdirSync(sessionsDir).filter((entry) =>
        /^[a-f0-9-]{36}\.json$/.test(entry),
      )) {
        const session = readJson(resolve(sessionsDir, name));
        if (session.runId === flags.run && session.phase === 'RUNNING') {
          let active = true;
          try {
            process.kill(session.pid, 0);
          } catch {
            active = false;
          }
          if (active) throw new Error('CANNOT_CLEAN_ACTIVE_RUN');
        }
      }
    }
    const resource = readJson(inside(root, 'qa/.local/resources/' + flags.run + '.json'));
    const expected = 'numora_test_qa_' + flags.run.replaceAll('-', '');
    if (
      resource.runId !== flags.run ||
      resource.database !== expected ||
      ![expected + '_restore', expected + '_recovery_restore'].includes(resource.restoreDatabase) ||
      resource.redisPrefix !== 'numora:test:qa:' + flags.run
    )
      throw new Error('RESOURCE_OWNERSHIP_MISMATCH');
    const { environment, problems } = testEnvironment(root);
    if (problems.length) throw new Error('INVALID_TEST_ENVIRONMENT');
    const postgres = requireFrom(root, 'packages/database')('postgres');
    const sql = postgres(environment.TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
    try {
      const experiments = ['volume', 'velocity', 'variety', 'recovery'].map(
        (mode) => expected + '_' + mode,
      );
      if (
        resource.experimentDatabases &&
        JSON.stringify(resource.experimentDatabases) !== JSON.stringify(experiments)
      )
        throw new Error('EXPERIMENT_OWNERSHIP_MISMATCH');
      for (const name of [
        resource.restoreDatabase,
        ...(resource.experimentDatabases || []),
        resource.database,
      ])
        await sql.unsafe('DROP DATABASE IF EXISTS "' + name + '" WITH (FORCE)');
    } finally {
      await sql.end();
    }
    const Redis = requireFrom(root, 'apps/worker')('ioredis');
    const redis = new Redis(environment.TEST_REDIS_URL, {
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    try {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(
          cursor,
          'MATCH',
          resource.redisPrefix + ':*',
          'COUNT',
          100,
        );
        cursor = next;
        if (keys.length) await redis.unlink(...keys);
      } while (cursor !== '0');
    } finally {
      redis.disconnect();
    }
    resource.cleanedAt = now();
    writeJson(inside(root, 'qa/.local/resources/' + flags.run + '.json'), resource);
    emit({ cleaned: true, run: flags.run, reportPreserved: true });
  } else throw new Error('UNKNOWN_OPERATION');
} catch (error) {
  emit({ error: sanitize(error.message) });
  process.exitCode = 2;
}

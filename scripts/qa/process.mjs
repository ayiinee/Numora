import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, resolve, delimiter } from 'node:path';
import { parseEnv } from 'node:util';
import { createServer } from 'node:net';
import os from 'node:os';
import { sanitize, readJson, writeJson, inside, now } from './core.mjs';

export function trackOwnedProcess(root, child, environment, label) {
  const runId = environment.QA_RUN_ID;
  if (!runId || !child.pid) return;
  if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error('INVALID_PROCESS_RUN_ID');
  const path = inside(root, 'qa/.local/processes/' + runId + '/' + child.pid + '.json');
  const record = {
    runId,
    pid: child.pid,
    parentPid: process.pid,
    label: sanitize(label),
    startedAt: now(),
    endedAt: null,
    code: null,
  };
  writeJson(path, record);
  child.once('close', (code) => {
    record.endedAt = now();
    record.code = code;
    try {
      writeJson(path, record);
    } catch {
      console.error('QA_PROCESS_LEDGER_WRITE_FAILED');
    }
  });
}
export function ownedProcesses(root, runId) {
  if (!/^[a-f0-9-]{36}$/.test(runId || '')) throw new Error('INVALID_PROCESS_RUN_ID');
  const directory = inside(root, 'qa/.local/processes/' + runId);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => /^\d+\.json$/.test(file))
    .map((file) => {
      const record = readJson(resolve(directory, file));
      if (record.runId !== runId || !Number.isInteger(record.pid) || record.pid < 1)
        throw new Error('PROCESS_OWNERSHIP_MISMATCH');
      let pidAlive = false;
      try {
        process.kill(record.pid, 0);
        pidAlive = true;
      } catch {
        /* Finished or inaccessible. */
      }
      return { ...record, pidAlive, needsInspection: !record.endedAt && pidAlive };
    });
}

export function requireFrom(root, packagePath) {
  return createRequire(resolve(root, packagePath, 'package.json'));
}
export function pnpmCommand(root, args) {
  if (process.platform !== 'win32') return ['pnpm', args];
  const native = resolve(process.env.APPDATA || '', 'npm/node_modules/pnpm/pnpm.exe');
  if (existsSync(native)) return [native, args];
  const candidates = [
    resolve(dirname(process.execPath), 'node_modules/corepack/dist/pnpm.js'),
    resolve(process.env.APPDATA || '', 'npm/node_modules/pnpm/bin/pnpm.cjs'),
    ...String(process.env.PATH || '')
      .split(delimiter)
      .map((p) => resolve(p, 'node_modules/pnpm/bin/pnpm.cjs')),
  ];
  const cli = candidates.find((p) => existsSync(p));
  if (!cli) throw new Error('PNPM_NODE_ENTRY_NOT_FOUND: install the repository-pinned pnpm');
  return [process.execPath, [cli, ...args]];
}
export function command(root, kind, args) {
  return kind === 'pnpm' ? pnpmCommand(root, args) : [kind, args];
}
export function childEnvironment(supplied = process.env) {
  const environment = { ...supplied };
  if (process.platform === 'win32') {
    const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === 'path');
    const inherited = pathKey ? environment[pathKey] : process.env.PATH || '';
    for (const key of Object.keys(environment))
      if (key.toLowerCase() === 'path') delete environment[key];
    environment.PATH = [
      dirname(process.execPath),
      resolve(process.env.APPDATA || '', 'npm'),
      inherited,
    ].join(delimiter);
  }
  return environment;
}
export function terminate(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      child.kill();
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}
export function runProcess(root, binary, args, options = {}) {
  return new Promise((resolveResult) => {
    if (options.signal?.aborted) {
      resolveResult({ code: null, error: 'INTERRUPTED_BEFORE_START', output: '', timedOut: true });
      return;
    }
    const [executable, argv] = command(root, binary, args);
    if (options.log) {
      mkdirSync(dirname(options.log), { recursive: true });
      writeFileSync(options.log, '', { mode: 0o600 });
    }
    let pendingLine = '';
    let child,
      output = '',
      timedOut = false,
      timer,
      finished = false;
    const stop = () => {
      timedOut = true;
      if (child) terminate(child);
    };
    try {
      child = spawn(executable, argv, {
        cwd: options.cwd || root,
        env: childEnvironment(options.env || process.env),
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      trackOwnedProcess(
        root,
        child,
        options.env || process.env,
        binary === 'pnpm' ? 'pnpm runner tree' : 'QA child process tree',
      );
    } catch (error) {
      if (child) terminate(child);
      resolveResult({ code: null, error: sanitize(error.message), output: '', timedOut: false });
      return;
    }
    const capture = (data) => {
      const chunk = data.toString();
      output = (output + chunk).slice(-2_000_000);
      if (options.log) {
        pendingLine += chunk;
        const end = pendingLine.lastIndexOf('\n');
        if (end >= 0) {
          appendFileSync(options.log, sanitize(pendingLine.slice(0, end + 1)));
          pendingLine = pendingLine.slice(end + 1);
        }
      }
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    if (options.timeoutMs) {
      timer = setTimeout(stop, options.timeoutMs);
      timer.unref();
    }
    options.signal?.addEventListener('abort', stop, { once: true });
    const finish = (code, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', stop);
      if (options.log) {
        mkdirSync(dirname(options.log), { recursive: true });
        writeFileSync(options.log, sanitize(output), { mode: 0o600 });
      }
      resolveResult({
        code,
        error: error ? sanitize(error.message) : null,
        output: sanitize(output),
        timedOut,
      });
    };
    child.once('error', (error) => finish(null, error));
    child.once('close', (code) => finish(code, null));
  });
}
export function testEnvironment(root, supplied = process.env) {
  const environment = { ...supplied };
  const file = resolve(root, '.env.test.local');
  if (existsSync(file)) {
    const parsed = parseEnv(readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(parsed))
      if (environment[key] === undefined) environment[key] = value;
  }
  const problems = [];
  if (environment.NODE_ENV !== 'test') problems.push('NODE_ENV must be test');
  for (const [key, protocols] of [
    ['TEST_DATABASE_URL', ['postgres:', 'postgresql:']],
    ['TEST_REDIS_URL', ['redis:']],
  ]) {
    try {
      const url = new URL(environment[key]);
      if (!protocols.includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname))
        throw new Error();
      if (key === 'TEST_DATABASE_URL' && !/^\/numora_test(?:_[a-z0-9_]+)?$/.test(url.pathname))
        throw new Error();
    } catch {
      problems.push(key + ' must point to a dedicated localhost test service');
    }
  }
  if (!environment.BULLMQ_PREFIX?.startsWith('numora:test:'))
    problems.push('BULLMQ_PREFIX must start with numora:test:');
  for (const key of ['DATABASE_URL', 'REDIS_URL'])
    if (environment[key]) problems.push('Clear inherited ' + key);
  if (
    environment.DATABASE_MIGRATION_URL &&
    environment.DATABASE_MIGRATION_URL !== environment.TEST_DATABASE_URL
  )
    problems.push('DATABASE_MIGRATION_URL must exactly match TEST_DATABASE_URL');
  return { environment, problems };
}
export async function doctor(root, profile = 'standard') {
  const config = readJson(resolve(root, 'qa/config.json')),
    checks = [];
  const add = (id, ready, message, version) =>
    checks.push({ id, ready, message, ...(version ? { version } : {}) });
  add(
    'node',
    Number(process.versions.node.split('.')[0]) === 24,
    'Node 24 required',
    process.versions.node,
  );
  const packageVersion = readJson(resolve(root, 'package.json')).packageManager.split('@')[1];
  const pnpm = await runProcess(root, 'pnpm', ['--version'], { timeoutMs: 15000 });
  add(
    'pnpm',
    pnpm.code === 0 && pnpm.output.trim() === packageVersion,
    'Use repository-pinned pnpm',
    pnpm.output.trim(),
  );
  add(
    'dependencies',
    existsSync(resolve(root, 'node_modules/ajv')),
    'Run pnpm install --frozen-lockfile',
  );
  const { environment, problems } = testEnvironment(root);
  if (profile !== 'quick') {
    for (const port of [3500, 3501, 3502]) {
      const available = await new Promise((ready) => {
        const server = createServer();
        server.once('error', () => ready(false));
        server.listen(port, 'localhost', () => server.close(() => ready(true)));
      });
      add(
        'port-' + port,
        available,
        'Port ' + port + ' must be free; do not stop unrelated processes',
      );
    }
    add(
      'test-environment',
      problems.length === 0,
      problems.join('; ') || 'Dedicated test configuration accepted',
    );
    if (!problems.length) {
      const guard = await runProcess(root, process.execPath, ['scripts/check-test-env.mjs'], {
        env: environment,
        timeoutMs: 10000,
      });
      add(
        'existing-test-guard',
        guard.code === 0,
        guard.code === 0 ? 'Existing guard accepted' : 'Existing test guard rejected configuration',
      );
      let sql, redis;
      try {
        const postgres = requireFrom(root, 'packages/database')('postgres');
        sql = postgres(environment.TEST_DATABASE_URL, {
          max: 1,
          connect_timeout: 3,
          idle_timeout: 1,
          onnotice: () => {},
        });
        const [version] = await sql.unsafe(
          "select current_setting('server_version_num')::integer as version",
        );
        const [permissions] = await sql.unsafe(
          'select rolcreatedb or rolsuper as allowed from pg_roles where rolname=current_user',
        );
        add(
          'postgres',
          Math.floor(version.version / 10000) === config.services.postgresMajor,
          'PostgreSQL 16 required',
          String(version.version),
        );
        add(
          'create-test-database',
          permissions.allowed === true,
          'Dedicated test account must have CREATEDB for run isolation',
        );
      } catch {
        add(
          'postgres',
          false,
          'PostgreSQL unavailable: check localhost service, test database and credentials',
        );
      } finally {
        if (sql) await sql.end({ timeout: 1 });
      }
      try {
        const Redis = requireFrom(root, 'apps/worker')('ioredis');
        redis = new Redis(environment.TEST_REDIS_URL, {
          lazyConnect: true,
          connectTimeout: 3000,
          maxRetriesPerRequest: 0,
          retryStrategy: () => null,
        });
        redis.on('error', () => {});
        await redis.connect();
        const info = await redis.info('server'),
          version = info.match(/redis_version:([^\r\n]+)/)?.[1] || 'unknown';
        add(
          'redis',
          Number(version.split('.')[0]) === config.services.redisMajor,
          'Redis 7 required',
          version,
        );
      } catch {
        add('redis', false, 'Redis unavailable: check dedicated localhost service');
      } finally {
        redis?.disconnect();
      }
    }
    try {
      const { chromium } = requireFrom(root, 'apps/web')('@playwright/test');
      add(
        'chromium',
        existsSync(chromium.executablePath()),
        'Install Chromium: pnpm --filter @tka/web exec playwright install chromium',
      );
    } catch {
      add('chromium', false, 'Playwright package unavailable');
    }
  }
  if (profile === 'full') {
    const k6 = await runProcess(root, environment.QA_K6_BIN || 'k6', ['version'], {
      timeoutMs: 10000,
    });
    add(
      'k6',
      k6.code === 0,
      'Install k6 or set QA_K6_BIN in ignored .env.test.local',
      k6.code === 0 ? k6.output.trim() : undefined,
    );
    try {
      requireFrom(root, 'apps/web').resolve('@axe-core/playwright');
      add('axe', true, 'axe available');
    } catch {
      add('axe', false, 'Install locked QA dependencies');
    }
    for (const tool of ['pg_dump', 'pg_restore']) {
      const probe = await runProcess(
        root,
        environment.QA_PG_BIN
          ? resolve(environment.QA_PG_BIN, tool + (process.platform === 'win32' ? '.exe' : ''))
          : tool,
        ['--version'],
        { timeoutMs: 10000 },
      );
      const version = probe.output.match(/\b(\d+)\.\d+/)?.[1];
      add(
        tool,
        probe.code === 0 && Number(version) === config.services.postgresMajor,
        'PostgreSQL 16 client tools must be in PATH or QA_PG_BIN',
        probe.code === 0 ? probe.output.trim() : undefined,
      );
    }
  }
  return {
    ready: checks.every((c) => c.ready),
    platform: process.platform,
    resources: {
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
    },
    localEnvironment: sanitize(
      environment.QA_LOCAL_ENV_LABEL || 'operator-provided-local-services',
    ),
    build: { mode: 'production', lowMemory: config.runtime?.lowMemoryBuild !== false },
    profile,
    checks,
    staging: config.staging.enabled
      ? 'CONFIGURATION_REQUIRES_DEPLOYMENT_VERIFICATION'
      : 'NOT_CONFIGURED',
    drive: config.drive.folderId ? 'FOLDER_CONFIGURED_CONNECTION_REQUIRES_CHECK' : 'NOT_CONFIGURED',
  };
}
export async function createRunDatabase(root, runId, environment) {
  const postgres = requireFrom(root, 'packages/database')('postgres');
  const sql = postgres(environment.TEST_DATABASE_URL, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  });
  const name = 'numora_test_qa_' + runId.replaceAll('-', '');
  try {
    await sql.unsafe('CREATE DATABASE "' + name + '"');
  } finally {
    await sql.end();
  }
  const url = new URL(environment.TEST_DATABASE_URL);
  url.pathname = '/' + name;
  url.searchParams.set('sslmode', 'disable');
  return {
    name,
    environment: {
      ...environment,
      TEST_DATABASE_URL: url.href,
      DATABASE_MIGRATION_URL: url.href,
      DATABASE_URL: '',
      REDIS_URL: '',
      BULLMQ_PREFIX: 'numora:test:qa:' + runId,
      QA_RUN_ID: runId,
      QA_CONTROL_DATABASE_URL: environment.TEST_DATABASE_URL,
    },
  };
}
export async function cloneExperimentDatabase(root, runId, mode, environment) {
  if (!['volume', 'velocity', 'variety', 'recovery'].includes(mode))
    throw new Error('INVALID_EXPERIMENT');
  const base = 'numora_test_qa_' + runId.replaceAll('-', '');
  const source = new URL(environment.TEST_DATABASE_URL);
  if (!/^[a-f0-9-]{36}$/.test(runId) || source.pathname !== '/' + base)
    throw new Error('EXPERIMENT_DATABASE_OWNERSHIP_MISMATCH');
  const admin = new URL(environment.QA_CONTROL_DATABASE_URL || source);
  if (admin.pathname === source.pathname || admin.host !== source.host)
    throw new Error('INVALID_CONTROL_DATABASE');
  const postgres = requireFrom(root, 'packages/database')('postgres');
  const sql = postgres(admin.href, { max: 1, connect_timeout: 5, onnotice: () => {} });
  const name = base + '_' + mode;
  try {
    await sql.unsafe('CREATE DATABASE "' + name + '" TEMPLATE "' + base + '"');
  } finally {
    await sql.end();
  }
  source.pathname = '/' + name;
  return { ...environment, TEST_DATABASE_URL: source.href, DATABASE_MIGRATION_URL: source.href };
}

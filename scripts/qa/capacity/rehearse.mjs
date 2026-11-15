import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { requireFrom, testEnvironment } from '../process.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const { environment, problems } = testEnvironment(root, { ...process.env, NODE_ENV: 'test' });
if (problems.length) throw new Error(problems.join('\n'));
const isolate = (env) =>
  Object.fromEntries(
    Object.entries(env).filter(([key]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|PROGRAMFILES|PROGRAMDATA)$/i.test(
        key,
      ),
    ),
  );
const runId = randomUUID();
const database = 'numora_test_qa_' + runId.replaceAll('-', '');
const testUrl = new URL(environment.TEST_DATABASE_URL);
const ownerUrl = new URL(testUrl);
ownerUrl.pathname = '/postgres';
testUrl.pathname = '/' + database;
const postgres = requireFrom(root, 'packages/database')('postgres');
const administrator = postgres(ownerUrl.href, { max: 1, connect_timeout: 5 });
const env = {
  ...isolate(environment),
  NODE_ENV: 'test',
  QA_RUN_ID: runId,
  TEST_DATABASE_URL: testUrl.href,
  DATABASE_MIGRATION_URL: testUrl.href,
  TEST_REDIS_URL: environment.TEST_REDIS_URL,
  DATABASE_URL: '',
  REDIS_URL: '',
  BULLMQ_PREFIX: 'numora:test:mixed-capacity:' + runId,
  QA_CAPACITY_EVIDENCE_URL: testUrl.href,
  QA_K6_BIN: environment.QA_K6_BIN || 'k6',
  QA_LOCAL_CAPACITY: 'true',
};
const web = 'http://localhost:3520';
const api = 'http://localhost:3521';
const auth = 'http://localhost:3522';
const webEnv = {
  ...isolate(environment),
  NODE_ENV: 'production',
  NUMORA_WEB_DIST_DIR: '.next-capacity',
  NUMORA_LOW_MEMORY: 'true',
  NEXT_PUBLIC_API_URL: api + '/api/v1',
  API_INTERNAL_URL: api + '/api/v1',
  NEXT_PUBLIC_SUPABASE_URL: auth,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'qa-local-fixture-public-key',
};
const evidence = resolve(root, 'qa/.local/capacity', 'rehearsal-' + runId);
const actorsPath = resolve(evidence, 'actors.local.json');
const configPath = resolve(evidence, 'config.json');
const children = [];
let owned = false;
const shutdown = new AbortController();
function stop() {
  shutdown.abort();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

function launch(exe, args, label, runtime = env, cwd = root) {
  shutdown.signal.throwIfAborted();
  const log = label ? openSync(resolve(evidence, label + '.log'), 'w') : null;
  const child = spawn(exe, args, {
    cwd,
    env: runtime,
    windowsHide: true,
    stdio: log === null ? 'inherit' : ['ignore', log, log],
  });
  if (log !== null) closeSync(log);
  const done = new Promise((resolveDone) => {
    child.once('close', resolveDone);
    child.once('error', () => resolveDone(1));
  });
  children.push({ child, done });
  return done;
}
async function build(target, action = 'build', runtime = env) {
  const args = ['--filter', '@tka/' + target, action];
  const log = target + '-' + action.replaceAll(':', '-');
  const code =
    process.platform === 'win32'
      ? await launch('cmd.exe', ['/d', '/s', '/c', 'pnpm ' + args.join(' ')], log, runtime)
      : await launch('pnpm', args, log, runtime);
  if (code !== 0) throw new Error('Rehearsal ' + action + ' failed for ' + target);
}
async function ready(url, timeoutMs = 60_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    shutdown.signal.throwIfAborted();
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1000),
      redirect: 'error',
    }).catch(() => null);
    await response?.body?.cancel();
    if (response?.ok) return;
    await delay(500);
  }
  throw new Error('Local QA readiness timed out');
}
try {
  for (const port of [3520, 3521, 3522]) {
    const server = createServer();
    server.listen(port, '127.0.0.1');
    await once(server, 'listening');
    await new Promise((done) => server.close(done));
  }
  mkdirSync(evidence, { recursive: true });
  console.log(JSON.stringify({ event: 'prepare-local-rehearsal', evidence }));
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const isDirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  writeFileSync(
    resolve(evidence, 'candidate.json'),
    JSON.stringify({ baseCommit: sha, trackedChanges: isDirty, runId }, null, 2),
  );
  await administrator.unsafe('create database ' + database);
  owned = true;
  for (const target of ['database', 'assessment-engine', 'irt-orchestration', 'api', 'worker'])
    await build(target);
  await build('database', 'db:migrate');
  await build('web', 'build', webEnv);
  const apiExit = launch(process.execPath, ['qa/runtime/serve.mjs'], 'api');
  await Promise.race([
    ready(api + '/api/v1/health/database', 300_000),
    apiExit.then(() => {
      throw new Error('Local QA API exited during setup. See api.log.');
    }),
  ]);
  launch(process.execPath, ['qa/runtime/consume.mjs'], 'outbox');
  launch(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', '3520', '-H', '127.0.0.1'],
    'web',
    webEnv,
    resolve(root, 'apps/web'),
  );
  await ready(web + '/login');
  const response = await fetch(auth + '/capacity-actors', {
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Cannot read local fixture bundle');
  writeFileSync(actorsPath, await response.text(), { mode: 0o600 });
  writeFileSync(
    configPath,
    JSON.stringify({
      web,
      api,
      deployment: { web: sha, api: sha, worker: sha },
      assessmentWrites: ['drill', 'pretest', 'tryout'],
      pvp: true,
      evidenceDatabaseHost: testUrl.hostname,
    }),
  );
  const runner = ['scripts/qa/capacity/run.mjs', 'dev', 'mixed-local', configPath, actorsPath];
  if ((await launch(process.execPath, [runner[0], 'check', ...runner.slice(1)], 'preflight')) !== 0)
    throw new Error('Local QA actor preflight failed');
  process.exitCode =
    (await launch(process.execPath, [runner[0], 'run', ...runner.slice(1)], null)) ?? 1;
} finally {
  for (const { child } of children)
    if (child.exitCode === null && child.signalCode === null) child.kill();
  await Promise.all(children.map(({ done }) => done));
  rmSync(actorsPath, { force: true });
  try {
    if (owned) {
      await administrator.unsafe('drop database ' + database);
      const Redis = requireFrom(root, 'apps/api')('ioredis').Redis;
      const redis = new Redis(environment.TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
      try {
        for (const prefix of [env.BULLMQ_PREFIX, 'pvp:' + env.BULLMQ_PREFIX]) {
          let cursor = '0';
          do {
            const [next, keys] = await redis.scan(cursor, 'MATCH', prefix + ':*', 'COUNT', 250);
            if (keys.length) await redis.unlink(...keys);
            cursor = next;
          } while (cursor !== '0');
        }
      } finally {
        redis.disconnect();
      }
    }
  } finally {
    await administrator.end({ timeout: 2 });
  }
}

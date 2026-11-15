import assert from 'node:assert/strict';
import { test } from 'node:test';
import { command, probeRedis, profileFile, redisUrlFrom, replaceRedisUrl, switchRedis } from './switch-redis.mjs';

test('interactive authorization commands accept inherited stdio without an output buffer', () => {
  assert.equal(command(process.execPath, ['-e', ''], { stdio: 'inherit' }), '');
});

const primary = 'rediss://default:fixture%24secret@primary.example.invalid:6379';
const backup = 'rediss://default:other%23secret@backup.example.invalid:6379';
const original = `# Production\r\nDATABASE_URL="postgresql://fixture:password@example.invalid/db"\r\nREDIS_URL="${primary}" # old\r\nBULLMQ_PREFIX=numora:prod\r\nOTHER="keep $this exactly"\r\n`;

test('replaces only Redis, preserving CRLF, database credentials, prefix and literal env values', () => {
  const changed = replaceRedisUrl(original, backup);
  assert.equal(changed, original.replace(`"${primary}" # old`, `"${backup}"`));
  assert.equal(redisUrlFrom(changed), backup);
  assert.equal(redisUrlFrom(`export REDIS_URL='${primary}'\n`), primary);
});

test('rejects ambiguous config, non-TLS URLs and profile path traversal', () => {
  for (const text of ['', `REDIS_URL="${primary}"\nREDIS_URL="${backup}"`,
    'REDIS_URL=redis://fixture.invalid:6379', 'REDIS_URL=not-a-url']) {
    assert.throws(() => redisUrlFrom(text));
  }
  assert.throws(() => replaceRedisUrl(original, `${backup}"\nDATABASE_URL=changed`));
  for (const name of ['../../production', 'backup-0', 'backup-1.env', '--help', undefined]) {
    assert.throws(() => profileFile(name));
  }
  assert.match(profileFile('backup-2'), /redis-backup-2\.env$/);
});

test('probe checks real writes/reads and disconnects; provider errors do not expose the URL', async () => {
  let disconnected = false;
  let stored;
  class Redis {
    on() {}
    async connect() {}
    async set(key, value, ttlMode, ttl, condition) {
      assert.match(key, /^numora:prod:redis-switch-probe:/);
      assert.deepEqual([ttlMode, ttl, condition], ['EX', 30, 'NX']);
      stored = value;
      return 'OK';
    }
    async get() { return stored; }
    async del() { stored = undefined; return 1; }
    disconnect() { disconnected = true; }
  }
  await probeRedis(Redis, backup, 'numora:prod');
  assert.equal(stored, undefined);
  assert.equal(disconnected, true);
  disconnected = false;
  class Exhausted extends Redis {
    async set() { throw new Error(`quota exceeded: ${backup}`); }
  }
  await assert.rejects(probeRedis(Exhausted, backup, 'numora:prod'), (error) => {
    assert.match(error.message, /Tes baca\/tulis/);
    assert.equal(error.message.includes(backup), false);
    return true;
  });
  assert.equal(disconnected, true);
  class ConstructorFailure {
    constructor() { throw new Error(backup); }
  }
  await assert.rejects(probeRedis(ConstructorFailure, backup, 'numora:prod'), /Tes baca\/tulis/);
});

function fixture(overrides = {}) {
  let current = original;
  const events = [];
  const options = {
    original, target: backup,
    probe: async () => { events.push('probe'); },
    authorize: async () => { events.push('authorize'); },
    backup: (text) => { assert.equal(text, original); events.push('backup'); return '/private/backup.env'; },
    readCurrent: () => current,
    write: (text) => { events.push(text === original ? 'restore' : 'write'); current = text; },
    stop: async () => { events.push('stop'); },
    start: async () => { events.push('start'); },
    waitHealthy: async () => { events.push('healthy'); },
    log: () => {},
    ...overrides,
  };
  return { options, events, current: () => current, edit: (text) => { current = text; } };
}

test('both services stop before changing env; backup precedes mutation and health gates success', async () => {
  const state = fixture();
  await switchRedis(state.options);
  assert.deepEqual(state.events, ['probe', 'authorize', 'backup', 'stop', 'write', 'start', 'healthy']);
  assert.equal(redisUrlFrom(state.current()), backup);
});

test('a rejected candidate or failed sudo check never stops services or changes env', async () => {
  for (const step of ['probe', 'authorize']) {
    const state = fixture({ [step]: async () => { throw new Error('fixture rejection'); } });
    await assert.rejects(switchRedis(state.options), /fixture rejection/);
    assert.equal(state.current(), original);
    assert.equal(state.events.includes('stop'), false);
    assert.equal(state.events.includes('backup'), false);
  }
});

for (const failedStep of ['stop', 'write', 'start', 'waitHealthy']) {
  test(`${failedStep} failure restores exact original config, restarts and verifies both services`, async () => {
    const state = fixture();
    const operation = state.options[failedStep];
    let first = true;
    state.options[failedStep] = (...args) => {
      if (first) { first = false; throw new Error(`fixture ${failedStep} failed`); }
      return operation(...args);
    };
    await assert.rejects(switchRedis(state.options), /sebelumnya sudah dipulihkan/);
    assert.equal(state.current(), original);
    assert.deepEqual(state.events.slice(-4), ['stop', 'restore', 'start', 'healthy']);
  });
}

test('unavailable old Redis is reported as an unconfirmed recovery, with backup location', async () => {
  const state = fixture({ waitHealthy: async () => { throw new Error('both Redis hosts unavailable'); } });
  await assert.rejects(switchRedis(state.options), /Pemulihan belum terkonfirmasi.*\/private\/backup.env/);
  assert.equal(state.current(), original);
});

test('concurrent env edits before stopping are preserved and abort the operation', async () => {
  const state = fixture();
  state.options.authorize = async () => { state.edit(`${original}NEW=operator-edit\n`); };
  await assert.rejects(switchRedis(state.options), /production.env berubah/);
  assert.equal(state.events.includes('stop'), false);
  assert.match(state.current(), /NEW=operator-edit/);
});

test('rollback preserves an unrelated env edit instead of silently overwriting it', async () => {
  const state = fixture();
  state.options.waitHealthy = async () => {
    state.edit(`${state.current()}NEW=operator-edit\n`);
    throw new Error('health failure');
  };
  await assert.rejects(switchRedis(state.options), /Pemulihan belum terkonfirmasi/);
  assert.match(state.current(), /NEW=operator-edit/);
  assert.equal(state.events.includes('restore'), false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoFailover, redisEndpointId, rehearseFailover, validateFailoverState } from './redis-failover.mjs';

const url = (name, password = 'fixture') => `rediss://default:${password}@${name}.example.invalid:6379`;
const quotaError = () => Object.assign(new Error('sanitized'), { quotaExceeded: true });
const candidates = [10, 2, 1].map((number) => ({ name: `backup-${number}`, url: url(`backup${number}`) }));

function fixture(overrides = {}) {
  const events = [];
  let state = { version: 1, exhausted: [], cooldownUntil: 0 };
  const options = {
    currentUrl: url('primary'),
    loadCandidates: () => candidates.map((candidate) => ({ ...candidate })),
    probe: async (target, mode) => {
      events.push(['probe', target, mode.readOnly]);
      if (target === url('primary')) throw quotaError();
    },
    switchTo: async (profile) => { events.push(['switch', profile]); },
    readState: () => state,
    saveState: (next) => { state = structuredClone(next); events.push(['save']); },
    now: () => 100_000,
    log: () => {},
    ...overrides,
  };
  return { options, events, state: () => state, setState: (next) => { state = next; } };
}

test('healthy active Redis does not read backup profiles, write state or restart', async () => {
  const state = fixture({
    probe: async (_target, mode) => { assert.equal(mode.readOnly, true); },
    loadCandidates: () => { throw new Error('must not load profiles'); },
  });
  assert.equal(await autoFailover(state.options), 'healthy');
  assert.deepEqual(state.events, []);
});

test('network/auth/other errors cannot trigger failover', async () => {
  for (const code of ['ETIMEDOUT', 'WRONGPASS', 'ECONNREFUSED']) {
    const state = fixture({ probe: async () => { throw new Error(code); } });
    await assert.rejects(autoFailover(state.options), /tanpa konfirmasi limit/);
    assert.deepEqual(state.events, []);
  }
});

test('quota confirms exhaustion, persists cooldown, probes first numeric backup and switches once', async () => {
  const state = fixture();
  assert.equal(await autoFailover(state.options), 'backup-1');
  assert.deepEqual(state.events, [
    ['probe', url('primary'), true], ['save'], ['probe', url('backup1'), false], ['switch', 'backup-1'],
  ]);
  assert.deepEqual(state.state(), {
    version: 1, exhausted: [redisEndpointId(url('primary'))], cooldownUntil: 400_000,
  });
  assert.equal(JSON.stringify(state.state()).includes('rediss://'), false);
});

test('quota-limited backup is remembered and the next backup is chosen', async () => {
  const state = fixture({ probe: async (target) => {
    if ([url('primary'), url('backup1')].includes(target)) throw quotaError();
  } });
  assert.equal(await autoFailover(state.options), 'backup-2');
  assert.equal(state.state().exhausted.includes(redisEndpointId(url('backup1'))), true);
  assert.deepEqual(state.events.filter(([event]) => event === 'switch'), [['switch', 'backup-2']]);
});

test('unreachable backup is skipped without permanently marking its quota exhausted', async () => {
  const state = fixture({ probe: async (target) => {
    if (target === url('primary')) throw quotaError();
    if (target === url('backup1')) throw new Error('timeout');
  } });
  assert.equal(await autoFailover(state.options), 'backup-2');
  assert.equal(state.state().exhausted.includes(redisEndpointId(url('backup1'))), false);
});

test('active backup-2 advances to backup-10 without returning to earlier profiles', async () => {
  const state = fixture({ currentUrl: url('backup2'), probe: async (target) => {
    if (target === url('backup2')) throw quotaError();
    assert.equal(target, url('backup10'));
  } });
  assert.equal(await autoFailover(state.options), 'backup-10');
});

test('same-endpoint credentials/aliases never count as a new quota reserve', async () => {
  assert.equal(redisEndpointId(url('primary')), redisEndpointId(url('primary', 'rotated')));
  const state = fixture({ loadCandidates: () => [
    { name: 'backup-1', url: url('primary', 'rotated') },
    { name: 'backup-2', url: url('backup2') },
  ] });
  assert.equal(await autoFailover(state.options), 'backup-2');
});

test('no ready reserve leaves active configuration unchanged and fails visibly', async () => {
  const state = fixture({ probe: async () => { throw quotaError(); } });
  await assert.rejects(autoFailover(state.options), /Tidak ada Redis cadangan berikutnya/);
  assert.equal(state.events.some(([event]) => event === 'switch'), false);
  assert.equal(state.state().exhausted.length, 4);
});

test('no configured backup cannot restart services', async () => {
  const state = fixture({ loadCandidates: () => [] });
  await assert.rejects(autoFailover(state.options), /Tidak ada Redis cadangan berikutnya/);
  assert.equal(state.events.some(([event]) => event === 'switch'), false);
});

test('repeated quota within cooldown does not probe reserves or restart', async () => {
  const state = fixture();
  await autoFailover(state.options);
  state.events.length = 0;
  assert.equal(await autoFailover(state.options), 'cooldown');
  assert.deepEqual(state.events, [['probe', url('primary'), true]]);
});

test('a failed startup does not cascade restarts across every healthy backup', async () => {
  const state = fixture({ switchTo: async (name) => { state.events.push(['switch', name]); throw new Error('startup failed'); } });
  await assert.rejects(autoFailover(state.options), /startup failed/);
  assert.deepEqual(state.events.filter(([event]) => event === 'switch'), [['switch', 'backup-1']]);
  assert.equal(state.state().cooldownUntil, 400_000);
});

test('state write failure stops before backup probes or service changes', async () => {
  const state = fixture({ saveState: () => { throw new Error('disk full'); } });
  await assert.rejects(autoFailover(state.options), /disk full/);
  assert.deepEqual(state.events, [['probe', url('primary'), true]]);
});

test('previously exhausted endpoints are skipped after cooldown', async () => {
  const state = fixture();
  state.setState({ version: 1, exhausted: [redisEndpointId(url('backup1'))], cooldownUntil: 0 });
  assert.equal(await autoFailover(state.options), 'backup-2');
});

test('corrupt state fails closed before checking Redis', async () => {
  for (const value of [null, {}, { version: 1, exhausted: ['raw-secret-url'], cooldownUntil: 0 },
    { version: 1, exhausted: [], cooldownUntil: -1 }]) {
    assert.throws(() => validateFailoverState(value), /State failover tidak valid/);
  }
  const state = fixture();
  state.setState({});
  await assert.rejects(autoFailover(state.options), /State failover tidak valid/);
  assert.deepEqual(state.events, []);
});

test('rehearsal simulates only the active quota, uses real standby probes and never writes durable state', async () => {
  const state = fixture();
  const before = structuredClone(state.state());
  assert.equal(await rehearseFailover(state.options), 'backup-1');
  assert.deepEqual(state.events, [['probe', url('backup1'), false]]);
  assert.deepEqual(state.state(), before);
});

test('rehearsal bypasses cooldown locally while retaining exhausted reserves and original state', async () => {
  const state = fixture();
  state.setState({ version: 1, exhausted: [redisEndpointId(url('backup1'))], cooldownUntil: 900_000 });
  const before = structuredClone(state.state());
  assert.equal(await rehearseFailover(state.options), 'backup-2');
  assert.deepEqual(state.state(), before);
  assert.deepEqual(state.events, [['probe', url('backup2'), false]]);
});

test('explicit apply uses the actual switch callback without marking healthy primary exhausted on disk', async () => {
  const state = fixture();
  const before = structuredClone(state.state());
  assert.equal(await rehearseFailover(state.options, { apply: true }), 'backup-1');
  assert.deepEqual(state.events, [['probe', url('backup1'), false], ['switch', 'backup-1']]);
  assert.deepEqual(state.state(), before);
});

test('rehearsal cannot fake an unavailable standby into readiness or print success', async () => {
  const messages = [];
  const state = fixture({ probe: async () => { throw quotaError(); }, log: (message) => messages.push(message) });
  await assert.rejects(rehearseFailover(state.options), /Tidak ada Redis cadangan berikutnya/);
  assert.equal(state.events.some(([event]) => event === 'switch' || event === 'save'), false);
  assert.equal(messages.some((message) => message.includes('LULUS:')), false);
});

test('apply rehearsal reports a real switch failure and does not try every reserve', async () => {
  const messages = [];
  const state = fixture({
    log: (message) => messages.push(message),
    switchTo: async (name) => { state.events.push(['switch', name]); throw new Error('real health failure'); },
  });
  await assert.rejects(rehearseFailover(state.options, { apply: true }), /real health failure/);
  assert.equal(messages.some((message) => message.includes('LULUS:')), false);
  assert.deepEqual(state.events, [['probe', url('backup1'), false], ['switch', 'backup-1']]);
});

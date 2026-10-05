import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import {
  accountNames,
  adminAccountNames,
  projectRef,
  runQaAccounts,
  readQaAccounts,
} from '../apps/api/scripts/qa-accounts.mjs';

// Entirely fictional identities and local temporary files; no environment secrets or network.
const env = {
  NODE_ENV: 'development',
  SUPABASE_URL: `https://${projectRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  SUPABASE_PROJECT_REF: projectRef,
  SUPABASE_SECRET_KEY: 'sb_secret_TEST_ONLY',
};

for (const key of [
  'NODE_ENV',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_SECRET_KEY',
]) {
  test(`invalid ${key} is identified before filesystem or Auth access`, async () => {
    let accessed = false;
    const unexpectedAccess = () => {
      accessed = true;
      throw new Error('Unexpected filesystem or Auth access');
    };
    await assert.rejects(
      runQaAccounts({
        root: '.',
        env: { ...env, [key]: 'TEST-PRIVATE-INVALID-VALUE' },
        createClient: unexpectedAccess,
        io: { mkdir: unexpectedAccess },
      }),
      (error) => {
        assert.match(error.message, new RegExp(`${key} must`));
        assert.doesNotMatch(error.message, /TEST-PRIVATE-INVALID-VALUE/);
        assert.match(error.message, /No QA accounts were changed/);
        return true;
      },
    );
    assert.equal(accessed, false);
  });
}

test('missing QA settings are reported together without accepting a legacy service-role key', async () => {
  const incomplete = { ...env, SUPABASE_SERVICE_ROLE_KEY: 'eyJ_TEST_PRIVATE_LEGACY_KEY' };
  delete incomplete.SUPABASE_PROJECT_REF;
  delete incomplete.SUPABASE_SECRET_KEY;
  await assert.rejects(runQaAccounts({ root: '.', env: incomplete }), (error) => {
    assert.match(error.message, /SUPABASE_PROJECT_REF must/);
    assert.match(error.message, /SUPABASE_SECRET_KEY must/);
    assert.match(error.message, /SUPABASE_SERVICE_ROLE_KEY is not used/);
    assert.doesNotMatch(error.message, /eyJ_TEST_PRIVATE_LEGACY_KEY/);
    return true;
  });
});

async function fixture(t, existing = true) {
  const root = await fs.mkdtemp(join(tmpdir(), 'numora-qa-test-'));
  t.after(async () => {
    assert.equal(
      resolve(root).startsWith(resolve(tmpdir()) + '\\') ||
        resolve(root).startsWith(resolve(tmpdir()) + '/'),
      true,
    );
    assert.equal(basename(root).startsWith('numora-qa-test-'), true);
    await fs.rm(root, { recursive: true, force: true });
  });
  const directory = join(root, '.qa-seed');
  await fs.mkdir(directory);
  const file = join(directory, 'accounts.json');
  const pending = join(directory, 'accounts.pending.json');
  const lock = join(directory, 'provisioning.lock');
  const accounts = Object.fromEntries(
    accountNames.map((name) => [
      name,
      {
        email: `numora-qa-${name.toLowerCase()}@example.invalid`,
        password: `TEST-OLD-${name}-PASSWORD`,
        id: randomUUID(),
      },
    ]),
  );
  const initial = { projectRef, accounts };
  if (existing) await fs.writeFile(file, JSON.stringify(initial));
  const users = new Map(
    existing
      ? accountNames.map((name) => [
          accounts[name].id,
          { id: accounts[name].id, email: accounts[name].email, app_metadata: { numora_qa: true } },
        ])
      : [],
  );
  const passwords = new Map(
    existing ? accountNames.map((name) => [accounts[name].id, accounts[name].password]) : [],
  );
  const calls = { updates: [], creates: [], lookups: 0 };
  const admin = {
    async listUsers({ perPage }) {
      calls.lookups++;
      return { data: { users: [...users.values()].slice(0, perPage) }, error: null };
    },
    async getUserById(id) {
      return { data: { user: users.get(id) }, error: null };
    },
    async updateUserById(id, { password }) {
      calls.updates.push({ id, password });
      passwords.set(id, password);
      return { data: { user: users.get(id) }, error: null };
    },
    async createUser(body) {
      const user = { id: randomUUID(), email: body.email, app_metadata: body.app_metadata };
      calls.creates.push(user.id);
      users.set(user.id, user);
      passwords.set(user.id, body.password);
      return { data: { user }, error: null };
    },
  };
  const run = (options = {}) =>
    runQaAccounts({
      root,
      env,
      args: ['--rotate-passwords'],
      createClient: () => ({ auth: { admin } }),
      ...options,
    });
  const read = async () => readQaAccounts(root);
  const consistent = async () => {
    const vault = await read();
    for (const name of accountNames)
      assert.equal(vault.accounts[name].password, passwords.get(vault.accounts[name].id));
  };
  return {
    root,
    directory,
    file,
    pending,
    lock,
    accounts,
    initial,
    users,
    passwords,
    calls,
    admin,
    run,
    read,
    consistent,
  };
}

test('preflight failure preserves the active vault and never logs provider secrets', async (t) => {
  const f = await fixture(t);
  f.admin.listUsers = async () => {
    throw new Error('TEST-PROVIDER-SECRET');
  };
  await assert.rejects(f.run(), (error) => {
    assert.match(error.message, /preflight failed/);
    assert.doesNotMatch(error.message, /TEST-PROVIDER-SECRET/);
    return true;
  });
  assert.deepEqual(await f.read(), f.initial);
  assert.equal(f.calls.updates.length, 0);
  await assert.rejects(fs.stat(f.pending), { code: 'ENOENT' });
});

for (const invalid of [
  'metadata',
  'email',
  'id',
  'project',
  'duplicate-id',
  'corrupt',
  'unreadable',
]) {
  test(`rejects ${invalid} before changing any of the six credentials`, async (t) => {
    const f = await fixture(t);
    if (invalid === 'metadata') f.users.get(f.accounts.studentC.id).app_metadata.numora_qa = false;
    if (invalid === 'email') f.users.get(f.accounts.studentC.id).email = 'non-qa@example.invalid';
    if (invalid === 'id') f.accounts.studentC.id = randomUUID();
    if (invalid === 'duplicate-id') f.accounts.studentC.id = f.accounts.admin.id;
    if (invalid === 'project') f.initial.projectRef = 'wrong-project';
    if (['id', 'project', 'duplicate-id'].includes(invalid))
      await fs.writeFile(f.file, JSON.stringify(f.initial));
    if (invalid === 'corrupt') await fs.writeFile(f.file, '{broken');
    const before = await fs.readFile(f.file, 'utf8');
    const io =
      invalid === 'unreadable'
        ? {
            ...fs,
            readFile: async (file, ...args) => {
              if (file === f.file)
                throw Object.assign(new Error('TEST-SECRET'), { code: 'EACCES' });
              return fs.readFile(file, ...args);
            },
          }
        : fs;
    await assert.rejects(f.run({ io }));
    assert.equal(await fs.readFile(f.file, 'utf8'), before);
    assert.equal(f.calls.updates.length, 0);
    assert.equal(f.calls.creates.length, 0);
  });
}

for (const target of ['file', 'pending']) {
  test(`a null ${target} is invalid rather than a missing file`, async (t) => {
    const f = await fixture(t);
    await fs.writeFile(f[target], 'null');
    await assert.rejects(f.run(), /unreadable\/invalid/);
    assert.equal(f.calls.lookups, 0);
    assert.equal(f.calls.updates.length, 0);
    assert.equal(await fs.readFile(f[target], 'utf8'), 'null');
  });
}

test('partial remote failure checkpoints only confirmed passwords and resumes the same candidates', async (t) => {
  const f = await fixture(t);
  const update = f.admin.updateUserById;
  f.admin.updateUserById = async (id, body) =>
    id === f.accounts.teacherB.id ? { error: { message: 'TEST-SECRET' } } : update(id, body);
  await assert.rejects(f.run(), /Could not rotate teacherB/);
  const pending = JSON.parse(await fs.readFile(f.pending, 'utf8'));
  const partial = await f.read();
  assert.equal(partial.accounts.admin.password, pending.accounts.admin.password);
  assert.equal(partial.accounts.teacherB.password, f.initial.accounts.teacherB.password);
  f.admin.updateUserById = update;
  await f.run();
  assert.deepEqual((await f.read()).accounts, pending.accounts);
  assert.equal(f.calls.updates.filter((call) => call.id === f.accounts.admin.id).length, 1);
  await f.consistent();
  await assert.rejects(fs.stat(f.pending), { code: 'ENOENT' });
});

test('an ambiguous remote success is retried with the identical candidate', async (t) => {
  const f = await fixture(t);
  const update = f.admin.updateUserById;
  f.admin.updateUserById = async (id, body) => {
    await update(id, body);
    throw new Error('TEST-NETWORK-SECRET');
  };
  await assert.rejects(f.run(), /Pending credentials/);
  const candidate = JSON.parse(await fs.readFile(f.pending, 'utf8')).accounts.admin.password;
  assert.deepEqual(await f.read(), f.initial);
  f.admin.updateUserById = update;
  await f.run();
  assert.equal(f.calls.updates[0].password, candidate);
  assert.equal(f.calls.updates[1].password, candidate);
  await f.consistent();
});

for (const target of ['accounts.json', 'accounts.pending.json', 'actors.json']) {
  test(`recovers remote success followed by an atomic ${target} write failure`, async (t) => {
    const f = await fixture(t);
    const io = {
      ...fs,
      rename: async (from, to) => {
        if (basename(to) === target && f.calls.updates.length) throw new Error('TEST-DISK-SECRET');
        return fs.rename(from, to);
      },
    };
    await assert.rejects(f.run({ io }), /atomically/);
    const pending = JSON.parse(await fs.readFile(f.pending, 'utf8'));
    await f.run();
    assert.deepEqual((await f.read()).accounts, pending.accounts);
    await f.consistent();
    assert.equal(
      (await fs.readdir(f.directory)).some((name) => name.endsWith('.tmp')),
      false,
    );
  });
}

test('exclusive lock rejects a concurrent invocation without stealing the first lock', async (t) => {
  const f = await fixture(t);
  const list = f.admin.listUsers;
  let release;
  let started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  f.admin.listUsers = async (query) => {
    started();
    await wait;
    return list(query);
  };
  const first = f.run();
  await entered;
  await assert.rejects(f.run(), /locked/);
  assert.equal(JSON.parse(await fs.readFile(f.lock, 'utf8')).pid, process.pid);
  release();
  await first;
  await f.consistent();
});

test('a crashed-process lock must be reviewed explicitly and is never auto-deleted', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.lock, JSON.stringify({ pid: 99999999, startedAt: '2026-10-03T00:00:00Z' }));
  await assert.rejects(f.run(), /verify the PID/);
  assert.equal(f.calls.lookups, 0);
  assert.equal(JSON.parse(await fs.readFile(f.lock, 'utf8')).pid, 99999999);
});

test('default provisioning and rerun create only six QA identities and keep passwords unchanged', async (t) => {
  const f = await fixture(t, false);
  assert.equal(await f.run({ args: [] }), 'verified');
  const created = await f.read();
  await f.run({ args: [] });
  assert.deepEqual(await f.read(), created);
  assert.equal(f.calls.creates.length, 6);
  assert.equal(f.calls.updates.length, 0);
  await f.consistent();
});

test('additional Admin group preserves the original vault, passwords and six-actor manifest', async (t) => {
  const f = await fixture(t);
  await f.run({ args: [] });
  const original = await fs.readFile(f.file, 'utf8');
  const originalActors = await fs.readFile(join(f.directory, 'actors.json'), 'utf8');
  await f.run({ args: [], group: 'adminRoles' });
  const file = join(f.directory, 'admin-roles/accounts.json');
  const additional = await fs.readFile(file, 'utf8');
  assert.deepEqual(
    Object.keys(JSON.parse(additional).accounts).sort(),
    ['admin', ...adminAccountNames].sort(),
  );
  await f.run({ args: [], group: 'adminRoles' });
  await f.run({ args: [] });
  assert.equal(await fs.readFile(f.file, 'utf8'), original);
  assert.equal(await fs.readFile(join(f.directory, 'actors.json'), 'utf8'), originalActors);
  assert.equal(await fs.readFile(file, 'utf8'), additional);
  assert.equal(f.calls.creates.length, 2);
  assert.equal(f.calls.updates.length, 0);
});

test('additional Admin creation recovers ambiguous Auth success without duplicate identities', async (t) => {
  const f = await fixture(t);
  const file = join(f.directory, 'admin-roles/accounts.json');
  const pending = join(f.directory, 'admin-roles/accounts.pending.json');
  const io = {
    ...fs,
    rename: async (from, to) => {
      if (to === pending && f.calls.creates.length) throw new Error('TEST ONLY DISK FAILURE');
      return fs.rename(from, to);
    },
  };
  await assert.rejects(f.run({ args: [], group: 'adminRoles', io }), /atomically/);
  const candidates = JSON.parse(await fs.readFile(pending, 'utf8')).accounts;
  await f.run({ args: [], group: 'adminRoles' });
  const accounts = JSON.parse(await fs.readFile(file, 'utf8')).accounts;
  for (const name of adminAccountNames)
    assert.equal(accounts[name].password, candidates[name].password);
  assert.equal(f.calls.creates.length, 2);
  assert.equal(f.calls.updates.length, 0);
  await f.consistent();
});

test('additional Admin group refuses a foreign Auth identity before creating or changing users', async (t) => {
  const f = await fixture(t);
  const id = randomUUID();
  f.users.set(id, {
    id,
    email: 'numora-qa-adminsuper@example.invalid',
    app_metadata: { numora_qa: false },
  });
  await assert.rejects(f.run({ args: [], group: 'adminRoles' }), /expected QA account/);
  assert.equal(f.calls.creates.length, 0);
  assert.equal(f.calls.updates.length, 0);
});

test('interrupted creation reuses the journal after remote success/local confirmation failure', async (t) => {
  const f = await fixture(t, false);
  const io = {
    ...fs,
    rename: async (from, to) => {
      if (to === f.pending && f.calls.creates.length) throw new Error('TEST-DISK');
      return fs.rename(from, to);
    },
  };
  await assert.rejects(f.run({ args: [], io }), /atomically/);
  await assert.rejects(fs.stat(f.file), { code: 'ENOENT' });
  await f.run({ args: [] });
  assert.equal(f.calls.creates.length, 6);
  await f.consistent();
});

test('missing vault refuses to adopt existing QA passwords except with explicit rotation', async (t) => {
  const f = await fixture(t);
  await fs.unlink(f.file);
  await assert.rejects(f.run({ args: [] }), /original vault or explicit/);
  assert.equal(f.calls.updates.length, 0);
  await f.run();
  await f.consistent();
});

test('pending rotation rejects default provisioning, external vault edits and a malformed journal', async (t) => {
  const f = await fixture(t);
  const update = f.admin.updateUserById;
  f.admin.updateUserById = async () => ({ error: { message: 'TEST-FAILURE' } });
  await assert.rejects(f.run());
  f.admin.updateUserById = update;
  await assert.rejects(f.run({ args: [] }), /original command/);
  const adminFile = join(f.directory, 'admin-roles/accounts.json');
  const modified = JSON.parse(await fs.readFile(adminFile, 'utf8'));
  modified.accounts.admin.password = 'TEST-EXTERNAL-EDIT';
  await fs.writeFile(adminFile, JSON.stringify(modified));
  await assert.rejects(f.run(), /changed outside/);
  await fs.writeFile(
    adminFile,
    JSON.stringify({ projectRef, accounts: { admin: f.initial.accounts.admin } }),
  );
  const journal = JSON.parse(await fs.readFile(f.pending, 'utf8'));
  journal.completed = ['unknown-user'];
  await fs.writeFile(f.pending, JSON.stringify(journal));
  await assert.rejects(f.run(), /Invalid QA recovery/);
  assert.equal(f.calls.updates.length, 0);
});

test('environment and unknown/duplicate flags are rejected; root/app aliases keep main checks', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run({ env: { ...env, NODE_ENV: 'production' } }), /exact Development/);
  await assert.rejects(f.run({ args: ['--unsafe'] }), /optional/);
  await assert.rejects(f.run({ args: ['--rotate-passwords', '--rotate-passwords'] }), /optional/);
  const root = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const app = JSON.parse(
    await fs.readFile(new URL('../apps/api/package.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    root.scripts['qa:accounts:rotate'],
    'dotenv -e .env -- pnpm --filter @tka/api qa:accounts:rotate',
  );
  assert.match(app.scripts['qa:accounts:rotate'], /--rotate-passwords$/);
  assert.match(root.scripts['test:checks'], /test-release-chain-guard.test.mjs/);
  assert.match(root.scripts['test:checks'], /qa-accounts.test.mjs/);
  assert.equal(f.calls.lookups, 0);
});

test('legacy Content Admin moves into the three-Admin vault without changing credentials or actor IDs', async (t) => {
  const f = await fixture(t);
  await f.run({ args: [], group: 'adminRoles' });
  const adminFile = join(f.directory, 'admin-roles/accounts.json');
  const admins = JSON.parse(await fs.readFile(adminFile, 'utf8'));
  assert.deepEqual(admins.accounts.admin, f.accounts.admin);
  assert.deepEqual(Object.keys(admins.accounts).sort(), ['admin', ...adminAccountNames].sort());
  assert.equal('admin' in JSON.parse(await fs.readFile(f.file, 'utf8')).accounts, false);
  await f.run({ args: [] });
  const actors = JSON.parse(await fs.readFile(join(f.directory, 'actors.json'), 'utf8'));
  assert.deepEqual(
    actors.actors,
    Object.fromEntries(accountNames.map((name) => [name, f.accounts[name].id])),
  );
  const extras = Object.fromEntries(adminAccountNames.map((name) => [name, admins.accounts[name]]));
  await f.run();
  const rotated = JSON.parse(await fs.readFile(adminFile, 'utf8'));
  for (const name of adminAccountNames) assert.deepEqual(rotated.accounts[name], extras[name]);
  await f.consistent();
});

test('interrupted move copies Content first and safely resumes source removal without Auth mutations', async (t) => {
  const f = await fixture(t);
  const io = {
    ...fs,
    rename: async (from, to) => {
      if (to === f.file) throw new Error('TEST ONLY interrupted source replacement');
      return fs.rename(from, to);
    },
  };
  await assert.rejects(f.run({ args: [], io }), /atomically/);
  const copied = JSON.parse(
    await fs.readFile(join(f.directory, 'admin-roles/accounts.json'), 'utf8'),
  );
  assert.deepEqual(copied.accounts.admin, f.accounts.admin);
  assert.deepEqual(await f.read(), f.initial);
  assert.equal(f.calls.updates.length, 0);
  assert.equal(f.calls.creates.length, 0);
  await f.run({ args: [] });
  assert.equal('admin' in JSON.parse(await fs.readFile(f.file, 'utf8')).accounts, false);
  await f.consistent();
});

test('conflicting Content credentials stop before Auth access and leave both vaults intact', async (t) => {
  const f = await fixture(t);
  const directory = join(f.directory, 'admin-roles');
  await fs.mkdir(directory);
  const file = join(directory, 'accounts.json');
  const destination = JSON.stringify({
    projectRef,
    accounts: { admin: { ...f.accounts.admin, password: 'TEST ONLY conflict' } },
  });
  await fs.writeFile(file, destination);
  const source = await fs.readFile(f.file, 'utf8');
  await assert.rejects(f.run({ args: [] }), /credentials conflict/);
  assert.equal(f.calls.lookups, 0);
  assert.equal(await fs.readFile(file, 'utf8'), destination);
  assert.equal(await fs.readFile(f.file, 'utf8'), source);
});

test('core and additional Admin provisioning share the same exclusive lock', async (t) => {
  const f = await fixture(t);
  const list = f.admin.listUsers;
  let release, started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  f.admin.listUsers = async (query) => {
    started();
    await wait;
    return list(query);
  };
  const first = f.run({ args: [] });
  await entered;
  await assert.rejects(f.run({ args: [], group: 'adminRoles' }), /locked/);
  release();
  await first;
  assert.equal(f.calls.creates.length, 0);
  await f.consistent();
});

test('an existing legacy rotation journal finishes before its Admin credentials move', async (t) => {
  const f = await fixture(t);
  const before = structuredClone(f.accounts);
  const candidate = structuredClone(before);
  candidate.admin.password = 'TEST ONLY confirmed legacy candidate';
  f.passwords.set(candidate.admin.id, candidate.admin.password);
  await fs.writeFile(f.file, JSON.stringify({ projectRef, accounts: candidate }));
  await fs.writeFile(
    f.pending,
    JSON.stringify({
      version: 1,
      projectRef,
      mode: 'rotate',
      hadVault: true,
      before,
      accounts: candidate,
      completed: ['admin'],
    }),
  );
  await f.run();
  assert.equal(
    f.calls.updates.some((call) => call.id === before.admin.id),
    false,
  );
  assert.equal('admin' in JSON.parse(await fs.readFile(f.file, 'utf8')).accounts, false);
  assert.deepEqual((await f.read()).accounts, candidate);
  await f.consistent();
});

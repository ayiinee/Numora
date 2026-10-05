import { randomBytes, randomUUID } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const projectRef = 'pkamenfnwmoeisccnrnk';
export const accountNames = ['admin', 'teacherA', 'teacherB', 'studentA', 'studentB', 'studentC'];
export const adminAccountNames = ['adminSuper', 'adminOperations'];
const participantNames = accountNames.filter((name) => name !== 'admin');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const email = (name) => `numora-qa-${name.toLowerCase()}@example.invalid`;
export class QaAccountError extends Error {}
const fail = (message) => {
  throw new QaAccountError(message);
};
const snapshot = (accounts) => ({ projectRef, accounts });

async function readJson(io, file) {
  try {
    const value = JSON.parse(await io.readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      fail('QA vault/journal must be an object.');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    fail(
      'QA vault or journal is unreadable/invalid. Restore it before retrying; no credentials were replaced.',
    );
  }
}

async function atomicJson(io, file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await io.open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2));
    await handle.sync();
    await handle.close();
    handle = null;
    await io.rename(temporary, file);
    if (process.platform !== 'win32') {
      const directory = await io.open(dirname(file), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } catch {
    fail('Could not save a QA file atomically. Keep the journal and retry the same command.');
  } finally {
    await handle?.close().catch(() => {});
    await io.unlink(temporary).catch(() => {});
  }
}

function validateAccounts(accounts, names = accountNames) {
  if (
    !accounts ||
    typeof accounts !== 'object' ||
    Object.keys(accounts).sort().join() !== names.slice().sort().join()
  )
    fail('QA vault/journal has an unexpected account set.');
  const ids = new Set();
  for (const name of names) {
    const account = accounts[name];
    if (
      !account ||
      account.email !== email(name) ||
      typeof account.password !== 'string' ||
      !account.password ||
      (account.id !== null && (typeof account.id !== 'string' || !uuid.test(account.id)))
    )
      fail(`Invalid ${name} QA account in vault/journal.`);
    if (account.id && ids.has(account.id)) fail('Duplicate QA identity in vault/journal.');
    if (account.id) ids.add(account.id);
  }
}

function validateVault(vault, names = accountNames) {
  if (vault.projectRef !== projectRef) fail('QA vault/journal project does not match Development.');
  validateAccounts(vault.accounts, names);
}

async function readLayout(root, io) {
  const core = await readJson(io, join(root, '.qa-seed/accounts.json'));
  const admins = await readJson(io, join(root, '.qa-seed/admin-roles/accounts.json'));
  if (core) validateVault(core, core.accounts?.admin ? accountNames : participantNames);
  if (admins) {
    const names = admins.accounts?.admin
      ? ['admin', ...adminAccountNames.filter((name) => name in admins.accounts)]
      : adminAccountNames;
    if (admins.accounts?.admin && names.length === 2)
      fail('The QA Admin vault has an incomplete additional account set.');
    validateVault(admins, names);
  }
  if (
    core?.accounts.admin &&
    admins?.accounts.admin &&
    ['id', 'email', 'password'].some(
      (key) => core.accounts.admin[key] !== admins.accounts.admin[key],
    )
  )
    fail('Content Admin credentials conflict between QA vaults. Existing files were preserved.');
  return { core, admins };
}

// Readers retain the six-actor QA workflow without duplicating Admin credentials on disk.
export async function readQaAccounts(root, io = filesystem) {
  const { core, admins } = await readLayout(root, io);
  if (!core) return null;
  const accounts = { ...core.accounts, admin: admins?.accounts.admin ?? core.accounts.admin };
  validateAccounts(accounts);
  return snapshot(Object.fromEntries(accountNames.map((name) => [name, accounts[name]])));
}

export async function readQaAdminAccounts(root, io = filesystem) {
  const { core, admins } = await readLayout(root, io);
  if (!admins && !core?.accounts.admin) return null;
  return snapshot({
    ...admins?.accounts,
    ...(core?.accounts.admin ? { admin: core.accounts.admin } : {}),
  });
}

async function readGroupVault(root, group, io) {
  if (group === 'core') return readQaAccounts(root, io);
  const { admins } = await readLayout(root, io);
  if (!admins || !adminAccountNames.some((name) => name in admins.accounts)) return null;
  return snapshot(
    Object.fromEntries(adminAccountNames.map((name) => [name, admins.accounts[name]])),
  );
}

async function migrateLayout(root, io) {
  const { core, admins } = await readLayout(root, io);
  if (!core?.accounts.admin) return;
  // Copy first, remove from the source second; interrupted moves replay without lost credentials.
  const directory = join(root, '.qa-seed/admin-roles');
  await io.mkdir(directory, { recursive: true, mode: 0o700 });
  const accounts = { admin: core.accounts.admin, ...admins?.accounts };
  await atomicJson(io, join(directory, 'accounts.json'), snapshot(accounts));
  await atomicJson(io, join(directory, 'actors.json'), {
    projectRef,
    mode: 'EMAIL_QA',
    actors: Object.fromEntries(
      Object.entries(accounts).map(([name, account]) => [name, account.id]),
    ),
  });
  await atomicJson(
    io,
    join(root, '.qa-seed/accounts.json'),
    snapshot(Object.fromEntries(participantNames.map((name) => [name, core.accounts[name]]))),
  );
}

async function saveGroupVault(root, group, accounts, io, legacyPending = false) {
  if (group === 'core' && legacyPending) {
    await atomicJson(io, join(root, '.qa-seed/accounts.json'), snapshot(accounts));
    return;
  }
  const { admins } = await readLayout(root, io);
  const directory = join(root, '.qa-seed/admin-roles');
  await io.mkdir(directory, { recursive: true, mode: 0o700 });
  const merged = {
    ...admins?.accounts,
    ...(group === 'core' ? { admin: accounts.admin } : accounts),
  };
  await atomicJson(io, join(directory, 'accounts.json'), snapshot(merged));
  await atomicJson(io, join(directory, 'actors.json'), {
    projectRef,
    mode: 'EMAIL_QA',
    actors: Object.fromEntries(Object.entries(merged).map(([name, account]) => [name, account.id])),
  });
  if (group === 'core')
    await atomicJson(
      io,
      join(root, '.qa-seed/accounts.json'),
      snapshot(Object.fromEntries(participantNames.map((name) => [name, accounts[name]]))),
    );
}

function validateJournal(journal, names = accountNames) {
  validateVault(journal, names);
  validateAccounts(journal.before, names);
  for (const name of names) {
    if (
      journal.before[name].id &&
      journal.accounts[name].id &&
      journal.before[name].id !== journal.accounts[name].id
    )
      fail('QA journal attempted to replace a pinned identity.');
    if (
      journal.mode === 'provision' &&
      journal.accounts[name].password !== journal.before[name].password
    )
      fail('Provisioning journal may not silently rotate existing credentials.');
  }
  if (
    journal.version !== 1 ||
    !['provision', 'rotate'].includes(journal.mode) ||
    typeof journal.hadVault !== 'boolean' ||
    !Array.isArray(journal.completed) ||
    new Set(journal.completed).size !== journal.completed.length ||
    journal.completed.some((name) => !names.includes(name)) ||
    journal.completed.some((name) => !journal.accounts[name].id)
  )
    fail('Invalid QA recovery journal. Keep it for operator recovery.');
}

function validateCurrent(vault, journal, names = accountNames) {
  if (!vault) {
    if (journal.hadVault)
      fail('The active QA vault is missing. Restore it before resuming rotation.');
    return;
  }
  validateVault(vault, names);
  for (const name of names) {
    const current = vault.accounts[name];
    const before = journal.before[name];
    const confirmed = journal.completed.includes(name) ? journal.accounts[name] : before;
    const equals = (other) =>
      current.id === other.id &&
      current.email === other.email &&
      current.password === other.password;
    if (!equals(before) && !equals(confirmed))
      fail('The active QA vault changed outside this operation. Keep the journal for recovery.');
  }
}

async function providerCall(action, message) {
  try {
    const result = await action();
    if (!result || result.error) fail(message);
    return result.data;
  } catch {
    fail(message);
  }
}

function assertQaUser(user, name, expectedId) {
  if (
    !user ||
    !uuid.test(user.id) ||
    user.email !== email(name) ||
    user.app_metadata?.numora_qa !== true ||
    (expectedId && user.id !== expectedId)
  )
    fail(
      `Existing ${name} Auth identity is not the expected QA account. No identity may be overwritten.`,
    );
}

async function lookupAll(admin, accounts, names = accountNames) {
  await providerCall(
    () => admin.listUsers({ page: 1, perPage: 1 }),
    'Admin API preflight failed. Retry after restoring access.',
  );
  const users = [];
  for (let page = 1; ; page++) {
    const data = await providerCall(
      () => admin.listUsers({ page, perPage: 100 }),
      'Admin user lookup failed. Retry without deleting the journal.',
    );
    if (!Array.isArray(data?.users)) fail('Admin user lookup returned an invalid response.');
    users.push(...data.users);
    if (data.users.length < 100) break;
  }
  const found = {};
  // Validate every identity before any create/password update, including the final account.
  for (const name of names) {
    const account = accounts[name];
    let user;
    if (account.id) {
      const data = await providerCall(
        () => admin.getUserById(account.id),
        `Could not verify ${name} Auth identity. No credentials were changed.`,
      );
      user = data?.user;
      assertQaUser(user, name, account.id);
    } else {
      const matching = users.filter((item) => item.email === email(name));
      if (matching.length > 1) fail(`Multiple ${name} QA identities found.`);
      user = matching[0];
      if (user) assertQaUser(user, name);
    }
    found[name] = user ?? null;
  }
  return found;
}

export async function runQaAccounts({
  root,
  env,
  args = [],
  createClient,
  io = filesystem,
  password = () => randomBytes(24).toString('base64url'),
  group = 'core',
}) {
  if (!['core', 'adminRoles'].includes(group)) fail('Unknown QA account group.');
  const names = group === 'core' ? accountNames : adminAccountNames;
  if (args.some((argument) => argument !== '--rotate-passwords') || args.length > 1)
    fail('Only one optional --rotate-passwords flag is supported.');
  const rotating = args.includes('--rotate-passwords');
  const environmentIssues = [
    [env.NODE_ENV !== 'development', 'NODE_ENV must be development'],
    [
      env.SUPABASE_URL !== `https://${projectRef}.supabase.co`,
      `SUPABASE_URL must be https://${projectRef}.supabase.co`,
    ],
    [
      env.NEXT_PUBLIC_SUPABASE_URL !== env.SUPABASE_URL,
      'NEXT_PUBLIC_SUPABASE_URL must match SUPABASE_URL',
    ],
    [env.SUPABASE_PROJECT_REF !== projectRef, `SUPABASE_PROJECT_REF must be ${projectRef}`],
    [
      !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_'),
      'SUPABASE_SECRET_KEY must be a server-only sb_secret_* key (SUPABASE_SERVICE_ROLE_KEY is not used)',
    ],
  ]
    .filter(([invalid]) => invalid)
    .map(([, message]) => message);
  if (environmentIssues.length)
    fail(
      `QA accounts require the exact Development project and server secret key. Fix .env: ${environmentIssues.join('; ')}. No QA accounts were changed.`,
    );
  const directory = group === 'core' ? join(root, '.qa-seed') : join(root, '.qa-seed/admin-roles');
  const pendingFile = join(directory, 'accounts.pending.json');
  // Both groups share a lock because they now share the Admin credential vault.
  const lockFile = join(root, '.qa-seed/provisioning.lock');
  try {
    await io.mkdir(directory, { recursive: true, mode: 0o700 });
    await io.mkdir(join(root, '.qa-seed'), { recursive: true, mode: 0o700 });
  } catch {
    fail('Could not open the local QA vault directory.');
  }
  let lock;
  try {
    lock = await io.open(lockFile, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST')
      fail(
        'QA provisioning is locked. If a process crashed, verify the PID in provisioning.lock has stopped before removing only that lock file.',
      );
    fail('Could not acquire the QA provisioning lock.');
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    await lock.sync();
    if (await readJson(io, join(root, '.qa-seed/admin-roles/provisioning.lock')))
      fail('Legacy Admin provisioning is locked. Verify its PID before removing that lock.');
    const vault = await readGroupVault(root, group, io);
    if (vault) validateVault(vault, names);
    let journal = await readJson(io, pendingFile);
    if (journal) {
      validateJournal(journal, names);
      validateCurrent(vault, journal, names);
      if ((journal.mode === 'rotate') !== rotating)
        fail(
          `An unfinished ${journal.mode} operation exists. Resume with its original command before starting another operation.`,
        );
    }
    const before =
      journal?.before ??
      vault?.accounts ??
      Object.fromEntries(
        names.map((name) => [name, { email: email(name), password: password(), id: null }]),
      );
    validateAccounts(before, names);
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).auth.admin;
    const found = await lookupAll(admin, journal?.accounts ?? before, names);
    if (!journal && !vault && !rotating && Object.values(found).some(Boolean))
      fail(
        'Existing QA Auth users require the original vault or explicit --rotate-passwords to re-provision credentials.',
      );
    const legacyPending = Boolean(
      journal && group === 'core' && (await readLayout(root, io)).core?.accounts.admin,
    );
    if (!journal) {
      const otherPending = join(
        root,
        group === 'core'
          ? '.qa-seed/admin-roles/accounts.pending.json'
          : '.qa-seed/accounts.pending.json',
      );
      if (await readJson(io, otherPending))
        fail('Finish the pending QA operation in the other group before provisioning.');
      await migrateLayout(root, io);
      journal = {
        version: 1,
        projectRef,
        mode: rotating ? 'rotate' : 'provision',
        hadVault: Boolean(vault),
        before: structuredClone(before),
        completed: [],
        accounts: Object.fromEntries(
          names.map((name) => [
            name,
            {
              ...before[name],
              id: found[name]?.id ?? null,
              password: rotating ? password() : before[name].password,
            },
          ]),
        ),
      };
      validateJournal(journal, names);
      await atomicJson(io, pendingFile, journal);
    }
    for (const name of names) {
      if (journal.completed.includes(name)) continue;
      const account = journal.accounts[name];
      const existing = found[name];
      if (existing) {
        account.id = existing.id;
        if (rotating) {
          const data = await providerCall(
            () => admin.updateUserById(account.id, { password: account.password }),
            `Could not rotate ${name}. Pending credentials were kept; rerun the same command.`,
          );
          assertQaUser(data?.user, name, account.id);
        }
      } else {
        const data = await providerCall(
          () =>
            admin.createUser({
              email: account.email,
              password: account.password,
              email_confirm: true,
              app_metadata: { numora_qa: true },
            }),
          `Could not create ${name}. Pending credentials were kept; rerun the same command.`,
        );
        assertQaUser(data?.user, name);
        account.id = data.user.id;
      }
      journal.completed.push(name);
      // Confirmation precedes the active vault write. Ambiguous updates replay the same candidate.
      await atomicJson(io, pendingFile, journal);
      if (journal.hadVault) {
        validateCurrent(await readGroupVault(root, group, io), journal, names);
        const confirmed = structuredClone(journal.before);
        for (const done of journal.completed) confirmed[done] = journal.accounts[done];
        await saveGroupVault(root, group, confirmed, io, legacyPending);
      }
    }
    validateCurrent(await readGroupVault(root, group, io), journal, names);
    await saveGroupVault(root, group, journal.accounts, io, legacyPending);
    if (group === 'core')
      await atomicJson(io, join(directory, 'actors.json'), {
        projectRef,
        mode: 'EMAIL_QA',
        actors: Object.fromEntries(names.map((name) => [name, journal.accounts[name].id])),
      });
    try {
      await io.unlink(pendingFile);
    } catch {
      fail(
        'QA credentials were confirmed but the journal could not be removed. Rerun the same command to finish.',
      );
    }
    await migrateLayout(root, io);
    return rotating ? 'rotated' : 'verified';
  } finally {
    await lock.close();
    try {
      await io.unlink(lockFile);
    } catch {
      fail(
        'QA lock cleanup failed. Verify the process has stopped before removing provisioning.lock.',
      );
    }
  }
}

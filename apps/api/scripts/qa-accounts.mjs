import { randomBytes, randomUUID } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const projectRef = 'pkamenfnwmoeisccnrnk';
export const accountNames = ['admin', 'teacherA', 'teacherB', 'studentA', 'studentB', 'studentC'];
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

function validateAccounts(accounts) {
  if (
    !accounts ||
    typeof accounts !== 'object' ||
    Object.keys(accounts).sort().join() !== accountNames.slice().sort().join()
  )
    fail('QA vault/journal has an unexpected account set.');
  const ids = new Set();
  for (const name of accountNames) {
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

function validateVault(vault) {
  if (vault.projectRef !== projectRef) fail('QA vault/journal project does not match Development.');
  validateAccounts(vault.accounts);
}

function validateJournal(journal) {
  validateVault(journal);
  validateAccounts(journal.before);
  for (const name of accountNames) {
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
    journal.completed.some((name) => !accountNames.includes(name)) ||
    journal.completed.some((name) => !journal.accounts[name].id)
  )
    fail('Invalid QA recovery journal. Keep it for operator recovery.');
}

function validateCurrent(vault, journal) {
  if (!vault) {
    if (journal.hadVault)
      fail('The active QA vault is missing. Restore it before resuming rotation.');
    return;
  }
  validateVault(vault);
  for (const name of accountNames) {
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

async function lookupAll(admin, accounts) {
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
  for (const name of accountNames) {
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
}) {
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
  const directory = join(root, '.qa-seed');
  const vaultFile = join(directory, 'accounts.json');
  const pendingFile = join(directory, 'accounts.pending.json');
  const lockFile = join(directory, 'provisioning.lock');
  try {
    await io.mkdir(directory, { recursive: true, mode: 0o700 });
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
    const vault = await readJson(io, vaultFile);
    if (vault) validateVault(vault);
    let journal = await readJson(io, pendingFile);
    if (journal) {
      validateJournal(journal);
      validateCurrent(vault, journal);
      if ((journal.mode === 'rotate') !== rotating)
        fail(
          `An unfinished ${journal.mode} operation exists. Resume with its original command before starting another operation.`,
        );
    }
    const before =
      journal?.before ??
      vault?.accounts ??
      Object.fromEntries(
        accountNames.map((name) => [name, { email: email(name), password: password(), id: null }]),
      );
    validateAccounts(before);
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).auth.admin;
    const found = await lookupAll(admin, journal?.accounts ?? before);
    if (!journal && !vault && !rotating && Object.values(found).some(Boolean))
      fail(
        'Existing QA Auth users require the original vault or explicit --rotate-passwords to re-provision credentials.',
      );
    if (!journal) {
      journal = {
        version: 1,
        projectRef,
        mode: rotating ? 'rotate' : 'provision',
        hadVault: Boolean(vault),
        before: structuredClone(before),
        completed: [],
        accounts: Object.fromEntries(
          accountNames.map((name) => [
            name,
            {
              ...before[name],
              id: found[name]?.id ?? null,
              password: rotating ? password() : before[name].password,
            },
          ]),
        ),
      };
      validateJournal(journal);
      await atomicJson(io, pendingFile, journal);
    }
    for (const name of accountNames) {
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
        validateCurrent(await readJson(io, vaultFile), journal);
        const confirmed = structuredClone(journal.before);
        for (const done of journal.completed) confirmed[done] = journal.accounts[done];
        await atomicJson(io, vaultFile, snapshot(confirmed));
      }
    }
    validateCurrent(await readJson(io, vaultFile), journal);
    await atomicJson(io, vaultFile, snapshot(journal.accounts));
    await atomicJson(io, join(directory, 'actors.json'), {
      projectRef,
      mode: 'EMAIL_QA',
      actors: Object.fromEntries(accountNames.map((name) => [name, journal.accounts[name].id])),
    });
    try {
      await io.unlink(pendingFile);
    } catch {
      fail(
        'QA credentials were confirmed but the journal could not be removed. Rerun the same command to finish.',
      );
    }
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

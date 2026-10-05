import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, rename, open, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import postgres from '../../../packages/database/node_modules/postgres/src/index.js';

export const projectRef = 'pkamenfnwmoeisccnrnk';
export const scenario = 'teacher-demo-2026-v1';
export const root = resolve(import.meta.dirname, '../../..');
export const directory = join(root, '.qa-seed/teacher-demo');
const rosterFile = join(root, 'packages/database/seeds/teacher-demo-roster.json');
const fail = (message) => {
  throw new Error(`TEACHER_DEMO: ${message}`);
};
const jwtClaims = (value) => {
  try {
    return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

export function serverAdminKey(env) {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const claims = key && jwtClaims(key);
  if (
    !key ||
    !(
      key.startsWith('sb_secret_') ||
      (claims?.role === 'service_role' && claims?.ref === projectRef)
    )
  )
    fail('A valid server Admin API key for Development is required.');
  return key;
}

export function requireDemoTarget(env) {
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    fail('Invalid database target.');
  }
  if (
    env.NODE_ENV !== 'development' ||
    env.SUPABASE_URL !== `https://${projectRef}.supabase.co` ||
    env.NEXT_PUBLIC_SUPABASE_URL !== env.SUPABASE_URL ||
    (env.SUPABASE_PROJECT_REF && env.SUPABASE_PROJECT_REF !== projectRef) ||
    !['require', 'verify-full'].includes(url.searchParams.get('sslmode')) ||
    !(
      (url.hostname === `db.${projectRef}.supabase.co` && url.username === 'postgres') ||
      (url.hostname.endsWith('.pooler.supabase.com') &&
        url.port === '5432' &&
        decodeURIComponent(url.username) === `postgres.${projectRef}`)
    )
  ) {
    fail('Only the documented TLS NUMORA Development sandbox is allowed.');
  }
  // A server secret must never be copied into a browser environment variable.
  if (
    Object.entries(env).some(
      ([key, value]) =>
        key.startsWith('NEXT_PUBLIC_') &&
        (value?.startsWith('sb_secret_') ||
          jwtClaims(value ?? '')?.role === 'service_role' ||
          (value &&
            (value === env.SUPABASE_SECRET_KEY || value === env.SUPABASE_SERVICE_ROLE_KEY))),
    )
  ) {
    fail('A server secret is present in a public environment variable.');
  }
  return url.toString();
}

export async function readJson(file, optional = false) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    fail('Local manifest/vault is missing or invalid.');
  }
}

export async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function verifyBackup(env) {
  const file = env.TEACHER_DEMO_BACKUP_PATH;
  const expected = env.TEACHER_DEMO_BACKUP_SHA256;
  if (!file || !isAbsolute(file) || !/^[a-f0-9]{64}$/.test(expected ?? ''))
    fail('A fresh backup path and SHA-256 are required.');
  const info = await stat(file);
  if (!info.isFile() || info.size < 1024 || Date.now() - info.mtimeMs > 86400000)
    fail('Backup is stale or empty.');
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(5);
    await handle.read(header, 0, 5, 0);
    if (header.toString() !== 'PGDMP') fail('Backup must be a PostgreSQL custom-format archive.');
  } finally {
    await handle.close();
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== expected) fail('Backup SHA-256 does not match.');
}

export function assertDemoAuth(user, account) {
  if (
    !user ||
    (user.id !== account.id && account.id !== null) ||
    user.email !== account.email ||
    user.app_metadata?.numora_teacher_demo !== scenario ||
    user.app_metadata?.numora_qa !== true ||
    user.app_metadata?.provider !== 'email' ||
    user.identities?.some((i) => i.provider !== 'email')
  ) {
    fail('Auth identity conflict; no account may be overwritten.');
  }
}

export async function runAccounts(env = process.env) {
  const target = requireDemoTarget(env);
  if (env.ALLOW_TEACHER_DEMO_SEED !== 'true')
    fail('Development opt-in and a server Admin API secret are required.');
  const adminKey = serverAdminKey(env);
  await verifyBackup(env);
  const roster = await readJson(rosterFile);
  const qa = await readJson(join(root, '.qa-seed/actors.json'));
  if (qa.projectRef !== projectRef || qa.mode !== 'EMAIL_QA')
    fail('Existing Development QA manifest is required.');
  const db = postgres(target, { max: 1, connect_timeout: 10 });
  let chapterOrderBase;
  try {
    await db.begin('read only', async (tx) => {
      const [check] = await tx`SELECT
        (SELECT count(*)::int FROM users WHERE auth_user_id IN (${qa.actors.admin}::uuid, ${qa.actors.teacherB}::uuid) AND status='ACTIVE' AND role IN ('ADMIN','TEACHER')) actors,
        (SELECT count(*)::int FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity) unprotected,
        (SELECT max(display_order)::int FROM chapters WHERE id::text NOT LIKE '04000000-0000-4000-8000-%') chapter_order`;
      if (check.actors !== 2 || check.unprotected !== 0) fail('QA actors or RLS preflight failed.');
      chapterOrderBase = check.chapter_order;
      for (const actor of roster.actors) {
        const rows =
          await tx`SELECT id FROM users WHERE (id=${actor.id}::uuid OR lower(email)=lower(${actor.email})) AND NOT (id=${actor.id}::uuid AND email=${actor.email} AND role=${actor.role}::user_role AND status='ACTIVE')`;
        if (rows.length) fail('Existing application profile collision.');
      }
      const conflicts =
        await tx`SELECT id FROM classes WHERE join_code IN ('NUM-9A26','NUM-8C15','NUM-7B99') AND id::text NOT LIKE '04000000-0000-4000-8000-%'`;
      if (conflicts.length) fail('Existing class join code collision.');
    });
  } finally {
    await db.end();
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockFile = join(directory, 'provisioning.lock');
  const lock = await open(lockFile, 'wx', 0o600);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const file = join(directory, 'accounts.json');
    const journalFile = join(directory, 'accounts.pending.json');
    let vault = await readJson(file, true);
    let journal = await readJson(journalFile, true);
    const validate = (value) => {
      if (
        value.projectRef !== projectRef ||
        value.scenario !== scenario ||
        !Array.isArray(value.accounts) ||
        value.accounts.length !== 99 ||
        value.rosterDigest !== createHash('sha256').update(JSON.stringify(roster)).digest('hex')
      )
        fail('Vault/journal belongs to another scenario.');
      for (const [i, account] of value.accounts.entries()) {
        if (
          account.email !== roster.actors[i].email ||
          account.profileId !== roster.actors[i].id ||
          typeof account.password !== 'string' ||
          account.password.length < 24 ||
          (account.id !== null && !/^[a-f0-9-]{36}$/.test(account.id))
        )
          fail('Invalid account recovery record.');
      }
    };
    if (vault) validate(vault);
    if (journal) validate(journal);
    if (vault && journal && JSON.stringify(vault.accounts) !== JSON.stringify(journal.accounts))
      fail('Vault and pending journal disagree.');
    const client = createClient(env.SUPABASE_URL, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const users = [];
    for (let page = 1; ; page++) {
      const result = await client.auth.admin.listUsers({ page, perPage: 100 });
      if (result.error || !Array.isArray(result.data?.users)) fail('Admin API preflight failed.');
      users.push(...result.data.users);
      if (result.data.users.length < 100) break;
    }
    const existing = roster.actors.map((actor, i) => {
      const matches = users.filter((user) => user.email === actor.email);
      if (matches.length > 1) fail('Duplicate Auth email.');
      const account = (journal ?? vault)?.accounts[i] ?? { email: actor.email, id: null };
      if (matches[0]) assertDemoAuth(matches[0], account);
      if (account.id && matches[0]?.id !== account.id) fail('Pinned Auth identity is missing.');
      return matches[0];
    });
    if (!vault && !journal && existing.some(Boolean))
      fail('Existing demo Auth users require their original recovery vault.');
    if (!journal && !vault) {
      journal = {
        projectRef,
        scenario,
        chapterOrderBase,
        asOf: new Date().toISOString(),
        rosterDigest: createHash('sha256').update(JSON.stringify(roster)).digest('hex'),
        accounts: roster.actors.map((actor) => ({
          profileId: actor.id,
          email: actor.email,
          password: randomBytes(24).toString('base64url'),
          id: null,
        })),
      };
      await atomicJson(journalFile, journal);
    }
    const active = journal ?? vault;
    for (const [i, account] of active.accounts.entries()) {
      if (account.id) continue;
      if (existing[i]) account.id = existing[i].id;
      else {
        const result = await client.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
          app_metadata: { numora_qa: true, numora_teacher_demo: scenario },
        });
        if (result.error) fail('Auth provisioning interrupted; resume using the saved journal.');
        assertDemoAuth(result.data.user, account);
        account.id = result.data.user.id;
      }
      await atomicJson(journalFile, active);
    }
    await atomicJson(file, active);
    await atomicJson(join(directory, 'manifest.json'), {
      projectRef,
      scenario,
      asOf: active.asOf,
      chapterOrderBase: active.chapterOrderBase,
      rosterDigest: active.rosterDigest,
      actors: Object.fromEntries(active.accounts.map((account) => [account.profileId, account.id])),
      qaActors: qa.actors,
    });
    if (journal) await unlink(journalFile);
    vault = active;
    return { accounts: vault.accounts.length, projectRef, scenario };
  } finally {
    await lock.close();
    await unlink(lockFile);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAccounts()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        error.message?.startsWith('TEACHER_DEMO:')
          ? error.message
          : 'TEACHER_DEMO: Provisioning failed; credentials were not logged.',
      );
      process.exitCode = 1;
    });
}

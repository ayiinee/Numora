import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectRef, QaAccountError, readQaAdminAccounts, runQaAccounts } from './qa-accounts.mjs';

const fail = (message) => {
  throw new QaAccountError(message);
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const qaAdminRoles = {
  adminSuper: {
    email: 'numora-qa-adminsuper@example.invalid',
    role: 'SUPER_ADMIN',
    name: 'Agus Wijaya',
  },
  adminOperations: {
    email: 'numora-qa-adminoperations@example.invalid',
    role: 'OPERATIONS',
    name: 'Sinta Lestari',
  },
};

export function requireQaAdminTarget(env) {
  let database;
  try {
    database = new URL(env.DATABASE_MIGRATION_URL);
  } catch {
    fail('QA Admin provisioning requires operator DATABASE_MIGRATION_URL.');
  }
  if (
    env.NODE_ENV !== 'development' ||
    env.SUPABASE_PROJECT_REF !== projectRef ||
    env.SUPABASE_URL !== `https://${projectRef}.supabase.co` ||
    env.NEXT_PUBLIC_SUPABASE_URL !== env.SUPABASE_URL ||
    !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_') ||
    !['require', 'verify-full'].includes(database.searchParams.get('sslmode')) ||
    !(
      (database.hostname === `db.${projectRef}.supabase.co` && database.username === 'postgres') ||
      (database.hostname.endsWith('.pooler.supabase.com') &&
        database.port === '5432' &&
        decodeURIComponent(database.username) === `postgres.${projectRef}`)
    )
  )
    fail(
      'QA Admin provisioning only allows the documented Development sandbox with operator credentials.',
    );
  if (
    Object.entries(env).some(
      ([key, value]) =>
        key.startsWith('NEXT_PUBLIC_') &&
        value &&
        (value.startsWith('sb_secret_') || value === env.SUPABASE_SECRET_KEY),
    )
  )
    fail('A server secret is present in public configuration.');
}

export async function checkQaAdminActor(tx, actorAuthId) {
  const [principal] =
    await tx`SELECT pg_has_role(current_user,(SELECT datdba FROM pg_database WHERE datname=current_database()),'MEMBER') AS owner`;
  if (!principal?.owner) fail('QA Admin provisioning requires an owner operator connection.');
  const [actor] =
    await tx`SELECT id, role, status, email, admin_role FROM public.users WHERE auth_user_id=${actorAuthId}::uuid FOR UPDATE`;
  if (
    !actor ||
    actor.role !== 'ADMIN' ||
    actor.status !== 'ACTIVE' ||
    actor.email !== 'numora-qa-admin@example.invalid' ||
    actor.admin_role !== 'CONTENT_DATA_MODERATION'
  )
    fail(
      'The original QA Content Admin must be active and explicitly assigned before provisioning additional roles.',
    );
  return actor.id;
}

export async function applyQaAdminProfiles(client, actorAuthId, accounts) {
  if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts))
    fail('Additional QA Admin identities are invalid.');
  for (const [key, spec] of Object.entries(qaAdminRoles)) {
    if (!uuid.test(accounts[key]?.id ?? '') || accounts[key].email !== spec.email)
      fail('Additional QA Admin identities are invalid.');
  }
  if (
    accounts.adminSuper.id === accounts.adminOperations.id ||
    Object.keys(qaAdminRoles).some((key) => accounts[key].id === actorAuthId)
  )
    fail('QA Admin identities must be distinct.');
  return client.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('numora:qa-admin-roles:v1'))`;
    const actorId = await checkQaAdminActor(tx, actorAuthId);
    const rows = await tx`SELECT id,auth_user_id,email,role,status,admin_role FROM public.users
      WHERE email IN ('numora-qa-adminsuper@example.invalid','numora-qa-adminoperations@example.invalid')
      OR auth_user_id IN (${accounts.adminSuper.id}::uuid,${accounts.adminOperations.id}::uuid) FOR UPDATE`;
    // Validate both identities before any insert/update; never repurpose a foreign profile.
    for (const [key, spec] of Object.entries(qaAdminRoles)) {
      const matches = rows.filter(
        (r) => r.email === spec.email || r.auth_user_id === accounts[key].id,
      );
      if (
        matches.length > 1 ||
        matches.some(
          (r) =>
            r.email !== spec.email ||
            r.auth_user_id !== accounts[key].id ||
            r.role !== 'ADMIN' ||
            r.status !== 'ACTIVE' ||
            (r.admin_role !== null && r.admin_role !== spec.role),
        )
      )
        fail('QA Admin profile conflict. Existing profiles and assignments were preserved.');
    }
    const ids = {};
    for (const [key, spec] of Object.entries(qaAdminRoles)) {
      let profile = rows.find((r) => r.auth_user_id === accounts[key].id);
      let changed = false;
      if (!profile) {
        [profile] =
          await tx`INSERT INTO public.users(auth_user_id,role,status,admin_role,display_name,email)
          VALUES(${accounts[key].id}::uuid,'ADMIN','ACTIVE',${spec.role}::admin_role,${spec.name},${spec.email}) RETURNING id`;
        changed = true;
      } else if (profile.admin_role === null) {
        await tx`UPDATE public.users SET admin_role=${spec.role}::admin_role,updated_at=clock_timestamp() WHERE id=${profile.id}::uuid`;
        changed = true;
      }
      ids[key] = profile.id;
      if (changed)
        await tx`INSERT INTO public.audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
        VALUES(${randomUUID()}::uuid,${actorId}::uuid,'QA_ADMIN_ROLE_PROVISIONED','user',${profile.id}::uuid,${tx.json({ to: spec.role, reason: 'development-admin-role-fixtures-v1', authUserId: accounts[key].id })})`;
    }
    return ids;
  });
}

export async function runQaAdmins({
  root,
  env,
  createClient,
  connect,
  check = false,
  io = { readFile },
  provisionAuth = runQaAccounts,
}) {
  requireQaAdminTarget(env);
  let core;
  try {
    core = await readQaAdminAccounts(root, io);
  } catch {
    fail('Original QA account vault is missing or invalid. Run qa:accounts first.');
  }
  const actor = core?.accounts?.admin;
  if (
    core?.projectRef !== projectRef ||
    actor?.email !== 'numora-qa-admin@example.invalid' ||
    !uuid.test(actor?.id ?? '')
  )
    fail('Original QA Content Admin vault does not match Development.');
  const client = connect(env.DATABASE_MIGRATION_URL, { max: 1 });
  try {
    // Validate DB permissions and actor before Auth writes.
    await client.begin((tx) => checkQaAdminActor(tx, actor.id));
    if (check) return 'preflight verified';
    await provisionAuth({ root, env, createClient, args: [], group: 'adminRoles' });
    let additional;
    try {
      additional = JSON.parse(
        await io.readFile(join(root, '.qa-seed/admin-roles/accounts.json'), 'utf8'),
      );
    } catch {
      fail(
        'Additional QA Admin vault is missing or invalid. Rerun qa:admins without deleting recovery files.',
      );
    }
    if (additional?.projectRef !== projectRef) fail('Additional QA Admin vault project mismatch.');
    await applyQaAdminProfiles(client, actor.id, additional.accounts);
    return 'provisioned and verified';
  } finally {
    await client.end();
  }
}

import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, i, all) => {
    if (value.startsWith('--')) pairs.push([value.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (
  !uuid.test(args['auth-user-id'] ?? '') ||
  !args.reason?.trim() ||
  args.reason.length < 10 ||
  !['bootstrap', 'emergency'].includes(args.mode) ||
  (args.mode === 'emergency' && !uuid.test(args['actor-id'] ?? ''))
)
  throw new Error(
    'Require --auth-user-id UUID --mode bootstrap|emergency --reason REASON; emergency also requires --actor-id UUID.',
  );
const configuredUrl = (value) => {
  try {
    return new URL(value ?? '');
  } catch {
    throw new Error('Operator URL configuration is invalid.');
  }
};
const database = configuredUrl(process.env.DATABASE_MIGRATION_URL);
const authUrl = configuredUrl(process.env.SUPABASE_URL);
if (
  !['require', 'verify-full'].includes(database.searchParams.get('sslmode')) ||
  database.hostname !== process.env.ADMIN_OPERATOR_DATABASE_HOST ||
  authUrl.hostname !== `${process.env.SUPABASE_PROJECT_REF}.supabase.co` ||
  authUrl.protocol !== 'https:' ||
  !process.env.SUPABASE_SECRET_KEY
)
  throw new Error(
    'Require TLS operator URL, exact ADMIN_OPERATOR_DATABASE_HOST, matching SUPABASE_PROJECT_REF and server-only Auth credentials.',
  );
const auth = createClient(authUrl.origin, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await auth.auth.admin.getUserById(args['auth-user-id']);
if (error || !data.user?.email || !data.user.email_confirmed_at)
  throw new Error(
    'Existing verified Auth identity required. No identities are created by this command.',
  );
const client = postgres(database.toString(), { max: 1 });
try {
  await client.begin(async (tx) => {
    const [principal] =
      await tx`SELECT current_user AS name,pg_has_role(current_user,(SELECT datdba FROM pg_database WHERE datname=current_database()),'MEMBER') AS owner`;
    if (!principal.owner) throw new Error('Database-owner operator connection required.');
    await tx`SELECT pg_advisory_xact_lock(61720261005)`;
    const active =
      await tx`SELECT id FROM users WHERE role='ADMIN' AND status='ACTIVE' AND admin_role='SUPER_ADMIN'`;
    if (args.mode === 'bootstrap' && active.length)
      throw new Error('Bootstrap refused: active Super Admin already exists.');
    const email = data.user.email.toLowerCase();
    const existing =
      await tx`SELECT id,auth_user_id,role,status,admin_role FROM users WHERE auth_user_id=${data.user.id} OR lower(email)=${email} FOR UPDATE`;
    if (
      existing.length > 1 ||
      (existing[0] && (existing[0].role !== 'ADMIN' || existing[0].auth_user_id !== data.user.id))
    )
      throw new Error('Existing identity conflict; Student/Teacher profiles cannot be converted.');
    let target = existing[0];
    if (!target)
      [target] =
        await tx`INSERT INTO users(auth_user_id,role,admin_role,email,display_name,status) VALUES(${data.user.id},'ADMIN','SUPER_ADMIN',${email},${email.split('@')[0]},'ACTIVE') RETURNING id`;
    if (args.mode === 'emergency') {
      const [actor] = await tx`SELECT id FROM users WHERE id=${args['actor-id']} AND role='ADMIN'`;
      if (!actor) throw new Error('Explicit recorded Admin actor required.');
    }
    await tx`UPDATE users SET status='ACTIVE',admin_role='SUPER_ADMIN',updated_at=clock_timestamp() WHERE id=${target.id}`;
    // Cancel outstanding invitations so an old link cannot overwrite the emergency assignment.
    await tx`UPDATE admin_invitations SET status='CANCELLED',lease_until=NULL,updated_at=clock_timestamp() WHERE user_id=${target.id} AND status NOT IN ('ACCEPTED','CANCELLED')`;
    await tx`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata) VALUES(${randomUUID()},${args.mode === 'bootstrap' ? target.id : args['actor-id']},'admin.operator.recovered','admin_account',${target.id},${tx.json({ mode: args.mode, reason: args.reason.trim(), operator: principal.name })})`;
  });
  console.log(
    'Super Admin recovery committed with operator audit. No password or Auth link is exposed.',
  );
} catch {
  console.error('Super Admin recovery failed; no database changes committed.');
  process.exitCode = 1;
} finally {
  await client.end();
}

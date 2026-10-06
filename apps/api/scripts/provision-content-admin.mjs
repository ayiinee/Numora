import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, i, all) => {
    if (value.startsWith('--')) pairs.push([value.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (
  !uuid.test(args['user-id'] ?? '') ||
  !uuid.test(args['actor-id'] ?? '') ||
  !['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'].includes(args.role) ||
  !args.reason?.trim() ||
  !process.env.DATABASE_MIGRATION_URL
) {
  throw new Error(
    'Require --user-id UUID --actor-id UUID --role ROLE --reason REASON and operator DATABASE_MIGRATION_URL.',
  );
}
const client = postgres(process.env.DATABASE_MIGRATION_URL, { max: 1 });
try {
  await client.begin(async (tx) => {
    const [principal] =
      await tx`SELECT pg_has_role(current_user,(SELECT datdba FROM pg_database WHERE datname=current_database()),'MEMBER') AS owner`;
    if (!principal.owner)
      throw new Error(
        'Provisioning requires a database owner operator connection, never runtime credentials.',
      );
    const profiles =
      await tx`SELECT id,role,status,admin_role FROM users WHERE id IN (${args['user-id']},${args['actor-id']}) FOR UPDATE`;
    for (const id of [args['user-id'], args['actor-id']]) {
      const profile = profiles.find((p) => p.id === id);
      if (!profile || profile.role !== 'ADMIN' || profile.status !== 'ACTIVE')
        throw new Error('Target and actor must be explicit active Admin accounts.');
    }
    const [previous] = await tx`SELECT admin_role FROM users WHERE id=${args['user-id']}`;
    if (previous.admin_role === args.role) return;
    await tx`UPDATE users SET admin_role=${args.role},updated_at=clock_timestamp() WHERE id=${args['user-id']}`;
    await tx`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
      VALUES(${randomUUID()},${args['actor-id']},'ADMIN_CONTENT_ROLE_PROVISIONED','user',${args['user-id']},${tx.json({ from: previous.admin_role, to: args.role, reason: args.reason })})`;
  });
  console.log('Explicit Admin subrole provisioned; audit recorded.');
} catch {
  console.error('Admin subrole provisioning failed; no changes committed.');
  process.exitCode = 1;
} finally {
  await client.end();
}

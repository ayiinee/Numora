// Read-only lookup of the explicitly requested QA account. No password/token export.
import postgres from 'postgres';
const email = process.env.GENERATOR_REAL_QA_EMAIL;
if (email !== 'numora-qa-adminsuper@example.invalid')
  throw new Error('Explicit QA account required');
const db = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  const [profile] = await db`SELECT auth_user_id AS "authUserId",email,display_name AS "displayName"
    FROM users WHERE email=${email} AND role='ADMIN' AND admin_role='SUPER_ADMIN' AND status='ACTIVE'`;
  if (!profile) throw new Error('Active QA Super Admin not found');
  process.stdout.write(
    JSON.stringify({
      ...profile,
      authUrl: process.env.SUPABASE_URL,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    }),
  );
} finally {
  await db.end();
}

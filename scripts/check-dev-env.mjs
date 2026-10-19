const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'BULLMQ_PREFIX',
  'TEACHER_TOKEN_PEPPER',
];
const problems = required.filter((name) => !process.env[name]).map((name) => `${name} is missing`);
if (process.env.NEXT_PUBLIC_TEACHER_TOKEN_PEPPER)
  problems.push('Remove NEXT_PUBLIC_TEACHER_TOKEN_PEPPER; teacher token pepper must stay server-side');

if (process.env.NEXT_PUBLIC_SUPABASE_URL !== process.env.SUPABASE_URL)
  problems.push('Web and API Supabase URLs differ');
if (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== process.env.SUPABASE_PUBLISHABLE_KEY)
  problems.push('Web and API Supabase publishable keys differ');
if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)
  problems.push('Remove NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY; service-role keys must stay server-side');
for (const name of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY']) {
  const key = process.env[name] ?? '';
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8')).role; } catch { /* Modern publishable keys are not JWTs. */ }
  if (key.startsWith('sb_secret_') || role === 'service_role')
    problems.push(`${name} contains a secret/service-role key; use a publishable or anon key`);
}
if (process.env.REDIS_URL && !process.env.REDIS_URL.startsWith('rediss://'))
  problems.push('REDIS_URL must use rediss://');
if (process.env.BULLMQ_PREFIX && !process.env.BULLMQ_PREFIX.startsWith('numora:dev:'))
  problems.push('BULLMQ_PREFIX must start with numora:dev:');
if (process.env.DATABASE_URL) {
  try {
    const database = new URL(process.env.DATABASE_URL);
    const mode = database.searchParams.get('sslmode');
    if (mode !== 'require' && mode !== 'verify-full')
      problems.push('DATABASE_URL must set sslmode=require or sslmode=verify-full');
    if (!['postgres:', 'postgresql:'].includes(database.protocol))
      problems.push('DATABASE_URL must use the PostgreSQL protocol');
    if (process.env.SUPABASE_URL) {
      const auth = new URL(process.env.SUPABASE_URL);
      const isLocalDatabase = process.env.LOCAL_DATABASE === 'true' &&
        ['localhost', '127.0.0.1'].includes(database.hostname);
      if (auth.hostname.endsWith('.supabase.co') && !isLocalDatabase) {
        const ref = auth.hostname.split('.')[0];
        const direct = database.hostname === `db.${ref}.supabase.co` && database.username === 'postgres';
        const pooler = database.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(database.username) === `postgres.${ref}`;
        if (!direct && !pooler) problems.push('Database and Supabase Auth projects differ');
        if ((database.port || '5432') !== '5432') problems.push('Use PostgreSQL direct/session port 5432 for this client');
      }
    }
  } catch {
    problems.push('DATABASE_URL or SUPABASE_URL is not a valid connection URL');
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`Environment: ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Development environment configuration is consistent.');
}

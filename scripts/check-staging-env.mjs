import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { targetOrigin } from './qa/capacity/config.mjs';

const sharedProjects = new Set(['bfvbstmkcpanqqehfevr', 'pkamenfnwmoeisccnrnk']);
const databaseVariables = ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'QA_CAPACITY_EVIDENCE_URL'];

export function stagingProblems(env) {
  const problems = [];
  if (env.NODE_ENV !== 'production' || env.NUMORA_DEPLOYMENT_PROFILE !== 'staging-supabase')
    problems.push('Staging must use NODE_ENV=production and the explicit staging-supabase profile');
  const readUrl = (name) => {
    try {
      return new URL(env[name]);
    } catch {
      problems.push(name + ' must be a valid URL');
      return null;
    }
  };
  const readOrigin = (name) => {
    try {
      return targetOrigin(env[name], 'staging');
    } catch {
      problems.push(name + ' must be a dedicated HTTPS staging origin');
      return null;
    }
  };

  const web = readOrigin('STAGING_WEB_ORIGIN');
  const api = readOrigin('STAGING_API_ORIGIN');
  if (web && api && web === api) problems.push('Web and API need distinct staging origins');
  if (web && env.CORS_ORIGINS !== web)
    problems.push('CORS_ORIGINS must match the staging web origin');
  if (web && env.ADMIN_AUTH_REDIRECT_ORIGIN !== web)
    problems.push('ADMIN_AUTH_REDIRECT_ORIGIN must match the staging web origin');
  if (api && env.NEXT_PUBLIC_API_URL !== api + '/api/v1')
    problems.push('NEXT_PUBLIC_API_URL must point to the staging API');
  if (api && env.API_INTERNAL_URL !== api + '/api/v1')
    problems.push('API_INTERNAL_URL must point to the staging API');

  const ref = env.SUPABASE_PROJECT_REF ?? '';
  if (!/^[a-z0-9]{20}$/.test(ref) || sharedProjects.has(ref))
    problems.push('SUPABASE_PROJECT_REF must identify a dedicated staging project');
  const auth = 'https://' + ref + '.supabase.co';
  if (env.SUPABASE_URL !== auth || env.NEXT_PUBLIC_SUPABASE_URL !== auth)
    problems.push('Supabase web and API Auth must match the staging project ref');
  if (
    !/^sb_publishable_[\w-]+$/.test(env.SUPABASE_PUBLISHABLE_KEY ?? '') ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== env.SUPABASE_PUBLISHABLE_KEY
  )
    problems.push('Web and API must use the same Supabase publishable key');
  if (!/^sb_secret_[\w-]+$/.test(env.SUPABASE_SECRET_KEY ?? ''))
    problems.push('SUPABASE_SECRET_KEY must be configured server-side');
  if (Object.keys(env).some((name) => /^NEXT_PUBLIC_.*(?:SECRET|PEPPER|SERVICE_ROLE)/.test(name)))
    problems.push('Keep secret keys and the teacher token pepper outside NEXT_PUBLIC variables');

  const dbIdentities = new Set();
  for (const name of databaseVariables) {
    const url = readUrl(name);
    if (!url) continue;
    const user = url.username;
    const direct = url.hostname === 'db.' + ref + '.supabase.co';
    const pooled = url.hostname.endsWith('.pooler.supabase.com') && user.endsWith('.' + ref);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.searchParams.getAll('sslmode').length !== 1 ||
      url.searchParams.get('sslmode') !== 'verify-full' ||
      [...url.searchParams.keys()].some((key) => key !== 'sslmode') ||
      (!direct && !pooled) ||
      (url.port && url.port !== '5432') ||
      !url.password
    )
      problems.push(name + ' must use TLS on the staging Supabase direct or session endpoint');
    if (
      name === 'DATABASE_URL' &&
      (url.hostname !== env.DATABASE_EXPECTED_HOST ||
        (url.port || '5432') !== env.DATABASE_EXPECTED_PORT ||
        decodeURIComponent(url.pathname.slice(1)) !== env.DATABASE_EXPECTED_NAME ||
        decodeURIComponent(url.username) !== env.DATABASE_EXPECTED_USER)
    )
      problems.push('DATABASE_URL must match the separately pinned staging runtime target');
    dbIdentities.add(direct ? user : user.slice(0, -ref.length - 1));
  }
  if (dbIdentities.size !== databaseVariables.length)
    problems.push('Runtime, migration and evidence connections must use distinct PostgreSQL roles');

  const redis = readUrl('REDIS_URL');
  if (
    redis &&
    (redis.protocol !== 'rediss:' || !redis.password || redis.hostname !== env.STAGING_REDIS_HOST)
  )
    problems.push('REDIS_URL must match the dedicated staging Redis host and use TLS');
  if (!/^numora:staging:[a-z0-9_-]+$/.test(env.BULLMQ_PREFIX ?? ''))
    problems.push('BULLMQ_PREFIX must be a staging namespace');
  if (
    !env.STAGING_R2_BUCKET ||
    env.R2_BUCKET !== env.STAGING_R2_BUCKET ||
    /(^|[-_])prod(?:uction)?($|[-_])/i.test(env.R2_BUCKET)
  )
    problems.push('R2_BUCKET must match the dedicated staging bucket');
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'])
    if (!env[name]) problems.push(name + ' must be supplied for staging media');
  for (const name of ['TEACHER_TOKEN_PEPPER', 'METRICS_TOKEN'])
    if (Buffer.byteLength(env[name] ?? '') < 32) problems.push(name + ' must be at least 32 bytes');
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let issues;
  try {
    const [file, ...rest] = process.argv.slice(2);
    if (!file || rest.length) throw new Error();
    issues = stagingProblems(parseEnv(readFileSync(file, 'utf8')));
  } catch {
    issues = ['Supply exactly one readable, valid staging env file'];
  }
  for (const issue of issues) console.error(issue);
  if (issues.length) process.exitCode = 1;
  else
    console.log(
      'Staging configuration passed local checks. Verify resource isolation at the provider.',
    );
}

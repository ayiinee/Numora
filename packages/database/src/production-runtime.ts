import { isIP } from 'node:net';
import type { Sql } from 'postgres';

export type ProductionService = 'api' | 'worker';
export interface ProductionTarget {
  profile: 'production-vps' | 'production-supabase';
  host: string;
  port: number;
  database: string;
  login: string;
  databaseRole: string;
}

/** Messages are fixed diagnostics: never interpolate URLs, credentials or provider errors. */
export class ProductionPreflightError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join('; '));
    this.name = 'ProductionPreflightError';
  }
}

function httpsOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? '');
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function publishable(value: string | undefined) {
  if (value?.startsWith('sb_publishable_') && value.length > 'sb_publishable_'.length) return true;
  try {
    const pieces = (value ?? '').split('.');
    return (
      pieces.length === 3 &&
      JSON.parse(Buffer.from(pieces[1]!, 'base64url').toString('utf8')).role === 'anon'
    );
  } catch {
    return false;
  }
}

/** Static only. Development/test keep their existing guards and require no new configuration. */
export function productionTarget(
  service: ProductionService,
  env: NodeJS.ProcessEnv = process.env,
): ProductionTarget | undefined {
  if (env.NODE_ENV !== 'production' && !env.NUMORA_DEPLOYMENT_PROFILE) return;
  const problems: string[] = [];
  if (env.NODE_ENV !== 'production')
    problems.push('NODE_ENV must be production for a production profile');
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
    problems.push('TLS certificate verification must not be disabled');
  if (env.PGOPTIONS)
    problems.push('PGOPTIONS overrides must not be present in runtime configuration');
  const profile = env.NUMORA_DEPLOYMENT_PROFILE;
  if (profile !== 'production-vps' && profile !== 'production-supabase')
    problems.push('NUMORA_DEPLOYMENT_PROFILE must be production-vps or production-supabase');
  const host = env.DATABASE_EXPECTED_HOST?.toLowerCase();
  const port = Number(env.DATABASE_EXPECTED_PORT);
  const database = env.DATABASE_EXPECTED_NAME;
  const login = env.DATABASE_EXPECTED_USER;
  if (!host || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || isIP(host))
    problems.push('DATABASE_EXPECTED_HOST must be an explicit TLS DNS hostname');
  if (!env.DATABASE_EXPECTED_PORT || !Number.isInteger(port) || port < 1 || port > 65535)
    problems.push('DATABASE_EXPECTED_PORT must be an explicit valid TCP port');
  if (
    !database ||
    !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(database) ||
    /^(?:template[01]|numora_test(?:_|$))/.test(database)
  )
    problems.push('DATABASE_EXPECTED_NAME must identify the intended non-test database');
  if (!login || !/^[a-zA-Z_][a-zA-Z0-9_.-]{0,126}$/.test(login))
    problems.push('DATABASE_EXPECTED_USER must identify the intended runtime login');
  let url: URL | undefined;
  try {
    url = new URL(env.DATABASE_URL ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !url.password ||
      url.hash
    )
      problems.push('DATABASE_URL must be a complete PostgreSQL runtime URL');
    if (
      url.hostname.toLowerCase() !== host ||
      Number(url.port || 5432) !== port ||
      decodeURIComponent(url.pathname.slice(1)) !== database ||
      decodeURIComponent(url.username) !== login
    )
      problems.push('DATABASE_URL does not match the pinned runtime target');
    // postgres-js also accepts query overrides. Restrict them so they cannot change the pinned route/TLS.
    if (
      url.searchParams.getAll('sslmode').length !== 1 ||
      url.searchParams.get('sslmode') !== 'verify-full' ||
      [...url.searchParams.keys()].some((key) => key !== 'sslmode')
    )
      problems.push(
        'DATABASE_URL must contain only sslmode=verify-full as its query configuration',
      );
  } catch {
    problems.push('DATABASE_URL is invalid');
  }

  const ref = env.SUPABASE_PROJECT_REF;
  let databaseRole = login ?? '';
  if (profile === 'production-supabase') {
    if (!ref || !/^[a-z0-9]{20}$/.test(ref))
      problems.push('SUPABASE_PROJECT_REF must identify the Auth/database project');
    const direct = host === `db.${ref}.supabase.co`;
    const pooler = host?.endsWith('.pooler.supabase.com') && login?.endsWith(`.${ref}`);
    if ((!direct && !pooler) || port !== 5432 || database !== 'postgres')
      problems.push('Supabase production requires a pinned direct or session-pooler target');
    if (pooler) databaseRole = login!.slice(0, -`.${ref}`.length);
  } else if (
    profile === 'production-vps' &&
    (host?.endsWith('.supabase.co') || host?.endsWith('.pooler.supabase.com'))
  ) {
    problems.push('VPS production cannot target a Supabase database endpoint');
  }
  if (
    ['postgres', 'supabase_admin', 'numora_main_runtime', 'numora_irt_runtime'].includes(
      databaseRole,
    )
  )
    problems.push(
      'Use a dedicated non-owner runtime login instead of an administrative or group role',
    );
  if (
    !env.DB_POOL_MAX ||
    !/^\d+$/.test(env.DB_POOL_MAX) ||
    !Number.isSafeInteger(Number(env.DB_POOL_MAX)) ||
    Number(env.DB_POOL_MAX) < 1
  )
    problems.push('DB_POOL_MAX must be an explicit positive integer per process');
  if (env.DATABASE_MIGRATION_URL)
    problems.push('DATABASE_MIGRATION_URL must not be present in a runtime process');
  if (env.ALLOW_SYNTHETIC_CONTENT && env.ALLOW_SYNTHETIC_CONTENT !== 'false')
    problems.push('Synthetic content is not permitted in production');
  if (env.PVP_MODE && !['disabled', 'official'].includes(env.PVP_MODE))
    problems.push('Production PVP_MODE must be disabled or official');
  if (env.PVP_CONTENT_MODE && env.PVP_CONTENT_MODE !== 'strict')
    problems.push('Production PvP content must use strict eligibility');
  if (!/^numora:prod:[a-z0-9][a-z0-9:_-]*$/.test(env.BULLMQ_PREFIX ?? ''))
    problems.push('BULLMQ_PREFIX must be a distinct numora:prod: namespace');
  try {
    const redis = new URL(env.REDIS_URL ?? '');
    if (redis.protocol !== 'rediss:' || !redis.hostname || !redis.password || redis.hash)
      problems.push('REDIS_URL must be an authenticated TLS Redis URL');
  } catch {
    problems.push('REDIS_URL is invalid');
  }
  for (const [key, value] of Object.entries(env)) {
    if (
      value &&
      /^NEXT_PUBLIC_.*(?:SECRET|PASSWORD|PRIVATE|DATABASE_URL|REDIS_URL|TOKEN_PEPPER|SERVICE_ROLE|METRICS_TOKEN)/.test(
        key,
      )
    )
      problems.push('Server-only secrets must not appear in NEXT_PUBLIC_ configuration');
  }
  for (const key of ['SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'])
    if (env[key] && !publishable(env[key]))
      problems.push('Auth client keys must not contain server-secret credentials');
  if (env.NUMORA_IRT_DATABASE_URL) {
    try {
      const irt = new URL(env.NUMORA_IRT_DATABASE_URL);
      if (
        !['postgres:', 'postgresql:'].includes(irt.protocol) ||
        !irt.username ||
        !irt.password ||
        irt.hash ||
        irt.hostname.toLowerCase() !== host ||
        Number(irt.port || 5432) !== port ||
        decodeURIComponent(irt.pathname.slice(1)) !== database ||
        irt.searchParams.getAll('sslmode').length !== 1 ||
        irt.searchParams.get('sslmode') !== 'verify-full' ||
        [...irt.searchParams.keys()].some((key) => key !== 'sslmode')
      )
        problems.push('NUMORA_IRT_DATABASE_URL must use the same pinned database and verified TLS');
    } catch {
      problems.push('NUMORA_IRT_DATABASE_URL is invalid');
    }
  }
  if (service === 'api') {
    if (!httpsOrigin(env.SUPABASE_URL)) problems.push('SUPABASE_URL must be an HTTPS Auth origin');
    if (profile === 'production-supabase') {
      try {
        const authHost = new URL(env.SUPABASE_URL ?? '').hostname;
        if (authHost.endsWith('.supabase.co') && authHost !== `${ref}.supabase.co`)
          problems.push('Managed Production database and Supabase Auth projects differ');
      } catch {
        /* HTTPS validation above reports malformed Auth origins. */
      }
    }
    if (!publishable(env.SUPABASE_PUBLISHABLE_KEY))
      problems.push('SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key');
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL !== env.SUPABASE_URL)
      problems.push('Web and API Auth origins differ');
    if (
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== env.SUPABASE_PUBLISHABLE_KEY
    )
      problems.push('Web and API Auth publishable keys differ');
    if (!env.TEACHER_TOKEN_PEPPER?.trim())
      problems.push('TEACHER_TOKEN_PEPPER is required and must retain its existing value');
    const origins = (env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim());
    if (
      !origins.length ||
      origins.some((origin) => !httpsOrigin(origin) || new URL(origin).origin !== origin)
    )
      problems.push('CORS_ORIGINS must list exact HTTPS application origins');
    if (env.NUMORA_OBSERVABILITY_ENABLED === 'true' && (env.METRICS_TOKEN?.length ?? 0) < 32)
      problems.push('Enabled API metrics require METRICS_TOKEN of at least 32 characters');
  }
  if (problems.length) throw new ProductionPreflightError([...new Set(problems)]);
  return {
    profile: profile as ProductionTarget['profile'],
    host: host!,
    port,
    database: database!,
    login: login!,
    databaseRole,
  };
}

export interface RuntimeDatabaseState {
  database: string;
  login: string;
  actor: string;
  superuser: boolean;
  createdb: boolean;
  createrole: boolean;
  bypassrls: boolean;
  elevated_membership: boolean;
  main_member: boolean;
  irt_member: boolean;
  owns_domain: boolean;
  owns_database: boolean;
  can_create: boolean;
  tls: boolean;
}

export function assertRuntimeDatabaseState(
  state: RuntimeDatabaseState | undefined,
  target: ProductionTarget,
) {
  const problems: string[] = [];
  if (
    !state ||
    state.database !== target.database ||
    state.login !== target.databaseRole ||
    state.actor !== target.databaseRole
  )
    problems.push('Connected database identity does not match the pinned runtime target');
  if (
    !state ||
    state.superuser ||
    state.createdb ||
    state.createrole ||
    state.bypassrls ||
    state.elevated_membership ||
    !state.main_member ||
    state.irt_member ||
    state.owns_domain ||
    state.owns_database ||
    state.can_create
  )
    problems.push(
      'Runtime role must be non-owner Main only, without DDL, administrative privileges or BYPASSRLS',
    );
  // Direct PostgreSQL is the initial VPS topology. A cloud pooler's internal hop may have different TLS.
  if (target.profile === 'production-vps' && !state?.tls)
    problems.push('VPS database session must use TLS');
  if (problems.length) throw new ProductionPreflightError(problems);
}

/** Catalog reads only; no migration, seed, privilege change or application-table mutation. */
export async function verifyProductionDatabase(client: Sql, target: ProductionTarget) {
  try {
    await client.begin(async (tx) => {
      await tx.unsafe('SET TRANSACTION READ ONLY');
      await tx.unsafe('SET LOCAL search_path = pg_catalog');
      await tx.unsafe("SET LOCAL statement_timeout = '5s'");
      const [state] = await tx<RuntimeDatabaseState[]>`
        SELECT current_database() AS database, session_user AS login, current_user AS actor,
          r.rolsuper AS superuser,r.rolcreatedb AS createdb,r.rolcreaterole AS createrole,r.rolbypassrls AS bypassrls,
          EXISTS(SELECT 1 FROM pg_roles a WHERE (a.rolsuper OR a.rolcreatedb OR a.rolcreaterole OR a.rolbypassrls
            OR a.rolname IN ('pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_signal_backend','pg_create_subscription','pg_read_all_data','pg_write_all_data','pg_maintain'))
            AND pg_has_role(current_user,a.oid,'MEMBER')) AS elevated_membership,
          coalesce((SELECT pg_has_role(current_user,oid,'MEMBER') FROM pg_roles WHERE rolname='numora_main_runtime'),false) AS main_member,
          coalesce((SELECT pg_has_role(current_user,oid,'MEMBER') FROM pg_roles WHERE rolname='numora_irt_runtime'),false) AS irt_member,
          (EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('public','irt_compute') AND pg_has_role(current_user,nspowner,'MEMBER'))
            OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','irt_compute') AND pg_has_role(current_user,c.relowner,'MEMBER'))
            OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','irt_compute') AND pg_has_role(current_user,p.proowner,'MEMBER'))) AS owns_domain,
          EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND pg_has_role(current_user,datdba,'MEMBER')) AS owns_database,
          EXISTS(SELECT 1 FROM pg_roles a WHERE pg_has_role(current_user,a.oid,'MEMBER') AND
            (has_database_privilege(a.oid,current_database(),'CREATE') OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('public','irt_compute') AND has_schema_privilege(a.oid,oid,'CREATE')))) AS can_create,
          coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) AS tls
        FROM pg_roles r WHERE r.rolname=current_user
      `;
      assertRuntimeDatabaseState(state, target);
    });
  } catch (error) {
    if (error instanceof ProductionPreflightError) throw error;
    throw new ProductionPreflightError([
      'Production database preflight failed; check connectivity, TLS trust and runtime permissions',
    ]);
  }
}

export function startupFailureMessage(error: unknown) {
  return error instanceof ProductionPreflightError
    ? error.message
    : 'Startup failed; inspect configuration and dependency health without printing credentials';
}

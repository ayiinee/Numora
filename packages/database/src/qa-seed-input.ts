export const QA_PROJECT_REF = 'pkamenfnwmoeisccnrnk';

export const qaActors = {
  admin: 'ADMIN',
  teacherA: 'TEACHER',
  teacherB: 'TEACHER',
  studentA: 'STUDENT',
  studentB: 'STUDENT',
  studentC: 'STUDENT',
} as const;

export type QaActor = keyof typeof qaActors;
export type QaManifest = {
  projectRef: string;
  mode: 'GOOGLE' | 'EMAIL_QA';
  actors: Record<QaActor, string>;
};

export function parseQaManifest(value: unknown): QaManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid QA manifest.');
  const object = value as Record<string, unknown>;
  if (
    !['actors,projectRef', 'actors,mode,projectRef'].includes(
      Object.keys(object).sort().join(','),
    ) ||
    object.projectRef !== QA_PROJECT_REF
  ) {
    throw new Error('QA manifest must target the allowed Development project.');
  }
  const mode = object.mode ?? 'GOOGLE';
  if (mode !== 'GOOGLE' && mode !== 'EMAIL_QA') throw new Error('Invalid QA identity mode.');
  const actors = object.actors;
  if (!actors || typeof actors !== 'object' || Array.isArray(actors))
    throw new Error('Invalid QA actors.');
  const ids = actors as Record<string, unknown>;
  const names = Object.keys(qaActors);
  if (Object.keys(ids).sort().join(',') !== names.sort().join(','))
    throw new Error('QA manifest must contain exactly six actors.');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const name of names) {
    if (typeof ids[name] !== 'string' || !uuid.test(ids[name]))
      throw new Error(`Invalid Auth UUID for ${name}.`);
  }
  if (new Set(Object.values(ids).map((id) => (id as string).toLowerCase())).size !== names.length) {
    throw new Error('QA Auth UUIDs must be distinct.');
  }
  return {
    projectRef: QA_PROJECT_REF,
    mode,
    actors: Object.fromEntries(
      names.map((name) => [name, (ids[name] as string).toLowerCase()]),
    ) as Record<QaActor, string>,
  };
}

export function requireQaTarget(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== 'development' || env.SUPABASE_PROJECT_REF !== QA_PROJECT_REF) {
    throw new Error('QA seed is restricted to the named Development project.');
  }
  if (env.SUPABASE_URL !== `https://${QA_PROJECT_REF}.supabase.co`) {
    throw new Error('SUPABASE_URL must match the QA Development project.');
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('QA database URL must use PostgreSQL.');
  const direct = url.hostname === `db.${QA_PROJECT_REF}.supabase.co` && url.username === 'postgres';
  const pooler =
    url.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(url.username) === `postgres.${QA_PROJECT_REF}`;
  if ((!direct && !pooler) || (url.port || '5432') !== '5432' || url.pathname !== '/postgres') {
    throw new Error('QA database URL must point to the allowed Development project on port 5432.');
  }
  const sslModes = url.searchParams.getAll('sslmode');
  if (sslModes.length !== 1 || !['require', 'verify-full'].includes(sslModes[0]!)) {
    throw new Error('QA database URL must require TLS.');
  }
  return env.DATABASE_URL;
}

export const qaDisplayNames = {
  admin: 'Dian Prasetyo',
  teacherA: 'Ratna Sari',
  teacherB: 'Budi Santoso',
  studentA: 'Alya Putri',
  studentB: 'Raka Saputra',
  studentC: 'Nabila Azzahra',
} as const;

import { allowSyntheticContent } from './package-runtime.js';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

const root = resolve(__dirname, '../../..');
const directory = join(root, '.qa-seed/teacher-demo');
const prefix = '04000000-0000-4000-8000-';
const scenario = 'teacher-demo-2026-v1';
type Sql = ReturnType<typeof postgres>;
type Query = Pick<Sql, 'unsafe'> & postgres.ISql;
type Actor = {
  id: string;
  role: 'TEACHER' | 'STUDENT';
  displayName: string;
  email: string;
  studentIndex?: number;
  classIndex?: number;
  tryoutCorrectCount?: number | null;
};
type Roster = {
  scenario: string;
  academicYear: string;
  actors: Actor[];
  classes: { id: string; name: string; joinCode: string; studentCount: number }[];
};
type Manifest = {
  projectRef: string;
  scenario: string;
  asOf: string;
  chapterOrderBase: number;
  rosterDigest: string;
  actors: Record<string, string>;
  qaActors: { admin: string; teacherB: string };
};
type Fingerprint = { security: unknown; data: { table: string; count: number; digest: string }[] };
const fail = (message: string): never => {
  throw new Error(`TEACHER_DEMO: ${message}`);
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function securitySnapshot(sql: Query) {
  const queries = [
    `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1`,
    `SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
    `SELECT table_name,grantee,privilege_type,is_grantable FROM information_schema.table_privileges WHERE table_schema='public' ORDER BY 1,2,3`,
    `SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
    `SELECT c.relname,conname,pg_get_constraintdef(p.oid) definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY 1,2`,
    `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2`,
    `SELECT event_object_table,trigger_name,event_manipulation,action_statement FROM information_schema.triggers WHERE event_object_schema='public' ORDER BY 1,2,3`,
    `SELECT p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,p.oid`,
    `SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
  ];
  const results = [];
  for (const query of queries) results.push(Array.from(await sql.unsafe(query)));
  const [managed] = await sql.unsafe<{ present: boolean }[]>(
    "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL present",
  );
  results.push(
    managed?.present
      ? Array.from(
          await sql.unsafe(
            'SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version',
          ),
        )
      : [],
  );
  return {
    digest: digest(results),
    publicTables: results[0]!.length,
    rlsTables: results[0]!.filter((row) => row.relrowsecurity).length,
  };
}

async function fingerprint(sql: Query): Promise<Fingerprint> {
  const tables = await sql.unsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
  );
  const data = [];
  for (const { table_name: table } of tables) {
    if (!/^[a-z_0-9]+$/.test(table)) fail('Unexpected table identifier.');
    const [row] = await sql.unsafe<{ count: number; digest: string }[]>(`SELECT count(*)::int count,
      md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) digest
      FROM public."${table}" t WHERE coalesce(to_jsonb(t)->>'id',to_jsonb(t)->>'event_id','') NOT LIKE '${prefix}%'`);
    data.push({ table, ...row! });
  }
  return { security: await securitySnapshot(sql), data };
}

async function inspect(sql: Query, roster: Roster) {
  const [state] = await sql.unsafe<
    {
      missing: string[];
      indexes: number;
      unprotected: number;
      policyCount: number;
      algebraPackages: number;
      futureNotifications: string | null;
    }[]
  >(`SELECT
    ARRAY(SELECT name FROM unnest(ARRAY['users','schools','teacher_verification_tokens','teacher_school_memberships','classes','class_memberships','chapters','subchapters','levels','competencies','questions','question_variants','question_versions','scoring_policy_versions','assessment_packages','package_items','assessment_attempts','attempt_items','attempt_answers','level_progress','tryout_batches','irt_batches','irt_item_results','feedback','analytics_outbox','audit_logs']) name WHERE to_regclass('public.'||name) IS NULL) missing,
    (SELECT count(*)::int FROM pg_indexes WHERE schemaname='public' AND indexname IN ('users_auth_user_id_uq','users_email_uq','classes_join_code_uq','class_memberships_active_student_class_uq','assessment_attempts_tryout_once_uq','attempt_answers_attempt_item_uq','level_progress_student_level_uq')) indexes,
    (SELECT count(*)::int FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity) unprotected,
    (SELECT count(*)::int FROM scoring_policy_versions WHERE policy_code='DRILL_PG_DEMO' AND version=1 AND status='PUBLISHED' AND configuration->>'masteryThreshold'='80') "policyCount",
    (SELECT count(*)::int FROM assessment_packages WHERE family_code LIKE 'DEMO-UI-L%' AND is_demo AND status='PUBLISHED') "algebraPackages",
    to_regclass('public.notifications')::text "futureNotifications"`);
  if (
    !state ||
    state.missing.length ||
    state.indexes !== 7 ||
    state.unprotected !== 0 ||
    state.policyCount !== 1 ||
    state.algebraPackages !== 10
  )
    fail(
      'Required existing schema, demo curriculum, constraints or RLS do not match. No migrations will be applied.',
    );
  if (
    roster.actors.length !== 99 ||
    roster.classes.length !== 3 ||
    new Set(roster.actors.map((a) => a.id)).size !== 99 ||
    new Set(roster.actors.map((a) => a.email)).size !== 99 ||
    roster.scenario !== scenario
  )
    fail('Invalid deterministic roster.');
  for (const actor of roster.actors) {
    const conflicts =
      await sql`SELECT id FROM users WHERE (id=${actor.id}::uuid OR lower(email)=lower(${actor.email}))
      AND NOT (id=${actor.id}::uuid AND email=${actor.email} AND role=${actor.role}::user_role AND display_name=${actor.displayName} AND status='ACTIVE')`;
    if (conflicts.length) fail('An existing user conflicts with the demo roster.');
    if (actor.role === 'STUDENT') {
      const expected = roster.classes[actor.classIndex! - 1]!.id;
      const memberships =
        await sql`SELECT id FROM class_memberships WHERE student_user_id=${actor.id}::uuid AND class_id<>${expected}::uuid`;
      if (memberships.length) fail('A demo Student already belongs to another class.');
    }
  }
  for (const item of roster.classes) {
    const conflicts =
      await sql`SELECT id FROM classes WHERE (id=${item.id}::uuid OR join_code=${item.joinCode})
      AND NOT (id=${item.id}::uuid AND join_code=${item.joinCode} AND name=${item.name} AND teacher_user_id=${roster.actors[0]!.id}::uuid AND archived_at IS NULL)`;
    if (conflicts.length) fail('An existing class conflicts with the demo scenario.');
  }
  const collisions =
    await sql`SELECT id FROM schools WHERE code='DEMO-TEACHER-SBY-01' AND id<>${prefix + '000000000020'}::uuid`;
  if (collisions.length) fail('Demo school code collision.');
  const published =
    await sql`SELECT id FROM assessment_packages WHERE assessment_type='TRYOUT' AND status='PUBLISHED'
    AND release_at='2026-09-27T17:00:00Z'::timestamptz AND id<>${prefix + '000000000702'}::uuid`;
  if (published.length) fail('Another published package already owns this weekly release.');
  return state;
}

async function verify(sql: Query, manifest: Manifest) {
  const classes =
    await sql.unsafe(`SELECT c.name,c.join_code,count(m.id)::int students FROM classes c
    LEFT JOIN class_memberships m ON m.class_id=c.id AND m.left_at IS NULL
    WHERE c.teacher_user_id='${prefix}000000000001' GROUP BY c.id ORDER BY c.join_code`);
  const counts: Record<string, number> = {};
  for (const table of [
    'users',
    'schools',
    'teacher_verification_tokens',
    'teacher_school_memberships',
    'classes',
    'class_memberships',
    'chapters',
    'subchapters',
    'competencies',
    'levels',
    'questions',
    'question_variants',
    'question_versions',
    'scoring_policy_versions',
    'assessment_packages',
    'package_items',
    'assessment_attempts',
    'attempt_items',
    'attempt_answers',
    'level_progress',
    'tryout_batches',
    'irt_batches',
    'irt_item_results',
    'feedback',
    'analytics_outbox',
    'audit_logs',
    'xp_ledger',
  ]) {
    const [row] = await sql.unsafe<{ count: number }[]>(
      `SELECT count(*)::int count FROM public.${table} WHERE id::text LIKE '${prefix}%'`,
    );
    counts[table] = row!.count;
  }
  const tryout = await sql.unsafe(`SELECT p.name,b.status,b.starts_at,b.closes_at,
    (SELECT count(*)::int FROM class_memberships WHERE class_id='${prefix}000000000010' AND left_at IS NULL) eligible,
    count(a.id) filter(where a.status IN ('SUBMITTED','GRADED'))::int submitted,
    (SELECT count(*)::int FROM class_memberships WHERE class_id='${prefix}000000000010' AND left_at IS NULL)
      -count(a.id) filter(where a.status IN ('SUBMITTED','GRADED'))::int not_submitted,
    round(avg(a.score_0_100) filter(where a.status IN ('SUBMITTED','GRADED')),2) stored_demo_percentage_average,
    count(a.id) filter(where a.score_0_100>=90)::int band_90_100,
    count(a.id) filter(where a.score_0_100>=75 AND a.score_0_100<90)::int band_75_89,
    count(a.id) filter(where a.score_0_100>=60 AND a.score_0_100<75)::int band_60_74,
    count(a.id) filter(where a.score_0_100<60)::int band_under_60,
    EXISTS(SELECT 1 FROM irt_batches ib WHERE ib.package_id=p.id AND ib.status='SUCCEEDED' AND ib.result_released_at<=clock_timestamp()
      AND NOT EXISTS(SELECT 1 FROM package_items pi WHERE pi.package_id=p.id AND NOT EXISTS(SELECT 1 FROM irt_item_results ir WHERE ir.batch_id=ib.id AND ir.question_version_id=pi.question_version_id AND ir.sample_size>=30 AND ir.data_status='SUFFICIENT'))) result_released
    FROM assessment_packages p JOIN tryout_batches b ON b.package_id=p.id
    LEFT JOIN assessment_attempts a ON a.package_id=p.id AND a.status IN ('SUBMITTED','GRADED')
    WHERE p.id IN ('${prefix}000000000701','${prefix}000000000702') GROUP BY p.id,b.id ORDER BY p.family_code`);
  const [feedback] = await sql.unsafe<
    { total: number; read: number; unread: number; read_rate: string }[]
  >(`SELECT count(*)::int total,count(*) filter(where read_at IS NOT NULL)::int read,
    count(*) filter(where read_at IS NULL)::int unread,round(100.0*count(*) filter(where read_at IS NOT NULL)/nullif(count(*),0),2) read_rate
    FROM feedback WHERE teacher_id='${prefix}000000000001'`);
  const [activity] = await sql.unsafe<{ active: number; students: number; rate: string }[]>(
    `SELECT count(*) filter(where EXISTS(SELECT 1 FROM assessment_attempts a WHERE a.student_id=m.student_user_id
    AND a.assessment_type IN ('DRILL','TRYOUT') AND a.started_at>='2026-09-30T17:00:00Z' AND a.started_at<=$1::timestamptz))::int active,
    count(*)::int students,round(100.0*count(*) filter(where EXISTS(SELECT 1 FROM assessment_attempts a WHERE a.student_id=m.student_user_id
    AND a.assessment_type IN ('DRILL','TRYOUT') AND a.started_at>='2026-09-30T17:00:00Z' AND a.started_at<=$1::timestamptz))/count(*),2) rate
    FROM class_memberships m WHERE m.class_id='${prefix}000000000010' AND m.left_at IS NULL`,
    [manifest.asOf],
  );
  const progress = await sql.unsafe(`SELECT
    CASE WHEN unlocked_at IS NULL THEN 'LOCKED' WHEN completed_at IS NOT NULL THEN 'MASTERED' ELSE 'UNLOCKED_NOT_MASTERED' END state,
    count(*)::int count FROM level_progress WHERE id::text LIKE '${prefix}%' GROUP BY 1 ORDER BY 1`);
  const drill = await sql.unsafe(`SELECT status,count(*)::int count,
    count(*) filter(where score_0_100<80)::int below_mastery FROM assessment_attempts WHERE id::text LIKE '${prefix}%' AND assessment_type='DRILL' GROUP BY status ORDER BY status`);
  const checks = [
    [
      'different_retry_variant',
      `SELECT NOT EXISTS(SELECT 1 FROM (SELECT package_id,lag(package_id) OVER (PARTITION BY student_id,level_id_at_start ORDER BY started_at,id) previous_package FROM assessment_attempts WHERE id::text LIKE '${prefix}%' AND assessment_type='DRILL') retries WHERE package_id=previous_package) ok`,
    ],
    [
      'auth_and_teacher',
      `SELECT count(*)=99 ok FROM users u JOIN auth.users a ON a.id=u.auth_user_id WHERE u.id::text LIKE '${prefix}%' AND a.email=u.email AND a.raw_app_meta_data->>'numora_teacher_demo'='${scenario}' AND a.raw_app_meta_data->>'provider'='email' AND EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=a.id AND i.provider='email')`,
    ],
    [
      'verified_school',
      `SELECT count(*)=1 ok FROM teacher_school_memberships m JOIN teacher_verification_tokens t ON t.id=m.verification_token_id JOIN schools s ON s.id=m.school_id WHERE m.teacher_user_id='${prefix}000000000001' AND m.ended_at IS NULL AND s.status='ACTIVE' AND t.used_by_user_id=m.teacher_user_id AND t.used_at=m.verified_at AND t.used_at BETWEEN t.created_at AND t.expires_at AND t.expires_at=t.created_at+interval '72 hours'`,
    ],
    [
      'raw_scores_and_answers',
      `SELECT NOT EXISTS(SELECT 1 FROM assessment_attempts a JOIN LATERAL (SELECT count(*) n,count(aa.id) answers,sum(ai.max_points) maximum,sum(CASE WHEN aa.answer->>'optionId'=q.answer_key->>'optionId' THEN ai.max_points ELSE 0 END) raw,
      bool_and(aa.awarded_points=CASE WHEN aa.answer->>'optionId'=q.answer_key->>'optionId' THEN ai.max_points ELSE 0 END) points_match FROM attempt_items ai JOIN question_versions q ON q.id=ai.question_version_id LEFT JOIN attempt_answers aa ON aa.attempt_item_id=ai.id WHERE ai.attempt_id=a.id) r ON true
      WHERE a.id::text LIKE '${prefix}%' AND a.status='GRADED' AND (r.n<>CASE WHEN a.assessment_type='DRILL' THEN 10 ELSE 35 END OR r.answers<>r.n OR a.raw_points<>r.raw OR a.score_0_100<>round(r.raw*100/r.maximum) OR NOT r.points_match)) ok`,
    ],
    [
      'progress_history',
      `SELECT NOT EXISTS(SELECT 1 FROM level_progress p JOIN LATERAL (SELECT max(score_0_100) best FROM assessment_attempts a WHERE a.student_id=p.student_id AND a.level_id_at_start=p.level_id AND a.status='GRADED') b ON true
      LEFT JOIN LATERAL (SELECT score_0_100 FROM assessment_attempts a WHERE a.student_id=p.student_id AND a.level_id_at_start=p.level_id AND a.status='GRADED' ORDER BY a.finished_at DESC,a.id DESC LIMIT 1) latest ON true
      WHERE p.id::text LIKE '${prefix}%' AND (p.best_score IS DISTINCT FROM b.best OR p.latest_score IS DISTINCT FROM latest.score_0_100 OR p.completed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assessment_attempts a WHERE a.id=p.completion_attempt_id AND a.score_0_100>=80))) ok`,
    ],
    [
      'locked_access_and_snapshot',
      `SELECT NOT EXISTS(SELECT 1 FROM assessment_attempts a JOIN levels l ON l.id=a.level_id_at_start JOIN assessment_packages p ON p.id=a.package_id
      WHERE a.id::text LIKE '${prefix}%' AND (a.scoring_policy_version_id IS DISTINCT FROM p.scoring_policy_version_id OR a.deadline_at IS NOT NULL AND a.assessment_type='DRILL' OR l.level_number>1 AND NOT EXISTS(SELECT 1 FROM assessment_attempts prev JOIN levels pl ON pl.id=prev.level_id_at_start WHERE prev.student_id=a.student_id AND pl.subchapter_id=l.subchapter_id AND pl.level_number=l.level_number-1 AND prev.status='GRADED' AND prev.score_0_100>=80 AND prev.finished_at<=a.started_at))) ok`,
    ],
    [
      'new_student_empty',
      `SELECT NOT EXISTS(SELECT 1 FROM assessment_attempts WHERE student_id='${prefix}000000001012') AND NOT EXISTS(SELECT 1 FROM level_progress WHERE student_id='${prefix}000000001012') ok`,
    ],
    [
      'regression_preserves_mastery',
      `SELECT count(*)=1 ok FROM level_progress p JOIN levels l ON l.id=p.level_id WHERE p.student_id='${prefix}000000001007' AND l.subchapter_id='03000000-0000-4000-8000-000000000101' AND l.level_number=1 AND p.latest_score=70 AND p.best_score=90 AND p.completed_at IS NOT NULL`,
    ],
    [
      'alya_mastered',
      `SELECT count(*)=15 ok FROM level_progress WHERE student_id='${prefix}000000001001' AND completed_at IS NOT NULL`,
    ],
    [
      'no_invented_rewards',
      `SELECT NOT EXISTS(SELECT 1 FROM xp_ledger WHERE student_id::text LIKE '${prefix}%') ok`,
    ],
    [
      'irt_evidence',
      `SELECT count(*)=35 AND min(sample_size)=30 AND max(sample_size)=30 AND bool_and(difficulty_b IS NULL AND discrimination_a IS NULL AND guessing_c IS NULL AND measurement_state='UNCALIBRATED') ok FROM irt_item_results WHERE batch_id='${prefix}000000000720'`,
    ],
    [
      'content_keys',
      `SELECT count(*)=200 AND bool_and(jsonb_array_length(options_or_statements)=4 AND EXISTS(SELECT 1 FROM jsonb_array_elements(options_or_statements) opt WHERE opt->>'id'=answer_key->>'optionId') AND length(explanation->>'text')>0) ok FROM question_versions WHERE id::text LIKE '${prefix}%'`,
    ],
    [
      'feedback_ownership',
      `SELECT NOT EXISTS(SELECT 1 FROM feedback f WHERE f.teacher_id='${prefix}000000000001' AND NOT EXISTS(SELECT 1 FROM classes c JOIN class_memberships m ON m.class_id=c.id WHERE c.id=f.class_id_at_send AND c.teacher_user_id=f.teacher_id AND m.student_user_id=f.student_id AND m.left_at IS NULL AND f.sent_at>=m.joined_at)) ok`,
    ],
  ];
  for (const [name, query] of checks) {
    const [row] = await sql.unsafe<{ ok: boolean }[]>(query!);
    if (!row?.ok) fail(`Verification failed: ${name}.`);
  }
  if (
    counts.users !== 99 ||
    counts.schools !== 1 ||
    counts.classes !== 3 ||
    counts.class_memberships !== 98 ||
    counts.assessment_packages !== 22 ||
    counts.xp_ledger !== 0 ||
    classes.length !== 3 ||
    classes.some((c) => c.students !== (c.join_code === 'NUM-9A26' ? 34 : 32)) ||
    tryout.length !== 2 ||
    tryout.some((t) => t.eligible !== 34 || t.submitted !== 30 || t.not_submitted !== 4) ||
    tryout[0]!.stored_demo_percentage_average !== '81.40' ||
    !tryout[0]!.result_released ||
    tryout[1]!.result_released ||
    [
      tryout[0]!.band_90_100,
      tryout[0]!.band_75_89,
      tryout[0]!.band_60_74,
      tryout[0]!.band_under_60,
    ].join(',') !== '8,12,6,4' ||
    feedback?.total !== 42 ||
    feedback.read !== 38 ||
    feedback.unread !== 4 ||
    activity?.active !== 28 ||
    activity.students !== 34
  )
    fail('Canonical scenario count verification failed.');
  return {
    scenario,
    asOf: manifest.asOf,
    counts,
    classes,
    tryout: tryout.map((t) => ({
      ...t,
      displayedAverage: t.result_released ? Number(t.stored_demo_percentage_average) : null,
      displayedDistribution: t.result_released
        ? [t.band_90_100, t.band_75_89, t.band_60_74, t.band_under_60]
        : null,
    })),
    feedback,
    activity,
    progress,
    drill,
    checks: checks.map(([name]) => name),
    teacherNotifications: { supported: false, unread: null },
    xpRanking: { supported: false, reason: 'OPEN-11 / DRL-OPEN-01/02 / TRY-TBC-03' },
  };
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((a) => !['--check', '--apply', '--verify'].includes(a)))
    fail('Use one of --check, --apply, --verify. Default is read-only --check.');
  const mode = args[0] ?? '--check';
  const safety: {
    requireDemoTarget(env: NodeJS.ProcessEnv): string;
    verifyBackup(env: NodeJS.ProcessEnv): Promise<void>;
  } = await import(pathToFileURL(join(root, 'apps/api/scripts/teacher-demo-accounts.mjs')).href);
  if (!allowSyntheticContent()) fail('Verified development fixture isolation required.');
  const url = safety.requireDemoTarget(process.env);
  const roster: Roster = JSON.parse(
    await readFile(join(root, 'packages/database/seeds/teacher-demo-roster.json'), 'utf8'),
  );
  const sql = postgres(url, { max: 1, connect_timeout: 10 });
  try {
    if (mode === '--check') {
      const state = await sql.begin('read only', (tx) => inspect(tx, roster));
      console.log(
        JSON.stringify({
          projectRef: 'pkamenfnwmoeisccnrnk',
          mode,
          state,
          security: await securitySnapshot(sql),
          writes: false,
        }),
      );
      return;
    }
    const manifest: Manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    if (
      manifest.projectRef !== 'pkamenfnwmoeisccnrnk' ||
      manifest.scenario !== scenario ||
      manifest.rosterDigest !== digest(roster) ||
      Object.keys(manifest.actors).length !== 99 ||
      !Number.isInteger(manifest.chapterOrderBase) ||
      !Number.isFinite(Date.parse(manifest.asOf)) ||
      Date.parse(manifest.asOf) < Date.parse('2026-10-03T04:00:00Z') ||
      Date.parse(manifest.asOf) > Date.now()
    )
      fail('Manifest target, roster or scenario time does not match.');
    const [admin] = await sql<
      { id: string }[]
    >`SELECT id FROM users WHERE auth_user_id=${manifest.qaActors.admin}::uuid AND role='ADMIN' AND status='ACTIVE'`;
    if (!admin) return fail('The existing QA Admin profile is required.');
    for (const actor of roster.actors) {
      const authId = manifest.actors[actor.id];
      if (!authId || !/^[a-f0-9-]{36}$/.test(authId)) return fail('Invalid Auth manifest.');
      const [auth] = await sql<
        { ok: boolean }[]
      >`SELECT email=${actor.email} AND raw_app_meta_data->>'provider'='email'
        AND raw_app_meta_data->>'numora_teacher_demo'=${scenario} AND raw_app_meta_data->>'numora_qa'='true'
        AND EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND i.provider='email') ok FROM auth.users u WHERE id=${authId}::uuid`;
      if (!auth?.ok) fail('Synthetic Auth identity verification failed.');
    }
    if (mode === '--apply') {
      if (process.env.ALLOW_TEACHER_DEMO_SEED !== 'true')
        fail('Explicit Development seed opt-in is required.');
      await safety.verifyBackup(process.env);
      const before = await fingerprint(sql);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const sqlFile = await readFile(
        join(root, 'packages/database/seeds/teacher-demo.sql'),
        'utf8',
      );
      const result = await sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL lock_timeout='5s'");
        await tx.unsafe("SET LOCAL statement_timeout='90s'");
        await tx`SELECT pg_advisory_xact_lock(hashtext('numora-teacher-demo-v1'))`;
        await inspect(tx, roster);
        const config = {
          ...manifest,
          roster,
          adminUserId: admin.id,
          tokenHash: createHash('sha256')
            .update(`${scenario}:synthetic-consumed-token`)
            .digest('hex'),
        };
        await tx`SELECT set_config('numora.teacher_demo',${JSON.stringify(config)},true)`;
        await tx.unsafe(sqlFile);
        const verified = await verify(tx, manifest);
        const after = await fingerprint(tx);
        if (digest(before) !== digest(after))
          fail('Existing rows or security/schema changed; transaction refused.');
        return {
          ...verified,
          securityUnchanged: true,
          existingRowsUnchanged: true,
          security: after.security,
        };
      });
      await writeFile(join(directory, 'verification.json'), JSON.stringify(result, null, 2), {
        mode: 0o600,
      });
      console.log(JSON.stringify({ mode, ...result }));
    } else {
      const result = await sql.begin('read only', (tx) => verify(tx, manifest));
      console.log(JSON.stringify({ mode, ...result, security: await securitySnapshot(sql) }));
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  run().catch((error: unknown) => {
    console.error(
      error instanceof Error && error.message.startsWith('TEACHER_DEMO:')
        ? error.message
        : 'TEACHER_DEMO: Seed/check failed; connection details and database payloads were suppressed.',
    );
    process.exitCode = 1;
  });
}

export { inspect, verify, securitySnapshot, fingerprint };

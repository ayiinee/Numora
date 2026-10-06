import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import postgres from 'postgres';
import {
  parseQaManifest,
  qaActors,
  qaDisplayNames,
  requireQaTarget,
  type QaActor,
} from './qa-seed-input.js';

const fail = (message: string): never => {
  throw new Error(`QA_SEED: ${message}`);
};

async function verifyBackup(path: string, expectedHash: string) {
  if (!isAbsolute(path) || !/^[a-f0-9]{64}$/i.test(expectedHash))
    fail('An absolute backup path and SHA-256 are required.');
  const info = await stat(path);
  if (!info.isFile() || info.size < 1024 || Date.now() - info.mtimeMs > 24 * 60 * 60 * 1000) {
    fail('A recent nonempty PostgreSQL custom-format backup is required.');
  }
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(5);
    await file.read(header, 0, 5, 0);
    if (header.toString('ascii') !== 'PGDMP')
      fail('Backup must be a PostgreSQL custom-format archive.');
  } finally {
    await file.close();
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Uint8Array);
  if (hash.digest('hex').toLowerCase() !== expectedHash.toLowerCase())
    fail('Backup SHA-256 mismatch.');
}

async function run() {
  const check = process.argv.includes('--check');
  if (process.argv.slice(2).some((arg) => arg !== '--check' && arg !== '--'))
    fail('Only --check is supported.');
  let url: string;
  try {
    url = requireQaTarget(process.env);
  } catch {
    fail(
      'Environment must target the allowed TLS Development project; check NODE_ENV, project ref, Auth URL, and DB URL.',
    );
  }
  const manifestPath = process.env.QA_SEED_MANIFEST;
  if (!manifestPath || !isAbsolute(manifestPath))
    fail('QA_SEED_MANIFEST must be an absolute path.');
  let manifest: ReturnType<typeof parseQaManifest>;
  try {
    manifest = parseQaManifest(JSON.parse(await readFile(manifestPath!, 'utf8')));
  } catch {
    fail('Manifest must contain six distinct Auth UUIDs for the allowed Development project.');
  }
  if (!check) {
    if (process.env.ALLOW_QA_SEED !== 'true')
      fail('Set ALLOW_QA_SEED=true for the reviewed write.');
    const backupPath = process.env.QA_SEED_BACKUP_PATH;
    const backupHash = process.env.QA_SEED_BACKUP_SHA256;
    if (!backupPath || !backupHash) {
      fail('A current backup path and SHA-256 are required before writing.');
    }
    await verifyBackup(backupPath!, backupHash!);
  }

  const client = postgres(url!, { max: 1, connect_timeout: 10 });
  try {
    let ready = false;
    await client.begin(async (tx) => {
      await tx.unsafe("SET LOCAL lock_timeout = '5s'");
      await tx.unsafe("SET LOCAL statement_timeout = '30s'");
      await tx`SELECT pg_advisory_xact_lock(hashtext('numora-demo-qa-seed'))`;
      const [schema] = await tx<
        {
          users: string | null;
          schools: string | null;
          tokens: string | null;
          classes: string | null;
          members: string | null;
          teacherMembers: string | null;
          audit: string | null;
          migrations: string | null;
        }[]
      >`
        SELECT to_regclass('public.users')::text AS users,
          to_regclass('public.schools')::text AS schools,
          to_regclass('public.teacher_verification_tokens')::text AS tokens,
          to_regclass('public.classes')::text AS classes,
          to_regclass('public.class_memberships')::text AS members,
          to_regclass('public.teacher_school_memberships')::text AS "teacherMembers",
          to_regclass('public.audit_logs')::text AS audit,
          to_regclass('drizzle.__drizzle_migrations')::text AS migrations`;
      if (!schema || Object.values(schema).some((value) => !value))
        fail('Required migrated schema is missing.');
      const [constraints] = await tx<
        { indexes: number; tokenSchoolFk: number; rlsTables: number }[]
      >`
        SELECT (SELECT count(*)::int FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname IN
          ('users_auth_user_id_uq', 'users_email_uq', 'schools_code_uq',
           'teacher_school_memberships_active_teacher_school_uq', 'class_memberships_active_student_class_uq',
           'classes_join_code_uq')) AS indexes,
          (SELECT count(*)::int FROM pg_catalog.pg_constraint WHERE conname = 'teacher_school_memberships_token_school_fk') AS "tokenSchoolFk",
          (SELECT count(*)::int FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename IN
            ('users', 'schools', 'teacher_verification_tokens', 'teacher_school_memberships',
             'classes', 'class_memberships', 'audit_logs') AND rowsecurity) AS "rlsTables"`;
      if (
        constraints?.indexes !== 6 ||
        constraints.tokenSchoolFk !== 1 ||
        constraints.rlsTables !== 7
      ) {
        fail('QA identity/class constraints or RLS differ from the migrated schema.');
      }
      const [counts] = await tx<
        { auth: number; profiles: number; schools: number; classes: number; members: number }[]
      >`
        SELECT (SELECT count(*)::int FROM auth.users) AS auth,
          (SELECT count(*)::int FROM public.users) AS profiles,
          (SELECT count(*)::int FROM public.schools) AS schools,
          (SELECT count(*)::int FROM public.classes) AS classes,
          (SELECT count(*)::int FROM public.class_memberships) AS members`;
      console.log(`Before QA seed: ${JSON.stringify(counts)}`);

      const ids = {} as Record<QaActor, string>;
      const actors = Object.keys(qaActors) as QaActor[];
      const emails = new Set<string>();
      for (const actor of actors) {
        const [auth] = await tx<
          {
            email: string | null;
            providerIdentity: boolean;
            primaryProvider: boolean;
            qaFlag: boolean;
          }[]
        >`
          SELECT u.email,
            (u.raw_app_meta_data->>'provider' = ${manifest.mode === 'EMAIL_QA' ? 'email' : 'google'}) AS "primaryProvider",
            (u.raw_app_meta_data->>'numora_qa' = 'true') AS "qaFlag",
            EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
              AND i.provider = ${manifest.mode === 'EMAIL_QA' ? 'email' : 'google'}) AS "providerIdentity"
          FROM auth.users u WHERE u.id = ${manifest.actors[actor]}::uuid`;
        if (
          !auth?.email ||
          !auth.providerIdentity ||
          !auth.primaryProvider ||
          (manifest.mode === 'EMAIL_QA' &&
            (!auth.qaFlag || auth.email !== `numora-qa-${actor.toLowerCase()}@example.invalid`)) ||
          emails.has(auth.email.toLowerCase())
        ) {
          fail(`${actor} must have a distinct matching Auth identity with email.`);
        }
        const email = auth!.email!;
        emails.add(email.toLowerCase());
        const profiles = await tx<
          {
            id: string;
            authUserId: string;
            role: string;
            displayName: string;
            email: string;
            status: string;
          }[]
        >`
          SELECT id, auth_user_id AS "authUserId", role, display_name AS "displayName", email, status
          FROM public.users WHERE auth_user_id = ${manifest.actors[actor]}::uuid OR lower(email) = lower(${email})`;
        const profile = profiles[0];
        if (
          profiles.length > 1 ||
          (profile &&
            (profile.authUserId !== manifest.actors[actor] ||
              profile.role !== qaActors[actor] ||
              profile.status !== 'ACTIVE' ||
              profile.email.toLowerCase() !== email.toLowerCase() ||
              profile.displayName !== qaDisplayNames[actor]))
        ) {
          fail(`${actor} conflicts with an existing non-QA profile or role.`);
        }
        if (check) continue;
        if (profile) {
          ids[actor] = profile.id;
        } else {
          const [created] = await tx<{ id: string }[]>`
            INSERT INTO public.users (auth_user_id, role, display_name, email)
            VALUES (${manifest.actors[actor]}::uuid, ${qaActors[actor]}::public.user_role, ${qaDisplayNames[actor]}, ${email})
            RETURNING id`;
          ids[actor] = created!.id;
          await tx`
            INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
            VALUES (${actor === 'admin' ? created!.id : ids.admin}::uuid, 'qa_profile_provisioned', 'user', ${created!.id}::uuid,
              ${JSON.stringify({ fixture: 'DEMO-QA', role: qaActors[actor] })}::jsonb)`;
        }
      }
      if (check) {
        console.log('QA identity and schema preflight passed; no rows written.');
        return;
      }

      const [existingSchool] = await tx<{ id: string; name: string; status: string }[]>`
        SELECT id, name, status FROM public.schools WHERE code = 'DEMO-QA-SCHOOL'`;
      if (
        existingSchool &&
        (existingSchool.name !== 'SMP Nusantara' || existingSchool.status !== 'ACTIVE')
      ) {
        fail('QA school code conflicts with existing data.');
      }
      if (existingSchool) {
        const [owned] = await tx<{ ok: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'school_created'
            AND entity_id = ${existingSchool.id}::uuid AND actor_user_id = ${ids.admin}::uuid
            AND metadata->>'fixture' = 'DEMO-QA') AS ok`;
        if (!owned?.ok) fail('Existing QA school has no matching fixture audit.');
      }
      const [school] = existingSchool
        ? [existingSchool]
        : await tx<{ id: string }[]>`
        INSERT INTO public.schools (code, name) VALUES ('DEMO-QA-SCHOOL', 'SMP Nusantara') RETURNING id`;
      if (!existingSchool)
        await tx`
        INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (${ids.admin}::uuid, 'school_created', 'school', ${school!.id}::uuid, '{"fixture":"DEMO-QA"}'::jsonb)`;

      const teacherMemberships = await tx<
        {
          id: string;
          schoolId: string;
          tokenSchoolId: string;
          tokenId: string;
          createdBy: string;
          usedBy: string;
          usedAt: Date | null;
          endedAt: Date | null;
        }[]
      >`
        SELECT m.id, m.school_id AS "schoolId", t.school_id AS "tokenSchoolId",
          m.verification_token_id AS "tokenId", t.created_by_user_id AS "createdBy",
          t.used_by_user_id AS "usedBy", t.used_at AS "usedAt", m.ended_at AS "endedAt"
        FROM public.teacher_school_memberships m
        JOIN public.teacher_verification_tokens t ON t.id = m.verification_token_id
        WHERE m.teacher_user_id = ${ids.teacherA}::uuid`;
      const teacherMembership = teacherMemberships[0];
      if (
        teacherMemberships.length > 1 ||
        (teacherMembership &&
          (teacherMembership.schoolId !== school!.id ||
            teacherMembership.tokenSchoolId !== school!.id ||
            teacherMembership.createdBy !== ids.admin ||
            teacherMembership.usedBy !== ids.teacherA ||
            !teacherMembership.usedAt ||
            teacherMembership.endedAt))
      )
        fail('Teacher A has a conflicting school affiliation.');
      if (teacherMembership) {
        const [owned] = await tx<{ ok: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'teacher_verified'
            AND entity_id = ${school!.id}::uuid AND actor_user_id = ${ids.teacherA}::uuid
            AND metadata->>'fixture' = 'DEMO-QA') AS ok`;
        if (!owned?.ok) fail('Existing Teacher A affiliation has no fixture audit.');
      }
      if (!teacherMembership) {
        const now = new Date();
        const hash = createHash('sha256').update(randomBytes(32)).digest('hex');
        const [token] = await tx<{ id: string }[]>`
          INSERT INTO public.teacher_verification_tokens
            (school_id, token_hash, created_by_user_id, created_at, expires_at, used_at, used_by_user_id)
          VALUES (${school!.id}::uuid, ${hash}, ${ids.admin}::uuid, ${now},
            ${new Date(now.getTime() + 72 * 60 * 60 * 1000)}, ${now}, ${ids.teacherA}::uuid)
          RETURNING id`;
        await tx`
          INSERT INTO public.teacher_school_memberships (teacher_user_id, school_id, verification_token_id, verified_at)
          VALUES (${ids.teacherA}::uuid, ${school!.id}::uuid, ${token!.id}::uuid, ${now})`;
        await tx`
          INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
          VALUES (${ids.admin}::uuid, 'teacher_token_issued', 'teacher_verification_token', ${token!.id}::uuid, '{"fixture":"DEMO-QA"}'::jsonb),
            (${ids.teacherA}::uuid, 'teacher_verified', 'school', ${school!.id}::uuid, '{"fixture":"DEMO-QA"}'::jsonb)`;
      }

      const [existingClass] = await tx<
        { id: string; schoolId: string; teacherId: string; name: string; archivedAt: Date | null }[]
      >`
        SELECT id, school_id AS "schoolId", teacher_user_id AS "teacherId", name, archived_at AS "archivedAt"
        FROM public.classes WHERE join_code = 'DEMO-QA-CLASS-A'`;
      if (
        existingClass &&
        (existingClass.schoolId !== school!.id ||
          existingClass.teacherId !== ids.teacherA ||
          existingClass.name !== 'Matematika IX A' ||
          existingClass.archivedAt)
      )
        fail('QA class code conflicts with existing data.');
      if (existingClass) {
        const [owned] = await tx<{ ok: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'class_created'
            AND entity_id = ${existingClass.id}::uuid AND actor_user_id = ${ids.teacherA}::uuid
            AND metadata->>'fixture' = 'DEMO-QA') AS ok`;
        if (!owned?.ok) fail('Existing QA Class A has no fixture audit.');
      }
      const [classA] = existingClass
        ? [existingClass]
        : await tx<{ id: string }[]>`
        INSERT INTO public.classes (school_id, teacher_user_id, name, join_code)
        VALUES (${school!.id}::uuid, ${ids.teacherA}::uuid, 'Matematika IX A', 'DEMO-QA-CLASS-A') RETURNING id`;
      if (!existingClass)
        await tx`
        INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (${ids.teacherA}::uuid, 'class_created', 'class', ${classA!.id}::uuid, '{"fixture":"DEMO-QA"}'::jsonb)`;
      const [outsider] = await tx<{ id: string }[]>`
        SELECT id FROM public.class_memberships
        WHERE class_id = ${classA!.id}::uuid AND student_user_id <> ${ids.studentA}::uuid LIMIT 1`;
      if (outsider) fail('QA Class A contains another Student.');

      const membershipsA = await tx<{ classId: string; leftAt: Date | null }[]>`
        SELECT class_id AS "classId", left_at AS "leftAt" FROM public.class_memberships
        WHERE student_user_id = ${ids.studentA}::uuid`;
      const memberA = membershipsA[0];
      if (
        membershipsA.length > 1 ||
        (memberA && (memberA.classId !== classA!.id || memberA.leftAt))
      ) {
        fail('Student A has a conflicting class affiliation.');
      }
      if (memberA) {
        const [owned] = await tx<{ ok: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'student_joined_class'
            AND entity_id = ${classA!.id}::uuid AND actor_user_id = ${ids.studentA}::uuid
            AND metadata->>'fixture' = 'DEMO-QA') AS ok`;
        if (!owned?.ok) fail('Existing Student A affiliation has no fixture audit.');
      }
      if (!memberA) {
        await tx`INSERT INTO public.class_memberships (class_id, student_user_id)
          VALUES (${classA!.id}::uuid, ${ids.studentA}::uuid)`;
        await tx`INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
          VALUES (${ids.studentA}::uuid, 'student_joined_class', 'class', ${classA!.id}::uuid, '{"fixture":"DEMO-QA"}'::jsonb)`;
      }

      for (const actor of ['teacherB', 'studentB', 'studentC'] as const) {
        const [affiliation] =
          actor === 'teacherB'
            ? await tx<
                { id: string }[]
              >`SELECT id FROM public.teacher_school_memberships WHERE teacher_user_id = ${ids[actor]}::uuid LIMIT 1`
            : await tx<
                { id: string }[]
              >`SELECT id FROM public.class_memberships WHERE student_user_id = ${ids[actor]}::uuid LIMIT 1`;
        if (affiliation) fail(`${actor} must remain unaffiliated for the live workflow.`);
      }
      const [graph] = await tx<{ teachers: number; students: number }[]>`
        SELECT (SELECT count(*)::int FROM public.teacher_school_memberships
          WHERE teacher_user_id = ${ids.teacherA}::uuid AND school_id = ${school!.id}::uuid AND ended_at IS NULL) AS teachers,
          (SELECT count(*)::int FROM public.class_memberships
          WHERE student_user_id = ${ids.studentA}::uuid AND class_id = ${classA!.id}::uuid AND left_at IS NULL) AS students`;
      if (graph?.teachers !== 1 || graph.students !== 1) fail('QA graph validation failed.');
      ready = true;
    });
    if (ready)
      console.log(
        'QA graph committed: School, Teacher A, Class A, and Student A are ready; Teacher B and Students B/C remain unaffiliated.',
      );
  } finally {
    await client.end();
  }
}

run().catch((error: unknown) => {
  const message =
    error instanceof Error && error.message.startsWith('QA_SEED:')
      ? error.message
      : 'QA seed failed; no transaction was committed.';
  console.error(message);
  process.exitCode = 1;
});

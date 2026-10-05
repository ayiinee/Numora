import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.CURRICULUM_TEST_PGLITE_MODULE;
const folder = new URL('../packages/database/drizzle/', import.meta.url);
const journal = JSON.parse(await readFile(new URL('meta/_journal.json', folder), 'utf8'));
const migrations = await Promise.all(
  journal.entries.map(async (entry) => ({
    ...entry,
    sql: await readFile(new URL(`${entry.tag}.sql`, folder), 'utf8'),
  })),
);
async function database() {
  const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  return db;
}
async function apply(db, entries) {
  try {
    await db.exec(`BEGIN;\n${entries.map((e) => e.sql).join('\n')}\nCOMMIT;`);
  } catch (error) {
    await db.exec('ROLLBACK');
    throw new Error(`Migration failed: ${error.message}`);
  }
}
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const insertId = async (db, sql, params = []) => (await one(db, `${sql} RETURNING id`, params)).id;

test(
  'fresh full migration chain commits with PRD v0.6 policies and backend-only new tables',
  { skip: !modulePath },
  async () => {
    const db = await database();
    try {
      await apply(db, migrations);
      assert.equal(
        (
          await one(
            db,
            "SELECT count(*)::int n FROM scoring_policy_versions WHERE policy_code IN ('DRILL_PRD_V06','TRYOUT_PRD_V06')",
          )
        ).n,
        2,
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT configuration->>'equivalentCorrectXpMultiplier' n FROM scoring_policy_versions WHERE policy_code='TRYOUT_PRD_V06'",
          )
        ).n,
        '10',
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT relrowsecurity enabled FROM pg_class WHERE oid='class_student_bans'::regclass",
          )
        ).enabled,
        true,
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT has_table_privilege('authenticated','class_student_bans','SELECT') allowed",
          )
        ).allowed,
        false,
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT has_table_privilege('numora_main_runtime','class_student_bans','SELECT') allowed",
          )
        ).allowed,
        true,
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT has_function_privilege('authenticated','enforce_student_class_membership()','EXECUTE') allowed",
          )
        ).allowed,
        false,
      );
      assert.equal(
        (
          await one(
            db,
            "SELECT EXISTS(SELECT 1 FROM pg_enum WHERE enumtypid='content_status'::regtype AND enumlabel='REVISION') present",
          )
        ).present,
        true,
      );
    } finally {
      await db.close();
    }
  },
);

test(
  'upgrade preserves Auth, immutable attempts/XP and supports five classes, bans, takeover state and zero stars',
  { skip: !modulePath },
  async () => {
    const db = await database();
    try {
      await apply(
        db,
        migrations.filter((e) => e.idx <= 23),
      );
      // Dummy Auth identities only: this fixture is not a restore of Supabase Cloud.
      await db.exec(
        'CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES(gen_random_uuid()),(gen_random_uuid());',
      );
      const teacher = await insertId(
        db,
        "INSERT INTO users(auth_user_id,role,display_name,email) VALUES(gen_random_uuid(),'TEACHER','Teacher','teacher@v06.test')",
      );
      const student = await insertId(
        db,
        "INSERT INTO users(auth_user_id,role,display_name,email) VALUES(gen_random_uuid(),'STUDENT','Student','student@v06.test')",
      );
      const admin = await insertId(
        db,
        "INSERT INTO users(auth_user_id,role,display_name,email) VALUES(gen_random_uuid(),'ADMIN','Legacy Admin','admin@v06.test')",
      );
      const school = await insertId(
        db,
        "INSERT INTO schools(code,name) VALUES('V06-TEST','School')",
      );
      const token = await insertId(
        db,
        "INSERT INTO teacher_verification_tokens(school_id,token_hash,created_by_user_id,expires_at) VALUES($1,'test-hash',$2,now()+interval '72 hours')",
        [school, admin],
      );
      const teacherMembership = await insertId(
        db,
        'INSERT INTO teacher_school_memberships(teacher_user_id,school_id,verification_token_id) VALUES($1,$2,$3)',
        [teacher, school, token],
      );
      const classId = await insertId(
        db,
        "INSERT INTO classes(school_id,teacher_user_id,name,join_code) VALUES($1,$2,'Class 1','V06CLASS1')",
        [school, teacher],
      );
      await db.query('INSERT INTO class_memberships(class_id,student_user_id) VALUES($1,$2)', [
        classId,
        student,
      ]);
      const chapter = await insertId(
        db,
        "INSERT INTO chapters(code,slug,name,display_order) VALUES('V06','v06','Bab',1)",
      );
      const sub = await insertId(
        db,
        "INSERT INTO subchapters(chapter_id,code,slug,name,display_order) VALUES($1,'V06-S','v06-s','Subbab',1)",
        [chapter],
      );
      const level = await insertId(
        db,
        'INSERT INTO levels(subchapter_id,level_number) VALUES($1,1)',
        [sub],
      );
      const policy = await insertId(
        db,
        "INSERT INTO scoring_policy_versions(policy_code,version,configuration,status) VALUES('LEGACY_TEST',1,'{}','PUBLISHED')",
      );
      const pkg = await insertId(
        db,
        "INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,level_id,scoring_policy_version_id,is_demo) VALUES('V06-PKG',1,'Legacy','DRILL',$1,$2,true)",
        [level, policy],
      );
      const attempt = await insertId(
        db,
        "INSERT INTO assessment_attempts(student_id,package_id,assessment_type,level_id_at_start,scoring_policy_version_id,status,finished_at,raw_points,score_0_100,stars) VALUES($1,$2,'DRILL',$3,$4,'GRADED',now(),8,80,2)",
        [student, pkg, level, policy],
      );
      await db.query(
        'INSERT INTO level_progress(student_id,level_id,unlocked_at,latest_score,best_score,best_stars) VALUES($1,$2,now(),80,80,2)',
        [student, level],
      );
      await db.query(
        "INSERT INTO xp_ledger(student_id,source_type,attempt_id,xp_amount) VALUES($1,'DRILL',$2,80)",
        [student, attempt],
      );
      const preserved = await one(
        db,
        'SELECT row_to_json(a) value FROM assessment_attempts a WHERE id=$1',
        [attempt],
      );
      await apply(
        db,
        migrations.filter((e) => e.idx > 23),
      );
      assert.deepEqual(
        await one(db, 'SELECT row_to_json(a) value FROM assessment_attempts a WHERE id=$1', [
          attempt,
        ]),
        preserved,
      );
      assert.equal((await one(db, 'SELECT count(*)::int n FROM auth.users')).n, 2);
      assert.equal(
        (await one(db, 'SELECT admin_role FROM users WHERE id=$1', [admin])).admin_role,
        null,
      );
      const progress = await one(
        db,
        'SELECT latest_stars,latest_attempt_id FROM level_progress WHERE student_id=$1',
        [student],
      );
      assert.equal(progress.latest_stars, 2);
      assert.equal(progress.latest_attempt_id, attempt);
      const classIds = [classId];
      for (let n = 2; n <= 6; n++)
        classIds.push(
          await insertId(db, 'INSERT INTO classes(school_id,name,join_code) VALUES($1,$2,$3)', [
            school,
            `Class ${n}`,
            `V06CLASS${n}`,
          ]),
        );
      await db.exec('SET ROLE numora_main_runtime');
      for (const id of classIds.slice(1, 5))
        await db.query('INSERT INTO class_memberships(class_id,student_user_id) VALUES($1,$2)', [
          id,
          student,
        ]);
      await assert.rejects(
        db.query('INSERT INTO class_memberships(class_id,student_user_id) VALUES($1,$2)', [
          classIds[5],
          student,
        ]),
        /CLASS_LIMIT_REACHED/,
      );
      await db.query(
        'INSERT INTO class_student_bans(class_id,student_user_id,banned_by_user_id) VALUES($1,$2,$3)',
        [classId, student, teacher],
      );
      assert.equal(
        (
          await one(
            db,
            'SELECT count(*)::int n FROM class_memberships WHERE student_user_id=$1 AND left_at IS NULL',
            [student],
          )
        ).n,
        4,
      );
      await assert.rejects(
        db.query('INSERT INTO class_memberships(class_id,student_user_id) VALUES($1,$2)', [
          classId,
          student,
        ]),
        /CLASS_BANNED/,
      );
      await assert.rejects(
        db.query('UPDATE class_student_bans SET unbanned_by_user_id=$1 WHERE class_id=$2', [
          teacher,
          classId,
        ]),
        /class_student_bans_unban_ck/,
      );
      await db.query(
        'UPDATE class_student_bans SET unbanned_at=now(),unbanned_by_user_id=$1 WHERE class_id=$2',
        [teacher, classId],
      );
      assert.equal(
        (
          await one(
            db,
            'SELECT count(*)::int n FROM class_memberships WHERE student_user_id=$1 AND left_at IS NULL',
            [student],
          )
        ).n,
        4,
      );
      await db.query('INSERT INTO class_memberships(class_id,student_user_id) VALUES($1,$2)', [
        classId,
        student,
      ]);
      await db.query('UPDATE teacher_school_memberships SET ended_at=now() WHERE id=$1', [
        teacherMembership,
      ]);
      assert.equal(
        (await one(db, 'SELECT teacher_user_id FROM classes WHERE id=$1', [classId]))
          .teacher_user_id,
        null,
      );
      assert.equal(
        (
          await one(
            db,
            'SELECT count(*)::int n FROM class_memberships WHERE student_user_id=$1 AND left_at IS NULL',
            [student],
          )
        ).n,
        5,
      );
      assert.equal(
        (
          await one(
            db,
            'SELECT count(*)::int n FROM xp_ledger WHERE attempt_id=$1 AND xp_amount=80',
            [attempt],
          )
        ).n,
        1,
      );
      const zeroAttempt = await insertId(
        db,
        "INSERT INTO assessment_attempts(student_id,package_id,assessment_type,level_id_at_start,status,finished_at,raw_points,score_0_100,stars) VALUES($1,$2,'DRILL',$3,'GRADED',now(),0,0,0)",
        [student, pkg, level],
      );
      await db.query(
        "INSERT INTO xp_ledger(student_id,source_type,attempt_id,xp_amount) VALUES($1,'DRILL',$2,24.944444) ON CONFLICT(attempt_id) DO NOTHING",
        [student, zeroAttempt],
      );
      await db.query(
        "INSERT INTO xp_ledger(student_id,source_type,attempt_id,xp_amount) VALUES($1,'DRILL',$2,24.944444) ON CONFLICT(attempt_id) DO NOTHING",
        [student, zeroAttempt],
      );
      assert.equal(
        (await one(db, 'SELECT count(*)::int n FROM xp_ledger WHERE attempt_id=$1', [zeroAttempt]))
          .n,
        1,
      );
      assert.equal(
        Number(
          (await one(db, 'SELECT xp_amount FROM xp_ledger WHERE attempt_id=$1', [zeroAttempt]))
            .xp_amount,
        ),
        24.944444,
      );
      await assert.rejects(
        db.query('UPDATE xp_ledger SET xp_amount=99 WHERE attempt_id=$1', [attempt]),
        /immutable|append|XP/i,
      );
    } finally {
      await db.close();
    }
  },
);

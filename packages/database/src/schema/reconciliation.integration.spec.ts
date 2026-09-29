import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, it } from 'vitest';

const testUrl = process.env.TEST_DATABASE_URL;

it.skipIf(!testUrl)('migrates the extended schema and permits Pretest after cancellation', async () => {
  const sql = postgres(testUrl!, { max: 1 });
  const tx = await sql.reserve();
  const studentId = randomUUID();
  const chapterId = randomUUID();
  const policyId = randomUUID();
  const packageId = randomUUID();

  try {
    await tx`BEGIN`;
    const rows = await tx<{ count: number }[]>`
      select count(*)::integer as count from pg_tables
      where schemaname = 'public' and rowsecurity
    `;
    expect(rows[0]?.count).toBe(50);

    await tx`insert into users (id, auth_user_id, role, display_name, email)
      values (${studentId}, ${randomUUID()}, 'STUDENT', 'Migration test', ${`${studentId}@example.invalid`})`;
    await tx`insert into chapters (id, title, sort_order) values
      (${chapterId}, 'Migration test', ${Math.floor(Math.random() * 1_000_000_000)})`;
    await tx`insert into scoring_policy_versions (id, policy_code, version, configuration)
      values (${policyId}, ${randomUUID()}, 1, '{}'::jsonb)`;
    await tx`insert into assessment_packages
      (id, family_code, package_version, name, assessment_type, chapter_id, scoring_policy_version_id)
      values (${packageId}, ${randomUUID()}, 1, 'Migration test', 'PRETEST', ${chapterId}, ${policyId})`;

    for (let i = 0; i < 2; i += 1) {
      await tx`insert into assessment_attempts
        (student_id, package_id, assessment_type, chapter_id_at_start, status)
        values (${studentId}, ${packageId}, 'PRETEST', ${chapterId}, 'CANCELLED')`;
    }
    await tx`insert into assessment_attempts
      (student_id, package_id, assessment_type, chapter_id_at_start, status)
      values (${studentId}, ${packageId}, 'PRETEST', ${chapterId}, 'SUBMITTED')`;
    const duplicate = await tx`insert into assessment_attempts
      (student_id, package_id, assessment_type, chapter_id_at_start, status)
      values (${studentId}, ${packageId}, 'PRETEST', ${chapterId}, 'GRADED')
      on conflict do nothing returning id`;
    expect(duplicate).toHaveLength(0);
  } finally {
    await tx`ROLLBACK`;
    tx.release();
    await sql.end();
  }
});

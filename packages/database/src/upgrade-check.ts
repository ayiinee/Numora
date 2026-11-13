import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { migrateIntegratedDatabase } from './integrated-migrations.js';

async function run() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required.');
  const name = `numora_upgrade_${randomBytes(4).toString('hex')}`;
  const upgradeUrl = new URL(testUrl);
  upgradeUrl.pathname = `/${name}`;
  const admin = postgres(testUrl, { max: 1 });
  const oldFolder = await mkdtemp(join(tmpdir(), 'numora-old-migrations-'));
  let client: ReturnType<typeof postgres> | undefined;

  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    client = postgres(upgradeUrl.toString(), { max: 1 });
    const folder = resolve(process.cwd(), 'drizzle');
    const journal = JSON.parse(await readFile(join(folder, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    const oldEntries = journal.entries.slice(0, 3);
    assert.equal(oldEntries.length, 3);
    await mkdir(join(oldFolder, 'meta'));
    await writeFile(join(oldFolder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: oldEntries }));
    for (const entry of oldEntries) {
      await copyFile(join(folder, `${entry.tag}.sql`), join(oldFolder, `${entry.tag}.sql`));
    }
    await migrate(drizzle(client), { migrationsFolder: oldFolder });

    const [student] = await client<{ id: string }[]>`
      INSERT INTO users (auth_user_id, role, display_name, email)
      VALUES (gen_random_uuid(), 'STUDENT', 'Upgrade test', 'upgrade@example.invalid') RETURNING id`;
    const [chapter] = await client<{ id: string }[]>`
      INSERT INTO chapters (title, sort_order, published_at)
      VALUES ('Legacy chapter', 1, now()) RETURNING id`;
    const [subchapter] = await client<{ id: string }[]>`
      INSERT INTO subchapters (chapter_id, title, sort_order, published_at)
      VALUES (${chapter!.id}, 'Legacy subchapter', 1, now()) RETURNING id`;
    const [level] = await client<{ id: string }[]>`
      INSERT INTO levels (subchapter_id, title, sort_order, published_at)
      VALUES (${subchapter!.id}, 'Legacy level', 1, now()) RETURNING id`;
    const [question] = await client<{ id: string }[]>`
      INSERT INTO questions (level_id, code) VALUES (${level!.id}, 'LEGACY-1') RETURNING id`;
    const [version] = await client<{ id: string }[]>`
      INSERT INTO question_versions (question_id, version) VALUES (${question!.id}, 1) RETURNING id`;
    const options = JSON.stringify([{ id: 'A', text: '1' }, { id: 'B', text: '2' }]);
    const [original] = await client<{ id: string }[]>`
      INSERT INTO question_variants (question_version_id, variant_no, stem, options, correct_option_id, explanation)
      VALUES (${version!.id}, 1, '1 + 1?', ${options}::jsonb, 'B', 'Two') RETURNING id`;
    const [variant] = await client<{ id: string }[]>`
      INSERT INTO question_variants (question_version_id, variant_no, stem, options, correct_option_id, explanation)
      VALUES (${version!.id}, 2, '2 - 1?', ${options}::jsonb, 'A', 'One') RETURNING id`;
    const [drillPackage] = await client<{ id: string }[]>`
      INSERT INTO drill_packages (level_id, variant_set, published_at)
      VALUES (${level!.id}, 1, now()) RETURNING id`;
    await client`
      INSERT INTO drill_package_questions (package_id, question_variant_id, sort_order)
      VALUES (${drillPackage!.id}, ${original!.id}, 1), (${drillPackage!.id}, ${variant!.id}, 2)`;
    const [attempt] = await client<{ id: string }[]>`
      INSERT INTO drill_attempts (student_id, level_id, package_id, status, completed_at, score)
      VALUES (${student!.id}, ${level!.id}, ${drillPackage!.id}, 'COMPLETED', now(), 100) RETURNING id`;
    await client`
      INSERT INTO drill_attempt_questions
        (attempt_id, question_variant_id, sort_order, stem, options, correct_option_id, explanation, selected_option_id)
      VALUES (${attempt!.id}, ${original!.id}, 1, '1 + 1?', ${options}::jsonb, 'B', 'Two', 'B')`;
    await client`
      INSERT INTO level_progress (student_id, level_id, latest_attempt_id, latest_score, best_score)
      VALUES (${student!.id}, ${level!.id}, ${attempt!.id}, 100, 100)`;
    const [active] = await client<{ id: string }[]>`
      INSERT INTO drill_attempts (student_id, level_id, package_id)
      VALUES (${student!.id}, ${level!.id}, ${drillPackage!.id}) RETURNING id`;
    await client`
      INSERT INTO drill_attempt_questions
        (attempt_id, question_variant_id, sort_order, stem, options, correct_option_id, explanation, selected_option_id)
      VALUES (${active!.id}, ${original!.id}, 1, '1 + 1?', ${options}::jsonb, 'B', 'Two', 'A'),
             (${active!.id}, ${variant!.id}, 2, '2 - 1?', ${options}::jsonb, 'A', 'One', null)`;

    // First reach the pre-PvP schema, then rehearse backfilling a real historical row.
    const prePvpEntries = journal.entries.slice(0, 7);
    await writeFile(join(oldFolder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: prePvpEntries }));
    for (const entry of prePvpEntries) await copyFile(join(folder, `${entry.tag}.sql`), join(oldFolder, `${entry.tag}.sql`));
    await migrate(drizzle(client), { migrationsFolder: oldFolder });
    const [pvpPackage] = await client<{ id: string }[]>`
      INSERT INTO assessment_packages (family_code, package_version, name, assessment_type, is_demo, scoring_policy_version_id)
      SELECT 'UPGRADE-PVP-FIXTURE', 1, 'Upgrade fixture only', 'PVP', true, scoring_policy_version_id
      FROM assessment_packages WHERE id = ${drillPackage!.id} RETURNING id`;
    const [pvpItem] = await client<{ id: string; question_version_id: string }[]>`
      INSERT INTO package_items (package_id, question_version_id, display_order, max_points)
      SELECT ${pvpPackage!.id}, question_version_id, 1, 150 FROM package_items WHERE package_id = ${drillPackage!.id} LIMIT 1
      RETURNING id, question_version_id`;
    const [match] = await client<{ id: string }[]>`
      INSERT INTO pvp_matches (room_code, package_id, creator_student_id, difficulty, status, started_at, ended_at, record_eligible)
      VALUES ('UPGRADE-PVP', ${pvpPackage!.id}, ${student!.id}, 'easy', 'FINISHED', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', true) RETURNING id`;
    await client`
      INSERT INTO pvp_match_questions (match_id, package_id, package_item_id, display_order)
      VALUES (${match!.id}, ${pvpPackage!.id}, ${pvpItem!.id}, 1)`;
    const reportMigration = journal.entries.findIndex((entry) => entry.tag === '0072_question_report_cases');
    assert.ok(reportMigration > prePvpEntries.length);
    await writeFile(join(oldFolder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: journal.entries.slice(0, reportMigration) }));
    for (const entry of journal.entries.slice(prePvpEntries.length, reportMigration))
      await copyFile(join(folder, `${entry.tag}.sql`), join(oldFolder, `${entry.tag}.sql`));
    await migrate(drizzle(client), { migrationsFolder: oldFolder });

    const [reported] = await client<{ id: string; version_id: string }[]>`
      SELECT a.id, i.question_version_id AS version_id FROM attempt_answers a
      JOIN attempt_items i ON i.id = a.attempt_item_id WHERE i.attempt_id = ${attempt!.id}`;
    assert.ok(reported);
    const legacyReports = await client<{ id: string }[]>`
      INSERT INTO question_reports (reporter_student_id, attempt_answer_id, category, status, follow_up, reported_at)
      VALUES (${student!.id}, ${reported.id}, 'ANSWER_KEY', 'RESOLVED', 'Legacy resolution', '2026-01-01'),
             (${student!.id}, ${reported.id}, 'EXPLANATION', 'OPEN', NULL, '2026-01-02')
      RETURNING id`;
    await client`INSERT INTO audit_logs (action, entity_type, entity_id, metadata)
      VALUES ('report_updated', 'question_report', ${legacyReports[0]!.id},
        '{"status":"RESOLVED","reason":"Legacy resolution"}'::jsonb)`;
    const sourcesBefore = await client`SELECT to_jsonb(r) AS source FROM question_reports r ORDER BY r.id`;
    await migrateIntegratedDatabase(client, folder);
    await migrateIntegratedDatabase(client, folder);
    assert.deepEqual(await client`SELECT to_jsonb(r) AS source FROM question_reports r ORDER BY r.id`, sourcesBefore);
    const [reportCase] = await client`SELECT id, question_version_id, status, revision FROM question_report_cases`;
    assert.deepEqual(reportCase && { ...reportCase }, { id: legacyReports[0]!.id, question_version_id: reported.version_id, status: 'OPEN', revision: 0 });
    const [access] = await client`SELECT has_table_privilege('numora_main_runtime', 'question_report_cases', 'UPDATE') AS main,
      has_table_privilege('numora_irt_runtime', 'question_report_cases', 'SELECT') AS irt`;
    assert.deepEqual(access && { ...access }, { main: true, irt: false });
    const [legacyAudit] = await client`SELECT metadata->>'reason' AS reason FROM audit_logs WHERE entity_id = ${legacyReports[0]!.id}`;
    assert.equal(legacyAudit?.reason, 'Legacy resolution');
    console.log('Legacy question report sources and moderation audit survived case backfill and migration replay.');
    const [pvpBackfill] = await client<{ version: string; policy: string; created: Date; ended: Date }[]>`
      SELECT q.question_version_id::text AS version, m.scoring_policy_version_id::text AS policy, m.created_at AS created, m.ended_at AS ended
      FROM pvp_matches m JOIN pvp_match_questions q ON q.match_id=m.id WHERE m.id=${match!.id}`;
    assert.equal(pvpBackfill!.version, pvpItem!.question_version_id);
    assert.ok(pvpBackfill!.policy);
    assert.ok(pvpBackfill!.created <= pvpBackfill!.ended);
    const [result] = await client<{
      variants: number; versions: number; pinned: number; progress: number; ready: number;
      commonPackages: number; commonItems: number; commonAttempts: number;
      commonAttemptItems: number; commonAnswers: number; score: string;
      answerVersion: string; unlockedLevelId: string | null;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM question_variants WHERE question_id = ${question!.id}) AS variants,
        (SELECT count(*)::int FROM question_versions WHERE variant_id IN (${original!.id}, ${variant!.id})) AS versions,
        (SELECT count(*)::int FROM drill_package_questions pq
          JOIN question_versions qv ON qv.id = pq.question_version_id AND qv.variant_id = pq.question_variant_id
          WHERE pq.package_id = ${drillPackage!.id}) AS pinned,
        (SELECT count(*)::int FROM legacy_level_progress_attempts WHERE drill_attempt_id = ${attempt!.id}) AS progress,
        (SELECT count(*)::int FROM chapters WHERE id = ${chapter!.id} AND status = 'READY') AS ready,
        (SELECT count(*)::int FROM assessment_packages WHERE id = ${drillPackage!.id} AND assessment_type = 'DRILL') AS "commonPackages",
        (SELECT count(*)::int FROM package_items WHERE package_id = ${drillPackage!.id}) AS "commonItems",
        (SELECT count(*)::int FROM assessment_attempts WHERE id = ${attempt!.id} AND status = 'GRADED') AS "commonAttempts",
        (SELECT count(*)::int FROM attempt_items WHERE attempt_id = ${attempt!.id}) AS "commonAttemptItems",
        (SELECT count(*)::int FROM attempt_answers ans
          JOIN attempt_items ai ON ai.id = ans.attempt_item_id
          WHERE ai.attempt_id = ${attempt!.id}) AS "commonAnswers",
        (SELECT score_0_100::text FROM assessment_attempts WHERE id = ${attempt!.id}) AS score,
        (SELECT question_version_id::text FROM attempt_items WHERE attempt_id = ${attempt!.id} LIMIT 1) AS "answerVersion",
        (SELECT unlocked_level_id::text FROM assessment_attempts WHERE id = ${attempt!.id}) AS "unlockedLevelId"`;
    assert.deepEqual(result, {
      variants: 2, versions: 2, pinned: 2, progress: 1, ready: 1,
      commonPackages: 1, commonItems: 2, commonAttempts: 1,
      commonAttemptItems: 1, commonAnswers: 1, score: '100.00',
      answerVersion: (await client<{ id: string }[]>`
        SELECT question_version_id AS id FROM drill_attempt_questions WHERE attempt_id = ${attempt!.id}`)[0]!.id,
      unlockedLevelId: null,
    });
    const [activeResult] = await client<{
      status: string; score: string | null; itemCount: number; answerCount: number; optionId: string;
    }[]>`
      SELECT aa.status::text, aa.score_0_100::text AS score,
        (SELECT count(*)::int FROM attempt_items WHERE attempt_id = aa.id) AS "itemCount",
        (SELECT count(*)::int FROM attempt_answers ans JOIN attempt_items ai ON ai.id = ans.attempt_item_id
          WHERE ai.attempt_id = aa.id) AS "answerCount",
        (SELECT ans.answer->>'optionId' FROM attempt_answers ans JOIN attempt_items ai ON ai.id = ans.attempt_item_id
          WHERE ai.attempt_id = aa.id LIMIT 1) AS "optionId"
      FROM assessment_attempts aa WHERE aa.id = ${active!.id}`;
    assert.deepEqual(activeResult, {
      status: 'IN_PROGRESS', score: null, itemCount: 2, answerCount: 1, optionId: 'A',
    });
    console.log('Legacy Drill package, completed/active attempts, answers and pinned versions survived the forward migration.');
  } finally {
    if (client) await client.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
    await rm(oldFolder, { recursive: true, force: true });
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

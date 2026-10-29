import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('Runtime repair guards on isolated PostgreSQL (TEST ONLY)', () => {
  let db: ReturnType<typeof postgres>;
  beforeAll(() => {
    if (
      !testUrl ||
      process.env.NODE_ENV !== 'test' ||
      !['localhost', '127.0.0.1'].includes(new URL(testUrl).hostname)
    )
      throw new Error('Isolated local PostgreSQL required.');
    db = postgres(testUrl, { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    await db?.end();
  });

  it('rejects a legacy transient cancellation atomically and still allows server restart cancellation', async () => {
    const [student] = await db`INSERT INTO users(auth_user_id,role,display_name,email)
      VALUES(${randomUUID()},'STUDENT','TEST ONLY',${randomUUID() + '@example.test'}) RETURNING id`;
    const [pack] =
      await db`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,is_demo)
      VALUES(${randomUUID()},1,'TEST ONLY','PVP',true) RETURNING id`;
    const [match] =
      await db`INSERT INTO pvp_matches(room_code,creator_student_id,package_id,difficulty,data_mode)
      VALUES(${randomUUID()},${student!.id},${pack!.id},'easy','demo') RETURNING id`;
    await db`INSERT INTO pvp_players(match_id,student_id,player_slot) VALUES(${match!.id},${student!.id},1)`;
    await expect(
      db.begin(async (tx) => {
        await tx`DELETE FROM pvp_active_rooms WHERE match_id=${match!.id}`;
        await tx`UPDATE pvp_matches SET status='CANCELLED',end_reason='SERVICE_INTERRUPTED' WHERE id=${match!.id}`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
    expect((await db`SELECT status FROM pvp_matches WHERE id=${match!.id}`)[0]!.status).toBe(
      'WAITING',
    );
    expect(await db`SELECT * FROM pvp_active_rooms WHERE match_id=${match!.id}`).toHaveLength(1);
    await db`UPDATE pvp_matches SET status='CANCELLED',end_reason='SERVER_RESTARTED' WHERE id=${match!.id}`;
    expect(await db`SELECT * FROM pvp_active_rooms WHERE match_id=${match!.id}`).toHaveLength(0);
  });

  it.each([
    { partial: true, xp: 3.333333, rejected: 3.333334 },
    { partial: false, xp: 4, rejected: 3.333333 },
  ])('preserves partial=$partial policy XP and ledger immutability', async ({partial,xp,rejected}) => {
    const [student] = await db`INSERT INTO users(auth_user_id,role,display_name,email)
      VALUES(${randomUUID()},'STUDENT','TEST ONLY',${randomUUID() + '@example.test'}) RETURNING id`;
    const [pack] =
      await db`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,is_demo)
      VALUES(${randomUUID()},1,'TEST ONLY','TRYOUT',true) RETURNING id`;
    const [family] = await db`INSERT INTO questions(usage_type) VALUES('TRYOUT') RETURNING id`;
    const [variant] = await db`INSERT INTO question_variants(question_id,variant_code,kind,origin)
      VALUES(${family!.id},${randomUUID()},'ORIGINAL','TEST') RETURNING id`;
    const [rubric] =
      await db`INSERT INTO scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest)
      VALUES(${randomUUID()},1,'CATEGORY',3,'{"testOnly":true}','TEST ONLY') RETURNING id`;
    const [version] =
      await db`INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,scoring_rubric_version_id)
      VALUES(${variant!.id},1,'CATEGORY','{"text":"TEST ONLY"}','[]','{}','{"text":"TEST ONLY"}',${rubric!.id}) RETURNING id`;
    const [item] =
      await db`INSERT INTO package_items(package_id,question_version_id,display_order,max_points)
      VALUES(${pack!.id},${version!.id},1,3) RETURNING id`;
    const [attempt] =
      await db`INSERT INTO assessment_attempts(student_id,package_id,assessment_type,status,finished_at,tryout_xp_policy_version,scoring_policy_version_id)
      VALUES(${student!.id},${pack!.id},'TRYOUT','IN_PROGRESS',null,1,
      CASE WHEN ${partial} THEN (SELECT id FROM scoring_policy_versions WHERE policy_code='TRYOUT_PGK_PARTIAL_V1' AND version=1) ELSE null END) RETURNING id`;
    const [attemptItem] =
      await db`INSERT INTO attempt_items(attempt_id,package_id,package_item_id,question_version_id,display_order,max_points)
      VALUES(${attempt!.id},${pack!.id},${item!.id},${version!.id},1,3) RETURNING id`;
    await db`INSERT INTO attempt_answers(attempt_item_id,answer,awarded_points,graded_at,score_category,fully_correct,response_state)
      VALUES(${attemptItem!.id},'{"categoryByStatementId":{}}',1,now(),1,false,'RESPONDED')`;
    await db`UPDATE assessment_attempts SET status='GRADED',finished_at=now() WHERE id=${attempt!.id}`;
    const reward = (
      xp: number,
    ) => db`INSERT INTO xp_ledger(student_id,source_type,attempt_id,xp_amount,policy_code,policy_version,base_xp,bonus_xp,occurred_at)
      VALUES(${student!.id},'TRYOUT',${attempt!.id},${xp},'TRYOUT_PRD_V06',1,${xp},0,(SELECT finished_at FROM assessment_attempts WHERE id=${attempt!.id})) RETURNING id,xp_amount`;
    await expect(reward(rejected)).rejects.toMatchObject({ code: '23514' });
    const [posted] = await reward(xp);
    expect(Number(posted!.xp_amount)).toBe(xp);
    await expect(db`UPDATE xp_ledger SET xp_amount=4 WHERE id=${posted!.id}`).rejects.toMatchObject(
      { code: '23514' },
    );
    await expect(db`DELETE FROM xp_ledger WHERE id=${posted!.id}`).rejects.toMatchObject({
      code: '23514',
    });
  });
});

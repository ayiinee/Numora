import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';

/** TEST ONLY academic evidence. No fixture policy is a production default. */
export async function tryoutMeasurementFixture(
  owner: Sql,
  main: Sql,
  compute: Sql,
  options: {
    partial?: boolean;
    empty?: boolean;
    unanswered?: boolean;
    lateGrading?: boolean;
    lateSaved?: boolean;
  } = {},
) {
  const key = randomUUID(),
    partial = options.partial ?? false;
  const [actor] = await owner<
    { id: string }[]
  >`INSERT INTO users(auth_user_id,role,admin_role,display_name,email) VALUES(${randomUUID()},'ADMIN','CONTENT_DATA_MODERATION','TEST reviewer',${key + '@example.test'}) RETURNING id`;
  const [student] = await owner<
    { id: string }[]
  >`INSERT INTO users(auth_user_id,role,display_name,email) VALUES(${randomUUID()},'STUDENT','Private fixture name',${'student-' + key + '@example.test'}) RETURNING id`;
  const [teacher] = await owner<
    { id: string }[]
  >`INSERT INTO users(auth_user_id,role,display_name,email) VALUES(${randomUUID()},'TEACHER','TEST teacher',${'teacher-' + key + '@example.test'}) RETURNING id`;
  const [chapter] = await owner<
    { id: string }[]
  >`INSERT INTO chapters(code,slug,name,display_order) VALUES(${key},${key},'TEST chapter',${parseInt(key.slice(0, 8), 16) % 2000000000}) RETURNING id`;
  const [sub] = await owner<
    { id: string }[]
  >`INSERT INTO subchapters(chapter_id,code,slug,name,display_order) VALUES(${chapter!.id},${key},${key},'TEST subchapter',1) RETURNING id`;
  const [competency] = await owner<
    { id: string }[]
  >`INSERT INTO competencies(subchapter_id,code,description) VALUES(${sub!.id},${key},'TEST competency') RETURNING id`;
  const [family] = await owner<
    { id: string }[]
  >`INSERT INTO questions(primary_competency_id) VALUES(${competency!.id}) RETURNING id`;
  const [variant] = await owner<
    { id: string }[]
  >`INSERT INTO question_variants(question_id,variant_code,kind,origin) VALUES(${family!.id},'O','ORIGINAL','TEST') RETURNING id`;
  const [rubric] = await owner<
    { id: string }[]
  >`INSERT INTO scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest,status,approved_by_user_id,approved_at)
    VALUES(${key},1,${partial ? 'CATEGORY' : 'SINGLE_CHOICE'},${partial ? 3 : 1},'{"fixture":true}','TEST','SEALED',${actor!.id},now()) RETURNING id`;
  const [version] = await owner<
    { id: string }[]
  >`INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,difficulty,scoring_rubric_version_id,content_status,reviewed_by_user_id,reviewed_at)
    VALUES(${variant!.id},1,${partial ? 'CATEGORY' : 'SINGLE_CHOICE'},'{"text":"TEST question"}','[{"id":"A","content":{"text":"A"}},{"id":"B","content":{"text":"B"}}]','{"optionId":"A"}','{"text":"PRIVATE explanation"}','TEST',${rubric!.id},'READY',${actor!.id},now()) RETURNING id`;
  const [policy] = await owner<
    { id: string }[]
  >`INSERT INTO scoring_policy_versions(policy_code,version,configuration) VALUES(${key},1,'{"fixture":true}') RETURNING id`;
  const [pack] = await owner<
    { id: string }[]
  >`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,scoring_policy_version_id) VALUES(${key},1,'TEST ONLY package','TRYOUT',${policy!.id}) RETURNING id`;
  const [pi] = await owner<
    { id: string }[]
  >`INSERT INTO package_items(package_id,question_version_id,display_order,max_points) VALUES(${pack!.id},${version!.id},1,${partial ? 6 : 1}) RETURNING id`;
  await owner`UPDATE assessment_packages SET frozen_at=now() WHERE id=${pack!.id}`;
  const [batch] = await main<
    { id: string }[]
  >`INSERT INTO tryout_batches(package_id,starts_at,closes_at,cutoff_at,result_due_at,status,release_policy,release_policy_digest)
    VALUES(${pack!.id},now()-interval '3 days',now()-interval '2 days',now()-interval '1 day',now()+interval '1 day','CLOSED','{"fixture":true}','TEST-release') RETURNING id`;
  const [context] = await main<
    { id: string }[]
  >`INSERT INTO measurement_contexts(ecosystem,dimension,tryout_batch_id,scale_code) VALUES('TRYOUT','TEST-global',${batch!.id},${key}) RETURNING id`;
  const pins: { approvalId: string; digest: string }[] = [];
  let quality = '';
  for (const kind of ['IRT_MODEL', 'QUALITY_GATE']) {
    const [p] = await compute<
      { id: string; digest: string }[]
    >`INSERT INTO irt_compute.technical_policy_versions(code,version,kind,definition,digest,status) VALUES(${key + kind},1,${kind},'{"fixture":true}','TEST','SEALED') RETURNING id,digest`;
    const [approval] = await main<
      { id: string }[]
    >`INSERT INTO configuration_approvals(technical_policy_version_id,approved_digest,scope,approved_by_user_id,approved_at) VALUES(${p!.id},${p!.digest},${JSON.stringify({ ecosystem: 'TRYOUT', contextId: context!.id })}::text::jsonb,${actor!.id},now()) RETURNING id`;
    pins.push({ approvalId: approval!.id, digest: p!.digest });
    if (kind === 'QUALITY_GATE') quality = p!.id;
  }
  const [principal] = await owner<
    { id: string }[]
  >`INSERT INTO service_principals(code,enabled) VALUES(${key},true) RETURNING id`;
  let attemptId = '',
    itemId = '';
  if (!options.empty) {
    const [a] = await main<
      { id: string }[]
    >`INSERT INTO assessment_attempts(student_id,package_id,assessment_type,scoring_policy_version_id,started_at) VALUES(${student!.id},${pack!.id},'TRYOUT',${policy!.id},now()-interval '2 days') RETURNING id`;
    const [i] = await main<
      { id: string }[]
    >`INSERT INTO attempt_items(attempt_id,package_id,package_item_id,question_version_id,display_order,max_points) VALUES(${a!.id},${pack!.id},${pi!.id},${version!.id},1,${partial ? 6 : 1}) RETURNING id`;
    if (!options.unanswered)
      await main`INSERT INTO attempt_answers(attempt_item_id,answer,saved_at,awarded_points,graded_at,score_category,fully_correct,response_state)
      VALUES(${i!.id},'{"optionId":"A"}',CASE WHEN ${options.lateSaved ?? false} THEN now() ELSE now()-interval '30 hours' END,${partial ? 4 : 1},CASE WHEN ${options.lateGrading ?? false} THEN now() ELSE now()-interval '30 hours' END,${partial ? 2 : 1},${!partial},'RESPONDED')`;
    if (options.lateGrading)
      await main`UPDATE assessment_attempts SET deadline_at=(SELECT cutoff_at FROM tryout_batches WHERE id=${batch!.id}) WHERE id=${a!.id}`;
    await main`UPDATE assessment_attempts SET status=${options.unanswered ? 'SUBMITTED' : 'GRADED'},finished_at=CASE WHEN ${options.lateGrading ?? false} THEN now() ELSE now()-interval '30 hours' END,raw_points=${options.unanswered ? null : partial ? 4 : 1},score_0_100=${options.unanswered ? null : 100} WHERE id=${a!.id}`;
    attemptId = a!.id;
    itemId = i!.id;
  }
  return {
    actor: actor!.id,
    student: student!.id,
    teacher: teacher!.id,
    packageId: pack!.id,
    contextId: context!.id,
    batchId: batch!.id,
    versionId: version!.id,
    rubricId: rubric!.id,
    principal: principal!.id,
    quality,
    pins,
    attemptId,
    itemId,
    partial,
  };
}

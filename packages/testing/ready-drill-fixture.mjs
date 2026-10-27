import { randomUUID } from 'node:crypto';

export function assertReadyDrillTarget(client, target, nodeEnv = process.env.NODE_ENV) {
  const url = new URL(target);
  const hosts = client.options.host;
  if (
    nodeEnv !== 'test' ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/numora_test_[a-z0-9_]+$/.test(url.pathname) ||
    client.options.database !== url.pathname.slice(1) ||
    !Array.isArray(hosts) ||
    !hosts.every((host) => ['localhost', '127.0.0.1'].includes(host))
  )
    throw new Error('READY_DRILL_FIXTURE_LOCAL_TARGET_REQUIRED');
}

/** Synthetic test versions only. Keep immutable bootstrap content and original packages. */
export async function seedReadyDrillFixture(client, { reviewerId, levelIds, testDatabaseUrl }) {
  assertReadyDrillTarget(client, testDatabaseUrl);
  return client.begin(async (tx) => {
    const [policy] =
      await tx`select id from scoring_policy_versions where policy_code='DRILL_PRD_V06' and version=1 and status='PUBLISHED'`;
    if (!policy) throw new Error('DRILL_POLICY_FIXTURE_MISSING');
    const versions = [];
    for (let i = 0; i < 10; i++) {
      const sourceId = '00000000-0000-4000-8000-' + String(301 + i * 2).padStart(12, '0');
      const [source] = await tx`select * from question_versions where id=${sourceId}`;
      if (!source) throw new Error('DEMO_QUESTION_FIXTURE_MISSING');
      const [latest] =
        await tx`select max(version_number)::integer as n from question_versions where variant_id=${source.variant_id}`;
      const id = randomUUID();
      await tx`insert into question_versions(id,variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,difficulty,content_status,reviewed_by_user_id,reviewed_at)
        values(${id},${source.variant_id},${latest.n + 1},${source.question_type},${tx.json(source.stem)},${tx.json(source.options_or_statements)},${tx.json(source.answer_key)},${tx.json(source.explanation)},${source.difficulty},'READY',${reviewerId},now())`;
      versions.push(id);
    }
    await tx`update assessment_packages set status='ARCHIVED' where level_id=any(${levelIds}::uuid[]) and status='PUBLISHED'`;
    const packages = [];
    for (const level of levelIds) {
      const id = randomUUID();
      await tx`insert into assessment_packages(id,family_code,package_version,name,assessment_type,chapter_id,level_id,variant_index,is_demo,scoring_policy_version_id,release_at,status)
        values(${id},${'QA-' + id},1,'TEST ONLY READY Drill','DRILL','00000000-0000-4000-8000-000000000100',${level},1,true,${policy.id},now(),'PUBLISHED')`;
      for (let i = 0; i < versions.length; i++)
        await tx`insert into package_items(package_id,question_version_id,display_order,max_points) values(${id},${versions[i]},${i + 1},1)`;
      packages.push(id);
    }
    return { versions, packages };
  });
}

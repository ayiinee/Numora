import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateIntegratedDatabase } from './integrated-migrations.js';
import { inspectSchema } from './schema-compatibility.js';
import {
  acceptComputeExecution,
  claimComputeExecution,
  createAnalysisRequest,
  finishComputeExecution,
  heartbeatComputeExecution,
  writeComputeArtifact,
} from './measurement-handoff.js';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('variant/IRT persistence and role boundaries', { timeout: 60000 }, () => {
  let owner: ReturnType<typeof postgres>;
  let main: ReturnType<typeof postgres>;
  let compute: ReturnType<typeof postgres>;
  let admin: ReturnType<typeof postgres>;
  const suffix = randomUUID().replaceAll('-', '');
  const databaseName = `numora_measurement_${suffix}`;
  const mainLogin = `test_main_${suffix}`;
  const computeLogin = `test_compute_${suffix}`;

  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(url.hostname))
      throw new Error('Only an isolated local test database is permitted.');
    admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    owner = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await migrateIntegratedDatabase(owner, resolve('drizzle'));
    const mainPassword = randomUUID();
    const computePassword = randomUUID();
    await admin.unsafe(
      `CREATE ROLE "${mainLogin}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${mainPassword}'`,
    );
    await admin.unsafe(
      `CREATE ROLE "${computeLogin}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${computePassword}'`,
    );
    await admin.unsafe(`GRANT numora_main_runtime TO "${mainLogin}"`);
    await admin.unsafe(`GRANT numora_irt_runtime TO "${computeLogin}"`);
    url.username = mainLogin;
    url.password = mainPassword;
    main = postgres(url.toString(), { max: 1, onnotice: () => {} });
    url.username = computeLogin;
    url.password = computePassword;
    compute = postgres(url.toString(), { max: 1, onnotice: () => {} });
  }, 60_000);
  afterAll(async () => {
    await Promise.all([owner?.end(), main?.end(), compute?.end()]);
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.unsafe(`DROP ROLE IF EXISTS "${mainLogin}"`);
      await admin.unsafe(`DROP ROLE IF EXISTS "${computeLogin}"`);
      await admin.end();
    }
  }, 60_000);

  async function fixture(partial = false, type: 'DRILL' | 'TRYOUT' = 'DRILL') {
    const key = randomUUID();
    const [actor] =
      await owner`INSERT INTO users(auth_user_id,role,display_name,email) VALUES(${randomUUID()},'ADMIN','Test reviewer',${key + '@example.test'}) RETURNING id`;
    const [student] =
      await owner`INSERT INTO users(auth_user_id,role,display_name,email) VALUES(${randomUUID()},'STUDENT','Private name',${'student-' + key + '@example.test'}) RETURNING id`;
    const [chapter] =
      await owner`INSERT INTO chapters(code,slug,name,display_order) VALUES(${key},${key},'Test chapter',${parseInt(key.slice(0, 8), 16) % 2000000000}) RETURNING id`;
    const [subchapter] =
      await owner`INSERT INTO subchapters(chapter_id,code,slug,name,display_order) VALUES(${chapter!.id},${key},${key},'Test subchapter',1) RETURNING id`;
    const [level] =
      await owner`INSERT INTO levels(subchapter_id,level_number) VALUES(${subchapter!.id},1) RETURNING id`;
    const [competency] =
      await owner`INSERT INTO competencies(subchapter_id,code,description) VALUES(${subchapter!.id},${key},'Test competency') RETURNING id`;
    const [family] =
      await owner`INSERT INTO questions(primary_competency_id) VALUES(${competency!.id}) RETURNING id`;
    const [variant] =
      await owner`INSERT INTO question_variants(question_id,variant_code,kind,origin) VALUES(${family!.id},'O','ORIGINAL','TEST') RETURNING id`;
    const [rubric] =
      await owner`INSERT INTO scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest,status,approved_by_user_id,approved_at)
      VALUES(${key},1,${partial ? 'CATEGORY' : 'SINGLE_CHOICE'},${partial ? 3 : 1},'{"fixture":true}','TEST-rubric','SEALED',${actor!.id},now()) RETURNING id`;
    const [version] =
      await owner`INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,difficulty,scoring_rubric_version_id,content_status,reviewed_by_user_id,reviewed_at)
      VALUES(${variant!.id},1,${partial ? 'CATEGORY' : 'SINGLE_CHOICE'},'{}','[]','{}','{}','TEST',${rubric!.id},'READY',${actor!.id},now()) RETURNING id`;
    const [policy] =
      await owner`INSERT INTO scoring_policy_versions(policy_code,version,configuration) VALUES(${key},1,'{"fixture":true}') RETURNING id`;
    const [pack] =
      await owner`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,level_id,scoring_policy_version_id)
      VALUES(${key},1,'TEST package',${type},${type === 'DRILL' ? level!.id : null},${policy!.id}) RETURNING id`;
    const [packageItem] =
      await owner`INSERT INTO package_items(package_id,question_version_id,display_order,max_points) VALUES(${pack!.id},${version!.id},1,${partial ? 6 : 1}) RETURNING id`;
    const [attempt] =
      await owner`INSERT INTO assessment_attempts(student_id,package_id,assessment_type,level_id_at_start,scoring_policy_version_id)
      VALUES(${student!.id},${pack!.id},${type},${type === 'DRILL' ? level!.id : null},${policy!.id}) RETURNING id`;
    const [item] =
      await owner`INSERT INTO attempt_items(attempt_id,package_id,package_item_id,question_version_id,display_order,max_points)
      VALUES(${attempt!.id},${pack!.id},${packageItem!.id},${version!.id},1,${partial ? 6 : 1}) RETURNING id`;
    const [context] =
      type === 'DRILL'
        ? await owner`INSERT INTO measurement_contexts(ecosystem,dimension,level_id,scale_code) VALUES('DRILL','TEST-local',${level!.id},${key}) RETURNING id`
        : await owner`WITH b AS (INSERT INTO tryout_batches(package_id,starts_at,closes_at,cutoff_at,result_due_at,status,release_policy,release_policy_digest)
        VALUES(${pack!.id},now()-interval '2 days',now()-interval '1 day',now()-interval '1 day',now()+interval '2 days','CLOSED','{"fixture":true}','TEST-release') RETURNING id)
        INSERT INTO measurement_contexts(ecosystem,dimension,tryout_batch_id,scale_code) SELECT 'TRYOUT','TEST-global',id,${key} FROM b RETURNING id`;
    const [quality] =
      await compute`INSERT INTO irt_compute.technical_policy_versions(code,version,kind,definition,digest,status) VALUES(${key},1,'QUALITY_GATE','{"fixture":true}','TEST-quality','SEALED') RETURNING id,digest`;
    const [approval] =
      await main`INSERT INTO configuration_approvals(technical_policy_version_id,approved_digest,scope,approved_by_user_id,approved_at)
      VALUES(${quality!.id},${quality!.digest},${JSON.stringify({ ecosystem: type, contextId: context!.id })}::text::jsonb,${actor!.id},now()) RETURNING id`;
    const [principal] =
      await owner`INSERT INTO service_principals(code,enabled) VALUES(${key},true) RETURNING id`;
    return {
      actor: actor!.id as string,
      student: student!.id as string,
      level: level!.id as string,
      family: family!.id as string,
      version: version!.id as string,
      rubric: rubric!.id as string,
      policy: policy!.id as string,
      package: pack!.id as string,
      item: item!.id as string,
      attempt: attempt!.id as string,
      context: context!.id as string,
      quality: quality!.id as string,
      approval: approval!.id as string,
      principal: principal!.id as string,
      qualityDigest: quality!.digest as string,
    };
  }
  async function freeze(f: Awaited<ReturnType<typeof fixture>>, eligible = true) {
    await owner`INSERT INTO attempt_answers(attempt_item_id,answer,awarded_points,graded_at) VALUES(${f.item},'{"optionId":"A"}',1,now())`;
    await owner`UPDATE assessment_attempts SET status='GRADED',finished_at=now(),raw_points=1,score_0_100=100 WHERE id=${f.attempt}`;
    const [snapshot] =
      await main`INSERT INTO response_snapshots(context_id,cutoff_at,policy,policy_digest,respondent_key_version)
      VALUES(${f.context},now(),'{"fixture":true}','TEST-policy','TEST-key-v1') RETURNING id`;
    await main`INSERT INTO response_snapshot_items(snapshot_id,respondent_id,attempt_id,attempt_item_id,question_version_id,rubric_version_id,raw_answer,score_category,maximum_score_category,fully_correct,awarded_points,max_points,response_state,operational_eligible,operational_exclusion_reasons,exposure_facts,completed_at)
      SELECT ${snapshot!.id},'TEST-pseudonym',a.id,i.id,i.question_version_id,i.rubric_version_id,ans.answer,ans.score_category,i.maximum_score_category,ans.fully_correct,ans.awarded_points,i.max_points,'RESPONDED',${eligible},${eligible ? '[]' : '["NOT_ELIGIBLE"]'}::text::jsonb,'{}',a.finished_at
      FROM assessment_attempts a JOIN attempt_items i ON i.attempt_id=a.id JOIN attempt_answers ans ON ans.attempt_item_id=i.id WHERE i.id=${f.item}`;
    await main`UPDATE response_snapshots SET status='FROZEN' WHERE id=${snapshot!.id}`;
    return snapshot!.id as string;
  }

  it('checks both schemas and restricts main/compute roles including compatibility views', async () => {
    expect((await inspectSchema(owner)).problems).toEqual([]);
    await expect(compute`SELECT email FROM public.users`).rejects.toMatchObject({ code: '42501' });
    await expect(
      compute`UPDATE public.assessment_attempts SET score_0_100=100`,
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      main`INSERT INTO irt_compute.generator_templates(code,version,definition,digest) VALUES('illegal',1,'{}','x')`,
    ).rejects.toMatchObject({ code: '42501' });
    await expect(main`UPDATE public.generator_configs SET parameters='{}'`).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      compute.unsafe('CREATE TABLE irt_compute.illegal(id integer)'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('separates weighted partial credit from categories and preserves final answers/content', async () => {
    const f = await fixture(true);
    await main`INSERT INTO attempt_answers(attempt_item_id,answer,awarded_points,score_category,fully_correct,response_state,graded_at)
      VALUES(${f.item},'{"fixture":"partial"}',4,2,false,'RESPONDED',now())`;
    const [answer] =
      await owner`SELECT score_category,awarded_points,fully_correct FROM attempt_answers WHERE attempt_item_id=${f.item}`;
    expect(answer).toEqual({ score_category: 2, awarded_points: '4.00', fully_correct: false });
    await expect(
      main`UPDATE attempt_answers SET score_category=4 WHERE attempt_item_id=${f.item}`,
    ).rejects.toMatchObject({ code: '23514' });
    await main`UPDATE assessment_attempts SET status='GRADED',finished_at=now() WHERE id=${f.attempt}`;
    await expect(
      main`UPDATE attempt_answers SET answer='{}' WHERE attempt_item_id=${f.item}`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      main`UPDATE question_versions SET explanation='{}'::jsonb || '{"changed":true}' WHERE id=${f.version}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('records whole issued payload idempotently and allows learning while invalidating reservation', async () => {
    const f = await fixture();
    const [study] =
      await owner`INSERT INTO trial_studies(context_id,original_question_version_id,requirements_policy_id,requirements_approval_id) VALUES(${f.context},${f.version},${f.quality},${f.approval}) RETURNING id`;
    const [cohort] =
      await owner`INSERT INTO trial_cohorts(study_id,role,period_starts_at,period_ends_at) VALUES(${study!.id},'AB',now(),now()+interval '1 day') RETURNING id`;
    const [member] =
      await owner`INSERT INTO trial_cohort_members(cohort_id,student_id,status) VALUES(${cohort!.id},${f.student},'ELIGIBLE') RETURNING id`;
    await owner`INSERT INTO trial_family_reservations(cohort_member_id,family_id) VALUES(${member!.id},${f.family})`;
    const first =
      await main`SELECT public.record_assessment_delivery(${f.attempt}::uuid,false) AS id`;
    expect(
      await main`SELECT public.record_assessment_delivery(${f.attempt}::uuid,false) AS id`,
    ).toEqual(first);
    const [count] =
      await owner`SELECT count(*)::int AS n FROM student_item_exposures WHERE student_id=${f.student}`;
    expect(count!.n).toBe(1);
    const [reservation] =
      await owner`SELECT invalidated_at,invalidating_exposure_id FROM trial_family_reservations WHERE cohort_member_id=${member!.id}`;
    expect(reservation!.invalidated_at).not.toBeNull();
    await expect(
      main`UPDATE trial_family_reservations SET invalidated_at=NULL,invalidating_exposure_id=NULL,reason=NULL WHERE cohort_member_id=${member!.id}`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      main`SELECT public.measurement_assert_trial_eligible(${f.student}::uuid,${f.package}::uuid)`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('freezes input, deduplicates requests, records scientific exclusion, and adopts only current execution', async () => {
    const f = await fixture();
    const snapshotId = await freeze(f, false);
    const input = {
      idempotencyKey: randomUUID(),
      requestType: 'MONITOR_PRODUCTION' as const,
      contextId: f.context,
      snapshotId,
      configurationPins: [{ approvalId: f.approval, digest: f.qualityDigest }],
    };
    const request = await createAnalysisRequest(main, input);
    expect(await createAnalysisRequest(main, input)).toEqual(request);
    await expect(createAnalysisRequest(main, { ...input, dueAt: new Date() })).rejects.toThrow(
      'IDEMPOTENCY_CONFLICT',
    );
    await expect(
      main`UPDATE response_snapshot_items SET operational_eligible=true WHERE snapshot_id=${snapshotId}`,
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      JSON.stringify(
        await compute`SELECT * FROM irt_input_responses_v3 WHERE snapshot_id=${snapshotId}`,
      ),
    ).not.toMatch(/Private name|@example.test/);
    const execution = await claimComputeExecution(compute, request.id, f.principal);
    expect(execution).not.toBeNull();
    expect(await claimComputeExecution(compute, request.id, f.principal)).toBeNull();
    const [dataset] =
      await compute`INSERT INTO irt_compute.analysis_datasets(execution_id,snapshot_id,selection_policy_id) VALUES(${execution!.id},${snapshotId},${f.quality}) RETURNING id`;
    const [row] =
      await compute`SELECT id FROM irt_input_responses_v3 WHERE snapshot_id=${snapshotId}`;
    await expect(
      compute`INSERT INTO irt_compute.analysis_response_selections(dataset_id,snapshot_id,snapshot_item_id,decision,reasons) VALUES(${dataset!.id},${snapshotId},${row!.id},'INCLUDE','[]')`,
    ).rejects.toMatchObject({ code: '23514' });
    await compute`INSERT INTO irt_compute.analysis_response_selections(dataset_id,snapshot_id,snapshot_item_id,decision,reasons) VALUES(${dataset!.id},${snapshotId},${row!.id},'EXCLUDE','["NOT_ELIGIBLE"]')`;
    await compute`UPDATE irt_compute.analysis_datasets SET status='SEALED' WHERE id=${dataset!.id}`;
    const artifact = await writeComputeArtifact(compute, {
      executionId: execution!.id,
      datasetId: dataset!.id,
      inputDigest: request.inputDigest,
      kind: 'MONITOR_PRODUCTION',
      scientificDecision: 'INSUFFICIENT',
      payload: { items: [] },
    });
    await expect(
      compute`UPDATE irt_compute.compute_outputs SET payload='{}' WHERE id=${artifact.id}`,
    ).rejects.toMatchObject({ code: '23514' });
    await finishComputeExecution(compute, execution!.id, execution!.fencingToken);
    expect(
      await acceptComputeExecution(main, request.id, execution!.id, request.inputDigest),
    ).toEqual({ requestId: request.id, executionId: execution!.id });
    await expect(
      heartbeatComputeExecution(compute, execution!.id, execution!.fencingToken),
    ).rejects.toThrow('STALE');
    expect(
      await acceptComputeExecution(main, request.id, execution!.id, request.inputDigest),
    ).toEqual({ requestId: request.id, executionId: execution!.id });
    const [events] =
      await owner`SELECT count(*)::int AS n FROM analytics_outbox WHERE entity_id=${request.id} AND event_name='analysis.requested'`;
    expect(events!.n).toBe(1);
  });

  it('keeps generated candidates private until their declared artifact is accepted and imported by main', async () => {
    const f = await fixture();
    const [config] =
      await compute`INSERT INTO irt_compute.generator_configs(template_or_competency_id,config_version,parameters,curriculum_limits,context_id,digest,status) VALUES(${randomUUID()},1,'{}','{}',${f.context},'TEST-config','SEALED') RETURNING id,digest`;
    const [approval] =
      await main`INSERT INTO configuration_approvals(generator_config_id,approved_digest,scope,approved_by_user_id,approved_at) VALUES(${config!.id},${config!.digest},${JSON.stringify({ ecosystem: 'DRILL', contextId: f.context })}::text::jsonb,${f.actor},now()) RETURNING id`;
    const [wave] =
      await main`INSERT INTO generation_waves(code,status,created_by_user_id,approved_at,constraints) VALUES(${randomUUID()},'APPROVED',${f.actor},now(),'{}') RETURNING id`;
    const [waveItem] =
      await main`INSERT INTO generation_wave_items(wave_id,original_question_version_id,context_id,generator_config_id,configuration_approval_id,target_count,max_regenerate_attempts,constraints) VALUES(${wave!.id},${f.version},${f.context},${config!.id},${approval!.id},1,0,'{}') RETURNING id`;
    const request = await createAnalysisRequest(main, {
      idempotencyKey: randomUUID(),
      requestType: 'GENERATE_VARIANTS',
      contextId: f.context,
      waveItemId: waveItem!.id,
      configurationPins: [{ approvalId: approval!.id, digest: config!.digest }],
    });
    await expect(
      main`UPDATE generation_wave_items SET target_count=2 WHERE id=${waveItem!.id}`,
    ).rejects.toMatchObject({ code: '23514' });
    const execution = await claimComputeExecution(compute, request.id, f.principal);
    const [run] =
      await compute`INSERT INTO irt_compute.generation_runs(config_id,original_question_version_id,wave_item_id,execution_id,generator_version,random_seed,parameter_values) VALUES(${config!.id},${f.version},${waveItem!.id},${execution!.id},'TEST','123','{}') RETURNING id`;
    const payload = {
      questionType: 'SINGLE_CHOICE',
      stem: { text: 'TEST generated' },
      optionsOrStatements: [],
      answerKey: {},
      explanation: {},
      media: [],
      difficulty: 'TEST',
      rubricVersionId: f.rubric,
      contentFingerprint: 'TEST',
    };
    const [candidate] =
      await compute`INSERT INTO irt_compute.generation_candidates(generation_run_id,parent_original_question_version_id,payload,random_seed,parameter_values,validation_status) VALUES(${run!.id},${f.version},${JSON.stringify(payload)}::text::jsonb,'123','{}','TEST') RETURNING id,payload_digest`;
    const [variant] =
      await main`INSERT INTO question_variants(question_id,variant_code,kind,origin,original_variant_id) VALUES(${f.family},'V1','VARIANT','TEST',(SELECT variant_id FROM question_versions WHERE id=${f.version})) RETURNING id`;
    const [version] =
      await main`INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,scoring_rubric_version_id,parent_original_question_version_id,content_fingerprint) VALUES(${variant!.id},1,'SINGLE_CHOICE','{"text":"TEST generated"}','[]','{}','{}','[]','TEST',${f.rubric},${f.version},'TEST') RETURNING id`;
    await expect(
      main`INSERT INTO candidate_imports(candidate_id,question_version_id,payload_digest,imported_by_user_id) VALUES(${candidate!.id},${version!.id},${candidate!.payload_digest},${f.actor})`,
    ).rejects.toMatchObject({ code: '23514' });
    await writeComputeArtifact(compute, {
      executionId: execution!.id,
      inputDigest: request.inputDigest,
      kind: 'GENERATE_VARIANTS',
      scientificDecision: 'CONTENT_VALID',
      payload: { candidateIds: [candidate!.id] },
    });
    await finishComputeExecution(compute, execution!.id, execution!.fencingToken);
    await acceptComputeExecution(main, request.id, execution!.id, request.inputDigest);
    await main`INSERT INTO candidate_imports(candidate_id,question_version_id,payload_digest,imported_by_user_id) VALUES(${candidate!.id},${version!.id},${candidate!.payload_digest},${f.actor})`;
    const [regular] =
      await main`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,level_id,scoring_policy_version_id) VALUES(${randomUUID()},1,'TEST generated package','DRILL',${f.level},${f.policy}) RETURNING id`;
    await main`INSERT INTO package_items(package_id,question_version_id,display_order,max_points) VALUES(${regular!.id},${version!.id},1,1)`;
    expect(
      (await main`SELECT package_can_distribute(${regular!.id}::uuid) AS ready`)[0]!.ready,
    ).toBe(false);
    await expect(
      compute`INSERT INTO irt_compute.generation_candidates(generation_run_id,parent_original_question_version_id,payload,random_seed,parameter_values,validation_status) VALUES(${run!.id},${f.version},${JSON.stringify(payload)}::text::jsonb,'124','{}','TEST')`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('copies approved 2PL evidence without imposing the legacy minimum or automatically activating it', async () => {
    const f = await fixture();
    const snapshotId = await freeze(f);
    const request = await createAnalysisRequest(main, {
      idempotencyKey: randomUUID(),
      requestType: 'CALIBRATE_ORIGINAL',
      contextId: f.context,
      snapshotId,
      configurationPins: [{ approvalId: f.approval, digest: f.qualityDigest }],
    });
    const execution = await claimComputeExecution(compute, request.id, f.principal);
    const [dataset] =
      await compute`INSERT INTO irt_compute.analysis_datasets(execution_id,snapshot_id,selection_policy_id) VALUES(${execution!.id},${snapshotId},${f.quality}) RETURNING id`;
    await compute`INSERT INTO irt_compute.analysis_response_selections(dataset_id,snapshot_id,snapshot_item_id,decision,reasons) SELECT ${dataset!.id},snapshot_id,id,'INCLUDE','[]' FROM irt_input_responses_v3 WHERE snapshot_id=${snapshotId}`;
    await compute`UPDATE irt_compute.analysis_datasets SET status='SEALED' WHERE id=${dataset!.id}`;
    // Synthetic TEST evidence only; this does not recommend a production sample threshold.
    const payload = {
      items: [
        {
          questionVersionId: f.version,
          rubricVersionId: f.rubric,
          modelFamily: '2PL',
          sampleSize: 1,
          eligibleRespondentCount: 1,
          discriminationA: 1.23456789,
          difficultyB: 0.2,
          measurementState: 'CALIBRATED',
          qualityEvidence: { fixture: true },
          steps: [],
        },
      ],
    };
    const artifact = await writeComputeArtifact(compute, {
      executionId: execution!.id,
      datasetId: dataset!.id,
      inputDigest: request.inputDigest,
      kind: 'CALIBRATE_ORIGINAL',
      scientificDecision: 'PASS',
      payload,
    });
    await finishComputeExecution(compute, execution!.id, execution!.fencingToken);
    await acceptComputeExecution(main, request.id, execution!.id, request.inputDigest);
    const [batch] =
      await main`INSERT INTO irt_batches(batch_kind,model_version,status,context_id,response_snapshot_id,analysis_request_id,source_output_id,output_snapshot) VALUES('DAILY','TEST-2PL','SUCCEEDED',${f.context},${snapshotId},${request.id},${artifact.id},${JSON.stringify(payload)}::text::jsonb) RETURNING id`;
    const [result] =
      await main`INSERT INTO irt_item_results(batch_id,question_version_id,sample_size,data_status,model_family,rubric_version_id,eligible_respondent_count,measurement_state,discrimination_a,difficulty_b,quality_evidence) VALUES(${batch!.id},${f.version},1,'SUFFICIENT','2PL',${f.rubric},1,'CALIBRATED',1.23456789,0.2,'{"fixture":true}') RETURNING id,discrimination_a,guessing_c`;
    expect(result!.discrimination_a).toBe('1.234568');
    expect(result!.guessing_c).toBeNull();
    await expect(
      main`INSERT INTO irt_item_step_parameters(item_result_id,step,value) VALUES(${result!.id},1,0.2)`,
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      await owner`SELECT id FROM active_parameter_bindings WHERE context_id=${f.context}`,
    ).toHaveLength(0);
    await expect(
      main`UPDATE irt_item_results SET difficulty_b=0.3 WHERE id=${result!.id}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('expires leases and rejects a stale worker after a replacement claims the same frozen input', async () => {
    const f = await fixture();
    const snapshotId = await freeze(f);
    const request = await createAnalysisRequest(main, {
      idempotencyKey: randomUUID(),
      requestType: 'MONITOR_PRODUCTION',
      contextId: f.context,
      snapshotId,
      configurationPins: [{ approvalId: f.approval, digest: f.qualityDigest }],
    });
    const first = await claimComputeExecution(compute, request.id, f.principal, 1);
    await owner`SELECT pg_sleep(1.1)`;
    const replacement = await claimComputeExecution(compute, request.id, f.principal);
    expect(replacement!.attemptNumber).toBe(2);
    expect(replacement!.fencingToken).not.toBe(first!.fencingToken);
    await expect(
      heartbeatComputeExecution(compute, first!.id, first!.fencingToken),
    ).rejects.toThrow('STALE');
    await expect(
      writeComputeArtifact(compute, {
        executionId: first!.id,
        inputDigest: request.inputDigest,
        kind: 'MONITOR_PRODUCTION',
        scientificDecision: 'INSUFFICIENT',
        payload: {},
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      acceptComputeExecution(main, request.id, first!.id, request.inputDigest),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('blocks opening an A/B phase without frozen packages and approved baseline/reference evidence', async () => {
    const f = await fixture();
    const [study] =
      await main`INSERT INTO trial_studies(context_id,original_question_version_id,requirements_policy_id,requirements_approval_id) VALUES(${f.context},${f.version},${f.quality},${f.approval}) RETURNING id`;
    const [blueprint] =
      await main`INSERT INTO assessment_blueprint_versions(code,version,definition,digest) VALUES(${randomUUID()},1,'{}','TEST') RETURNING id`;
    const [phase] =
      await main`INSERT INTO trial_phases(study_id,purpose,blueprint_version_id,operational_policy,operational_policy_digest) VALUES(${study!.id},'VARIANT_AB',${blueprint!.id},'{}','TEST') RETURNING id`;
    await expect(
      main`UPDATE trial_phases SET status='OPEN',opens_at=now(),cutoff_at=now()+interval '1 day' WHERE id=${phase!.id}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('publishes one immutable common Tryout finalization without synthetic fallback theta', async () => {
    const f = await fixture(false, 'TRYOUT');
    await freeze(f);
    const [batch] =
      await owner`SELECT tryout_batch_id AS id FROM measurement_contexts WHERE id=${f.context}`;
    const [finalization] =
      await main`INSERT INTO tryout_result_finalizations(batch_id,version,mode,scoring_policy_version_id,policy_snapshot,digest) VALUES(${batch!.id},1,'FALLBACK',${f.policy},'{"fixture":true}','TEST-result') RETURNING id`;
    await expect(
      main`UPDATE tryout_result_finalizations SET published_at=now() WHERE id=${finalization!.id}`,
    ).rejects.toMatchObject({ code: '23514' });
    await main`INSERT INTO tryout_finalization_items(finalization_id,question_version_id,included,max_points,reason) VALUES(${finalization!.id},${f.version},true,1,'TEST-valid')`;
    await expect(
      main`INSERT INTO tryout_attempt_results(finalization_id,attempt_id,score,theta,coverage) VALUES(${finalization!.id},${f.attempt},100,1,'{}')`,
    ).rejects.toMatchObject({ code: '23514' });
    await main`INSERT INTO tryout_attempt_results(finalization_id,attempt_id,score,raw_points,maximum_points,rank,coverage) VALUES(${finalization!.id},${f.attempt},100,1,1,1,'{}')`;
    await main`UPDATE tryout_result_finalizations SET published_at=now() WHERE id=${finalization!.id}`;
    await expect(
      main`UPDATE tryout_attempt_results SET score=500 WHERE finalization_id=${finalization!.id}`,
    ).rejects.toMatchObject({ code: '23514' });
    const [state] = await owner`SELECT status FROM tryout_batches WHERE id=${batch!.id}`;
    expect(state!.status).toBe('PUBLISHED');
  });
});

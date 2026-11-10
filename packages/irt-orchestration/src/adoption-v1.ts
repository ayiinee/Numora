/* eslint-disable @typescript-eslint/no-explicit-any -- shared validator checks scientific JSON at this boundary. */
import type { Sql, TransactionSql } from 'postgres';
// @ts-expect-error Shared JavaScript contract validator has no TypeScript declaration.
import { validateResult } from '../../contracts/irt-calibration-v1/validate.mjs';

type JsonObject = Record<string, any>;
const fail = (code: string): never => { throw new Error(code); };

export function validateV1ArtifactShape(payload: JsonObject, input: JsonObject, execution: { executionId: string; dispatchGeneration: number }) {
  validateResult(payload, input, execution);
  if (input.ecosystem !== 'TRYOUT' || payload.executionStatus !== 'SUCCEEDED' || !payload.outcome)
    fail('IRT_V1_ARTIFACT_NOT_SUCCEEDED');
  return { attempts: new Set<string>(payload.outcome.respondents.map((r: JsonObject) => r.attemptId)) };
}

/** Re-check frozen identity, current fencing, approval and byte commitment before adoption. */
export async function loadVerifiedTryoutArtifactV1(tx: TransactionSql, requestId: string) {
  const [source] = await tx<JsonObject[]>`
    SELECT id::text,snapshot_id::text,input_digest,body,payload,cancelled,approvals_valid,current_generation
    FROM public.irt_calibration_inputs_v1 WHERE id=${requestId}`;
  if (!source) throw new Error('IRT_V1_REQUEST_NOT_FOUND');
  if (source.cancelled || !source.approvals_valid) fail('IRT_V1_AUTHORIZATION_STALE');
  await tx`SELECT id FROM public.configuration_approvals WHERE id IN
    (SELECT (value#>>'{ref,approvalId}')::uuid FROM public.irt_calibration_requests_v1 r, jsonb_each(r.resources) WHERE r.id=${requestId}) FOR SHARE`;
  const [job] = await tx<JsonObject[]>`
    SELECT j.id::text AS job_id,j.execution_id::text,j.status,j.generation,a.id::text AS artifact_id,a.digest AS artifact_digest,a.payload,
      a.digest=irt_compute.payload_digest(jsonb_build_object('payload',a.payload,'diagnostics',a.diagnostics,'runtime',r.runtime_profile)) AS digest_valid
    FROM irt_compute.calibration_jobs_v1 j JOIN public.irt_calibration_requests_v1 r ON r.id=j.request_id
    JOIN irt_compute.calibration_artifacts_v1 a ON a.job_id=j.id
    WHERE j.request_id=${requestId} AND j.generation=${source.current_generation} AND j.status IN ('SUCCEEDED','FAILED')`;
  if (!job) return { source, job: null };
  if (!job.digest_valid) fail('IRT_V1_ARTIFACT_DIGEST_INVALID');
  validateResult(job.payload, source.payload, { executionId: job.execution_id, dispatchGeneration: job.generation });
  return { source, job };
}

/** Main-only adoption: no publication, canonical respondent grades, or XP. */
export async function adoptTryoutArtifactV1(client: Sql, requestId: string) {
  return client.begin(async (tx: TransactionSql) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}::text,61))`;
    await tx`SELECT id FROM public.irt_calibration_requests_v1 WHERE id=${requestId} FOR SHARE`;
    const { source, job } = await loadVerifiedTryoutArtifactV1(tx, requestId);
    if (!job || job.status !== 'SUCCEEDED') return { requestId, adopted: false, status: job?.status ?? 'PENDING' };
    const { attempts } = validateV1ArtifactShape(job.payload, source.payload, { executionId: job.execution_id, dispatchGeneration: job.generation });
    const [existing] = await tx<JsonObject[]>`SELECT id::text,status,artifact_digest,batch_id::text FROM public.irt_artifact_adoption_receipts_v1 WHERE request_id=${requestId} FOR UPDATE`;
    if (existing?.status === 'ADOPTED') {
      if (existing.artifact_digest !== job.artifact_digest) fail('IRT_V1_ADOPTION_CONFLICT');
      return { requestId, adopted: true, receiptId: existing.id, batchId: existing.batch_id, replay: true };
    }
    const snapshot = await tx<{ attempt_id: string }[]>`SELECT DISTINCT attempt_id::text FROM public.response_snapshot_items WHERE snapshot_id=${source.snapshot_id}`;
    const expected = new Set(snapshot.map(r => r.attempt_id));
    if (!expected.size || expected.size !== attempts.size || [...expected].some(id => !attempts.has(id))) fail('IRT_V1_ATTEMPT_COVERAGE_INVALID');
    const [receipt] = await tx<JsonObject[]>`
      INSERT INTO public.irt_artifact_adoption_receipts_v1(request_id,execution_id,artifact_id,artifact_digest,status)
      VALUES(${requestId},${job.execution_id},${job.artifact_id},${job.artifact_digest},'RECEIVED')
      ON CONFLICT(request_id) DO UPDATE SET execution_id=excluded.execution_id,artifact_id=excluded.artifact_id,artifact_digest=excluded.artifact_digest,status='RECEIVED',failure_code=NULL
      WHERE irt_artifact_adoption_receipts_v1.status='FAILED' RETURNING id::text`;
    if (!receipt) throw new Error('IRT_V1_ADOPTION_CONFLICT');
    const original = source.body.packages.find((p: JsonObject) => p.armKind === 'ORIGINAL');
    if (!original) fail('IRT_V1_ORIGINAL_REQUIRED');
    const [batch] = await tx<JsonObject[]>`
      INSERT INTO public.irt_batches(package_id,batch_kind,model_version,status,finished_at,context_id,response_snapshot_id,output_snapshot,output_digest,source_request_id,source_execution_id,source_calibration_artifact_id,adoption_receipt_id)
      VALUES(${original.packageId},'TRYOUT_V1','irt-calibration-v1','SUCCEEDED',clock_timestamp(),${source.body.context.contextId},${source.snapshot_id},${JSON.stringify(job.payload)}::jsonb,${job.artifact_digest},${requestId},${job.execution_id},${job.artifact_id},${receipt.id}) RETURNING id::text`;
    for (const pkg of source.body.packages) {
      const [manifest] = await tx<JsonObject[]>`SELECT manifest_digest FROM public.assessment_packages WHERE id=${pkg.packageId} AND package_version=${pkg.packageVersion}`;
      if (!manifest?.manifest_digest) fail('IRT_V1_PACKAGE_MANIFEST_MISSING');
      await tx`INSERT INTO public.irt_artifact_adoption_packages_v1(receipt_id,package_id,package_version,arm_id,arm_kind,manifest_digest)
        VALUES(${receipt.id},${pkg.packageId},${pkg.packageVersion},${pkg.armId},${pkg.armKind},${manifest!.manifest_digest})`;
    }
    const people = new Map<string, JsonObject>(source.body.respondents.map((r: JsonObject) => [r.attemptId, r]));
    for (const r of job.payload.outcome.respondents) {
      const pin = people.get(r.attemptId)!;
      await tx`INSERT INTO public.irt_artifact_adoption_attempts_v1(receipt_id,attempt_id,respondent_id,package_id,package_version,assigned_arm_id,delivered_arm_id,result_status,reason_codes,result_snapshot)
        VALUES(${receipt.id},${r.attemptId},${r.respondentId},${r.packageId},${r.packageVersion},${pin.assignedArmId},${pin.deliveredArmId},${r.status},${JSON.stringify(r.reasonCodes)}::jsonb,${JSON.stringify(r)}::jsonb)`;
    }
    for (const item of job.payload.outcome.items) {
      // Total valid frozen observations, separate from calibration eligibility; never infer fitted N.
      const total = source.body.responses.filter((r: JsonObject) => r.questionVersionId === item.questionVersionId && ['RESPONDED','OMITTED'].includes(r.responseState)).length;
      const p = item.parameters;
      const [result] = await tx<JsonObject[]>`
        INSERT INTO public.irt_item_results(batch_id,question_version_id,sample_size,data_status,discrimination_a,difficulty_b,model_family,rubric_version_id,eligible_respondent_count,measurement_state,quality_evidence)
        VALUES(${batch!.id},${item.questionVersionId},${total},${p ? 'SUFFICIENT' : 'NOT_ENOUGH_DATA'},${p?.discriminationA ?? null},${p?.difficultyB ?? null},${item.modelFamily},${item.rubricVersionId},${item.eligibleRespondentCount},${item.measurementState},${JSON.stringify(item.quality)}::jsonb) RETURNING id`;
      for (const step of p?.steps ?? []) await tx`INSERT INTO public.irt_item_step_parameters(item_result_id,step,value,standard_error) VALUES(${result!.id},${step.step},${step.value},${step.standardError})`;
    }
    await tx`UPDATE public.irt_artifact_adoption_receipts_v1 SET status='ADOPTED',batch_id=${batch!.id},updated_at=clock_timestamp() WHERE id=${receipt.id}`;
    return { requestId, adopted: true, receiptId: receipt.id, batchId: batch!.id, attemptCount: attempts.size, replay: false };
  });
}

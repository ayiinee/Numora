import type { Sql, TransactionSql } from 'postgres';

type JsonObject = Record<string, any>;

const fail = (code: string): never => {
  throw new Error(code);
};

export function validateV1ArtifactShape(payload: JsonObject, input: JsonObject, artifactDigest = '') {
  if (
    payload.contractVersion !== 'irt-calibration-v1' ||
    payload.requestId !== input.id ||
    payload.inputDigest !== input.input_digest ||
    payload.snapshotId !== input.snapshot_id ||
    !Array.isArray(payload.items) ||
    !payload.items.length ||
    !Array.isArray(payload.packages) ||
    !payload.packages.length ||
    !Array.isArray(payload.respondents) ||
    payload.respondents.some((r: JsonObject) => !r.attemptId || !r.respondentId || !r.batchId)
  )
    fail('IRT_V1_ARTIFACT_IDENTITY_INVALID');
  const attempts = new Set<string>();
  const respondents = new Set<string>();
  for (const row of payload.respondents) {
    if (attempts.has(row.attemptId) || respondents.has(row.respondentId))
      fail('IRT_V1_ARTIFACT_DUPLICATE_RESPONDENT');
    attempts.add(row.attemptId);
    respondents.add(row.respondentId);
    if (
      !row.packageId ||
      !row.packageVersion ||
      !row.assignedArmId ||
      !row.deliveredArmId ||
      !['SCORED', 'INSUFFICIENT', 'NOT_COMPARABLE', 'UNSCORABLE'].includes(row.status)
    )
      fail('IRT_V1_ARTIFACT_RESULT_STATUS_INVALID');
  }
  if (payload.items.some((item: JsonObject) => !item.questionVersionId || !item.rubricVersionId))
    fail('IRT_V1_ARTIFACT_ITEM_INVALID');
  if (payload.packages.some((pkg: JsonObject) => !pkg.packageId || !pkg.packageVersion || !pkg.armId || !['ORIGINAL', 'VARIANT'].includes(pkg.armKind)))
    fail('IRT_V1_ARTIFACT_PACKAGE_INVALID');
  return { attempts, respondents, artifactDigest };
}

async function recordFailure(client: Sql, requestId: string, code: string) {
  await client.begin(async (tx) => {
    await tx`
      INSERT INTO public.irt_artifact_adoption_receipts_v1(request_id,execution_id,artifact_id,artifact_digest,status,failure_code)
      VALUES(${requestId},NULL,NULL,'', 'FAILED', ${code})
      ON CONFLICT(request_id) DO UPDATE SET status='FAILED',failure_code=${code},updated_at=clock_timestamp()`;
  });
}

/** Main-only adoption path for contract irt-calibration-v1. No publication/finalization/XP. */
export async function adoptTryoutArtifactV1(client: Sql, requestId: string) {
  try {
    return await client.begin(async (tx: TransactionSql) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}::text,61))`;
      const [input] = await tx<JsonObject[]>`
        SELECT id::text,snapshot_id::text,input_digest,body FROM public.irt_calibration_inputs_v1
        WHERE id=${requestId} FOR SHARE`;
      if (!input) fail('IRT_V1_REQUEST_NOT_FOUND');
      const [job] = await tx<JsonObject[]>`
        SELECT j.id::text AS job_id,j.execution_id::text,j.status,j.generation,
               a.id::text AS artifact_id,a.digest AS artifact_digest,a.payload
        FROM irt_compute.calibration_jobs_v1 j
        JOIN irt_compute.calibration_artifacts_v1 a ON a.job_id=j.id
        WHERE j.request_id=${requestId} AND j.status='SUCCEEDED'
        ORDER BY j.generation DESC LIMIT 1`;
      if (!job) return { requestId, adopted: false, status: 'PENDING' };
      const [existing] = await tx<JsonObject[]>`
        SELECT id::text,status,artifact_digest FROM public.irt_artifact_adoption_receipts_v1
        WHERE request_id=${requestId} FOR UPDATE`;
      if (existing) {
        if (existing.artifact_digest !== job.artifact_digest) fail('IRT_V1_ADOPTION_CONFLICT');
        return { requestId, adopted: existing.status === 'ADOPTED', receiptId: existing.id };
      }
      const { attempts } = validateV1ArtifactShape(job.payload, input!, job.artifact_digest);
      const snapshot = await tx<{ attempt_id: string }[]>`
        SELECT DISTINCT attempt_id::text FROM public.response_snapshot_items WHERE snapshot_id=${input!.snapshot_id}`;
      const expected = new Set((snapshot ?? []).map((row: { attempt_id: string }) => row.attempt_id));
      if (expected.size !== attempts.size || [...expected].some((id) => !attempts.has(id)))
        fail('IRT_V1_ATTEMPT_COVERAGE_INVALID');
      const [receipt] = await tx<JsonObject[]>`
        INSERT INTO public.irt_artifact_adoption_receipts_v1(request_id,execution_id,artifact_id,artifact_digest,status)
        VALUES(${requestId},${job.execution_id},${job.artifact_id},${job.artifact_digest},'RECEIVED')
        RETURNING id::text`;
      const original = job.payload.packages.find((pkg: JsonObject) => pkg.armKind === 'ORIGINAL') ?? job.payload.packages[0];
      const [batch] = await tx<JsonObject[]>`
        INSERT INTO public.irt_batches(package_id,batch_kind,model_version,status,finished_at,context_id,response_snapshot_id,output_snapshot,output_digest,source_request_id,source_execution_id,source_calibration_artifact_id,adoption_receipt_id)
        VALUES(${original!.packageId},'TRYOUT_V1','irt-calibration-v1','SUCCEEDED',clock_timestamp(),${input!.body.context.contextId},${input!.snapshot_id},${JSON.stringify(job.payload)}::jsonb,${job.artifact_digest},${requestId},${job.execution_id},${job.artifact_id},${receipt!.id})
        RETURNING id::text`;
      for (const pkg of job.payload.packages) {
        await tx`
          INSERT INTO public.irt_artifact_adoption_packages_v1(receipt_id,package_id,package_version,arm_id,arm_kind,manifest_digest)
          VALUES(${receipt!.id},${pkg.packageId},${pkg.packageVersion},${pkg.armId},${pkg.armKind},${pkg.manifestDigest ?? ''})`;
      }
      for (const respondent of job.payload.respondents) {
        await tx`
          INSERT INTO public.irt_artifact_adoption_attempts_v1(receipt_id,attempt_id,respondent_id,package_id,package_version,assigned_arm_id,delivered_arm_id,result_status,reason_codes,result_snapshot)
          VALUES(${receipt!.id},${respondent.attemptId},${respondent.respondentId},${respondent.packageId},${respondent.packageVersion},${respondent.assignedArmId},${respondent.deliveredArmId},${respondent.status},${JSON.stringify(respondent.reasonCodes ?? [])}::jsonb,${JSON.stringify(respondent)}::jsonb)`;
      }
      for (const item of job.payload.items) {
        const calibrated = item.measurementState === 'CALIBRATED';
        const [result] = await tx<JsonObject[]>`
          INSERT INTO public.irt_item_results(batch_id,question_version_id,sample_size,data_status,discrimination_a,difficulty_b,model_family,rubric_version_id,eligible_respondent_count,measurement_state,quality_evidence)
          VALUES(${batch!.id},${item.questionVersionId},${item.sampleSize},${calibrated ? 'SUFFICIENT' : 'NOT_ENOUGH_DATA'},${item.discriminationA ?? null},${item.difficultyB ?? null},${item.modelFamily},${item.rubricVersionId},${item.eligibleRespondentCount},${item.measurementState},${JSON.stringify(item.qualityEvidence ?? {})}::jsonb)
          RETURNING id`;
        for (const step of item.steps ?? [])
          await tx`INSERT INTO public.irt_item_step_parameters(item_result_id,step,value,standard_error) VALUES(${result!.id},${step.step},${step.value},${step.standardError ?? null})`;
      }
      await tx`UPDATE public.irt_artifact_adoption_receipts_v1 SET status='ADOPTED',batch_id=${batch!.id},updated_at=clock_timestamp() WHERE id=${receipt!.id}`;
      return { requestId, adopted: true, receiptId: receipt!.id, batchId: batch!.id, attemptCount: attempts.size };
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'IRT_V1_ADOPTION_FAILED';
    if (!code.startsWith('IRT_V1_')) throw error;
    await recordFailure(client, requestId, code);
    throw error;
  }
}

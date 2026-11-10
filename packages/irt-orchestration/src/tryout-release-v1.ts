/* eslint-disable @typescript-eslint/no-explicit-any -- contract boundary validated using the shared validator. */
import { isDeepStrictEqual } from 'node:util';
import type { Sql, TransactionSql } from 'postgres';
import { loadVerifiedTryoutArtifactV1 } from './adoption-v1.js';
import { decideTryoutReleaseV1, type ResearchReleasePolicy } from './release-decisions-v1.js';

type Json = Record<string, any>;
function enabled(publication = false) {
  if (
    process.env.NUMORA_IRT_RESEARCH_ENABLED !== 'true' ||
    process.env.NUMORA_IRT_RELEASE_ENABLED !== 'true' ||
    (publication && process.env.NUMORA_IRT_PUBLICATION_ENABLED !== 'true')
  )
    throw new Error('IRT_RELEASE_DISABLED');
}
async function lockSource(tx: TransactionSql, batchId: string, requestId: string) {
  const [host] = await tx`SELECT current_database() AS name`;
  if (!String(host?.name).startsWith('irt_research_test_'))
    throw new Error('IRT_RELEASE_DISPOSABLE_ONLY');
  const [batch] = await tx<
    Json[]
  >`SELECT * FROM public.tryout_batches WHERE id=${batchId} FOR UPDATE`;
  const [request] = await tx<
    Json[]
  >`SELECT * FROM public.irt_calibration_requests_v1 WHERE id=${requestId} FOR SHARE`;
  if (!batch || !request || request.body.context.batchId !== batchId)
    throw new Error('IRT_RELEASE_BATCH_MISMATCH');
  return { batch, request };
}
async function decision(tx: TransactionSql, batch: Json, request: Json, approvalId: string) {
  await tx`SELECT public.irt_assert_release_authorization_v1(${request.id}::uuid,${approvalId}::uuid)`;
  const [policy] = await tx<
    Json[]
  >`SELECT p.id::text,p.version,p.digest,p.definition FROM public.configuration_approvals a
    JOIN irt_compute.technical_policy_versions p ON p.id=a.technical_policy_version_id WHERE a.id=${approvalId}`;
  if (!policy) throw new Error('IRT_RELEASE_POLICY_MISSING');
  if (batch.release_policy?.approvalId !== approvalId)
    throw new Error('IRT_RELEASE_POLICY_NOT_PINNED');
  const [clock] =
    await tx`SELECT clock_timestamp()>=${batch.closes_at}::timestamptz AS closed, clock_timestamp()>=${batch.result_due_at}::timestamptz AS overdue`;
  if (!clock?.closed || !['CLOSED', 'PROCESSING'].includes(batch.status))
    throw new Error('IRT_RELEASE_BATCH_NOT_CLOSED');
  const { source, job } = await loadVerifiedTryoutArtifactV1(tx, request.id);
  if (job?.status === 'SUCCEEDED') {
    const [receipt] =
      await tx`SELECT id FROM public.irt_artifact_adoption_receipts_v1 WHERE request_id=${request.id} AND status='ADOPTED' AND artifact_digest=${job.artifact_digest}`;
    if (!receipt) throw new Error('IRT_RELEASE_ADOPTION_REQUIRED');
  }
  if (!job && !clock.overdue) throw new Error('IRT_RELEASE_COMPUTE_PENDING');
  if (
    job?.status === 'FAILED' &&
    job.payload.failure.retryable &&
    source.current_generation < 3 &&
    !clock.overdue
  )
    throw new Error('IRT_RELEASE_RETRY_REQUIRED');
  const expected = new Set<string>(source.body.respondents.map((r: Json) => r.attemptId));
  const attempts = await tx<
    Json[]
  >`SELECT id::text,status FROM public.assessment_attempts WHERE tryout_batch_id=${batch.id}`;
  const rows: { attempt_id: string }[] = source.body.respondents.map((r: Json) => ({
    attempt_id: r.attemptId,
  }));
  for (const ids of [attempts.map((a) => a.id), rows.map((r) => r.attempt_id)])
    if (ids.length !== expected.size || ids.some((id) => !expected.has(id)))
      throw new Error('IRT_RELEASE_COVERAGE_INVALID');
  if (attempts.some((a) => !['SUBMITTED', 'GRADED'].includes(a.status)))
    throw new Error('IRT_RELEASE_FINAL_GRADE_REQUIRED');
  const d = decideTryoutReleaseV1(
    source.payload,
    job?.payload ?? null,
    policy.definition as ResearchReleasePolicy,
  );
  return {
    ...d,
    requestId: request.id,
    snapshotId: request.snapshot_id,
    inputDigest: request.input_digest,
    artifactDigest: job?.artifact_digest ?? null,
    executionId: job?.execution_id ?? null,
    generation: source.current_generation,
    policy: { id: policy.id, version: policy.version, digest: policy.digest, approvalId },
    purpose: 'RESEARCH_ONLY',
  };
}

export async function prepareTryoutReleaseV1(
  client: Sql,
  batchId: string,
  requestId: string,
  approvalId: string,
) {
  enabled();
  return client.begin(async (tx) => {
    const { batch, request } = await lockSource(tx, batchId, requestId);
    const [existing] = await tx<
      Json[]
    >`SELECT id::text,digest,published_at,policy_snapshot FROM public.tryout_result_finalizations WHERE batch_id=${batchId} AND source_calibration_request_id=${requestId}`;
    if (existing?.published_at)
      return { finalizationId: existing.id, status: 'PUBLISHED', replay: true };
    const snapshot = await decision(tx, batch, request, approvalId);
    if (existing) {
      if (!isDeepStrictEqual(existing.policy_snapshot, snapshot))
        throw new Error('IRT_RELEASE_REPLAY_CONFLICT');
      return { finalizationId: existing.id, status: 'READY', replay: true };
    }
    if (
      await tx`SELECT id FROM public.tryout_result_finalizations WHERE batch_id=${batchId}`.then(
        (r) => r.length,
      )
    )
      throw new Error('IRT_RELEASE_FINALIZATION_EXISTS');
    const original = request.body.packages.find((p: Json) => p.armKind === 'ORIGINAL');
    const [pkg] = await tx<
      Json[]
    >`SELECT scoring_policy_version_id::text FROM public.assessment_packages WHERE id=${original.packageId}`;
    if (!pkg?.scoring_policy_version_id) throw new Error('IRT_RELEASE_SCORING_POLICY_MISSING');
    const modes = new Set(snapshot.results.map((r) => r.mode));
    const mode = modes.size === 1 ? [...modes][0]! : 'MIXED';
    const body = tx.json(snapshot);
    const [f] = await tx<
      Json[]
    >`INSERT INTO public.tryout_result_finalizations(batch_id,version,mode,scoring_policy_version_id,mapping_approval_id,policy_snapshot,digest,source_calibration_request_id,release_approval_id)
      VALUES(${batchId},1,${mode},${pkg.scoring_policy_version_id},${request.body.policies.scoreMapping?.approvalId ?? null},${body}::jsonb,irt_compute.payload_digest(${body}::jsonb),${requestId},${approvalId}) RETURNING id::text`;
    for (const i of request.body.items)
      await tx`INSERT INTO public.tryout_finalization_items(finalization_id,question_version_id,included,max_points,reason)
      VALUES(${f!.id},${i.questionVersionId},${i.contentState === 'CONTENT_VALID'},${i.maxPoints},${i.contentState === 'CONTENT_VALID' ? 'FROZEN_CONTENT_VALID' : 'FROZEN_CONTENT_INVALID'})`;
    for (const r of snapshot.results)
      await tx`INSERT INTO public.tryout_attempt_results(finalization_id,attempt_id,score,theta,standard_error,raw_points,maximum_points,coverage,result_mode,delivered_arm_id,result_reason)
      VALUES(${f!.id},${r.attemptId},${r.score},${r.theta},${r.standardError},${r.rawPoints},${r.maximumPoints},${tx.json({ validItemCount: r.validItemCount })}::jsonb,${r.mode},${r.armId},${r.reason})`;
    return {
      finalizationId: f!.id,
      status: 'READY',
      attemptCount: snapshot.results.length,
      arms: snapshot.arms.map(({ results: _, ...a }) => a),
      replay: false,
    };
  });
}

export async function publishTryoutReleaseV1(client: Sql, finalizationId: string) {
  enabled(true);
  return client.begin(async (tx) => {
    const [ref] = await tx<
      Json[]
    >`SELECT batch_id::text,source_calibration_request_id::text FROM public.tryout_result_finalizations WHERE id=${finalizationId}`;
    if (!ref?.source_calibration_request_id) throw new Error('IRT_RELEASE_NOT_FOUND');
    const { batch, request } = await lockSource(
      tx,
      ref.batch_id,
      ref.source_calibration_request_id,
    );
    const [f] = await tx<
      Json[]
    >`SELECT * FROM public.tryout_result_finalizations WHERE id=${finalizationId} FOR UPDATE`;
    if (f!.published_at) return { finalizationId, status: 'PUBLISHED', replay: true };
    const current = await decision(tx, batch, request, f!.release_approval_id);
    if (!isDeepStrictEqual(current, f!.policy_snapshot))
      throw new Error('IRT_RELEASE_SOURCE_CHANGED');
    await tx`UPDATE public.tryout_result_finalizations SET published_at=clock_timestamp() WHERE id=${finalizationId}`;
    return { finalizationId, status: 'PUBLISHED', replay: false };
  });
}

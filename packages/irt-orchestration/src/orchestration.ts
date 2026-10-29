import { createHash, createHmac } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { createAnalysisRequest, type ConfigurationPin } from '@tka/database';
import { fail, IrtOrchestrationError, uuid, validateCalibrationPayload } from './validation.js';

export interface PrepareTryoutAnalysis {
  contextId: string;
  configurationPins: ConfigurationPin[];
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function requireIrtEnabled() {
  if (process.env.IRT_V3_ENABLED !== 'true') fail('IRT_V3_DISABLED', 503);
}
function operationKey(key: string) {
  if (!/^[\x21-\x7e]{1,160}$/.test(key)) fail('IRT_IDEMPOTENCY_KEY_REQUIRED', 400);
  // Idempotency keys are not copied into analytics/logs.
  return hash(key);
}
async function lockRequest(tx: TransactionSql, id: string) {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${id}::text,3))`;
}
async function duplicate(tx: TransactionSql, key: string, fingerprint: string, actorId: string) {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text,4))`;
  const [existing] = await tx<
    { request_id: string; operation_fingerprint: string; actor_user_id: string }[]
  >`
    SELECT request_id,operation_fingerprint,actor_user_id FROM analysis_request_dispatches WHERE operation_key=${key}`;
  if (
    existing &&
    (existing.operation_fingerprint !== fingerprint || existing.actor_user_id !== actorId)
  )
    fail('IRT_IDEMPOTENCY_CONFLICT');
  return existing?.request_id;
}
async function consistentOperation<T>(
  client: Sql,
  operation: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return (await client.begin('isolation level repeatable read', operation)) as T;
    } catch (error) {
      if (!['40001', '23505'].includes((error as { code?: string }).code ?? '')) throw error;
    }
  }
  return fail('IRT_PREPARE_BUSY', 503);
}

export async function prepareTryoutAnalysis(
  client: Sql,
  actorId: string,
  key: string,
  input: PrepareTryoutAnalysis,
) {
  requireIrtEnabled();
  if (
    !uuid(input.contextId) ||
    !Array.isArray(input.configurationPins) ||
    !input.configurationPins.length ||
    input.configurationPins.length > 20 ||
    input.configurationPins.some(
      (p) =>
        !uuid(p.approvalId) || typeof p.digest !== 'string' || !p.digest || p.digest.length > 160,
    ) ||
    new Set(input.configurationPins.map((p) => p.approvalId)).size !==
      input.configurationPins.length
  )
    fail('IRT_PREPARE_INVALID', 400);
  const pins = [...input.configurationPins].sort((a, b) =>
    a.approvalId.localeCompare(b.approvalId),
  );
  const opKey = operationKey(key);
  const fingerprint = hash({ operation: 'PREPARE', contextId: input.contextId, pins });
  const id = await consistentOperation(client, async (tx) => {
    const previous = await duplicate(tx, opKey, fingerprint, actorId);
    if (previous) return previous;
    const [ctx] = await tx<
      {
        package_id: string;
        cutoff_at: string;
        result_due_at: string;
        release_policy: unknown;
        release_policy_digest: string;
        manifest_digest: string;
      }[]
    >`
      SELECT b.package_id,b.cutoff_at::text,b.result_due_at::text,b.release_policy,b.release_policy_digest,p.manifest_digest
      FROM measurement_contexts c JOIN tryout_batches b ON b.id=c.tryout_batch_id JOIN assessment_packages p ON p.id=b.package_id
      WHERE c.id=${input.contextId} AND c.ecosystem='TRYOUT' AND b.status='CLOSED'
      AND b.cutoff_at<=clock_timestamp() AND p.assessment_type='TRYOUT' AND p.purpose='REGULAR'
      AND p.frozen_at IS NOT NULL AND p.manifest_digest IS NOT NULL AND b.release_policy IS NOT NULL AND b.release_policy_digest IS NOT NULL`;
    if (!ctx) fail('IRT_DEPENDENCY_NOT_APPROVED');
    const rubrics =
      await tx`SELECT pi.id FROM package_items pi LEFT JOIN scoring_rubric_versions r ON r.id=pi.rubric_version_id
      WHERE pi.package_id=${ctx.package_id} AND (r.id IS NULL OR r.status<>'SEALED')`;
    if (rubrics.length) fail('IRT_DEPENDENCY_NOT_APPROVED');
    const approvals = await tx<
      {
        id: string;
        approved_digest: string;
        kind: string;
        scope: { ecosystem?: string; contextId?: string };
      }[]
    >`
      SELECT a.id,a.approved_digest,t.kind,a.scope FROM configuration_approvals a JOIN irt_compute.technical_policy_versions t ON t.id=a.technical_policy_version_id
      WHERE a.id=ANY(${pins.map((p) => p.approvalId)}::uuid[]) AND a.revoked_at IS NULL AND t.status='SEALED' AND a.approved_digest=t.digest`;
    if (
      approvals.length !== pins.length ||
      !['IRT_MODEL', 'QUALITY_GATE'].every(
        (kind) => approvals.filter((a) => a.kind === kind).length === 1,
      ) ||
      approvals.some(
        (a) =>
          a.approved_digest !== pins.find((p) => p.approvalId === a.id)?.digest ||
          a.scope.ecosystem !== 'TRYOUT' ||
          (a.scope.contextId && a.scope.contextId !== input.contextId),
      )
    )
      fail('IRT_DEPENDENCY_NOT_APPROVED');
    const secret = process.env.IRT_PSEUDONYM_KEY;
    const keyVersion = process.env.IRT_PSEUDONYM_KEY_VERSION;
    if (
      !secret ||
      Buffer.byteLength(secret) < 32 ||
      !keyVersion ||
      !/^[A-Za-z0-9_.-]{1,80}$/.test(keyVersion)
    )
      fail('IRT_PSEUDONYM_NOT_CONFIGURED', 503);
    const sources = await tx<
      { id: string; student_id: string; finished_at: string; completed_at: string }[]
    >`
      SELECT a.id,a.student_id,a.finished_at::text,least(a.finished_at,a.deadline_at,p.close_at)::text AS completed_at FROM assessment_attempts a JOIN assessment_packages p ON p.id=a.package_id WHERE a.package_id=${ctx.package_id}
      AND a.assessment_type='TRYOUT' AND a.purpose='REGULAR' AND a.status IN ('SUBMITTED','GRADED') AND a.finished_at IS NOT NULL AND a.started_at<=${ctx.cutoff_at}::timestamptz ORDER BY a.id`;
    if (!sources.length) fail('IRT_DATASET_EMPTY');
    const policy = {
      version: 'job10-operational-v2',
      releasePolicy: ctx.release_policy,
      releasePolicyDigest: ctx.release_policy_digest,
      packageManifestDigest: ctx.manifest_digest,
    };
    const [snapshot] = await tx<
      { id: string }[]
    >`INSERT INTO response_snapshots(context_id,cutoff_at,policy,policy_digest,respondent_key_version)
      VALUES(${input.contextId},${ctx.cutoff_at}::timestamptz,${JSON.stringify(policy)}::text::jsonb,irt_compute.payload_digest(${JSON.stringify(policy)}::text::jsonb),${keyVersion}) RETURNING id`;
    for (const attempt of sources) {
      const respondent = createHmac('sha256', secret)
        .update(`${keyVersion}:${attempt.student_id}`)
        .digest('hex');
      const inserted =
        await tx`INSERT INTO response_snapshot_items(snapshot_id,respondent_id,attempt_id,attempt_item_id,question_version_id,rubric_version_id,raw_answer,score_category,maximum_score_category,fully_correct,awarded_points,max_points,response_state,operational_eligible,operational_exclusion_reasons,exposure_facts,completed_at)
        SELECT ${snapshot!.id},${respondent},i.attempt_id,i.id,i.question_version_id,i.rubric_version_id,a.answer,a.score_category,i.maximum_score_category,a.fully_correct,a.awarded_points,i.max_points,
          coalesce(a.response_state::text,'OMITTED'),
          coalesce(${attempt.completed_at}::timestamptz<=${ctx.cutoff_at}::timestamptz AND a.graded_at IS NOT NULL AND a.score_category IS NOT NULL AND a.fully_correct IS NOT NULL AND a.response_state::text IN ('RESPONDED','OMITTED') AND (a.response_state::text='OMITTED' OR a.saved_at<=${ctx.cutoff_at}::timestamptz),false),
          CASE WHEN a.graded_at IS NULL OR a.score_category IS NULL OR a.fully_correct IS NULL THEN '["UNSCORED"]'::jsonb WHEN ${attempt.completed_at}::timestamptz>${ctx.cutoff_at}::timestamptz OR a.response_state::text<>'OMITTED' AND a.saved_at>${ctx.cutoff_at}::timestamptz THEN '["AFTER_CUTOFF"]'::jsonb WHEN a.response_state::text NOT IN ('RESPONDED','OMITTED') THEN '["INVALID_RESPONSE"]'::jsonb ELSE '[]'::jsonb END,
          jsonb_build_object('sourceFinalizedAt',${attempt.finished_at}::timestamptz,'deliveries',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',m.kind,'issuedAt',m.issued_at) ORDER BY m.issued_at,m.id) FROM content_delivery_items di JOIN content_delivery_manifests m ON m.id=di.manifest_id WHERE di.attempt_item_id=i.id AND m.issued_at<=${ctx.cutoff_at}::timestamptz),'[]'::jsonb),
            'priorExposure',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',e.kind,'module',e.module,'occurredAt',e.occurred_at) ORDER BY e.occurred_at,e.id) FROM student_item_exposures e JOIN question_variants v ON v.question_id=e.family_id JOIN question_versions q ON q.variant_id=v.id WHERE q.id=i.question_version_id AND e.student_id=${attempt.student_id} AND e.occurred_at<=${attempt.completed_at}::timestamptz),'[]'::jsonb)),
          ${attempt.completed_at}::timestamptz
        FROM attempt_items i LEFT JOIN attempt_answers a ON a.attempt_item_id=i.id JOIN scoring_rubric_versions r ON r.id=i.rubric_version_id
        WHERE i.attempt_id=${attempt.id} AND r.status='SEALED' RETURNING id`;
      const [total] = await tx<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM attempt_items WHERE attempt_id=${attempt.id}`;
      if (!inserted.length || inserted.length !== total!.n) fail('IRT_DEPENDENCY_NOT_APPROVED');
    }
    await tx`UPDATE response_snapshots SET status='FROZEN' WHERE id=${snapshot!.id}`;
    const request = await createAnalysisRequest(tx, {
      idempotencyKey: opKey,
      requestType: 'CALIBRATE_TRYOUT',
      contextId: input.contextId,
      snapshotId: snapshot!.id,
      packageId: ctx.package_id,
      configurationPins: pins,
      dueAt: ctx.result_due_at,
    });
    await tx`INSERT INTO analysis_request_dispatches(request_id,generation,operation_key,operation_fingerprint,actor_user_id) VALUES(${request.id},1,${opKey},${fingerprint},${actorId})`;
    await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(${actorId},'IRT_V3_PREPARED','analysis_request',${request.id},${JSON.stringify({ inputDigest: request.inputDigest, generation: 1 })}::text::jsonb)`;
    return request.id;
  });
  return analysisRequestDetail(client, id);
}

export async function retryTryoutAnalysis(client: Sql, actorId: string, key: string, id: string) {
  requireIrtEnabled();
  if (!uuid(id)) fail('IRT_REQUEST_INVALID', 400);
  const opKey = operationKey(key),
    fingerprint = hash({ operation: 'RETRY', requestId: id });
  await client.begin(async (tx) => {
    const previous = await duplicate(tx, opKey, fingerprint, actorId);
    if (previous) return;
    await lockRequest(tx, id);
    const [r] = await tx<
      { status: string; input_digest: string }[]
    >`SELECT status,input_digest FROM analysis_requests WHERE id=${id} AND request_type='CALIBRATE_TRYOUT' FOR UPDATE`;
    if (!r) fail('IRT_REQUEST_NOT_FOUND', 404);
    const [d] = await tx<
      { generation: number }[]
    >`SELECT generation FROM analysis_request_dispatches WHERE request_id=${id} ORDER BY generation DESC LIMIT 1`;
    if (!d) fail('IRT_REQUEST_NOT_MANAGED');
    await tx`INSERT INTO analysis_request_dispatches(request_id,generation,operation_key,operation_fingerprint,actor_user_id) VALUES(${id},${d.generation + 1},${opKey},${fingerprint},${actorId})`;
    await tx`UPDATE analysis_requests SET status='PENDING' WHERE id=${id}`;
    await tx`UPDATE outbox_deliveries SET delivered_at=NULL,retry_at=NULL,failure_code=NULL WHERE consumer='irt_compute' AND outbox_id IN (SELECT id FROM analytics_outbox WHERE entity_id=${id} AND event_name='analysis.requested')`;
    await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(${actorId},'IRT_V3_RETRY_AUTHORIZED','analysis_request',${id},${JSON.stringify({ inputDigest: r.input_digest, generation: d.generation + 1 })}::text::jsonb)`;
  });
  return analysisRequestDetail(client, id);
}

export async function analysisRequestDetail(client: Sql, id: string) {
  const [r] = await client<
    {
      id: string;
      context_id: string;
      package_id: string;
      configuration_pins: ConfigurationPin[];
      status: string;
      input_digest: string;
      snapshot_id: string;
      due_at: Date;
      accepted_execution_id: string | null;
      overdue: boolean;
      row_count: number;
      digest: string;
      generation: number;
    }[]
  >`
    SELECT r.*,r.due_at<clock_timestamp() AND r.status<>'COMPLETED' AS overdue,s.row_count,s.digest,d.generation
    FROM analysis_requests r JOIN response_snapshots s ON s.id=r.snapshot_id JOIN LATERAL (SELECT generation FROM analysis_request_dispatches WHERE request_id=r.id ORDER BY generation DESC LIMIT 1) d ON true
    WHERE r.id=${id} AND r.request_type='CALIBRATE_TRYOUT'`;
  if (!r) fail('IRT_REQUEST_NOT_FOUND', 404);
  const [e] = await client<
    {
      id: string;
      status: string;
      attempt_number: number;
      failure_code: string | null;
      lease_expired: boolean;
    }[]
  >`SELECT id,status,attempt_number,failure_code,lease_expires_at<=clock_timestamp() AS lease_expired FROM irt_compute.compute_executions WHERE request_id=${id} ORDER BY attempt_number DESC LIMIT 1`;
  const artifacts = await client<
    { id: string; digest: string; scientific_decision: string }[]
  >`SELECT id,digest,scientific_decision FROM irt_compute.compute_outputs WHERE execution_id=${e?.id ?? null} ORDER BY sequence_number`;
  const [delivery] = await client<
    { failure_code: string | null }[]
  >`SELECT d.failure_code FROM outbox_deliveries d JOIN analytics_outbox o ON o.id=d.outbox_id WHERE o.entity_id=${id} AND d.consumer='irt_compute' AND o.event_name='analysis.requested'`;
  const safeCode = (code: string | null | undefined) =>
    code && /^[A-Z0-9_]{1,80}$/.test(code) ? code : code ? 'IRT_COMPUTE_FAILED' : null;
  return {
    id: r.id,
    contractVersion: 3 as const,
    contextId: r.context_id,
    configurationPins: r.configuration_pins,
    packageId: r.package_id,
    status: r.status,
    inputDigest: r.input_digest,
    snapshotId: r.snapshot_id,
    snapshotDigest: r.digest,
    rowCount: r.row_count,
    dispatchGeneration: r.generation,
    dueAt: new Date(r.due_at).toISOString(),
    overdue: r.overdue,
    acceptedExecutionId: r.accepted_execution_id,
    execution: e
      ? {
          id: e.id,
          status: e.status,
          attemptNumber: e.attempt_number,
          leaseExpired: e.lease_expired,
          failureCode: safeCode(e.failure_code),
        }
      : null,
    failureCode: safeCode(delivery?.failure_code),
    artifacts: artifacts.map((a) => ({
      id: a.id,
      digest: a.digest,
      scientificDecision: a.scientific_decision,
    })),
  };
}
export async function listAnalysisRequests(client: Sql, limit: number, offset: number) {
  const rows = await client<
    { id: string }[]
  >`SELECT r.id FROM analysis_requests r JOIN analysis_request_dispatches d ON d.request_id=r.id AND d.generation=1 WHERE r.request_type='CALIBRATE_TRYOUT' ORDER BY r.created_at DESC,r.id DESC LIMIT ${limit} OFFSET ${offset}`;
  return { items: await Promise.all(rows.map((r) => analysisRequestDetail(client, r.id))) };
}

export async function adoptTryoutArtifact(client: Sql, id: string, actorId?: string) {
  requireIrtEnabled();
  let attemptedExecutionId: string | undefined;
  try {
    return await client.begin(async (tx) => {
      await lockRequest(tx, id);
      const [r] = await tx<
        {
          id: string;
          status: string;
          input_digest: string;
          context_id: string;
          snapshot_id: string;
          package_id: string;
          accepted_execution_id: string | null;
          configuration_pins: ConfigurationPin[];
        }[]
      >`SELECT * FROM analysis_requests WHERE id=${id} AND request_type='CALIBRATE_TRYOUT' FOR UPDATE`;
      if (!r) fail('IRT_REQUEST_NOT_FOUND', 404);
      const managed =
        await tx`SELECT id FROM analysis_request_dispatches WHERE request_id=${id} LIMIT 1`;
      if (!managed.length) fail('IRT_REQUEST_NOT_MANAGED');
      if (r.accepted_execution_id) return { requestId: id, adopted: false };
      const [e] = await tx<
        { id: string; status: string }[]
      >`SELECT id,status FROM irt_compute.compute_executions WHERE request_id=${id} ORDER BY attempt_number DESC LIMIT 1`;
      if (!e || e.status !== 'SUCCEEDED' || r.status !== 'RUNNING')
        return { requestId: id, adopted: false };
      attemptedExecutionId = e.id;
      const outputs = await tx<
        { id: string; payload: unknown; scientific_decision: string; valid: boolean }[]
      >`
        SELECT o.id,o.payload,o.scientific_decision,(o.contract_version=3 AND o.kind='CALIBRATE_TRYOUT' AND o.sequence_number=1 AND o.input_digest=${r.input_digest} AND o.digest=irt_compute.payload_digest(o.payload) AND d.status='SEALED' AND d.snapshot_id=${r.snapshot_id} AND d.execution_id=${e.id}
          AND EXISTS(SELECT 1 FROM configuration_approvals a JOIN irt_compute.technical_policy_versions p ON p.id=a.technical_policy_version_id WHERE a.id=ANY(${r.configuration_pins.map((p) => p.approvalId)}::uuid[]) AND p.id=d.selection_policy_id AND p.kind='QUALITY_GATE')) AS valid
        FROM irt_compute.compute_outputs o LEFT JOIN irt_compute.analysis_datasets d ON d.id=o.dataset_id WHERE o.execution_id=${e.id}`;
      const output = outputs[0];
      if (outputs.length !== 1 || !output?.valid) fail('IRT_ARTIFACT_PROVENANCE_INVALID');
      validateCalibrationPayload(output.payload);
      const pinned = await tx<
        {
          question_version_id: string;
          rubric_version_id: string;
          maximum_score_category: number;
          question_type: string;
        }[]
      >`SELECT DISTINCT i.question_version_id,i.rubric_version_id,i.maximum_score_category,q.question_type FROM response_snapshot_items i JOIN question_versions q ON q.id=i.question_version_id WHERE snapshot_id=${r.snapshot_id}`;
      if (
        output.payload.items.length !== pinned.length ||
        output.payload.items.some(
          (item) =>
            !pinned.some(
              (p) =>
                p.question_version_id === item.questionVersionId &&
                p.rubric_version_id === item.rubricVersionId &&
                (p.question_type === 'SINGLE_CHOICE') === (item.modelFamily === '2PL') &&
                (item.modelFamily !== 'GPCM' ||
                  item.measurementState !== 'CALIBRATED' ||
                  item.steps.length === p.maximum_score_category),
            ),
        )
      )
        fail('IRT_ARTIFACT_ITEM_MISMATCH');
      const [model] = await tx<
        { code: string; version: number }[]
      >`SELECT t.code,t.version FROM configuration_approvals a JOIN irt_compute.technical_policy_versions t ON t.id=a.technical_policy_version_id WHERE a.id=ANY(${r.configuration_pins.map((p) => p.approvalId)}::uuid[]) AND t.kind='IRT_MODEL' ORDER BY a.id LIMIT 1`;
      if (!model) fail('IRT_ARTIFACT_PROVENANCE_INVALID');
      await tx`UPDATE analysis_requests SET accepted_execution_id=${e.id},status='COMPLETED' WHERE id=${id}`;
      const [batch] = await tx<
        { id: string }[]
      >`INSERT INTO irt_batches(package_id,batch_kind,model_version,status,finished_at,context_id,response_snapshot_id,analysis_request_id,source_output_id,output_snapshot)
        VALUES(${r.package_id},'TRYOUT',${`${model.code}@${model.version}`},'SUCCEEDED',clock_timestamp(),${r.context_id},${r.snapshot_id},${id},${output.id},${JSON.stringify(output.payload)}::text::jsonb) RETURNING id`;
      for (const item of output.payload.items) {
        const dataStatus =
          item.measurementState === 'CALIBRATED'
            ? 'SUFFICIENT'
            : item.measurementState === 'INSUFFICIENT'
              ? 'NOT_ENOUGH_DATA'
              : item.measurementState;
        const [result] = await tx<
          { id: string }[]
        >`INSERT INTO irt_item_results(batch_id,question_version_id,sample_size,data_status,discrimination_a,difficulty_b,model_family,rubric_version_id,eligible_respondent_count,measurement_state,quality_evidence)
          VALUES(${batch!.id},${item.questionVersionId},${item.sampleSize},${dataStatus},${item.discriminationA},${item.difficultyB},${item.modelFamily},${item.rubricVersionId},${item.eligibleRespondentCount},${item.measurementState},${JSON.stringify(item.qualityEvidence)}::text::jsonb) RETURNING id`;
        for (const step of item.steps)
          await tx`INSERT INTO irt_item_step_parameters(item_result_id,step,value,standard_error) VALUES(${result!.id},${step.step},${step.value},${step.standardError})`;
      }
      await tx`UPDATE outbox_deliveries SET failure_code=NULL,retry_at=NULL WHERE consumer='irt_compute' AND outbox_id IN (SELECT id FROM analytics_outbox WHERE entity_id=${id} AND event_name='analysis.requested')`;
      await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(${actorId ?? null},'IRT_V3_ADOPTED','analysis_request',${id},${JSON.stringify({ executionId: e.id, outputId: output.id, scientificDecision: output.scientific_decision })}::text::jsonb)`;
      return { requestId: id, adopted: true };
    });
  } catch (error) {
    const code =
      error instanceof IrtOrchestrationError
        ? error.code
        : ['23514', '23505', '22003', '22P02'].includes((error as { code?: string }).code ?? '')
          ? 'IRT_ARTIFACT_INVALID'
          : null;
    if (!code || !attemptedExecutionId) throw error;
    const failedExecutionId = attemptedExecutionId;
    await client.begin(async (tx) => {
      await lockRequest(tx, id);
      await tx`UPDATE analysis_requests SET status='FAILED' WHERE id=${id} AND status='RUNNING' AND accepted_execution_id IS NULL
        AND (SELECT id FROM irt_compute.compute_executions WHERE request_id=${id} ORDER BY attempt_number DESC LIMIT 1)=${failedExecutionId}`;
      await tx`UPDATE outbox_deliveries SET failure_code=${code} WHERE consumer='irt_compute' AND outbox_id IN (SELECT id FROM analytics_outbox WHERE entity_id=${id} AND event_name='analysis.requested') AND EXISTS(SELECT 1 FROM analysis_requests WHERE id=${id} AND status='FAILED')
        AND (SELECT id FROM irt_compute.compute_executions WHERE request_id=${id} ORDER BY attempt_number DESC LIMIT 1)=${failedExecutionId}`;
    });
    throw error;
  }
}

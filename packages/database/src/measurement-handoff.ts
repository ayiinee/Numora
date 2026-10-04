import type { Sql, TransactionSql } from 'postgres';
import type { ComputeArtifact, CreateAnalysisRequest } from './measurement-contract.js';

/** Main only: the DB trigger creates the request/outbox/delivery atomically. */
export async function createAnalysisRequest(
  client: Sql | TransactionSql,
  input: CreateAnalysisRequest,
) {
  const [row] = await client<{ id: string; input_digest: string; status: string }[]>`
    INSERT INTO public.analysis_requests(idempotency_key,request_type,context_id,snapshot_id,wave_item_id,package_id,baseline_id,reference_set_id,configuration_pins,input_digest,due_at)
    VALUES (${input.idempotencyKey},${input.requestType},${input.contextId},${input.snapshotId ?? null},${input.waveItemId ?? null},${input.packageId ?? null},${input.baselineId ?? null},${input.referenceSetId ?? null},${JSON.stringify(input.configurationPins)}::text::jsonb,'',${input.dueAt instanceof Date ? input.dueAt.toISOString() : (input.dueAt ?? null)}::timestamptz)
    ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
      WHERE analysis_requests.input_digest=EXCLUDED.input_digest
    RETURNING id,input_digest,status`;
  if (!row) throw new Error('ANALYSIS_IDEMPOTENCY_CONFLICT');
  return { id: row.id, inputDigest: row.input_digest, status: row.status };
}

/** Compute only: expired attempts are retained; the next attempt receives a new token. */
export async function claimComputeExecution(
  client: Sql,
  requestId: string,
  servicePrincipalId: string,
  leaseSeconds = 60,
  dispatchGeneration?: number,
) {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1) throw new Error('INVALID_LEASE');
  return client.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}::text,3))`;
    const [request] = await tx<
      { status: string }[]
    >`SELECT status FROM public.irt_input_requests_v3 WHERE id=${requestId}`;
    if (!request || ['COMPLETED', 'CANCELLED'].includes(request.status)) return null;
    const [dispatch] = await tx<{ id: string; generation: number }[]>`
      SELECT id,generation FROM public.irt_input_dispatches_v3 WHERE request_id=${requestId}
      ORDER BY generation DESC LIMIT 1`;
    if (dispatch && dispatch.generation !== dispatchGeneration) return null;
    await tx`UPDATE irt_compute.compute_executions SET status='EXPIRED',finished_at=clock_timestamp(),failure_code='LEASE_EXPIRED'
      WHERE request_id=${requestId} AND status='RUNNING' AND lease_expires_at<=clock_timestamp()`;
    const [active] =
      await tx`SELECT id FROM irt_compute.compute_executions WHERE request_id=${requestId} AND status='RUNNING'`;
    if (active) return null;
    if (dispatch) {
      const used =
        await tx`SELECT id FROM irt_compute.compute_executions WHERE dispatch_id=${dispatch.id}`;
      if (used.length || request.status !== 'PENDING') return null;
    }
    const [execution] = await tx<{ id: string; fencing_token: string; attempt_number: number }[]>`
      INSERT INTO irt_compute.compute_executions(request_id,attempt_number,service_principal_id,lease_expires_at,dispatch_id)
      SELECT ${requestId},coalesce(max(attempt_number),0)+1,${servicePrincipalId},clock_timestamp()+(${leaseSeconds}::text||' seconds')::interval,${dispatch?.id ?? null}
      FROM irt_compute.compute_executions WHERE request_id=${requestId}
      RETURNING id,fencing_token,attempt_number`;
    if (!execution) throw new Error('COMPUTE_CLAIM_FAILED');
    return {
      id: execution.id,
      fencingToken: execution.fencing_token,
      attemptNumber: execution.attempt_number,
    };
  });
}

export async function heartbeatComputeExecution(
  client: Sql,
  executionId: string,
  fencingToken: string,
  leaseSeconds = 60,
) {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1) throw new Error('INVALID_LEASE');
  const rows = await client`UPDATE irt_compute.compute_executions
    SET heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+(${leaseSeconds}::text||' seconds')::interval
    WHERE id=${executionId} AND fencing_token=${fencingToken} AND status='RUNNING' AND lease_expires_at>clock_timestamp()
    RETURNING id`;
  if (!rows.length) throw new Error('COMPUTE_STALE_EXECUTION');
}

export async function writeComputeArtifact(client: Sql, artifact: ComputeArtifact) {
  const [row] = await client<{ id: string; digest: string }[]>`
    INSERT INTO irt_compute.compute_outputs(execution_id,dataset_id,kind,sequence_number,input_digest,digest,payload,scientific_decision)
    VALUES(${artifact.executionId},${artifact.datasetId ?? null},${artifact.kind},${artifact.sequenceNumber ?? 1},${artifact.inputDigest},'',${JSON.stringify(artifact.payload)}::text::jsonb,${artifact.scientificDecision})
    RETURNING id,digest`;
  if (!row) throw new Error('COMPUTE_ARTIFACT_FAILED');
  return row;
}

export async function finishComputeExecution(
  client: Sql,
  executionId: string,
  fencingToken: string,
  failureCode?: string,
) {
  const rows =
    await client`UPDATE irt_compute.compute_executions SET status=${failureCode ? 'FAILED' : 'SUCCEEDED'},
    failure_code=${failureCode ?? null},finished_at=clock_timestamp()
    WHERE id=${executionId} AND fencing_token=${fencingToken} AND status='RUNNING' AND lease_expires_at>clock_timestamp() RETURNING id`;
  if (!rows.length) throw new Error('COMPUTE_STALE_EXECUTION');
}

/** Main only. Accepting evidence does not activate parameters or publish grades. */
export async function acceptComputeExecution(
  client: Sql,
  requestId: string,
  executionId: string,
  expectedInputDigest: string,
) {
  return client.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}::text,3))`;
    const [request] = await tx<{ input_digest: string; accepted_execution_id: string | null }[]>`
      SELECT input_digest,accepted_execution_id FROM public.analysis_requests WHERE id=${requestId} FOR UPDATE`;
    if (!request || request.input_digest !== expectedInputDigest)
      throw new Error('ANALYSIS_INPUT_CONFLICT');
    if (request.accepted_execution_id) {
      if (request.accepted_execution_id !== executionId)
        throw new Error('ANALYSIS_ADOPTION_CONFLICT');
      return { requestId, executionId };
    }
    await tx`UPDATE public.analysis_requests SET accepted_execution_id=${executionId},status='COMPLETED' WHERE id=${requestId}`;
    await tx`UPDATE public.outbox_deliveries SET delivered_at=coalesce(delivered_at,clock_timestamp()),attempts=greatest(attempts,1)
      WHERE consumer='irt_compute' AND outbox_id IN (SELECT id FROM public.analytics_outbox WHERE entity_id=${requestId} AND event_name='analysis.requested')`;
    return { requestId, executionId };
  });
}

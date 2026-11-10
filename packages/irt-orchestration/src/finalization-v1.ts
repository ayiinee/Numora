import type { Sql, TransactionSql } from 'postgres';

type Json = Record<string, any>;
export type FinalizationMode = 'IRT' | 'FALLBACK' | 'UNSCORABLE' | 'INSUFFICIENT' | 'NOT_COMPARABLE';

export function classifyFinalizationRespondent(row: Json): { mode: FinalizationMode; score: number | null; theta: number | null; standardError: number | null; reasonCodes: string[] } {
  const status = row.status;
  if (status === 'SCORED') {
    const score = row.score;
    const theta = row.theta;
    const standardError = row.standardError;
    if (![score, theta, standardError].every((v) => typeof v === 'number' && Number.isFinite(v)))
      throw new Error('IRT_V1_FINALIZATION_SCORED_RESULT_INVALID');
    if (score < 0 || score > 100 || standardError < 0)
      throw new Error('IRT_V1_FINALIZATION_SCORED_RESULT_INVALID');
    return { mode: 'IRT', score, theta, standardError, reasonCodes: row.reasonCodes ?? [] };
  }
  if (status === 'UNSCORABLE') return { mode: 'UNSCORABLE', score: null, theta: null, standardError: null, reasonCodes: row.reasonCodes ?? ['NO_VALID_ITEMS'] };
  if (status === 'INSUFFICIENT') return { mode: 'INSUFFICIENT', score: null, theta: null, standardError: null, reasonCodes: row.reasonCodes ?? ['INSUFFICIENT_SAMPLE'] };
  if (status === 'NOT_COMPARABLE') return { mode: 'NOT_COMPARABLE', score: null, theta: null, standardError: null, reasonCodes: row.reasonCodes ?? ['LINKING_FAILED'] };
  throw new Error('IRT_V1_FINALIZATION_STATUS_INVALID');
}

function policySnapshot(body: Json) {
  const policies = body?.policies ?? {};
  return { scoring: policies.scoring ?? null, scoreMapping: policies.scoreMapping ?? null, fallback: body?.fallbackPolicy ?? null };
}

/** Stage per-attempt IRT/fallback decisions. Never publishes or mutates attempt, XP, or history. */
export async function finalizeTryoutArtifactV1(client: Sql, receiptId: string) {
  return client.begin(async (tx: TransactionSql) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${receiptId}::text,63))`;
    const [receipt] = await tx<Json[]>`SELECT id::text,request_id::text,batch_id::text,status,artifact_digest FROM public.irt_artifact_adoption_receipts_v1 WHERE id=${receiptId} FOR UPDATE`;
    if (!receipt) throw new Error('IRT_V1_FINALIZATION_RECEIPT_NOT_FOUND');
    const [existing] = await tx<Json[]>`SELECT id::text,status,version FROM public.irt_finalization_runs_v1 WHERE receipt_id=${receiptId} FOR UPDATE`;
    if (existing) return { receiptId, runId: existing.id, status: existing.status, version: existing.version, replay: true };
    if (receipt.status !== 'ADOPTED' || !receipt.batch_id) throw new Error('IRT_V1_FINALIZATION_RECEIPT_NOT_ADOPTED');
    const [input] = await tx<Json[]>`SELECT id::text,body FROM public.irt_calibration_inputs_v1 WHERE id=${receipt.request_id} FOR SHARE`;
    if (!input) throw new Error('IRT_V1_FINALIZATION_REQUEST_NOT_FOUND');
    const attempts = await tx<Json[]>`SELECT attempt_id::text,respondent_id::text,result_status,result_snapshot FROM public.irt_artifact_adoption_attempts_v1 WHERE receipt_id=${receiptId} ORDER BY attempt_id`;
    const coverage = await tx<Json[]>`SELECT attempt_id::text FROM public.irt_artifact_adoption_attempts_v1 WHERE receipt_id=${receiptId}`;
    if (!attempts.length || coverage.length !== attempts.length) throw new Error('IRT_V1_FINALIZATION_COVERAGE_INVALID');
    const [versionRow] = await tx<Json[]>`SELECT COALESCE(MAX(version),0)::int AS version FROM public.irt_finalization_runs_v1 WHERE batch_id=${receipt.batch_id}`;
    const version = Number(versionRow?.version ?? 0) + 1;
    const snapshot = policySnapshot(input.body ?? {});
    const digest = `${receipt.artifact_digest}:finalization:${version}`;
    const [run] = await tx<Json[]>`INSERT INTO public.irt_finalization_runs_v1(batch_id,receipt_id,version,status,policy_snapshot,digest) VALUES(${receipt.batch_id},${receiptId},${version},'RUNNING',${JSON.stringify(snapshot)}::jsonb,${digest}) RETURNING id::text`;
    for (const row of attempts) {
      const result = classifyFinalizationRespondent({ ...row.result_snapshot, status: row.result_status });
      await tx`INSERT INTO public.irt_finalization_results_v1(run_id,attempt_id,mode,score,theta,standard_error,reason_codes,result_snapshot) VALUES(${run!.id},${row.attempt_id},${result.mode},${result.score},${result.theta},${result.standardError},${JSON.stringify(result.reasonCodes)}::jsonb,${JSON.stringify(row.result_snapshot)}::jsonb)`;
    }
    await tx`UPDATE public.irt_finalization_runs_v1 SET status='READY' WHERE id=${run!.id}`;
    return { receiptId, runId: run!.id, status: 'READY', version, attemptCount: attempts.length, replay: false };
  });
}

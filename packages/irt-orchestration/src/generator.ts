import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { createAnalysisRequest } from '@tka/database';
import { fail, uuid } from './validation.js';
import { contentFingerprint, fingerprint, type Json } from './generator-fingerprint.js';

export function requireGeneratorEnabled() {
  if (process.env.NUMORA_GENERATOR_ENABLED !== 'true') fail('GENERATOR_DISABLED', 503);
}
export async function requireGeneratorMain(client: Sql | TransactionSql) {
  const [role] = await client<{ safe: boolean }[]>`SELECT
    (pg_has_role(current_user,'numora_main_runtime','member') AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls
      AND NOT has_table_privilege(current_user,'irt_compute.generation_candidates','INSERT')
      AND NOT has_table_privilege(current_user,'irt_compute.generator_configs','UPDATE')
      AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relnamespace IN ('public'::regnamespace,'irt_compute'::regnamespace) AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))) AS safe
    FROM pg_roles WHERE rolname=current_user`;
  if (!role?.safe) fail('GENERATOR_UNSAFE_MAIN_ROLE', 503);
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function operation(actor: string, key: string, action: string) {
  if (!/^[\x21-\x7e]{1,160}$/.test(key)) fail('GENERATOR_IDEMPOTENCY_KEY_REQUIRED', 400);
  return hash({ actor, key, action });
}
type Mapping = {
  id: string;
  config_id: string;
  context_id: string;
  original_id: string;
  family_id: string;
  rubric_id: string;
  approved_digest: string;
  label: string;
  parameters: Record<string, Json>;
  question_type: string;
  stem: { text: string };
  options_or_statements: CandidatePayload['optionsOrStatements'];
  answer_key: CandidatePayload['answerKey'];
  media: unknown[] | null;
  explanation: { text: string };
};
// Mapping is explicit registration provenance plus a main-owned scoped approval.
// No local record number is converted into Curriculum taxonomy.
async function mappings(tx: Sql | TransactionSql, approvalId?: string) {
  const rows = await tx<Mapping[]>`SELECT a.id,g.id AS config_id,g.context_id,q.id AS original_id,
    v.question_id AS family_id,q.scoring_rubric_version_id AS rubric_id,
    a.approved_digest,g.parameters->>'questionExternalId' AS label,g.parameters,
    q.question_type,q.stem,q.options_or_statements,q.answer_key,q.media,q.explanation
    FROM configuration_approvals a JOIN irt_compute.generator_configs g ON g.id=a.generator_config_id
    JOIN question_versions q ON q.id::text=g.parameters->>'parentQuestionVersionId'
    JOIN question_variants v ON v.id=q.variant_id
    JOIN scoring_rubric_versions rubric ON rubric.id=q.scoring_rubric_version_id
    JOIN measurement_contexts c ON c.id=g.context_id
    WHERE (${approvalId ?? null}::uuid IS NULL OR a.id=${approvalId ?? null}::uuid)
    AND a.revoked_at IS NULL AND g.status='SEALED' AND a.approved_digest=g.digest
    AND g.digest=irt_compute.payload_digest(g.parameters)
    AND g.parameters->>'serviceContract'='generator-service-v1'
    AND g.parameters->>'familyId'=v.question_id::text AND v.kind='ORIGINAL'
    AND g.parameters->>'rubricVersionId'=rubric.id::text AND rubric.status='SEALED'
    AND rubric.question_type=q.question_type::text
    AND g.parameters->>'contextId'=c.id::text
    AND a.scope->>'ecosystem'=c.ecosystem AND a.scope->>'contextId'=c.id::text
    AND q.content_status<>'ARCHIVED' AND q.validation_state NOT IN ('QUARANTINED','ARCHIVED')
    ORDER BY label,g.id,a.id FOR SHARE OF a,q,rubric`;
  return rows.filter((m) => {
    try {
      if (m.media?.length || !m.explanation?.text?.trim()) return false;
      const collection = Array.isArray(m.options_or_statements)
        ? { options: m.options_or_statements, categories: [] }
        : m.options_or_statements;
      let answer = m.answer_key;
      if (m.question_type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' && 'optionIds' in answer)
        answer = {
          optionIds: collection.options
            .filter((o) => 'optionIds' in m.answer_key && m.answer_key.optionIds.includes(o.id))
            .map((o) => o.id),
        };
      const text = (t: { text: string }) => ({ text: t.text.replaceAll('\r\n', '\n') });
      const source = {
        questionType: m.question_type,
        stem: text(m.stem),
        optionsOrStatements: {
          options: collection.options.map((o) => ({ id: o.id, content: text(o.content) })),
          categories: collection.categories ?? [],
        },
        answerKey: answer,
      };
      return fingerprint(source as unknown as Json) === m.parameters.sourceFingerprint;
    } catch {
      return false;
    }
  });
}
export async function generatorCatalog(
  client: Sql,
  available?: {
    questionExternalId: string;
    mode: string;
    originalHash: string;
    originalVersion: number;
  }[],
) {
  requireGeneratorEnabled();
  await requireGeneratorMain(client);
  return {
    items: (await mappings(client))
      .filter(
        (m) =>
          !available ||
          available.some(
            (a) =>
              a.mode === 'generator' &&
              a.questionExternalId === m.label &&
              a.originalHash === m.parameters.originalHash &&
              a.originalVersion === m.parameters.originalVersion,
          ),
      )
      .map((m) => ({
        id: m.id,
        label: m.label,
        originalQuestionVersionId: m.original_id,
        contextId: m.context_id,
      })),
  };
}
async function mapping(tx: Sql | TransactionSql, id: string) {
  const rows = await mappings(tx, id);
  if (rows.length !== 1) fail('GENERATOR_MAPPING_NOT_APPROVED');
  return rows[0]!;
}
async function duplicate(tx: TransactionSql, key: string, fingerprint: string) {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${key},4))`;
  const [r] = await tx<{ request_id: string; operation_fingerprint: string }[]>`
    SELECT request_id,operation_fingerprint FROM analysis_request_dispatches WHERE operation_key=${key}`;
  if (r && r.operation_fingerprint !== fingerprint) fail('GENERATOR_IDEMPOTENCY_CONFLICT');
  return r?.request_id;
}
export async function prepareGeneration(
  client: Sql,
  actor: string,
  key: string,
  mappingId: string,
) {
  requireGeneratorEnabled();
  await requireGeneratorMain(client);
  if (!uuid(mappingId)) fail('GENERATOR_MAPPING_INVALID', 400);
  const id = await client.begin((tx) => prepareGenerationWithin(tx, actor, key, mappingId));
  return generationDetail(client, id);
}
export async function prepareGenerationWithin(
  tx: TransactionSql,
  actor: string,
  key: string,
  mappingId: string,
) {
  const op = operation(actor, key, 'PREPARE'),
    fp = hash({ mappingId });

  const previous = await duplicate(tx, op, fp);
  if (previous) return previous;
  const m = await mapping(tx, mappingId);
  const constraints = JSON.stringify({
    serviceContract: 'generator-service-v1',
    seed: randomInt(1, 1000000001),
  });
  const [wave] = await tx<
    { id: string }[]
  >`INSERT INTO generation_waves(code,status,created_by_user_id,approved_at,constraints)
      VALUES(${randomUUID()},'APPROVED',${actor},clock_timestamp(),'{}') RETURNING id`;
  const [item] = await tx<
    { id: string }[]
  >`INSERT INTO generation_wave_items(wave_id,original_question_version_id,context_id,generator_config_id,configuration_approval_id,target_count,max_regenerate_attempts,constraints)
      VALUES(${wave!.id},${m.original_id},${m.context_id},${m.config_id},${m.id},1,0,${constraints}::text::jsonb) RETURNING id`;
  const request = await createAnalysisRequest(tx, {
    idempotencyKey: op,
    requestType: 'GENERATE_VARIANTS',
    contextId: m.context_id,
    waveItemId: item!.id,
    configurationPins: [{ approvalId: m.id, digest: m.approved_digest }],
  });
  await tx`INSERT INTO analysis_request_dispatches(request_id,generation,operation_key,operation_fingerprint,actor_user_id)
      VALUES(${request.id},1,${op},${fp},${actor})`;
  await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(${actor},'GENERATOR_PREPARED','analysis_request',${request.id})`;
  return String(request.id);
}
export async function retryGeneration(client: Sql, actor: string, key: string, id: string) {
  requireGeneratorEnabled();
  await requireGeneratorMain(client);
  const op = operation(actor, key, 'RETRY'),
    fp = hash({ id });
  await client.begin(async (tx) => {
    if (await duplicate(tx, op, fp)) return;
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${id},3))`;
    const [r] = await tx<
      { approval_id: string }[]
    >`SELECT w.configuration_approval_id AS approval_id
      FROM analysis_requests r JOIN generation_wave_items w ON w.id=r.wave_item_id WHERE r.id=${id} AND r.request_type='GENERATE_VARIANTS' FOR UPDATE OF r`;
    if (!r) fail('GENERATOR_REQUEST_NOT_FOUND', 404);
    await mapping(tx, r.approval_id);
    await tx`INSERT INTO analysis_request_dispatches(request_id,generation,operation_key,operation_fingerprint,actor_user_id)
      SELECT ${id},max(generation)+1,${op},${fp},${actor} FROM analysis_request_dispatches WHERE request_id=${id}`;
    await tx`UPDATE analysis_requests SET status='PENDING' WHERE id=${id}`;
    await tx`UPDATE outbox_deliveries SET delivered_at=NULL,retry_at=NULL,failure_code=NULL WHERE consumer='irt_compute'
      AND outbox_id IN (SELECT id FROM analytics_outbox WHERE entity_id=${id} AND event_name='analysis.requested')`;
  });
  return generationDetail(client, id);
}
export async function generationDetail(client: Sql, id: string) {
  requireGeneratorEnabled();
  await requireGeneratorMain(client);
  const [r] = await client<
    {
      id: string;
      status: string;
      generation: number;
      execution_status: string | null;
      failure_code: string | null;
      lease_expired: boolean | null;
      accepted_execution_id: string | null;
      label: string;
    }[]
  >`
    SELECT r.id,r.status,r.accepted_execution_id,d.generation,e.status AS execution_status,(e.status='RUNNING' AND e.lease_expires_at<=clock_timestamp()) AS lease_expired,
    coalesce(e.failure_code,delivery.failure_code) AS failure_code,g.parameters->>'questionExternalId' AS label
    FROM analysis_requests r JOIN generation_wave_items w ON w.id=r.wave_item_id JOIN irt_compute.generator_configs g ON g.id=w.generator_config_id
    JOIN LATERAL (SELECT id,generation FROM analysis_request_dispatches WHERE request_id=r.id ORDER BY generation DESC LIMIT 1) d ON true
    LEFT JOIN irt_compute.compute_executions e ON e.dispatch_id=d.id
    LEFT JOIN analytics_outbox o ON o.entity_id=r.id AND o.event_name='analysis.requested'
    LEFT JOIN outbox_deliveries delivery ON delivery.outbox_id=o.id AND delivery.consumer='irt_compute'
    WHERE r.id=${id} AND r.request_type='GENERATE_VARIANTS'`;
  if (!r) fail('GENERATOR_REQUEST_NOT_FOUND', 404);
  return {
    id: r.id,
    label: r.label,
    status: r.status,
    dispatchGeneration: r.generation,
    executionStatus: r.execution_status,
    leaseExpired: r.lease_expired ?? false,
    failureCode: r.failure_code && /^[A-Z0-9_]{1,80}$/.test(r.failure_code) ? r.failure_code : null,
    accepted: !!r.accepted_execution_id,
  };
}
export async function listGenerations(client: Sql, limit: number, offset: number) {
  requireGeneratorEnabled();
  await requireGeneratorMain(client);
  const rows = await client<
    { id: string }[]
  >`SELECT r.id FROM analysis_requests r WHERE r.request_type='GENERATE_VARIANTS'
    AND EXISTS(SELECT 1 FROM analysis_request_dispatches d WHERE d.request_id=r.id AND d.generation=1)
    ORDER BY r.created_at DESC,r.id DESC LIMIT ${limit} OFFSET ${offset}`;
  return { items: await Promise.all(rows.map((r) => generationDetail(client, r.id))) };
}

export interface CandidatePayload {
  questionType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' | 'CATEGORY';
  stem: { text: string };
  optionsOrStatements: {
    options: { id: string; content: { text: string } }[];
    categories: { id: string; label: string }[];
  };
  answerKey:
    | { optionId: string }
    | { optionIds: string[] }
    | { categoryByStatementId: Record<string, string> };
  explanation: { text: string };
  media: [];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | null;
  rubricVersionId: string;
  contentFingerprint: string;
}
export function verifyFingerprint(payload: CandidatePayload) {
  if (contentFingerprint(payload as unknown as Record<string, Json>) !== payload.contentFingerprint)
    fail('GENERATOR_CONTENT_FINGERPRINT_INVALID');
}
export async function acceptedCandidate(
  tx: TransactionSql,
  id: string,
  validate: (payload: unknown) => CandidatePayload,
  accept = true,
) {
  await requireGeneratorMain(tx);
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${id},3))`;
  const [r] = await tx<
    {
      input_digest: string;
      accepted_execution_id: string | null;
      configuration_pins: { approvalId: string; digest: string }[];
      wave_item_id: string;
    }[]
  >`
    SELECT * FROM analysis_requests WHERE id=${id} AND request_type='GENERATE_VARIANTS' FOR UPDATE`;
  if (!r) fail('GENERATOR_REQUEST_NOT_FOUND', 404);
  const [w] = await tx<
    {
      configuration_approval_id: string;
      original_question_version_id: string;
      generator_config_id: string;
      context_id: string;
      constraints: { seed: number };
      target_count: number;
    }[]
  >`
    SELECT * FROM generation_wave_items WHERE id=${r.wave_item_id}`;
  if (!w) fail('GENERATOR_ARTIFACT_INVALID');
  const m = await mapping(tx, w.configuration_approval_id);
  if (
    w.original_question_version_id !== m.original_id ||
    w.context_id !== m.context_id ||
    w.generator_config_id !== m.config_id ||
    w.target_count !== 1 ||
    r.configuration_pins.length !== 1 ||
    r.configuration_pins[0]?.approvalId !== m.id ||
    r.configuration_pins[0]?.digest !== m.approved_digest
  )
    fail('GENERATOR_PIN_MISMATCH');
  const [e] = await tx<
    { id: string; status: string }[]
  >`SELECT e.id,e.status FROM irt_compute.compute_executions e
    JOIN analysis_request_dispatches d ON d.id=e.dispatch_id WHERE e.request_id=${id}
    AND d.generation=(SELECT max(generation) FROM analysis_request_dispatches WHERE request_id=${id}) ORDER BY e.attempt_number DESC LIMIT 1`;
  if (
    !e ||
    e.status !== 'SUCCEEDED' ||
    (r.accepted_execution_id && r.accepted_execution_id !== e.id)
  )
    fail('GENERATOR_NOT_SUCCEEDED');
  const outputs = await tx<
    { id: string; payload: { candidateIds: string[] }; valid: boolean }[]
  >`SELECT id,payload,
    (kind='GENERATE_VARIANTS' AND sequence_number=1 AND contract_version=3 AND scientific_decision='CONTENT_VALID'
    AND input_digest=${r.input_digest} AND digest=irt_compute.payload_digest(payload) AND dataset_id IS NULL) AS valid
    FROM irt_compute.compute_outputs WHERE execution_id=${e.id}`;
  const out = outputs[0];
  if (
    outputs.length !== 1 ||
    !out?.valid ||
    !out.payload ||
    typeof out.payload !== 'object' ||
    Array.isArray(out.payload) ||
    Object.keys(out.payload).length !== 1 ||
    !Array.isArray(out.payload.candidateIds) ||
    out.payload.candidateIds.length !== 1 ||
    !uuid(out.payload.candidateIds[0])
  )
    fail('GENERATOR_ARTIFACT_INVALID');
  const candidates = await tx<
    {
      id: string;
      payload: unknown;
      payload_digest: string;
      parent_original_question_version_id: string;
      valid: boolean;
    }[]
  >`
    SELECT c.id,c.payload,c.payload_digest,c.parent_original_question_version_id,
    (c.sealed_at IS NOT NULL AND c.validation_status='CONTENT_VALID' AND c.payload_digest=irt_compute.payload_digest(c.payload)
      AND c.parent_original_question_version_id=${m.original_id} AND run.original_question_version_id=${m.original_id}
      AND run.config_id=${m.config_id} AND run.wave_item_id=${r.wave_item_id} AND run.status='SUCCEEDED'
      AND run.random_seed=${String(w.constraints.seed)} AND c.random_seed=run.random_seed
      AND c.parameter_values=run.parameter_values AND c.parameter_values->>'seed'=${String(w.constraints.seed)}
      AND c.parameter_values->>'questionExternalId'=${m.label}
      AND c.parameter_values->>'originalHash'=${String(m.parameters.originalHash)}
      AND c.parameter_values->>'originalVersion'=${String(m.parameters.originalVersion)}
      AND c.parameter_values->>'configHash'=${String(m.parameters.configHash)}
      AND c.parameter_values->>'configVersion'=${String(m.parameters.configVersion)}) AS valid
    FROM irt_compute.generation_candidates c JOIN irt_compute.generation_runs run ON run.id=c.generation_run_id
    WHERE run.execution_id=${e.id}`;
  const c = candidates[0];
  if (candidates.length !== 1 || !c?.valid || c.id !== out.payload.candidateIds[0])
    fail('GENERATOR_CANDIDATE_INVALID');
  const payload = validate(c.payload);
  verifyFingerprint(payload);
  const [source] = await tx<
    { question_type: string; difficulty: string | null }[]
  >`SELECT question_type,difficulty FROM question_versions WHERE id=${m.original_id}`;
  if (
    payload.rubricVersionId !== m.rubric_id ||
    payload.questionType !== source?.question_type ||
    payload.difficulty !== source.difficulty
  )
    fail('GENERATOR_RUBRIC_MISMATCH');
  if (accept && !r.accepted_execution_id)
    await tx`UPDATE analysis_requests SET accepted_execution_id=${e.id},status='COMPLETED' WHERE id=${id}`;
  return { ...c, payload, familyId: m.family_id, originalId: m.original_id };
}
export async function saveGenerationDraft(
  client: Sql,
  actor: string,
  id: string,
  validate: (payload: unknown) => CandidatePayload,
) {
  requireGeneratorEnabled();
  await requireGeneratorMain(client);
  return client.begin((tx) => saveGenerationDraftWithin(tx, actor, id, validate));
}
export async function saveGenerationDraftWithin(
  tx: TransactionSql,
  actor: string,
  id: string,
  validate: (payload: unknown) => CandidatePayload,
) {
  const c = await acceptedCandidate(tx, id, validate);
  await tx`SELECT id FROM questions WHERE id=${c.familyId} FOR UPDATE`;
  const [previous] = await tx<
    { question_version_id: string }[]
  >`SELECT question_version_id FROM candidate_imports WHERE candidate_id=${c.id}`;
  if (previous) return { id: previous.question_version_id };
  const [existing] = await tx<
    { id: string; parent_original_question_version_id: string; equal: boolean }[]
  >`SELECT q.id,q.parent_original_question_version_id,
      jsonb_build_object('questionType',q.question_type,'stem',q.stem,'optionsOrStatements',q.options_or_statements,'answerKey',q.answer_key,'explanation',q.explanation,'media',q.media,'difficulty',q.difficulty,'rubricVersionId',q.scoring_rubric_version_id,'contentFingerprint',q.content_fingerprint)=${JSON.stringify(c.payload)}::text::jsonb AS equal
      FROM question_versions q JOIN question_variants v ON v.id=q.variant_id
      WHERE v.question_id=${c.familyId} AND q.content_fingerprint=${c.payload.contentFingerprint} ORDER BY q.created_at,q.id LIMIT 1`;
  if (
    existing &&
    (!existing.equal || existing.parent_original_question_version_id !== c.originalId)
  )
    fail('GENERATOR_DUPLICATE_LINEAGE_CONFLICT');
  let versionId = existing?.id;
  if (!versionId) {
    const [v] = await tx<
      { id: string }[]
    >`INSERT INTO question_variants(question_id,original_variant_id,variant_code,kind,origin)
        SELECT ${c.familyId},variant_id,${'G-' + c.id},'VARIANT','GENERATOR' FROM question_versions WHERE id=${c.originalId} RETURNING id`;
    const p = c.payload;
    const [q] = await tx<
      { id: string }[]
    >`INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,scoring_rubric_version_id,content_fingerprint,parent_original_question_version_id,level_id,content_status)
        SELECT ${v!.id},1,${p.questionType},${JSON.stringify(p.stem)}::text::jsonb,${JSON.stringify(p.optionsOrStatements)}::text::jsonb,
        ${JSON.stringify(p.answerKey)}::text::jsonb,${JSON.stringify(p.explanation)}::text::jsonb,'[]'::jsonb,${p.difficulty},${p.rubricVersionId},${p.contentFingerprint},${c.originalId},level_id,'DRAFT'
        FROM question_versions WHERE id=${c.originalId} RETURNING id`;
    versionId = q!.id;
  }
  await tx`INSERT INTO candidate_imports(candidate_id,question_version_id,payload_digest,imported_by_user_id) VALUES(${c.id},${versionId},${c.payload_digest},${actor})`;
  await tx`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(${actor},'GENERATOR_DRAFT_SAVED','question_version',${versionId})`;
  return { id: versionId };
}

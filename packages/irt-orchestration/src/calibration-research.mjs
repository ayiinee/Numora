// Opt-in research adapter. No canonical grades, publication, XP or parameter adoption.
import { createHmac } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validateInput, validateResult } from '../../contracts/irt-calibration-v1/validate.mjs';

const kinds = {model:'IRT_MODEL',quality:'QUALITY_GATE',eligibility:'IRT_ELIGIBILITY',scoring:'IRT_SCORING',scoreMapping:'SCORE_MAPPING'};
export function respondentUuid(secret, keyVersion, contextId, studentId) {
  if (Buffer.byteLength(secret)<32) throw new Error('IRT_PSEUDONYM_NOT_CONFIGURED');
  const bytes=createHmac('sha256',secret).update(JSON.stringify([keyVersion,contextId,studentId])).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|0x80; bytes[8]=(bytes[8]&63)|0x80;
  const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export async function freezeCalibrationResearch(sql, draft, resources, runtime, {secret,keyVersion}) {
  if(process.env.NUMORA_IRT_RESEARCH_ENABLED!=='true') throw new Error('IRT_RESEARCH_DISABLED');
  const input=structuredClone(draft);
  if(input.ecosystem!=='TRYOUT'||input.comparisons.length) throw new Error('UNSUPPORTED_CONTRACT');
  // Caller selects the frozen manifests; source attempt identity/grades are authoritative.
  const attemptIds=input.respondents.map(p=>p.attemptId);
  return sql.begin(async tx=>{
    const manifests=await tx`SELECT r.package_id,p.package_version,r.arm_id,arm.kind,r.anchor_question_version_ids,
      p.curriculum_approval,p.frozen_at,r.manifest_digest,
      r.manifest_digest=irt_compute.payload_digest(jsonb_build_object('packageId',p.id,'packageVersion',p.package_version,
        'approval',p.curriculum_approval,'scoringPolicy',p.scoring_policy_version_id,'anchors',r.anchor_question_version_ids,
        'items',(SELECT jsonb_agg(to_jsonb(pi) ORDER BY pi.display_order) FROM package_items pi WHERE pi.package_id=p.id))) AS digest_valid,
      (SELECT array_agg(pi.question_version_id ORDER BY pi.display_order) FROM package_items pi WHERE pi.package_id=p.id) AS question_ids
      FROM assessment_arm_revisions r JOIN assessment_packages p ON p.id=r.package_id
      JOIN assessment_arms arm ON arm.id=r.arm_id JOIN assessment_arm_sets s ON s.id=arm.set_id
      JOIN tryout_batch_packages membership ON membership.package_id=p.id AND membership.arm_id=arm.id
      WHERE s.context_id=${input.context.contextId} AND membership.batch_id=${input.context.batchId}`;
    for(const p of input.packages) {
      const manifest=manifests.find(m=>m.package_id===p.packageId&&m.package_version===p.packageVersion&&m.arm_id===p.armId);
      if(!manifest||!manifest.digest_valid||!manifest.frozen_at||!manifest.curriculum_approval||manifest.kind!==p.armKind||
        !isDeepStrictEqual([...manifest.anchor_question_version_ids].sort(),[...input.anchorQuestionVersionIds].sort())||
        !isDeepStrictEqual(manifest.question_ids,p.questionVersionIds))throw new Error('IRT_CANONICAL_MANIFEST_MISMATCH');
    }
    const canonicalItems=await tx`SELECT q.id,q.content_fingerprint,q.question_type,q.parent_original_question_version_id,
      q.validation_state,q.content_status,q.scoring_rubric_version_id,v.question_id,v.kind,
      r.maximum_score_category,r.status AS rubric_status,r.approved_at,r.approved_by_user_id
      FROM question_versions q JOIN question_variants v ON v.id=q.variant_id
      JOIN scoring_rubric_versions r ON r.id=q.scoring_rubric_version_id WHERE q.id=ANY(${input.items.map(i=>i.questionVersionId)}::uuid[])`;
    for(const item of input.items) {
      const source=canonicalItems.find(q=>q.id===item.questionVersionId);
      if(!source||source.content_fingerprint!==item.contentDigest||source.question_id!==item.familyId||source.question_type!==item.questionType||
        source.scoring_rubric_version_id!==item.rubricVersionId||source.maximum_score_category!==item.maximumScoreCategory||
        source.rubric_status!=='SEALED'||!source.approved_at||!source.approved_by_user_id||source.validation_state!=='CONTENT_VALID'||source.content_status!=='READY'||
        (source.kind==='ORIGINAL'?source.id:source.parent_original_question_version_id)!==item.originalQuestionVersionId)throw new Error('IRT_CANONICAL_ITEM_MISMATCH');
    }
    const sources=await tx`SELECT a.id,a.student_id,a.package_id,a.status,a.finished_at,
      a.tryout_batch_id,a.started_at,
      i.id AS attempt_item_id,i.question_version_id,i.rubric_version_id,i.maximum_score_category,i.max_points,
      ans.score_category,ans.awarded_points,ans.response_state,ans.graded_at,
      assignment.assigned_arm_id,revision.arm_id AS delivered_arm_id,pin.fallback_reason,pin.delivered_revision_id,
      pin.delivery_mode,package.package_version,
      EXISTS(SELECT 1 FROM content_delivery_items di JOIN content_delivery_manifests dm ON dm.id=di.manifest_id
        WHERE di.attempt_item_id=i.id AND di.question_version_id=i.question_version_id AND dm.student_id=a.student_id
        AND dm.module='TRYOUT' AND dm.kind='ITEM_PAYLOAD_ISSUED') AS was_presented,
      ARRAY(SELECT DISTINCT CASE WHEN e.kind='EXPLANATION_PAYLOAD_ISSUED' THEN 'EXPLANATION' ELSE e.module END
        FROM student_item_exposures e JOIN question_variants v ON v.question_id=e.family_id
        JOIN question_versions q ON q.variant_id=v.id WHERE q.id=i.question_version_id AND e.student_id=a.student_id
        AND e.occurred_at<a.started_at) AS prior_sources
      FROM assessment_attempts a JOIN attempt_items i ON i.attempt_id=a.id
      JOIN attempt_answers ans ON ans.attempt_item_id=i.id
      JOIN assessment_attempt_arm_deliveries pin ON pin.attempt_id=a.id
      JOIN assessment_arm_assignments assignment ON assignment.id=pin.assignment_id
      JOIN assessment_arm_revisions revision ON revision.id=pin.delivered_revision_id
      JOIN assessment_packages package ON package.id=a.package_id
      WHERE a.id=ANY(${attemptIds}::uuid[]) ORDER BY a.id,i.id`;
    // Pin table naming is part of this adapter and tested against the current schema.
    if(!sources.length) throw new Error('IRT_CANONICAL_SOURCE_MISSING');
    const sourceMap=new Map(sources.map(r=>[r.attempt_item_id,r]));
    for(const person of input.respondents) {
      const rows=sources.filter(r=>r.id===person.attemptId);
      if(rows.length!==30 || rows.some(r=>!r.graded_at || !r.finished_at || r.status!=='GRADED' || r.tryout_batch_id!==input.context.batchId || r.tryout_batch_id!==person.batchId || r.package_id!==person.packageId || r.package_version!==person.packageVersion || r.assigned_arm_id!==person.assignedArmId || r.delivered_arm_id!==person.deliveredArmId || r.delivery_mode!==person.deliveryMode)) throw new Error('IRT_CANONICAL_ATTEMPT_MISMATCH');
      person.respondentId=respondentUuid(secret,keyVersion,input.context.contextId,rows[0].student_id);
      person.submittedAt=rows[0].finished_at.toISOString();
      person.gradedAt=new Date(Math.max(...rows.map(r=>new Date(r.graded_at).getTime()))).toISOString();
      person.attemptIndex=1;person.firstValidAttempt=true;
    }
    for(const response of input.responses) {
      const source=sourceMap.get(response.attemptItemId);
      const person=input.respondents.find(p=>p.attemptId===response.attemptId);
      if(!source||source.id!==response.attemptId||source.question_version_id!==response.questionVersionId||source.rubric_version_id!==response.rubricVersionId) throw new Error('IRT_CANONICAL_GRADE_MISMATCH');
      response.respondentId=person.respondentId;
      response.scoreCategory=source.score_category;
      response.awardedPoints=source.awarded_points;
      response.responseState=source.response_state;
      response.priorExposureSources=[...new Set(source.prior_sources)].sort();
      response.exposureState=response.priorExposureSources.length?'KNOWN_PRIOR':'FRESH';
      response.eligibilityReasons=[!source.was_presented?'NOT_PRESENTED':person.deliveryMode!=='ASSIGNED'?'ARM_CROSSOVER':response.priorExposureSources.length?'PRIOR_EXPOSURE':'FIRST_VALID_ATTEMPT'];
      response.includedInCalibration=source.was_presented&&person.deliveryMode==='ASSIGNED'&&!response.priorExposureSources.length;
    }
    validateInput(input);
    return freezeValidated(tx,input,resources,runtime);
  });
}

export async function freezeValidated(sql, input, resources, runtime) {
  validateInput(input);
  if(input.ecosystem!=='TRYOUT'||input.comparisons.length)throw new Error('UNSUPPORTED_CONTRACT');
  for(const [key,kind] of Object.entries(kinds)) {
    if(!isDeepStrictEqual(resources[key]?.ref,input.policies[key])||resources[key]?.kind!==kind)throw new Error('IRT_POLICY_RESOURCE_MISMATCH');
  }
  if(input.policies.comparison!==null)throw new Error('IRT_COMPARISON_NOT_SUPPORTED');
  const body=structuredClone(input);delete body.inputDigest;
  const [row]=await sql`INSERT INTO irt_calibration_requests_v1(id,snapshot_id,context_id,body,resources,runtime_profile,input_digest)
    VALUES(${input.requestId},${input.snapshotId},${input.context.contextId},${sql.json(body)},${sql.json(resources)},${sql.json(runtime)},'')
    ON CONFLICT(id) DO NOTHING RETURNING id,input_digest`;
  if(row)return {requestId:row.id,inputDigest:row.input_digest};
  const [existing]=await sql`SELECT id,input_digest FROM irt_calibration_requests_v1 WHERE id=${input.requestId}
    AND body=${sql.json(body)}::jsonb AND resources=${sql.json(resources)}::jsonb AND runtime_profile=${sql.json(runtime)}::jsonb`;
  if(!existing)throw new Error('IRT_IDEMPOTENCY_CONFLICT');
  return {requestId:existing.id,inputDigest:existing.input_digest};
}

export async function dispatchCalibrationResearch(sql,requestId,actorId) {
  return sql.begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${requestId},53))`;
    const [request]=await tx`SELECT input_digest FROM irt_calibration_requests_v1 WHERE id=${requestId}`;
    if(!request)throw new Error('IRT_REQUEST_NOT_FOUND');
    const [row]=await tx`INSERT INTO irt_calibration_dispatches_v1(request_id,generation,actor_user_id)
      SELECT ${requestId},coalesce(max(generation),0)+1,${actorId} FROM irt_calibration_dispatches_v1 WHERE request_id=${requestId} RETURNING generation`;
    return {contractVersion:3,requestId,inputDigest:request.input_digest,dispatchGeneration:row.generation};
  });
}

export async function notifyCalibrationResearch(notification,{url,token}) {
  if(process.env.NUMORA_IRT_RESEARCH_ENABLED!=='true')throw new Error('IRT_RESEARCH_DISABLED');
  const response=await fetch(new URL('/api/v1/irt/compute/execute',url),{method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(notification),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw new Error('IRT_ACKNOWLEDGEMENT_FAILED');
  const ack=await response.json();
  if(ack.serviceContract!=='irt-calibration-service-v1'||ack.requestId!==notification.requestId||ack.inputDigest!==notification.inputDigest||ack.dispatchGeneration!==notification.dispatchGeneration)throw new Error('IRT_ACKNOWLEDGEMENT_MISMATCH');
  return ack;
}

export async function deliverPendingCalibrationResearch(sql,options) {
  if(process.env.NUMORA_IRT_RESEARCH_ENABLED!=='true')throw new Error('IRT_RESEARCH_DISABLED');
  const rows=await sql`SELECT o.id,o.payload FROM analytics_outbox o
    JOIN outbox_deliveries d ON d.outbox_id=o.id AND d.consumer='irt_research'
    JOIN irt_calibration_inputs_v1 source ON source.id=o.entity_id
    WHERE o.event_name='irt.research.requested' AND d.delivered_at IS NULL
    AND (d.retry_at IS NULL OR d.retry_at<=clock_timestamp())
    AND source.current_generation=(o.payload->>'dispatchGeneration')::int
    AND source.approvals_valid AND NOT source.cancelled ORDER BY o.occurred_at,o.id LIMIT 20`;
  let acknowledged=0,failed=0;
  for(const row of rows) {
    let error=false;
    try {await notifyCalibrationResearch(row.payload,options);acknowledged++;} catch {error=true;failed++;}
    await sql`UPDATE outbox_deliveries SET attempts=attempts+1,
      delivered_at=CASE WHEN ${error} THEN NULL ELSE clock_timestamp() END,
      retry_at=CASE WHEN ${error} THEN clock_timestamp()+interval '15 seconds' ELSE NULL END,
      failure_code=CASE WHEN ${error} THEN 'IRT_ACKNOWLEDGEMENT_FAILED' ELSE NULL END
      WHERE outbox_id=${row.id} AND consumer='irt_research'`;
  }
  return {acknowledged,failed};
}

export async function verifyCalibrationResearchArtifact(sql, requestId) {
  const [row]=await sql`SELECT source.payload AS input,source.runtime_profile,source.cancelled,source.approvals_valid,
    source.current_generation,j.execution_id,j.generation,a.payload,a.diagnostics,
    a.digest=irt_compute.payload_digest(jsonb_build_object('payload',a.payload,'diagnostics',a.diagnostics,'runtime',source.runtime_profile)) AS digest_valid
    FROM irt_calibration_inputs_v1 source JOIN irt_compute.calibration_jobs_v1 j ON j.request_id=source.id AND j.generation=source.current_generation
    JOIN irt_compute.calibration_artifacts_v1 a ON a.job_id=j.id WHERE source.id=${requestId} AND j.status IN ('SUCCEEDED','FAILED')`;
  if(!row||row.cancelled||!row.approvals_valid||!row.digest_valid)throw new Error('IRT_ARTIFACT_NOT_ACCEPTABLE');
  validateResult(row.payload,row.input,{executionId:row.execution_id,dispatchGeneration:row.generation});
  return {verified:true,result:row.payload,diagnostics:row.diagnostics,publication:false};
}

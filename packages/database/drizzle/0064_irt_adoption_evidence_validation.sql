-- Validate exact child identity once at sealing; avoid copying a whole batch per inserted row.
CREATE OR REPLACE FUNCTION public.irt_adoption_receipt_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q record; j record; b public.irt_batches;
BEGIN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.status='ADOPTED') THEN
  RAISE EXCEPTION 'Adopted receipt is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.request_id IS DISTINCT FROM OLD.request_id
  OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
  RAISE EXCEPTION 'Receipt identity is immutable' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.request_id::text,53));
 SELECT * INTO q FROM public.irt_calibration_inputs_v1 WHERE id=NEW.request_id;
 IF q.id IS NULL OR q.cancelled OR NOT q.approvals_valid THEN
  RAISE EXCEPTION 'Receipt authorization stale' USING ERRCODE='23514';
 END IF;
 IF NEW.status='FAILED' THEN
  IF TG_OP<>'INSERT' AND OLD.status<>'FAILED' THEN RAISE EXCEPTION 'Receipt cannot downgrade' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 SELECT a.*,job.execution_id,job.generation,job.status AS job_status INTO j
  FROM irt_compute.calibration_artifacts_v1 a JOIN irt_compute.calibration_jobs_v1 job ON job.id=a.job_id
  WHERE a.id=NEW.artifact_id AND job.request_id=NEW.request_id;
 IF j.id IS NULL OR j.execution_id IS DISTINCT FROM NEW.execution_id OR j.generation IS DISTINCT FROM q.current_generation
  OR j.job_status IS DISTINCT FROM 'SUCCEEDED' OR j.digest IS DISTINCT FROM NEW.artifact_digest
  OR j.payload->>'executionStatus' IS DISTINCT FROM 'SUCCEEDED'
  OR j.payload->>'requestId' IS DISTINCT FROM NEW.request_id::text
  OR j.payload->>'inputDigest' IS DISTINCT FROM q.input_digest
  OR j.digest IS DISTINCT FROM irt_compute.payload_digest(jsonb_build_object('payload',j.payload,'diagnostics',j.diagnostics,
    'runtime',(SELECT runtime_profile FROM public.irt_calibration_requests_v1 WHERE id=NEW.request_id))) THEN
  RAISE EXCEPTION 'Receipt must pin current sealed artifact' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND (NEW.status<>'RECEIVED' OR NEW.batch_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Receipt must begin received' USING ERRCODE='23514';
 END IF;
 IF NEW.status='ADOPTED' THEN
  SELECT * INTO b FROM public.irt_batches WHERE id=NEW.batch_id;
  IF b.id IS NULL OR b.adoption_receipt_id IS DISTINCT FROM NEW.id OR b.source_request_id IS DISTINCT FROM NEW.request_id
   OR b.source_execution_id IS DISTINCT FROM NEW.execution_id OR b.source_calibration_artifact_id IS DISTINCT FROM NEW.artifact_id
   OR b.output_digest IS DISTINCT FROM NEW.artifact_digest
   OR (SELECT count(*) FROM public.irt_artifact_adoption_packages_v1 WHERE receipt_id=NEW.id)<>jsonb_array_length(q.body->'packages')
   OR (SELECT count(*) FROM public.irt_artifact_adoption_attempts_v1 WHERE receipt_id=NEW.id)<>jsonb_array_length(q.body->'respondents')
   OR (SELECT count(*) FROM public.irt_item_results WHERE batch_id=b.id)<>jsonb_array_length(j.payload#>'{outcome,items}') THEN
   RAISE EXCEPTION 'Adopted receipt requires exact canonical coverage' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(q.body->'packages') pin
    LEFT JOIN public.irt_artifact_adoption_packages_v1 c ON c.receipt_id=NEW.id AND c.package_id=(pin->>'packageId')::uuid
    LEFT JOIN public.assessment_packages p ON p.id=c.package_id AND p.package_version=c.package_version
    WHERE c.id IS NULL OR c.package_version IS DISTINCT FROM (pin->>'packageVersion')::integer
      OR c.arm_id::text IS DISTINCT FROM pin->>'armId' OR c.arm_kind IS DISTINCT FROM pin->>'armKind'
      OR c.manifest_digest IS DISTINCT FROM p.manifest_digest OR c.manifest_digest IS NULL OR c.manifest_digest='')
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(q.body->'respondents') pin
    LEFT JOIN public.irt_artifact_adoption_attempts_v1 c ON c.receipt_id=NEW.id AND c.attempt_id=(pin->>'attemptId')::uuid
    WHERE c.id IS NULL OR c.respondent_id IS DISTINCT FROM pin->>'respondentId'
      OR c.package_id::text IS DISTINCT FROM pin->>'packageId' OR c.package_version IS DISTINCT FROM (pin->>'packageVersion')::integer
      OR c.assigned_arm_id::text IS DISTINCT FROM pin->>'assignedArmId' OR c.delivered_arm_id::text IS DISTINCT FROM pin->>'deliveredArmId')
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(j.payload#>'{outcome,respondents}') result
    LEFT JOIN public.irt_artifact_adoption_attempts_v1 c ON c.receipt_id=NEW.id AND c.attempt_id=(result->>'attemptId')::uuid
    WHERE c.id IS NULL OR c.result_snapshot IS DISTINCT FROM result OR c.result_status IS DISTINCT FROM result->>'status'
      OR c.reason_codes IS DISTINCT FROM result->'reasonCodes') THEN
   RAISE EXCEPTION 'Adoption evidence must copy frozen identity and artifact' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.irt_adoption_child_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r public.irt_artifact_adoption_receipts_v1;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Adoption evidence is immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM public.irt_artifact_adoption_receipts_v1 WHERE id=NEW.receipt_id FOR UPDATE;
 IF r.id IS NULL OR r.status<>'RECEIVED' THEN RAISE EXCEPTION 'Receipt must be receiving evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

--> statement-breakpoint
-- Check OLD bindings too: clearing a research source must not bypass the legacy-aware guard.
CREATE FUNCTION public.irt_research_adopted_immutable_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='irt_batches' THEN
  IF OLD.source_calibration_artifact_id IS NOT NULL THEN
   RAISE EXCEPTION 'Research batch is immutable' USING ERRCODE='23514';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.irt_batches WHERE id=OLD.batch_id AND source_calibration_artifact_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Research item is immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irt_research_batch_immutable_v1 BEFORE UPDATE OR DELETE ON public.irt_batches
 FOR EACH ROW EXECUTE FUNCTION public.irt_research_adopted_immutable_v1();
CREATE TRIGGER irt_research_item_immutable_v1 BEFORE UPDATE OR DELETE ON public.irt_item_results
 FOR EACH ROW EXECUTE FUNCTION public.irt_research_adopted_immutable_v1();
REVOKE ALL ON FUNCTION public.irt_research_adopted_immutable_v1() FROM PUBLIC;

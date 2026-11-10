-- Adoption receipts are durable evidence, not a mutable job-status cache.
CREATE FUNCTION public.irt_adoption_receipt_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
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
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irt_adoption_receipt_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.irt_artifact_adoption_receipts_v1
 FOR EACH ROW EXECUTE FUNCTION public.irt_adoption_receipt_guard_v1();
--> statement-breakpoint
CREATE FUNCTION public.irt_adoption_child_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r public.irt_artifact_adoption_receipts_v1; q jsonb; a jsonb; pin jsonb; result jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Adoption evidence is immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM public.irt_artifact_adoption_receipts_v1 WHERE id=NEW.receipt_id FOR UPDATE;
 IF r.id IS NULL OR r.status<>'RECEIVED' THEN RAISE EXCEPTION 'Receipt must be receiving evidence' USING ERRCODE='23514'; END IF;
 SELECT body INTO q FROM public.irt_calibration_requests_v1 WHERE id=r.request_id;
 SELECT payload INTO a FROM irt_compute.calibration_artifacts_v1 WHERE id=r.artifact_id;
 IF TG_TABLE_NAME='irt_artifact_adoption_packages_v1' THEN
  SELECT value INTO pin FROM jsonb_array_elements(q->'packages') WHERE value->>'packageId'=NEW.package_id::text;
  IF pin IS NULL OR (pin->>'packageVersion')::integer IS DISTINCT FROM NEW.package_version
   OR pin->>'armId' IS DISTINCT FROM NEW.arm_id::text OR pin->>'armKind' IS DISTINCT FROM NEW.arm_kind
   OR NEW.manifest_digest IS DISTINCT FROM (SELECT manifest_digest FROM public.assessment_packages WHERE id=NEW.package_id AND package_version=NEW.package_version)
   OR NEW.manifest_digest IS NULL OR NEW.manifest_digest='' THEN
   RAISE EXCEPTION 'Package must copy frozen identity' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT value INTO pin FROM jsonb_array_elements(q->'respondents') WHERE value->>'attemptId'=NEW.attempt_id::text;
  SELECT value INTO result FROM jsonb_array_elements(a#>'{outcome,respondents}') WHERE value->>'attemptId'=NEW.attempt_id::text;
  IF pin IS NULL OR result IS NULL OR pin->>'respondentId' IS DISTINCT FROM NEW.respondent_id
   OR pin->>'packageId' IS DISTINCT FROM NEW.package_id::text OR (pin->>'packageVersion')::integer IS DISTINCT FROM NEW.package_version
   OR pin->>'assignedArmId' IS DISTINCT FROM NEW.assigned_arm_id::text OR pin->>'deliveredArmId' IS DISTINCT FROM NEW.delivered_arm_id::text
   OR result IS DISTINCT FROM NEW.result_snapshot OR result->>'status' IS DISTINCT FROM NEW.result_status
   OR result->'reasonCodes' IS DISTINCT FROM NEW.reason_codes THEN
   RAISE EXCEPTION 'Attempt must copy frozen identity and artifact' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irt_adoption_package_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.irt_artifact_adoption_packages_v1
 FOR EACH ROW EXECUTE FUNCTION public.irt_adoption_child_guard_v1();
CREATE TRIGGER irt_adoption_attempt_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.irt_artifact_adoption_attempts_v1
 FOR EACH ROW EXECUTE FUNCTION public.irt_adoption_child_guard_v1();
--> statement-breakpoint
CREATE FUNCTION public.irt_adoption_complete_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.irt_artifact_adoption_receipts_v1 WHERE id=NEW.id AND status='RECEIVED') THEN
  RAISE EXCEPTION 'Partial adoption cannot commit' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER irt_adoption_complete_guard_v1 AFTER INSERT OR UPDATE ON public.irt_artifact_adoption_receipts_v1
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.irt_adoption_complete_guard_v1();
REVOKE ALL ON FUNCTION public.irt_adoption_receipt_guard_v1(),public.irt_adoption_child_guard_v1(),public.irt_adoption_complete_guard_v1() FROM PUBLIC;

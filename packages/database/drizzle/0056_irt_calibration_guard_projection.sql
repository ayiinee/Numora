-- Avoid materializing scientific response payloads on every lease heartbeat.
-- All authorization, fencing, immutability and artifact digest rules remain intact.
CREATE OR REPLACE FUNCTION irt_compute.calibration_job_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source record;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Job history immutable' USING ERRCODE='23514'; END IF;
 SELECT id,cancelled,approvals_valid,current_generation INTO source FROM public.irt_calibration_inputs_v1 WHERE id=NEW.request_id;
 IF (TG_OP='INSERT' OR NEW.status IN ('RUNNING','SUCCEEDED')) AND
  (source.id IS NULL OR source.cancelled OR NOT source.approvals_valid OR source.current_generation<>NEW.generation) THEN RAISE EXCEPTION 'Calibration authorization stale' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'ACCEPTED' OR NEW.execution_id IS NOT NULL THEN RAISE EXCEPTION 'New job must be accepted' USING ERRCODE='23514'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','execution_id','lease_expires_at','heartbeat_at','failure_code','finished_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','execution_id','lease_expires_at','heartbeat_at','failure_code','finished_at'])
   OR OLD.status NOT IN ('ACCEPTED','RUNNING') OR (OLD.execution_id IS NOT NULL AND OLD.execution_id IS DISTINCT FROM NEW.execution_id)
   OR (OLD.status='RUNNING' AND NEW.status='ACCEPTED') THEN RAISE EXCEPTION 'Invalid execution transition' USING ERRCODE='23514'; END IF;
  IF NEW.status='RUNNING' AND (NEW.execution_id IS NULL OR NEW.lease_expires_at<=clock_timestamp() OR (OLD.status='RUNNING' AND OLD.lease_expires_at<=clock_timestamp())) THEN RAISE EXCEPTION 'Live fenced execution required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION irt_compute.calibration_artifact_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE job irt_compute.calibration_jobs_v1; source record;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Artifact immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO job FROM irt_compute.calibration_jobs_v1 WHERE id=NEW.job_id FOR UPDATE;
 SELECT id,cancelled,approvals_valid,current_generation,input_digest,snapshot_id,body,runtime_profile INTO source FROM public.irt_calibration_inputs_v1 WHERE id=job.request_id;
 IF job.id IS NULL OR source.id IS NULL OR job.status IS DISTINCT FROM 'RUNNING' OR job.lease_expires_at IS NULL OR job.lease_expires_at<=clock_timestamp() OR source.cancelled OR NOT source.approvals_valid OR source.current_generation IS DISTINCT FROM job.generation
  OR NEW.payload->>'contractVersion' IS DISTINCT FROM 'irt-calibration-v1' OR NEW.payload->>'requestId' IS DISTINCT FROM job.request_id::text
  OR NEW.payload->>'executionId' IS DISTINCT FROM job.execution_id::text OR NEW.payload->>'inputDigest' IS DISTINCT FROM source.input_digest
  OR NEW.payload->>'snapshotId' IS DISTINCT FROM source.snapshot_id::text OR NEW.payload->>'calibrationId' IS DISTINCT FROM source.body->>'calibrationId'
  OR NEW.payload->'context' IS DISTINCT FROM source.body->'context'
  OR (NEW.payload->>'dispatchGeneration')::int IS DISTINCT FROM job.generation THEN RAISE EXCEPTION 'Invalid or stale calibration artifact' USING ERRCODE='23514'; END IF;
 NEW.digest:=irt_compute.payload_digest(jsonb_build_object('payload',NEW.payload,'diagnostics',NEW.diagnostics,'runtime',source.runtime_profile));
 RETURN NEW;
END $$;

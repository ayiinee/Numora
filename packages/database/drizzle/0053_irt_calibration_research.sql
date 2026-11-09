-- Research-only additive runtime. No grade/publication/XP table is changed.
CREATE TABLE public.irt_calibration_requests_v1 (
 id uuid PRIMARY KEY, snapshot_id uuid NOT NULL UNIQUE, context_id uuid NOT NULL REFERENCES public.measurement_contexts(id),
 body jsonb NOT NULL, resources jsonb NOT NULL, runtime_profile jsonb NOT NULL,
 input_digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (body->>'contractVersion'='irt-calibration-v1' AND body->>'ecosystem'='TRYOUT'),
 CHECK (NOT body ? 'inputDigest'), CHECK (jsonb_array_length(body->'comparisons')=0),
 CHECK (runtime_profile->>'purpose'='RESEARCH_ONLY'),
 CHECK (runtime_profile->>'image' ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE public.irt_calibration_dispatches_v1 (
 request_id uuid NOT NULL REFERENCES public.irt_calibration_requests_v1(id), generation integer NOT NULL CHECK(generation BETWEEN 1 AND 3),
 actor_user_id uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(request_id,generation)
);
CREATE TABLE public.irt_calibration_cancellations_v1 (
 request_id uuid PRIMARY KEY REFERENCES public.irt_calibration_requests_v1(id), actor_user_id uuid NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE irt_compute.calibration_jobs_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL, generation integer NOT NULL,
 status text NOT NULL DEFAULT 'ACCEPTED' CHECK(status IN ('ACCEPTED','RUNNING','SUCCEEDED','FAILED','EXPIRED')),
 execution_id uuid UNIQUE, fencing_token bigint GENERATED ALWAYS AS IDENTITY,
 lease_expires_at timestamptz, heartbeat_at timestamptz, failure_code text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 UNIQUE(request_id,generation), FOREIGN KEY(request_id,generation) REFERENCES public.irt_calibration_dispatches_v1(request_id,generation)
);
CREATE TABLE irt_compute.calibration_artifacts_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL UNIQUE REFERENCES irt_compute.calibration_jobs_v1(id),
 payload jsonb NOT NULL, diagnostics jsonb NOT NULL, digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE FUNCTION public.irt_calibration_request_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resource jsonb; target irt_compute.technical_policy_versions; approval public.configuration_approvals;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Frozen calibration input is immutable' USING ERRCODE='23514'; END IF;
 -- Owner authorized only disposable local research in this delivery.
 IF current_database() NOT LIKE 'irt_research_test_%' THEN RAISE EXCEPTION 'Research requires disposable database' USING ERRCODE='23514'; END IF;
 IF NEW.body->>'requestId'<>NEW.id::text OR NEW.body->>'snapshotId'<>NEW.snapshot_id::text OR NEW.body#>>'{context,contextId}'<>NEW.context_id::text THEN RAISE EXCEPTION 'Calibration identity mismatch' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(NEW.resources) IS DISTINCT FROM 'object' OR NOT NEW.resources ?& ARRAY['model','quality','eligibility','scoring','scoreMapping']
  OR (SELECT count(*) FROM jsonb_object_keys(NEW.resources))<>5 THEN RAISE EXCEPTION 'Policy resources required' USING ERRCODE='23514'; END IF;
 FOR resource IN SELECT value FROM jsonb_each(NEW.resources) LOOP
  SELECT * INTO target FROM irt_compute.technical_policy_versions WHERE id=(resource#>>'{ref,id}')::uuid;
  SELECT * INTO approval FROM public.configuration_approvals WHERE id=(resource#>>'{ref,approvalId}')::uuid;
  IF target.id IS NULL OR target.status<>'SEALED' OR target.kind IS DISTINCT FROM resource->>'kind'
   OR target.definition IS DISTINCT FROM resource->'definition' OR target.version::text IS DISTINCT FROM resource#>>'{ref,version}'
   OR target.digest IS DISTINCT FROM resource#>>'{ref,digest}' OR target.digest IS DISTINCT FROM irt_compute.payload_digest(target.definition)
   OR approval.technical_policy_version_id IS DISTINCT FROM target.id OR approval.revoked_at IS NOT NULL
   OR approval.approved_digest IS DISTINCT FROM target.digest OR approval.scope->>'contextId' IS DISTINCT FROM NEW.context_id::text
   OR approval.scope->>'purpose' IS DISTINCT FROM 'RESEARCH_ONLY' THEN RAISE EXCEPTION 'Calibration policy not approved in scope' USING ERRCODE='23514'; END IF;
 END LOOP;
 NEW.input_digest:=irt_compute.payload_digest(jsonb_build_object('recipe','PG_JSONB_IRT_RESEARCH_V1','body',NEW.body,'resources',NEW.resources,'runtime',NEW.runtime_profile));
 RETURN NEW;
END $$;
CREATE TRIGGER irt_calibration_request_guard BEFORE INSERT OR UPDATE OR DELETE ON public.irt_calibration_requests_v1 FOR EACH ROW EXECUTE FUNCTION public.irt_calibration_request_guard_v1();
--> statement-breakpoint
ALTER TABLE irt_compute.technical_policy_versions DROP CONSTRAINT technical_policy_versions_kind_ck;
ALTER TABLE irt_compute.technical_policy_versions ADD CONSTRAINT technical_policy_versions_kind_ck CHECK(kind IN ('VALIDATOR','IRT_MODEL','QUALITY_GATE','COMPARISON','ADJUSTMENT','SCORE_MAPPING','PACKAGE_EVALUATION','TRIAL_REQUIREMENTS','IRT_ELIGIBILITY','IRT_SCORING'));
CREATE FUNCTION public.irt_calibration_dispatch_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous integer; job irt_compute.calibration_jobs_v1;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Dispatch immutable' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.request_id::text,53));
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.actor_user_id AND role='ADMIN' AND status='ACTIVE' AND admin_role IN ('SUPER_ADMIN','CONTENT_DATA_MODERATION')) THEN RAISE EXCEPTION 'Content Admin required' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.irt_calibration_cancellations_v1 WHERE request_id=NEW.request_id) THEN RAISE EXCEPTION 'Cancelled' USING ERRCODE='23514'; END IF;
 SELECT max(generation) INTO previous FROM public.irt_calibration_dispatches_v1 WHERE request_id=NEW.request_id;
 IF NEW.generation<>coalesce(previous,0)+1 THEN RAISE EXCEPTION 'Dispatch sequence invalid' USING ERRCODE='23514'; END IF;
 IF previous IS NOT NULL THEN
  SELECT * INTO job FROM irt_compute.calibration_jobs_v1 WHERE request_id=NEW.request_id AND generation=previous;
  IF job.id IS NULL OR NOT (job.status IN ('FAILED','EXPIRED') AND job.failure_code IN ('TIMEOUT','DEPENDENCY_UNAVAILABLE','LEASE_EXPIRED')) THEN RAISE EXCEPTION 'Retry needs transient terminal failure' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irt_calibration_dispatch_guard BEFORE INSERT OR UPDATE OR DELETE ON public.irt_calibration_dispatches_v1 FOR EACH ROW EXECUTE FUNCTION public.irt_calibration_dispatch_guard_v1();
CREATE TRIGGER irt_calibration_cancel_immutable BEFORE UPDATE OR DELETE ON public.irt_calibration_cancellations_v1 FOR EACH ROW EXECUTE FUNCTION public.measurement_append_only();
--> statement-breakpoint
CREATE VIEW public.irt_calibration_inputs_v1 WITH(security_barrier=true) AS
 SELECT r.*,r.body||jsonb_build_object('inputDigest',r.input_digest) AS payload,
 (SELECT max(d.generation) FROM public.irt_calibration_dispatches_v1 d WHERE d.request_id=r.id) AS current_generation,
 EXISTS(SELECT 1 FROM public.irt_calibration_cancellations_v1 c WHERE c.request_id=r.id) AS cancelled,
 NOT EXISTS(SELECT 1 FROM jsonb_each(r.resources) x LEFT JOIN public.configuration_approvals a ON a.id=(x.value#>>'{ref,approvalId}')::uuid WHERE a.id IS NULL OR a.revoked_at IS NOT NULL OR a.approved_digest IS DISTINCT FROM x.value#>>'{ref,digest}') AS approvals_valid
 FROM public.irt_calibration_requests_v1 r;
CREATE FUNCTION irt_compute.calibration_job_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source record;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Job history immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO source FROM public.irt_calibration_inputs_v1 WHERE id=NEW.request_id;
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
CREATE TRIGGER calibration_job_guard BEFORE INSERT OR UPDATE OR DELETE ON irt_compute.calibration_jobs_v1 FOR EACH ROW EXECUTE FUNCTION irt_compute.calibration_job_guard_v1();
CREATE FUNCTION irt_compute.calibration_artifact_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE job irt_compute.calibration_jobs_v1; source record;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Artifact immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO job FROM irt_compute.calibration_jobs_v1 WHERE id=NEW.job_id FOR UPDATE;
 SELECT * INTO source FROM public.irt_calibration_inputs_v1 WHERE id=job.request_id;
 IF job.status<>'RUNNING' OR job.lease_expires_at<=clock_timestamp() OR source.cancelled OR NOT source.approvals_valid OR source.current_generation<>job.generation
  OR NEW.payload->>'contractVersion'<>'irt-calibration-v1' OR NEW.payload->>'requestId'<>job.request_id::text
  OR NEW.payload->>'executionId'<>job.execution_id::text OR NEW.payload->>'inputDigest'<>source.input_digest
  OR (NEW.payload->>'dispatchGeneration')::int<>job.generation THEN RAISE EXCEPTION 'Invalid or stale calibration artifact' USING ERRCODE='23514'; END IF;
 NEW.digest:=irt_compute.payload_digest(jsonb_build_object('payload',NEW.payload,'diagnostics',NEW.diagnostics,'runtime',source.runtime_profile));
 RETURN NEW;
END $$;
CREATE TRIGGER calibration_artifact_guard BEFORE INSERT OR UPDATE OR DELETE ON irt_compute.calibration_artifacts_v1 FOR EACH ROW EXECUTE FUNCTION irt_compute.calibration_artifact_guard_v1();
--> statement-breakpoint
ALTER TABLE public.irt_calibration_requests_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irt_calibration_dispatches_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irt_calibration_cancellations_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE irt_compute.calibration_jobs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE irt_compute.calibration_artifacts_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY main_access ON public.irt_calibration_requests_v1 FOR ALL TO numora_main_runtime USING(true) WITH CHECK(true);
CREATE POLICY main_access ON public.irt_calibration_dispatches_v1 FOR ALL TO numora_main_runtime USING(true) WITH CHECK(true);
CREATE POLICY main_access ON public.irt_calibration_cancellations_v1 FOR ALL TO numora_main_runtime USING(true) WITH CHECK(true);
CREATE POLICY compute_access ON irt_compute.calibration_jobs_v1 FOR ALL TO numora_irt_runtime USING(true) WITH CHECK(true);
CREATE POLICY main_read ON irt_compute.calibration_jobs_v1 FOR SELECT TO numora_main_runtime USING(true);
CREATE POLICY compute_access ON irt_compute.calibration_artifacts_v1 FOR ALL TO numora_irt_runtime USING(true) WITH CHECK(true);
CREATE POLICY main_read ON irt_compute.calibration_artifacts_v1 FOR SELECT TO numora_main_runtime USING(true);
GRANT SELECT,INSERT ON public.irt_calibration_requests_v1,public.irt_calibration_dispatches_v1,public.irt_calibration_cancellations_v1 TO numora_main_runtime;
GRANT SELECT ON public.irt_calibration_inputs_v1 TO numora_irt_runtime,numora_main_runtime;
GRANT SELECT,INSERT,UPDATE ON irt_compute.calibration_jobs_v1 TO numora_irt_runtime;
GRANT USAGE,SELECT ON SEQUENCE irt_compute.calibration_jobs_v1_fencing_token_seq TO numora_irt_runtime;
GRANT SELECT,INSERT ON irt_compute.calibration_artifacts_v1 TO numora_irt_runtime;
GRANT SELECT ON irt_compute.calibration_jobs_v1,irt_compute.calibration_artifacts_v1 TO numora_main_runtime;
REVOKE ALL ON FUNCTION public.irt_calibration_request_guard_v1(),public.irt_calibration_dispatch_guard_v1(),irt_compute.calibration_job_guard_v1(),irt_compute.calibration_artifact_guard_v1() FROM PUBLIC;

-- Explicit operator-owned production authorization. No production enrollment or approval is created.
CREATE TABLE public.irt_production_authorizations_v1 (
 context_id uuid PRIMARY KEY REFERENCES public.measurement_contexts(id),
 batch_id uuid NOT NULL UNIQUE REFERENCES public.tryout_batches(id),
 database_oid oid NOT NULL, database_name name NOT NULL,
 main_login name NOT NULL, compute_login name NOT NULL CHECK(main_login<>compute_login),
 service_principal_id uuid NOT NULL REFERENCES public.service_principals(id),
 runtime_profile jsonb NOT NULL CHECK(runtime_profile->>'purpose'='PRODUCTION'),
 resources jsonb NOT NULL CHECK(jsonb_typeof(resources)='object'),
 release_approval_id uuid NOT NULL REFERENCES public.configuration_approvals(id),
 scientific_acceptance_digest text NOT NULL CHECK(scientific_acceptance_digest ~ '^[0-9a-f]{64}$'),
 approved_by_user_id uuid NOT NULL REFERENCES public.users(id),
 approved_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, CHECK(expires_at>approved_at AND isfinite(expires_at))
);
ALTER TABLE public.irt_production_authorizations_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irt_production_authorizations_v1 FROM PUBLIC,numora_main_runtime,numora_irt_runtime;
-- Runtime roles can check authorization; only a trusted migration/operator role can provision/revoke it.
CREATE FUNCTION public.irt_production_authorized_v1(context uuid, runtime jsonb, resources jsonb DEFAULT NULL) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.irt_production_authorizations_v1 a
 JOIN public.measurement_contexts c ON c.id=a.context_id AND c.tryout_batch_id=a.batch_id
 JOIN public.users u ON u.id=a.approved_by_user_id AND u.role='ADMIN' AND u.status='ACTIVE'
   AND u.admin_role IN ('SUPER_ADMIN','CONTENT_DATA_MODERATION')
 JOIN public.service_principals s ON s.id=a.service_principal_id AND s.enabled
 JOIN pg_roles mr ON mr.rolname=a.main_login AND NOT mr.rolsuper AND NOT mr.rolbypassrls AND NOT mr.rolcreatedb AND NOT mr.rolcreaterole
 JOIN pg_roles cr ON cr.rolname=a.compute_login AND NOT cr.rolsuper AND NOT cr.rolbypassrls AND NOT cr.rolcreatedb AND NOT cr.rolcreaterole
 WHERE a.context_id=context AND a.database_oid=(SELECT oid FROM pg_database WHERE datname=current_database())
 AND a.database_name=current_database() AND a.revoked_at IS NULL
 AND a.approved_at<=statement_timestamp() AND a.expires_at>statement_timestamp()
 AND a.runtime_profile=runtime-'pseudonymKeyVersion' AND ($3 IS NULL OR a.resources=$3)
 AND pg_has_role(mr.oid,'numora_main_runtime','MEMBER') AND NOT pg_has_role(mr.oid,'numora_irt_runtime','MEMBER')
 AND pg_has_role(cr.oid,'numora_irt_runtime','MEMBER') AND NOT pg_has_role(cr.oid,'numora_main_runtime','MEMBER')
 AND NOT EXISTS(SELECT 1 FROM jsonb_each(a.resources) r
   LEFT JOIN public.configuration_approvals p ON p.id=(r.value#>>'{ref,approvalId}')::uuid
   WHERE p.id IS NULL OR p.revoked_at IS NOT NULL OR p.scope->>'purpose' IS DISTINCT FROM 'PRODUCTION'
   OR p.scope->>'contextId' IS DISTINCT FROM a.context_id::text OR p.scope->>'ecosystem' IS DISTINCT FROM 'TRYOUT'
   OR p.approved_digest IS DISTINCT FROM r.value#>>'{ref,digest}')
 AND EXISTS(SELECT 1 FROM public.configuration_approvals p WHERE p.id=a.release_approval_id AND p.revoked_at IS NULL
   AND p.scope->>'purpose'='PRODUCTION' AND p.scope->>'contextId'=a.context_id::text AND p.scope->>'ecosystem'='TRYOUT'))
$$;
REVOKE ALL ON FUNCTION public.irt_production_authorized_v1(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.irt_production_authorized_v1(uuid,jsonb,jsonb) TO numora_main_runtime,numora_irt_runtime;
CREATE FUNCTION public.irt_assert_production_v1(context uuid, runtime jsonb, resources jsonb DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM context_id FROM public.irt_production_authorizations_v1 WHERE context_id=context FOR SHARE;
 IF NOT public.irt_production_authorized_v1(context,runtime,resources) OR NOT public.irt_production_visible_v1(context) THEN
  RAISE EXCEPTION 'IRT_PRODUCTION_NOT_AUTHORIZED' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.irt_assert_production_v1(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.irt_assert_production_v1(uuid,jsonb,jsonb) TO numora_main_runtime,numora_irt_runtime;
--> statement-breakpoint
-- Replace the original named CHECK without rewriting existing rows or frozen digests.
DO $$ DECLARE n text; BEGIN
 FOR n IN SELECT conname FROM pg_constraint WHERE conrelid='public.irt_calibration_requests_v1'::regclass
 AND contype='c' AND pg_get_constraintdef(oid) LIKE '%runtime_profile%purpose%' LOOP
 EXECUTE format('ALTER TABLE public.irt_calibration_requests_v1 DROP CONSTRAINT %I',n); END LOOP;
END $$;
ALTER TABLE public.irt_calibration_requests_v1 ADD CONSTRAINT irt_calibration_runtime_purpose_ck
 CHECK(runtime_profile->>'purpose' IN ('RESEARCH_ONLY','PRODUCTION'));
--> statement-breakpoint
CREATE FUNCTION public.irt_assert_production_release_v1(context uuid, approval uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.irt_production_authorizations_v1 WHERE context_id=context AND release_approval_id=approval AND revoked_at IS NULL) THEN
 RAISE EXCEPTION 'IRT_PRODUCTION_RELEASE_MISMATCH' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.irt_assert_production_release_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.irt_assert_production_release_v1(uuid,uuid) TO numora_main_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.irt_calibration_request_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resource jsonb; target irt_compute.technical_policy_versions; approval public.configuration_approvals;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Frozen calibration input is immutable' USING ERRCODE='23514'; END IF;
 -- Owner authorized only disposable local research in this delivery.
 IF NEW.runtime_profile->>'purpose'='PRODUCTION' THEN
  PERFORM public.irt_assert_production_v1(NEW.context_id,NEW.runtime_profile,NEW.resources);
 ELSIF current_database() NOT LIKE 'irt_research_test_%' OR NEW.runtime_profile->>'purpose' IS DISTINCT FROM 'RESEARCH_ONLY' THEN
  RAISE EXCEPTION 'Research requires disposable database' USING ERRCODE='23514'; END IF;
 IF NEW.body->>'requestId' IS DISTINCT FROM NEW.id::text OR NEW.body->>'snapshotId' IS DISTINCT FROM NEW.snapshot_id::text OR NEW.body#>>'{context,contextId}' IS DISTINCT FROM NEW.context_id::text THEN RAISE EXCEPTION 'Calibration identity mismatch' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.measurement_contexts c WHERE c.id=NEW.context_id AND c.ecosystem='TRYOUT'
   AND c.tryout_batch_id::text=NEW.body#>>'{context,batchId}' AND c.revision::text=NEW.body#>>'{context,revision}') THEN RAISE EXCEPTION 'Calibration context mismatch' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(NEW.resources) IS DISTINCT FROM 'object' OR NOT NEW.resources ?& ARRAY['model','quality','eligibility','scoring','scoreMapping']
  OR (SELECT count(*) FROM jsonb_object_keys(NEW.resources))<>5 THEN RAISE EXCEPTION 'Policy resources required' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(NEW.resources) x WHERE x.value->'ref' IS DISTINCT FROM NEW.body->'policies'->x.key
  OR x.value->>'kind' IS DISTINCT FROM CASE x.key WHEN 'model' THEN 'IRT_MODEL' WHEN 'quality' THEN 'QUALITY_GATE' WHEN 'eligibility' THEN 'IRT_ELIGIBILITY' WHEN 'scoring' THEN 'IRT_SCORING' WHEN 'scoreMapping' THEN 'SCORE_MAPPING' END)
  OR NEW.body#>'{policies,comparison}' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Calibration policy binding mismatch' USING ERRCODE='23514'; END IF;
 FOR resource IN SELECT value FROM jsonb_each(NEW.resources) LOOP
  SELECT * INTO target FROM irt_compute.technical_policy_versions WHERE id=(resource#>>'{ref,id}')::uuid;
  SELECT * INTO approval FROM public.configuration_approvals WHERE id=(resource#>>'{ref,approvalId}')::uuid;
  IF target.id IS NULL OR target.status<>'SEALED' OR target.kind IS DISTINCT FROM resource->>'kind'
   OR target.definition IS DISTINCT FROM resource->'definition' OR target.version::text IS DISTINCT FROM resource#>>'{ref,version}'
   OR target.digest IS DISTINCT FROM resource#>>'{ref,digest}' OR target.digest IS DISTINCT FROM irt_compute.payload_digest(target.definition)
   OR approval.technical_policy_version_id IS DISTINCT FROM target.id OR approval.revoked_at IS NOT NULL
   OR approval.approved_digest IS DISTINCT FROM target.digest OR approval.scope->>'contextId' IS DISTINCT FROM NEW.context_id::text
   OR approval.scope->>'purpose' IS DISTINCT FROM NEW.runtime_profile->>'purpose' OR approval.scope->>'ecosystem' IS DISTINCT FROM 'TRYOUT' THEN RAISE EXCEPTION 'Calibration policy not approved in scope' USING ERRCODE='23514'; END IF;
 END LOOP;
 NEW.input_digest:=irt_compute.payload_digest(jsonb_build_object('recipe','PG_JSONB_IRT_RESEARCH_V1','body',NEW.body,'resources',NEW.resources,'runtime',NEW.runtime_profile));
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.irt_delivery_binding_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b public.tryout_batches; c public.measurement_contexts; pins jsonb; resources jsonb; a record;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'IRT_BINDING_RESEARCH_ONLY' USING ERRCODE='23514'; END IF;
 IF NEW.configuration#>>'{runtime,purpose}'='PRODUCTION' THEN
  PERFORM public.irt_assert_production_v1(NEW.context_id,NEW.configuration->'runtime',NEW.configuration->'resources');
  PERFORM public.irt_assert_production_release_v1(NEW.context_id,(NEW.configuration->>'releaseApprovalId')::uuid);
 ELSIF current_database() NOT LIKE 'irt_research_test_%' THEN
  RAISE EXCEPTION 'IRT_BINDING_RESEARCH_ONLY' USING ERRCODE='23514'; END IF;
 SELECT * INTO b FROM public.tryout_batches WHERE id=NEW.batch_id FOR UPDATE;
 SELECT * INTO c FROM public.measurement_contexts WHERE id=NEW.context_id;
 IF b.id IS NULL OR b.starts_at<=clock_timestamp() OR b.cancelled_at IS NOT NULL OR b.config_revision<>NEW.batch_revision
  OR c.ecosystem IS DISTINCT FROM 'TRYOUT' OR c.tryout_batch_id IS DISTINCT FROM b.id
  OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.actor_user_id AND role='ADMIN' AND status='ACTIVE'
    AND admin_role IN ('SUPER_ADMIN','CONTENT_DATA_MODERATION'))
  OR NOT EXISTS(SELECT 1 FROM public.assessment_arm_sets WHERE id=NEW.arm_set_id AND context_id=c.id AND status IN ('DRAFT','OPEN')) THEN
  RAISE EXCEPTION 'IRT_BINDING_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.batch_id<>OLD.batch_id OR NEW.revision<>OLD.revision+1
  OR NEW.request_id<>OLD.request_id OR NEW.snapshot_id<>OLD.snapshot_id OR NEW.calibration_id<>OLD.calibration_id) THEN
  RAISE EXCEPTION 'IRT_BINDING_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
 IF NEW.configuration#>>'{runtime,purpose}' NOT IN ('RESEARCH_ONLY','PRODUCTION') OR NEW.configuration#>>'{runtime,purpose}' IS NULL
  OR coalesce(NEW.configuration#>>'{runtime,image}','') !~ '^sha256:[0-9a-f]{64}$'
  OR (NEW.configuration->>'contextRevision')::integer IS DISTINCT FROM c.revision THEN
  RAISE EXCEPTION 'IRT_BINDING_RUNTIME_INVALID' USING ERRCODE='23514'; END IF;
 pins:=NEW.configuration->'packages';resources:=NEW.configuration->'resources';
 IF jsonb_typeof(pins) IS DISTINCT FROM 'array' OR jsonb_array_length(pins)=0
  OR (SELECT count(*) FROM public.tryout_batch_packages WHERE batch_id=b.id)<>jsonb_array_length(pins)
  OR (SELECT count(*) FROM jsonb_array_elements(pins) p WHERE p->>'armKind'='ORIGINAL')<>1
  OR (SELECT count(DISTINCT p->>'packageId') FROM jsonb_array_elements(pins) p)<>jsonb_array_length(pins)
  OR (SELECT count(DISTINCT p->>'armId') FROM jsonb_array_elements(pins) p)<>jsonb_array_length(pins)
  OR jsonb_typeof(NEW.configuration->'anchors') IS DISTINCT FROM 'array'
  OR jsonb_array_length(NEW.configuration->'anchors')<>5
  OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(NEW.configuration->'anchors'))<>5
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(pins) p WHERE NOT EXISTS(
   SELECT 1 FROM public.assessment_arm_revisions r JOIN public.assessment_arms arm ON arm.id=r.arm_id
    JOIN public.assessment_packages pkg ON pkg.id=r.package_id
    JOIN public.tryout_batch_packages m ON m.batch_id=b.id AND m.package_id=pkg.id
   WHERE r.id=(p->>'revisionId')::uuid AND arm.set_id=NEW.arm_set_id AND arm.id=(p->>'armId')::uuid
    AND arm.kind=p->>'armKind' AND pkg.id=(p->>'packageId')::uuid AND pkg.package_version=(p->>'packageVersion')::integer
    AND cardinality(r.anchor_question_version_ids)=5 AND to_jsonb(r.anchor_question_version_ids)=NEW.configuration->'anchors'
    AND (SELECT count(*) FROM public.package_items WHERE package_id=pkg.id)=30
    AND pkg.frozen_at IS NOT NULL AND pkg.frozen_at<b.starts_at
    AND r.manifest_digest=p->>'manifestDigest'
    AND (SELECT array_agg(question_version_id::text ORDER BY display_order) FROM public.package_items WHERE package_id=pkg.id)
      =ARRAY(SELECT jsonb_array_elements_text(p->'questionVersionIds')))) THEN
  RAISE EXCEPTION 'IRT_BINDING_MANIFEST_INVALID' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(resources) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(resources))<>5 THEN
  RAISE EXCEPTION 'IRT_BINDING_POLICY_INVALID' USING ERRCODE='23514'; END IF;
 FOR a IN SELECT key,value FROM jsonb_each(resources) LOOP
  IF a.key NOT IN ('model','quality','eligibility','scoring','scoreMapping')
   OR a.value->>'kind' IS DISTINCT FROM (CASE a.key WHEN 'model' THEN 'IRT_MODEL' WHEN 'quality' THEN 'QUALITY_GATE'
    WHEN 'eligibility' THEN 'IRT_ELIGIBILITY' WHEN 'scoring' THEN 'IRT_SCORING' WHEN 'scoreMapping' THEN 'SCORE_MAPPING' END)
   OR NOT EXISTS(SELECT 1 FROM public.configuration_approvals approval JOIN irt_compute.technical_policy_versions p ON p.id=approval.technical_policy_version_id
    WHERE approval.id=(a.value#>>'{ref,approvalId}')::uuid AND p.id=(a.value#>>'{ref,id}')::uuid
     AND p.version=(a.value#>>'{ref,version}')::integer AND p.status='SEALED' AND p.kind=a.value->>'kind'
     AND p.definition=a.value->'definition' AND p.digest=a.value#>>'{ref,digest}' AND p.digest=irt_compute.payload_digest(p.definition)
     AND approval.approved_digest=p.digest AND approval.revoked_at IS NULL
     AND approval.scope->>'contextId'=c.id::text AND approval.scope->>'ecosystem'='TRYOUT' AND approval.scope->>'purpose'=NEW.configuration#>>'{runtime,purpose}') THEN
   RAISE EXCEPTION 'IRT_BINDING_POLICY_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.configuration_approvals release_approval JOIN irt_compute.technical_policy_versions p ON p.id=release_approval.technical_policy_version_id
  WHERE release_approval.id=(NEW.configuration->>'releaseApprovalId')::uuid AND p.kind='IRT_FALLBACK' AND p.status='SEALED'
   AND release_approval.revoked_at IS NULL AND release_approval.approved_digest=p.digest AND p.digest=irt_compute.payload_digest(p.definition)
   AND release_approval.scope->>'contextId'=c.id::text AND release_approval.scope->>'ecosystem'='TRYOUT' AND release_approval.scope->>'purpose'=NEW.configuration#>>'{runtime,purpose}') THEN
  RAISE EXCEPTION 'IRT_BINDING_RELEASE_POLICY_INVALID' USING ERRCODE='23514'; END IF;
 NEW.digest:=irt_compute.payload_digest(NEW.configuration);
 UPDATE public.tryout_batch_packages m SET arm_id=(p.value->>'armId')::uuid
 FROM jsonb_array_elements(pins) p WHERE m.batch_id=b.id AND m.package_id=(p.value->>'packageId')::uuid;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.irt_assert_release_authorization_v1(request_id uuid, approval_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; a public.configuration_approvals; p irt_compute.technical_policy_versions;
BEGIN
 
 SELECT * INTO r FROM public.irt_calibration_inputs_v1 WHERE id=request_id;
 IF r.runtime_profile->>'purpose'='PRODUCTION' THEN
  PERFORM public.irt_assert_production_v1(r.context_id,r.runtime_profile,r.resources);
  PERFORM public.irt_assert_production_release_v1(r.context_id,approval_id);
 ELSIF current_database() NOT LIKE 'irt_research_test_%' THEN
  RAISE EXCEPTION 'IRT release is disposable research only' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM public.configuration_approvals WHERE id=approval_id FOR SHARE;
 SELECT * INTO p FROM irt_compute.technical_policy_versions WHERE id=a.technical_policy_version_id;
 IF r.id IS NULL OR r.cancelled OR NOT r.approvals_valid OR a.id IS NULL OR a.revoked_at IS NOT NULL
 OR p.kind IS DISTINCT FROM 'IRT_FALLBACK' OR p.status IS DISTINCT FROM 'SEALED' OR a.approved_digest IS DISTINCT FROM p.digest
 OR p.digest IS DISTINCT FROM irt_compute.payload_digest(p.definition)
 OR a.scope->>'purpose' IS DISTINCT FROM r.runtime_profile->>'purpose' OR a.scope->>'ecosystem' IS DISTINCT FROM 'TRYOUT'
 OR a.scope->>'contextId' IS DISTINCT FROM r.context_id::text THEN RAISE EXCEPTION 'IRT release approval invalid' USING ERRCODE='23514'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.irt_production_visible_v1(context uuid) RETURNS boolean LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.irt_production_authorizations_v1 a WHERE a.context_id=context
 AND (a.main_login=current_setting('role',true) OR a.compute_login=current_setting('role',true)
 OR a.main_login=session_user OR a.compute_login=session_user))
$$;
REVOKE ALL ON FUNCTION public.irt_production_visible_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.irt_production_visible_v1(uuid) TO numora_main_runtime,numora_irt_runtime;
--> statement-breakpoint
CREATE OR REPLACE VIEW public.irt_calibration_inputs_v1 WITH(security_barrier=true) AS
 SELECT r.*,r.body||jsonb_build_object('inputDigest',r.input_digest) AS payload,
 (SELECT max(d.generation) FROM public.irt_calibration_dispatches_v1 d WHERE d.request_id=r.id) AS current_generation,
 EXISTS(SELECT 1 FROM public.irt_calibration_cancellations_v1 c WHERE c.request_id=r.id) AS cancelled,
 NOT EXISTS(SELECT 1 FROM jsonb_each(r.resources) x LEFT JOIN public.configuration_approvals a ON a.id=(x.value#>>'{ref,approvalId}')::uuid WHERE a.id IS NULL OR a.revoked_at IS NOT NULL OR a.approved_digest IS DISTINCT FROM x.value#>>'{ref,digest}') AND (r.runtime_profile->>'purpose'='RESEARCH_ONLY' OR public.irt_production_authorized_v1(r.context_id,r.runtime_profile,r.resources)) AS approvals_valid
 FROM public.irt_calibration_requests_v1 r
 WHERE r.runtime_profile->>'purpose'='RESEARCH_ONLY' OR public.irt_production_visible_v1(r.context_id);
--> statement-breakpoint
CREATE FUNCTION public.irt_production_execution_fence_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.irt_calibration_requests_v1; rid uuid;
BEGIN
 IF TG_TABLE_NAME='calibration_artifacts_v1' THEN
  SELECT request_id INTO rid FROM irt_compute.calibration_jobs_v1 WHERE id=NEW.job_id;
 ELSE rid:=NEW.request_id; END IF;
 SELECT * INTO r FROM public.irt_calibration_requests_v1 WHERE id=rid;
 IF r.runtime_profile->>'purpose'='PRODUCTION' THEN
  PERFORM public.irt_assert_production_v1(r.context_id,r.runtime_profile,r.resources);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irt_production_job_fence BEFORE INSERT OR UPDATE ON irt_compute.calibration_jobs_v1 FOR EACH ROW EXECUTE FUNCTION public.irt_production_execution_fence_v1();
CREATE TRIGGER irt_production_artifact_fence BEFORE INSERT ON irt_compute.calibration_artifacts_v1 FOR EACH ROW EXECUTE FUNCTION public.irt_production_execution_fence_v1();
CREATE TRIGGER irt_production_dispatch_fence BEFORE INSERT ON public.irt_calibration_dispatches_v1 FOR EACH ROW EXECUTE FUNCTION public.irt_production_execution_fence_v1();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.irt_delivery_assignment_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding public.irt_delivery_bindings_v1; pin jsonb;
BEGIN
 SELECT * INTO binding FROM public.irt_delivery_bindings_v1 WHERE batch_id=NEW.tryout_batch_id FOR SHARE;
 IF binding.batch_id IS NULL THEN RETURN NEW; END IF;
 IF binding.configuration#>>'{runtime,purpose}'='PRODUCTION' THEN
  PERFORM public.irt_assert_production_v1(binding.context_id,binding.configuration->'runtime',binding.configuration->'resources'); END IF;
 SELECT value INTO pin FROM jsonb_array_elements(binding.configuration->'packages') WHERE value->>'packageId'=NEW.package_id::text;
 IF pin IS NULL THEN RAISE EXCEPTION 'IRT_DELIVERY_PACKAGE_UNBOUND' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.student_id::text||':'||binding.context_id::text,71));
 IF NOT EXISTS(SELECT 1 FROM public.assessment_arm_assignments WHERE set_id=binding.arm_set_id AND student_id=NEW.student_id) THEN
  INSERT INTO public.assessment_arm_assignments(set_id,student_id,assigned_arm_id)
   VALUES(binding.arm_set_id,NEW.student_id,(pin->>'armId')::uuid);
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.irt_production_execution_fence_v1() FROM PUBLIC;

--> statement-breakpoint
CREATE FUNCTION public.irt_compute_principal_authorized_v1(context uuid, principal uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.irt_production_authorizations_v1 a WHERE a.context_id=context
 AND a.service_principal_id=principal AND (a.compute_login=session_user OR a.compute_login=current_setting('role',true))
 AND public.irt_production_authorized_v1(a.context_id,a.runtime_profile,a.resources))
$$;
REVOKE ALL ON FUNCTION public.irt_compute_principal_authorized_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.irt_compute_principal_authorized_v1(uuid,uuid) TO numora_irt_runtime;
DROP POLICY compute_access ON irt_compute.calibration_jobs_v1;
CREATE POLICY compute_access ON irt_compute.calibration_jobs_v1 FOR ALL TO numora_irt_runtime
 USING(EXISTS(SELECT 1 FROM public.irt_calibration_inputs_v1 s WHERE s.id=request_id))
 WITH CHECK(EXISTS(SELECT 1 FROM public.irt_calibration_inputs_v1 s WHERE s.id=request_id));
DROP POLICY compute_access ON irt_compute.calibration_artifacts_v1;
CREATE POLICY compute_access ON irt_compute.calibration_artifacts_v1 FOR ALL TO numora_irt_runtime
 USING(EXISTS(SELECT 1 FROM irt_compute.calibration_jobs_v1 j WHERE j.id=job_id))
 WITH CHECK(EXISTS(SELECT 1 FROM irt_compute.calibration_jobs_v1 j WHERE j.id=job_id));

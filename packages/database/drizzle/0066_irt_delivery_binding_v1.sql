CREATE TABLE public.irt_delivery_bindings_v1 (
 batch_id uuid PRIMARY KEY REFERENCES public.tryout_batches(id) ON DELETE RESTRICT,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), context_id uuid NOT NULL UNIQUE REFERENCES public.measurement_contexts(id),
 arm_set_id uuid NOT NULL REFERENCES public.assessment_arm_sets(id), batch_revision integer NOT NULL,
 configuration jsonb NOT NULL, digest text NOT NULL, actor_user_id uuid NOT NULL REFERENCES public.users(id),
 request_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),snapshot_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 calibration_id uuid NOT NULL DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.irt_delivery_progress_v1 (
 batch_id uuid PRIMARY KEY REFERENCES public.irt_delivery_bindings_v1(batch_id),
 request_id uuid UNIQUE REFERENCES public.irt_calibration_requests_v1(id),
 blocker text, updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.irt_delivery_bindings_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irt_delivery_progress_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY main_access ON public.irt_delivery_bindings_v1 FOR ALL TO numora_main_runtime USING(true) WITH CHECK(true);
CREATE POLICY main_access ON public.irt_delivery_progress_v1 FOR ALL TO numora_main_runtime USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON public.irt_delivery_bindings_v1,public.irt_delivery_progress_v1 TO numora_main_runtime;
--> statement-breakpoint
CREATE FUNCTION public.irt_delivery_binding_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b public.tryout_batches; c public.measurement_contexts; pins jsonb; resources jsonb; a record;
BEGIN
 IF current_database() NOT LIKE 'irt_research_test_%' OR TG_OP='DELETE' THEN
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
 IF NEW.configuration#>>'{runtime,purpose}' IS DISTINCT FROM 'RESEARCH_ONLY'
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
     AND approval.scope->>'contextId'=c.id::text AND approval.scope->>'ecosystem'='TRYOUT' AND approval.scope->>'purpose'='RESEARCH_ONLY') THEN
   RAISE EXCEPTION 'IRT_BINDING_POLICY_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.configuration_approvals release_approval JOIN irt_compute.technical_policy_versions p ON p.id=release_approval.technical_policy_version_id
  WHERE release_approval.id=(NEW.configuration->>'releaseApprovalId')::uuid AND p.kind='IRT_FALLBACK' AND p.status='SEALED'
   AND release_approval.revoked_at IS NULL AND release_approval.approved_digest=p.digest AND p.digest=irt_compute.payload_digest(p.definition)
   AND release_approval.scope->>'contextId'=c.id::text AND release_approval.scope->>'ecosystem'='TRYOUT' AND release_approval.scope->>'purpose'='RESEARCH_ONLY') THEN
  RAISE EXCEPTION 'IRT_BINDING_RELEASE_POLICY_INVALID' USING ERRCODE='23514'; END IF;
 NEW.digest:=irt_compute.payload_digest(NEW.configuration);
 UPDATE public.tryout_batch_packages m SET arm_id=(p.value->>'armId')::uuid
 FROM jsonb_array_elements(pins) p WHERE m.batch_id=b.id AND m.package_id=(p.value->>'packageId')::uuid;
 RETURN NEW;
END $$;
CREATE TRIGGER irt_delivery_binding_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.irt_delivery_bindings_v1
 FOR EACH ROW EXECUTE FUNCTION public.irt_delivery_binding_guard_v1();
--> statement-breakpoint
-- Assignment precedes the attempt: first_valid_evidence must not see this attempt as a retry.
CREATE FUNCTION public.irt_delivery_assignment_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding public.irt_delivery_bindings_v1; pin jsonb;
BEGIN
 SELECT * INTO binding FROM public.irt_delivery_bindings_v1 WHERE batch_id=NEW.tryout_batch_id FOR SHARE;
 IF binding.batch_id IS NULL THEN RETURN NEW; END IF;
 SELECT value INTO pin FROM jsonb_array_elements(binding.configuration->'packages') WHERE value->>'packageId'=NEW.package_id::text;
 IF pin IS NULL THEN RAISE EXCEPTION 'IRT_DELIVERY_PACKAGE_UNBOUND' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.student_id::text||':'||binding.context_id::text,71));
 IF NOT EXISTS(SELECT 1 FROM public.assessment_arm_assignments WHERE set_id=binding.arm_set_id AND student_id=NEW.student_id) THEN
  INSERT INTO public.assessment_arm_assignments(set_id,student_id,assigned_arm_id)
   VALUES(binding.arm_set_id,NEW.student_id,(pin->>'armId')::uuid);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irt_delivery_assignment_v1 BEFORE INSERT ON public.assessment_attempts
 FOR EACH ROW EXECUTE FUNCTION public.irt_delivery_assignment_v1();
--> statement-breakpoint
CREATE FUNCTION public.irt_delivery_pin_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding public.irt_delivery_bindings_v1; pin jsonb; assignment uuid;
BEGIN
 SELECT * INTO binding FROM public.irt_delivery_bindings_v1 WHERE batch_id=NEW.batch_id FOR SHARE;
 IF binding.batch_id IS NULL THEN RETURN NEW; END IF;
 IF binding.batch_revision<>(SELECT config_revision FROM public.tryout_batches WHERE id=NEW.batch_id) THEN
  RAISE EXCEPTION 'IRT_BINDING_STALE' USING ERRCODE='23514'; END IF;
 SELECT value INTO pin FROM jsonb_array_elements(binding.configuration->'packages') WHERE value->>'packageId'=NEW.package_id::text;
 IF pin IS NULL THEN RAISE EXCEPTION 'IRT_DELIVERY_PACKAGE_UNBOUND' USING ERRCODE='23514'; END IF;
 SELECT id INTO assignment FROM public.assessment_arm_assignments WHERE set_id=binding.arm_set_id AND student_id=NEW.student_id;
 IF NOT EXISTS(SELECT 1 FROM public.assessment_arm_assignments WHERE id=assignment AND assigned_arm_id=(pin->>'armId')::uuid) THEN
  RAISE EXCEPTION 'IRT_DELIVERY_ASSIGNMENT_CONFLICT' USING ERRCODE='23514'; END IF;
 INSERT INTO public.assessment_attempt_arm_deliveries(attempt_id,assignment_id,delivered_revision_id,delivery_mode)
  VALUES(NEW.attempt_id,assignment,(pin->>'revisionId')::uuid,'ASSIGNED');
 RETURN NEW;
END $$;
CREATE TRIGGER irt_delivery_pin_v1 BEFORE INSERT ON public.tryout_student_assignments
 FOR EACH ROW EXECUTE FUNCTION public.irt_delivery_pin_v1();
REVOKE ALL ON FUNCTION public.irt_delivery_binding_guard_v1(),public.irt_delivery_assignment_v1(),public.irt_delivery_pin_v1() FROM PUBLIC;

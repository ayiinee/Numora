ALTER TYPE public.measurement_state ADD VALUE IF NOT EXISTS 'NOT_COMPARABLE';
--> statement-breakpoint
-- PostgreSQL row locks require UPDATE privilege; immutable-source trigger still rejects writes.
GRANT UPDATE(id) ON public.irt_calibration_requests_v1 TO numora_main_runtime;
--> statement-breakpoint
-- Additive, opt-in local research release. Legacy finalizations retain their guards.
ALTER TABLE irt_compute.technical_policy_versions DROP CONSTRAINT technical_policy_versions_kind_ck;
ALTER TABLE irt_compute.technical_policy_versions ADD CONSTRAINT technical_policy_versions_kind_ck CHECK(kind IN ('VALIDATOR','IRT_MODEL','QUALITY_GATE','COMPARISON','ADJUSTMENT','SCORE_MAPPING','PACKAGE_EVALUATION','TRIAL_REQUIREMENTS','IRT_ELIGIBILITY','IRT_SCORING','IRT_FALLBACK'));
ALTER TABLE public.tryout_result_finalizations
 ADD COLUMN source_calibration_request_id uuid UNIQUE REFERENCES public.irt_calibration_requests_v1(id) ON DELETE RESTRICT,
 ADD COLUMN release_approval_id uuid REFERENCES public.configuration_approvals(id) ON DELETE RESTRICT;
ALTER TABLE public.tryout_attempt_results ADD COLUMN result_mode text CHECK(result_mode IN ('IRT','FALLBACK','UNSCORABLE')),
 ADD COLUMN delivered_arm_id uuid, ADD COLUMN result_reason text;
ALTER TABLE public.tryout_result_finalizations DROP CONSTRAINT tryout_result_finalizations_mode_ck;
ALTER TABLE public.tryout_result_finalizations ADD CONSTRAINT tryout_result_finalizations_mode_ck CHECK(mode IN ('IRT','FALLBACK','UNSCORABLE','MIXED'));
ALTER TABLE public.tryout_result_finalizations DROP CONSTRAINT tryout_result_finalizations_irt_ck;
ALTER TABLE public.tryout_result_finalizations ADD CONSTRAINT tryout_result_finalizations_irt_ck CHECK
 (mode<>'IRT' OR ((source_output_id IS NOT NULL OR source_calibration_request_id IS NOT NULL) AND mapping_approval_id IS NOT NULL));
ALTER TABLE public.tryout_result_finalizations ADD CONSTRAINT tryout_result_finalizations_mixed_ck CHECK(mode<>'MIXED' OR source_calibration_request_id IS NOT NULL);
--> statement-breakpoint
CREATE FUNCTION public.irt_assert_release_authorization_v1(request_id uuid, approval_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; a public.configuration_approvals; p irt_compute.technical_policy_versions;
BEGIN
 IF current_database() NOT LIKE 'irt_research_test_%' THEN RAISE EXCEPTION 'IRT release is disposable research only' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM public.irt_calibration_inputs_v1 WHERE id=request_id;
 SELECT * INTO a FROM public.configuration_approvals WHERE id=approval_id FOR SHARE;
 SELECT * INTO p FROM irt_compute.technical_policy_versions WHERE id=a.technical_policy_version_id;
 IF r.id IS NULL OR r.cancelled OR NOT r.approvals_valid OR a.id IS NULL OR a.revoked_at IS NOT NULL
 OR p.kind IS DISTINCT FROM 'IRT_FALLBACK' OR p.status IS DISTINCT FROM 'SEALED' OR a.approved_digest IS DISTINCT FROM p.digest
 OR p.digest IS DISTINCT FROM irt_compute.payload_digest(p.definition)
 OR a.scope->>'purpose' IS DISTINCT FROM 'RESEARCH_ONLY' OR a.scope->>'ecosystem' IS DISTINCT FROM 'TRYOUT'
 OR a.scope->>'contextId' IS DISTINCT FROM r.context_id::text THEN RAISE EXCEPTION 'IRT release approval invalid' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.irt_assert_release_authorization_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.irt_assert_release_authorization_v1(uuid,uuid) TO numora_main_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_finalization_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch public.tryout_batches; expected integer; actual integer;
BEGIN

  IF NEW.source_calibration_request_id IS NOT NULL THEN
    IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.published_at IS NOT NULL) THEN RAISE EXCEPTION 'Published finalization is immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND NEW.source_calibration_request_id IS DISTINCT FROM OLD.source_calibration_request_id THEN RAISE EXCEPTION 'Source immutable' USING ERRCODE='23514'; END IF;
    PERFORM public.irt_assert_release_authorization_v1(NEW.source_calibration_request_id,NEW.release_approval_id);
    IF NOT EXISTS(SELECT 1 FROM public.irt_calibration_requests_v1 r WHERE r.id=NEW.source_calibration_request_id AND r.body#>>'{context,batchId}'=NEW.batch_id::text) THEN RAISE EXCEPTION 'Wrong release batch' USING ERRCODE='23514'; END IF;
    IF NEW.digest IS DISTINCT FROM irt_compute.payload_digest(NEW.policy_snapshot) THEN RAISE EXCEPTION 'Release digest invalid' USING ERRCODE='23514'; END IF;
    IF NEW.published_at IS NOT NULL THEN
      SELECT * INTO batch FROM public.tryout_batches WHERE id=NEW.batch_id FOR UPDATE;
      IF TG_OP='INSERT' OR batch.status NOT IN ('CLOSED','PROCESSING') OR batch.closes_at>clock_timestamp()
        OR batch.release_policy_digest IS DISTINCT FROM irt_compute.payload_digest(batch.release_policy)
        OR batch.release_policy->>'approvalId' IS DISTINCT FROM NEW.release_approval_id::text
      THEN RAISE EXCEPTION 'Closed approved batch required' USING ERRCODE='23514'; END IF;
      IF EXISTS(SELECT 1 FROM public.assessment_attempts a WHERE a.tryout_batch_id=NEW.batch_id AND
        (a.status NOT IN ('SUBMITTED','GRADED') OR NOT EXISTS(SELECT 1 FROM public.tryout_attempt_results x WHERE x.finalization_id=NEW.id AND x.attempt_id=a.id)))
      OR EXISTS(SELECT 1 FROM public.tryout_attempt_results x LEFT JOIN public.assessment_attempts a ON a.id=x.attempt_id WHERE x.finalization_id=NEW.id AND a.tryout_batch_id IS DISTINCT FROM NEW.batch_id)
      OR (SELECT count(*) FROM public.tryout_attempt_results WHERE finalization_id=NEW.id)=0
      OR (SELECT count(*) FROM public.tryout_attempt_results WHERE finalization_id=NEW.id)<>(SELECT jsonb_array_length(body->'respondents') FROM public.irt_calibration_requests_v1 WHERE id=NEW.source_calibration_request_id)
      THEN RAISE EXCEPTION 'Exact batch coverage required' USING ERRCODE='23514'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.policy_snapshot->'results') r WHERE NOT EXISTS
        (SELECT 1 FROM public.tryout_attempt_results x WHERE x.finalization_id=NEW.id AND x.attempt_id=(r->>'attemptId')::uuid
         AND x.result_mode=r->>'mode' AND x.delivered_arm_id=(r->>'armId')::uuid
         AND x.score IS NOT DISTINCT FROM (r->>'score')::numeric AND x.theta IS NOT DISTINCT FROM (r->>'theta')::numeric
         AND x.standard_error IS NOT DISTINCT FROM (r->>'standardError')::numeric))
      THEN RAISE EXCEPTION 'Release rows differ from frozen decision' USING ERRCODE='23514'; END IF;
      UPDATE public.tryout_batches SET status='PUBLISHED' WHERE id=NEW.batch_id;
      INSERT INTO public.analytics_outbox(event_name,event_version,entity_type,entity_id,payload)
       VALUES('tryout.batch_published','3','tryout_batch',NEW.batch_id,jsonb_build_object('finalizationId',NEW.id,'mode',NEW.mode));
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.published_at IS NOT NULL) THEN RAISE EXCEPTION 'Published finalization is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.published_at IS NOT NULL THEN
    SELECT * INTO batch FROM public.tryout_batches WHERE id=NEW.batch_id FOR UPDATE;
    IF batch.status NOT IN ('CLOSED','PROCESSING') OR batch.release_policy_digest IS NULL THEN RAISE EXCEPTION 'Publication requires closed batch and approved release policy' USING ERRCODE='23514'; END IF;
    SELECT count(*)::int INTO expected FROM public.assessment_attempts WHERE package_id=batch.package_id AND status='GRADED';
    SELECT count(*)::int INTO actual FROM public.tryout_attempt_results WHERE finalization_id=NEW.id;
    IF TG_OP='INSERT' OR expected=0 OR actual<>expected THEN RAISE EXCEPTION 'Publication must cover every valid batch attempt' USING ERRCODE='23514'; END IF;
    IF (SELECT count(*) FROM public.tryout_finalization_items WHERE finalization_id=NEW.id)<>(SELECT count(*) FROM public.package_items WHERE package_id=batch.package_id) THEN RAISE EXCEPTION 'Publication requires a common accounted-for item list' USING ERRCODE='23514'; END IF;
    IF NEW.mode='UNSCORABLE' AND EXISTS(SELECT 1 FROM public.tryout_attempt_results WHERE finalization_id=NEW.id AND (score IS NOT NULL OR rank IS NOT NULL OR percentile IS NOT NULL OR theta IS NOT NULL)) THEN RAISE EXCEPTION 'Unscorable batch has no score/rank/theta' USING ERRCODE='23514'; END IF;
    IF NEW.mode<>'UNSCORABLE' AND (NOT EXISTS(SELECT 1 FROM public.tryout_finalization_items WHERE finalization_id=NEW.id AND included) OR EXISTS(SELECT 1 FROM public.tryout_attempt_results WHERE finalization_id=NEW.id AND score IS NULL)) THEN RAISE EXCEPTION 'Scorable batch requires contributing items and scores' USING ERRCODE='23514'; END IF;
    IF NEW.mode='IRT' THEN PERFORM public.measurement_assert_adopted(NEW.source_output_id,(SELECT id FROM public.measurement_contexts WHERE tryout_batch_id=NEW.batch_id LIMIT 1)); END IF;
    UPDATE public.tryout_batches SET status='PUBLISHED' WHERE id=NEW.batch_id;
    INSERT INTO public.analytics_outbox(event_name,event_version,entity_type,entity_id,payload) VALUES('tryout.batch_published','3','tryout_batch',NEW.batch_id,jsonb_build_object('finalizationId',NEW.id,'mode',NEW.mode));
  END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_finalization_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f public.tryout_result_finalizations; pkg uuid; respondent jsonb;
BEGIN
  SELECT * INTO f FROM public.tryout_result_finalizations WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.finalization_id ELSE NEW.finalization_id END FOR UPDATE;
  IF f.published_at IS NOT NULL THEN RAISE EXCEPTION 'Published item/result cannot change' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND OLD.finalization_id<>NEW.finalization_id THEN RAISE EXCEPTION 'Finalization ownership cannot change' USING ERRCODE='23514'; END IF;
  IF f.source_calibration_request_id IS NOT NULL THEN
    IF TG_TABLE_NAME='tryout_attempt_results' THEN
      IF NOT EXISTS(SELECT 1 FROM public.assessment_attempts a JOIN public.irt_calibration_requests_v1 r ON r.id=f.source_calibration_request_id,
        LATERAL jsonb_array_elements(r.body->'respondents') p WHERE a.id=NEW.attempt_id AND a.tryout_batch_id=f.batch_id
        AND p->>'attemptId'=a.id::text AND p->>'deliveredArmId'=NEW.delivered_arm_id::text)
      THEN RAISE EXCEPTION 'Result outside frozen batch' USING ERRCODE='23514'; END IF;
      IF NEW.result_mode IS NULL OR NEW.rank IS NOT NULL OR NEW.percentile IS NOT NULL
       OR (NEW.score IS NOT NULL AND NOT (NEW.score>=0 AND NEW.score<=100))
       OR (NEW.result_mode='UNSCORABLE' AND (NEW.score IS NOT NULL OR NEW.theta IS NOT NULL OR NEW.standard_error IS NOT NULL))
       OR (NEW.result_mode='FALLBACK' AND (NEW.score IS NULL OR NEW.theta IS NOT NULL OR NEW.standard_error IS NOT NULL))
       OR (NEW.result_mode='IRT' AND (NEW.score IS NULL OR NEW.theta IS NULL OR NEW.standard_error IS NULL))
      THEN RAISE EXCEPTION 'Invalid per-attempt mode' USING ERRCODE='23514'; END IF;
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f.policy_snapshot->'results') r
        WHERE r->>'attemptId'=NEW.attempt_id::text AND r->>'mode'=NEW.result_mode
        AND r->>'armId'=NEW.delivered_arm_id::text
        AND (r->>'score')::numeric IS NOT DISTINCT FROM NEW.score
        AND (r->>'theta')::numeric IS NOT DISTINCT FROM NEW.theta
        AND (r->>'standardError')::numeric IS NOT DISTINCT FROM NEW.standard_error
        AND (r->>'rawPoints')::numeric IS NOT DISTINCT FROM NEW.raw_points
        AND (r->>'maximumPoints')::numeric IS NOT DISTINCT FROM NEW.maximum_points)
      THEN RAISE EXCEPTION 'Result must copy frozen decision' USING ERRCODE='23514'; END IF;
    ELSE
      IF NOT EXISTS(SELECT 1 FROM public.irt_calibration_requests_v1 r, LATERAL jsonb_array_elements(r.body->'items') i
       WHERE r.id=f.source_calibration_request_id AND i->>'questionVersionId'=NEW.question_version_id::text)
      THEN RAISE EXCEPTION 'Item outside frozen manifest' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  SELECT package_id INTO pkg FROM public.tryout_batches WHERE id=f.batch_id;
  IF TG_TABLE_NAME='tryout_attempt_results' THEN
    IF NOT EXISTS(SELECT 1 FROM public.assessment_attempts WHERE id=NEW.attempt_id AND package_id=pkg AND assessment_type='TRYOUT' AND status='GRADED') THEN RAISE EXCEPTION 'Result attempt must belong to the finalized batch' USING ERRCODE='23514'; END IF;
    IF f.mode<>'IRT' AND (NEW.theta IS NOT NULL OR NEW.standard_error IS NOT NULL) THEN RAISE EXCEPTION 'Fallback cannot invent theta/uncertainty' USING ERRCODE='23514'; END IF;
    IF f.mode='IRT' THEN
      SELECT value INTO respondent FROM irt_compute.compute_outputs o CROSS JOIN LATERAL jsonb_array_elements(o.payload->'respondents') r WHERE o.id=f.source_output_id AND r.value->>'attemptId'=NEW.attempt_id::text;
      IF respondent IS NULL OR (respondent->>'score')::numeric IS DISTINCT FROM NEW.score OR (respondent->>'theta')::numeric IS DISTINCT FROM NEW.theta OR (respondent->>'standardError')::numeric IS DISTINCT FROM NEW.standard_error OR respondent->>'mappingApprovalId' IS DISTINCT FROM f.mapping_approval_id::text THEN RAISE EXCEPTION 'IRT academic results must copy the scientific artifact and mapping' USING ERRCODE='23514'; END IF;
    END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.package_items WHERE package_id=pkg AND question_version_id=NEW.question_version_id) THEN RAISE EXCEPTION 'Finalization item must belong to batch package' USING ERRCODE='23514'; END IF;
    IF NEW.erratum_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.assessment_errata WHERE id=NEW.erratum_id AND question_version_id=NEW.question_version_id) THEN RAISE EXCEPTION 'Correction must belong to this item version' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
ALTER TABLE public.irt_artifact_adoption_receipts_v1 DROP CONSTRAINT irt_artifact_adoption_receipts_v1_execution_id_fkey;
ALTER TABLE public.irt_artifact_adoption_receipts_v1 ADD FOREIGN KEY(execution_id) REFERENCES irt_compute.calibration_jobs_v1(execution_id) ON DELETE RESTRICT;
ALTER TABLE public.irt_batches DROP CONSTRAINT irt_batches_source_execution_id_fkey;
ALTER TABLE public.irt_batches ADD FOREIGN KEY(source_execution_id) REFERENCES irt_compute.calibration_jobs_v1(execution_id) ON DELETE RESTRICT;
ALTER TABLE public.irt_batches ADD COLUMN research_snapshot_id uuid REFERENCES public.irt_calibration_requests_v1(snapshot_id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_adopted_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b public.irt_batches; r public.analysis_requests; payload_item jsonb;
BEGIN

  IF TG_TABLE_NAME='irt_batches' THEN
   IF NEW.source_calibration_artifact_id IS NOT NULL THEN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Research batch immutable' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.irt_calibration_requests_v1 q
      JOIN irt_compute.calibration_jobs_v1 j ON j.request_id=q.id
      JOIN irt_compute.calibration_artifacts_v1 a ON a.job_id=j.id
      WHERE q.id=NEW.source_request_id AND q.snapshot_id=NEW.research_snapshot_id AND q.context_id=NEW.context_id
      AND j.execution_id=NEW.source_execution_id AND j.status='SUCCEEDED' AND a.id=NEW.source_calibration_artifact_id
      AND a.payload=NEW.output_snapshot AND a.digest=NEW.output_digest)
    THEN RAISE EXCEPTION 'Research batch must copy sealed artifact' USING ERRCODE='23514'; END IF;
    RETURN NEW;
   END IF;
  ELSIF TG_TABLE_NAME='irt_item_results' THEN
    SELECT * INTO b FROM public.irt_batches WHERE id=NEW.batch_id;
    IF b.source_calibration_artifact_id IS NOT NULL THEN
      IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Research item immutable' USING ERRCODE='23514'; END IF;
      SELECT value INTO payload_item FROM jsonb_array_elements(b.output_snapshot#>'{outcome,items}') WHERE value->>'questionVersionId'=NEW.question_version_id::text;
      IF payload_item IS NULL OR payload_item->>'rubricVersionId' IS DISTINCT FROM NEW.rubric_version_id::text
        OR payload_item->>'modelFamily' IS DISTINCT FROM NEW.model_family
        OR payload_item->>'measurementState' IS DISTINCT FROM NEW.measurement_state::text
        OR (payload_item->>'eligibleRespondentCount')::integer IS DISTINCT FROM NEW.eligible_respondent_count
        OR payload_item->'quality' IS DISTINCT FROM NEW.quality_evidence
        OR round((payload_item#>>'{parameters,discriminationA}')::numeric,6) IS DISTINCT FROM NEW.discrimination_a
        OR round((payload_item#>>'{parameters,difficultyB}')::numeric,6) IS DISTINCT FROM NEW.difficulty_b
      THEN RAISE EXCEPTION 'Research parameters must copy artifact' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END IF;
  END IF;
  IF TG_TABLE_NAME='irt_batches' THEN
    IF NEW.source_output_id IS NOT NULL THEN
      IF TG_OP='UPDATE' AND OLD.source_output_id IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Adopted calibration batch is immutable' USING ERRCODE='23514'; END IF;
      PERFORM public.measurement_assert_adopted(NEW.source_output_id,NEW.context_id);
      SELECT * INTO r FROM public.analysis_requests WHERE id=NEW.analysis_request_id;
      IF r.snapshot_id IS DISTINCT FROM NEW.response_snapshot_id OR r.context_id IS DISTINCT FROM NEW.context_id THEN RAISE EXCEPTION 'IRT adoption must pin request input/context' USING ERRCODE='23514'; END IF;
      IF NEW.output_snapshot IS DISTINCT FROM (SELECT payload FROM irt_compute.compute_outputs WHERE id=NEW.source_output_id) THEN RAISE EXCEPTION 'Canonical output cannot alter scientific artifact' USING ERRCODE='23514'; END IF;
      NEW.output_digest:=(SELECT digest FROM irt_compute.compute_outputs WHERE id=NEW.source_output_id);
    END IF;
  ELSE
    SELECT * INTO b FROM public.irt_batches WHERE id=NEW.batch_id;
    IF NEW.model_family<>'LEGACY' THEN
      PERFORM public.measurement_assert_adopted(b.source_output_id,b.context_id);
      SELECT value INTO payload_item FROM jsonb_array_elements(b.output_snapshot->'items') WHERE value->>'questionVersionId'=NEW.question_version_id::text;
      IF payload_item IS NULL OR payload_item->>'rubricVersionId' IS DISTINCT FROM NEW.rubric_version_id::text OR payload_item->>'modelFamily' IS DISTINCT FROM NEW.model_family OR
        (payload_item->>'sampleSize')::integer IS DISTINCT FROM NEW.sample_size OR (payload_item->>'eligibleRespondentCount')::integer IS DISTINCT FROM NEW.eligible_respondent_count OR
        round((payload_item->>'discriminationA')::numeric,6) IS DISTINCT FROM NEW.discrimination_a OR round((payload_item->>'difficultyB')::numeric,6) IS DISTINCT FROM NEW.difficulty_b OR payload_item->>'measurementState' IS DISTINCT FROM NEW.measurement_state::text THEN
        RAISE EXCEPTION 'Canonical parameters must copy the scientific artifact' USING ERRCODE='23514';
      END IF;
      IF (NEW.model_family='2PL') IS DISTINCT FROM (SELECT question_type='SINGLE_CHOICE' FROM public.question_versions WHERE id=NEW.question_version_id) THEN RAISE EXCEPTION 'Model family must match item response format' USING ERRCODE='23514'; END IF;
      IF NEW.measurement_state='CALIBRATED' AND (NEW.quality_evidence IS NULL OR NEW.eligible_respondent_count IS NULL) THEN RAISE EXCEPTION 'Calibrated result needs quality evidence/counts' USING ERRCODE='23514'; END IF;
    END IF;
    IF TG_OP='UPDATE' AND OLD.model_family<>'LEGACY' THEN RAISE EXCEPTION 'Adopted item results are immutable' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

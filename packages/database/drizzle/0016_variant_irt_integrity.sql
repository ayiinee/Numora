-- ENGINEERING DECISION: integrity and access boundaries; no academic thresholds are approved here.
CREATE OR REPLACE FUNCTION irt_compute.payload_digest(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT encode(sha256(convert_to(value::text, 'UTF8')), 'hex') $$;
--> statement-breakpoint
-- Conservative legacy metadata. A draft rubric is evidence of previous binary grading, not new approval.
INSERT INTO public.scoring_rubric_versions (id, code, version, question_type, maximum_score_category, definition, digest)
VALUES ('00000000-0000-4000-8000-000000009901', 'LEGACY_SINGLE_CHOICE', 1, 'SINGLE_CHOICE', 1,
  '{"legacy":true,"categories":[0,1],"fullyCorrectCategory":1}',
  irt_compute.payload_digest('{"legacy":true,"categories":[0,1],"fullyCorrectCategory":1}'));
--> statement-breakpoint
UPDATE public.question_versions SET scoring_rubric_version_id = '00000000-0000-4000-8000-000000009901'
WHERE question_type = 'SINGLE_CHOICE';
--> statement-breakpoint
UPDATE public.question_versions SET validation_state = CASE WHEN content_status='READY' THEN 'CONTENT_VALID'::public.content_validation_state
  WHEN content_status='ARCHIVED' THEN 'ARCHIVED'::public.content_validation_state ELSE 'DRAFT'::public.content_validation_state END;
--> statement-breakpoint
UPDATE public.package_items pi SET rubric_version_id = q.scoring_rubric_version_id, maximum_score_category = 1
FROM public.question_versions q WHERE q.id=pi.question_version_id AND q.question_type='SINGLE_CHOICE';
--> statement-breakpoint
UPDATE public.attempt_items ai SET rubric_version_id=pi.rubric_version_id, maximum_score_category=pi.maximum_score_category
FROM public.package_items pi WHERE pi.id=ai.package_item_id;
--> statement-breakpoint
UPDATE public.attempt_answers a SET score_category=CASE WHEN a.awarded_points=ai.max_points THEN 1 ELSE 0 END,
  fully_correct=(a.awarded_points=ai.max_points), response_state=CASE WHEN a.answer->>'optionId' IS NULL THEN 'OMITTED'::public.response_state ELSE 'RESPONDED'::public.response_state END
FROM public.attempt_items ai JOIN public.question_versions q ON q.id=ai.question_version_id
WHERE ai.id=a.attempt_item_id AND q.question_type='SINGLE_CHOICE' AND a.graded_at IS NOT NULL AND a.awarded_points IN (0,ai.max_points);
--> statement-breakpoint
-- Level/parent provenance is populated only where the existing evidence is unambiguous.
UPDATE public.question_versions q SET level_id=s.level_id FROM (
  SELECT pi.question_version_id, (array_agg(DISTINCT p.level_id))[1] AS level_id
  FROM public.package_items pi JOIN public.assessment_packages p ON p.id=pi.package_id
  WHERE p.level_id IS NOT NULL GROUP BY pi.question_version_id HAVING count(DISTINCT p.level_id)=1
) s WHERE q.id=s.question_version_id;
--> statement-breakpoint
UPDATE public.question_versions q SET parent_original_question_version_id=r.original_question_version_id
FROM irt_compute.generation_candidates c JOIN irt_compute.generation_runs r ON r.id=c.generation_run_id
WHERE c.candidate_question_version_id=q.id AND EXISTS(
  SELECT 1 FROM public.question_versions parent JOIN public.question_variants pv ON pv.id=parent.variant_id
    JOIN public.question_variants cv ON cv.id=q.variant_id
  WHERE parent.id=r.original_question_version_id AND pv.kind='ORIGINAL' AND pv.question_id=cv.question_id
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only; create a new version', TG_TABLE_NAME USING ERRCODE='23514'; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Configuration history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('SEALED','RETIRED') AND
    (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
    RAISE EXCEPTION 'Sealed configuration is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('SEALED','RETIRED') AND NEW.status NOT IN ('SEALED','RETIRED') THEN
    RAISE EXCEPTION 'Sealed configuration cannot become draft' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='scoring_rubric_versions' AND EXISTS(SELECT 1 FROM public.attempt_items WHERE rubric_version_id=OLD.id) AND
    (to_jsonb(NEW)-ARRAY['status','approved_by_user_id','approved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','approved_by_user_id','approved_at']) THEN RAISE EXCEPTION 'Used rubric definition cannot change' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='generator_configs' AND EXISTS(SELECT 1 FROM irt_compute.generation_runs WHERE config_id=OLD.id) AND (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Used generator configuration cannot change' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['public.scoring_rubric_versions','public.assessment_blueprint_versions','irt_compute.generator_templates','irt_compute.technical_policy_versions','irt_compute.generator_configs'] LOOP
    EXECUTE format('CREATE TRIGGER measurement_config_guard BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.measurement_config_guard()',target);
  END LOOP;
  FOREACH target IN ARRAY ARRAY['public.measurement_contexts','public.content_validation_decisions','public.candidate_imports','public.trial_assignments','public.trial_eligibility_snapshots','public.trial_checkpoints','public.content_delivery_manifests','public.content_delivery_items','public.student_item_exposures','public.package_quality_results','public.item_distribution_decisions','public.monitoring_findings','public.assessment_errata','irt_compute.compute_outputs','irt_compute.candidate_validation_results','irt_compute.adjustment_iterations'] LOOP
    EXECUTE format('CREATE TRIGGER measurement_append_only BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.measurement_append_only()',target);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d text; s text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Approval history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'Only first revocation is allowed' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.technical_policy_version_id IS NOT NULL THEN SELECT digest,status INTO d,s FROM irt_compute.technical_policy_versions WHERE id=NEW.technical_policy_version_id;
  ELSIF NEW.generator_template_id IS NOT NULL THEN SELECT digest,status INTO d,s FROM irt_compute.generator_templates WHERE id=NEW.generator_template_id;
  ELSE SELECT digest,status INTO d,s FROM irt_compute.generator_configs WHERE id=NEW.generator_config_id; END IF;
  IF s IS DISTINCT FROM 'SEALED' OR d IS DISTINCT FROM NEW.approved_digest THEN RAISE EXCEPTION 'Approval must match a sealed configuration digest' USING ERRCODE='23514'; END IF;
  IF NEW.scope->>'ecosystem' NOT IN ('DRILL','TRYOUT') OR NEW.scope->>'ecosystem' IS NULL THEN RAISE EXCEPTION 'Explicit approval ecosystem is required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_approval_guard BEFORE INSERT OR UPDATE OR DELETE ON public.configuration_approvals FOR EACH ROW EXECUTE FUNCTION public.measurement_approval_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_question_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fam uuid; parent_fam uuid; parent_kind text; d public.content_validation_decisions;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Question version history cannot be deleted' USING ERRCODE='23514'; END IF;
  SELECT question_id INTO fam FROM public.question_variants WHERE id=NEW.variant_id;
  IF NEW.question_type='SINGLE_CHOICE' AND NEW.scoring_rubric_version_id IS NULL THEN NEW.scoring_rubric_version_id:='00000000-0000-4000-8000-000000009901'; END IF;
  IF NEW.parent_original_question_version_id IS NOT NULL THEN
    SELECT v.question_id,v.kind INTO parent_fam,parent_kind FROM public.question_versions q JOIN public.question_variants v ON v.id=q.variant_id WHERE q.id=NEW.parent_original_question_version_id;
    IF parent_fam IS DISTINCT FROM fam OR parent_kind IS DISTINCT FROM 'ORIGINAL' OR NEW.parent_original_question_version_id=NEW.id THEN RAISE EXCEPTION 'Original parent must be another original version in the same family' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.revised_from_question_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.question_versions q WHERE q.id=NEW.revised_from_question_version_id AND q.variant_id=NEW.variant_id AND q.version_number<NEW.version_number) THEN RAISE EXCEPTION 'Revision must reference an earlier version of the same variant' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (EXISTS(SELECT 1 FROM public.attempt_items WHERE question_version_id=OLD.id) OR EXISTS(SELECT 1 FROM public.pvp_match_questions WHERE question_version_id=OLD.id) OR EXISTS(SELECT 1 FROM irt_compute.generation_runs WHERE original_question_version_id=OLD.id) OR EXISTS(SELECT 1 FROM public.package_items i JOIN public.assessment_packages p ON p.id=i.package_id WHERE i.question_version_id=OLD.id AND p.frozen_at IS NOT NULL) OR EXISTS(SELECT 1 FROM public.generation_wave_items w JOIN public.analysis_requests r ON r.wave_item_id=w.id WHERE w.original_question_version_id=OLD.id)) AND
    (to_jsonb(NEW)-ARRAY['content_status','validation_state','validation_decision_id','reviewed_by_user_id','reviewed_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['content_status','validation_state','validation_decision_id','reviewed_by_user_id','reviewed_at']) THEN
    RAISE EXCEPTION 'Used content/scoring cannot be overwritten' USING ERRCODE='23514';
  END IF;
  IF NEW.content_status='READY' AND NEW.validation_decision_id IS NULL AND NEW.reviewed_by_user_id IS NOT NULL THEN NEW.validation_state:='CONTENT_VALID'; END IF;
  IF NEW.validation_decision_id IS NOT NULL THEN
    SELECT * INTO d FROM public.content_validation_decisions WHERE id=NEW.validation_decision_id;
    IF d.question_version_id IS DISTINCT FROM NEW.id OR d.state IS DISTINCT FROM NEW.validation_state THEN RAISE EXCEPTION 'Validation decision must belong to this version and state' USING ERRCODE='23514'; END IF;
    IF NEW.content_status='READY' AND d.state<>'CONTENT_VALID' THEN RAISE EXCEPTION 'READY requires content validation' USING ERRCODE='23514'; END IF;
    IF d.service_principal_id IS NOT NULL AND (d.configuration_approval_id IS NULL OR d.source_output_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.configuration_approvals WHERE id=d.configuration_approval_id AND revoked_at IS NULL)) THEN RAISE EXCEPTION 'Automatic validation requires approved configuration and evidence' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_question_guard BEFORE INSERT OR UPDATE OR DELETE ON public.question_versions FOR EACH ROW EXECUTE FUNCTION public.measurement_question_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Package history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (OLD.frozen_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.assessment_attempts WHERE package_id=OLD.id) OR EXISTS(SELECT 1 FROM public.pvp_matches WHERE package_id=OLD.id)) AND
    (to_jsonb(NEW)-ARRAY['status','release_at','close_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','release_at','close_at']) THEN RAISE EXCEPTION 'Used/frozen package composition cannot change' USING ERRCODE='23514'; END IF;
  IF NEW.frozen_at IS NOT NULL AND OLD.frozen_at IS NULL THEN
    NEW.manifest_digest:=irt_compute.payload_digest(jsonb_build_object('packageId',NEW.id,'blueprintVersionId',NEW.blueprint_version_id,'scoringPolicyVersionId',NEW.scoring_policy_version_id,'items',
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.display_order,i.id) FROM public.package_items i WHERE i.package_id=NEW.id)));
  END IF;
  IF NEW.frozen_at IS NOT NULL AND NEW.manifest_digest IS NULL THEN RAISE EXCEPTION 'Frozen package needs a manifest digest' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_package_guard BEFORE UPDATE OR DELETE ON public.assessment_packages FOR EACH ROW EXECUTE FUNCTION public.measurement_package_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p public.package_items; q public.question_versions; frozen boolean;
BEGIN
  IF TG_TABLE_NAME='attempt_items' THEN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Attempt item snapshot is immutable' USING ERRCODE='23514'; END IF;
    SELECT * INTO p FROM public.package_items WHERE id=NEW.package_item_id;
    IF NEW.max_points IS DISTINCT FROM p.max_points THEN RAISE EXCEPTION 'Attempt weight must match package snapshot' USING ERRCODE='23514'; END IF;
    NEW.rubric_version_id := coalesce(NEW.rubric_version_id,p.rubric_version_id);
    NEW.maximum_score_category := coalesce(NEW.maximum_score_category,p.maximum_score_category);
    IF NEW.rubric_version_id IS DISTINCT FROM p.rubric_version_id OR NEW.maximum_score_category IS DISTINCT FROM p.maximum_score_category THEN RAISE EXCEPTION 'Attempt rubric must match package' USING ERRCODE='23514'; END IF;
    NEW.item_role := p.item_role;
  ELSE
    SELECT frozen_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.assessment_attempts WHERE package_id=pkg.id) OR EXISTS(SELECT 1 FROM public.pvp_matches WHERE package_id=pkg.id) INTO frozen
      FROM public.assessment_packages pkg WHERE pkg.id=CASE WHEN TG_OP='DELETE' THEN OLD.package_id ELSE NEW.package_id END FOR UPDATE;
    IF frozen THEN RAISE EXCEPTION 'Frozen/used package items cannot change' USING ERRCODE='23514'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF TG_OP='UPDATE' AND NEW.package_id<>OLD.package_id THEN RAISE EXCEPTION 'Move requires a new package item' USING ERRCODE='23514'; END IF;
    SELECT * INTO q FROM public.question_versions WHERE id=NEW.question_version_id;
    NEW.rubric_version_id := coalesce(NEW.rubric_version_id,q.scoring_rubric_version_id);
    IF NEW.rubric_version_id IS DISTINCT FROM q.scoring_rubric_version_id THEN RAISE EXCEPTION 'Package rubric must match content version' USING ERRCODE='23514'; END IF;
    SELECT maximum_score_category INTO NEW.maximum_score_category FROM public.scoring_rubric_versions WHERE id=NEW.rubric_version_id;
    IF EXISTS(SELECT 1 FROM public.package_items pi JOIN public.question_versions oldq ON oldq.id=pi.question_version_id JOIN public.question_variants ov ON ov.id=oldq.variant_id
      JOIN public.question_variants nv ON nv.id=q.variant_id WHERE pi.package_id=NEW.package_id AND pi.id<>NEW.id AND ov.question_id=nv.question_id) THEN
      RAISE EXCEPTION 'A package cannot contain close variants of one family' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_package_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.package_items FOR EACH ROW EXECUTE FUNCTION public.measurement_item_guard();
--> statement-breakpoint
CREATE TRIGGER measurement_attempt_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.attempt_items FOR EACH ROW EXECUTE FUNCTION public.measurement_item_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i public.attempt_items; a public.assessment_attempts; kind text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Answer history cannot be deleted' USING ERRCODE='23514'; END IF;
  SELECT * INTO i FROM public.attempt_items WHERE id=NEW.attempt_item_id;
  SELECT * INTO a FROM public.assessment_attempts WHERE id=i.attempt_id FOR UPDATE;
  IF a.status IN ('GRADED','CANCELLED') OR (a.status='SUBMITTED' AND (TG_OP='INSERT' OR OLD.graded_at IS NOT NULL OR NEW.answer IS DISTINCT FROM OLD.answer)) THEN RAISE EXCEPTION 'Final raw submission is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.awarded_points>i.max_points OR NEW.score_category>i.maximum_score_category THEN RAISE EXCEPTION 'Score exceeds pinned maximum' USING ERRCODE='23514'; END IF;
  SELECT question_type INTO kind FROM public.question_versions WHERE id=i.question_version_id;
  IF NEW.graded_at IS NULL THEN
    NEW.score_category:=NULL; NEW.fully_correct:=NULL;
  ELSIF kind='SINGLE_CHOICE' AND NEW.awarded_points IN (0,i.max_points) THEN
    NEW.score_category:=CASE WHEN NEW.awarded_points=i.max_points THEN 1 ELSE 0 END;
    NEW.fully_correct:=(NEW.awarded_points=i.max_points);
    NEW.response_state:=CASE WHEN NEW.answer->>'optionId' IS NULL THEN 'OMITTED'::public.response_state ELSE 'RESPONDED'::public.response_state END;
  ELSIF kind='SINGLE_CHOICE' THEN RAISE EXCEPTION 'Binary item cannot receive partial points' USING ERRCODE='23514';
  ELSIF NEW.score_category IS NULL OR NEW.fully_correct IS NULL OR NEW.response_state IS NULL OR i.rubric_version_id IS NULL THEN
    RAISE EXCEPTION 'Partial-credit scoring needs explicit rubric/category/state' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_answer_guard BEFORE INSERT OR UPDATE OR DELETE ON public.attempt_answers FOR EACH ROW EXECUTE FUNCTION public.measurement_answer_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Assessment history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF OLD.status IN ('GRADED','CANCELLED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Final assessment facts are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status='SUBMITTED' AND (to_jsonb(NEW)-ARRAY['status','raw_points','score_0_100']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','raw_points','score_0_100']) THEN RAISE EXCEPTION 'Submitted assessment identity/timing is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status='SUBMITTED' AND NEW.status NOT IN ('SUBMITTED','GRADED') THEN RAISE EXCEPTION 'Submission cannot reopen' USING ERRCODE='23514'; END IF;
  IF (NEW.student_id,NEW.package_id,NEW.purpose,NEW.phase_id,NEW.trial_assignment_id,NEW.scoring_policy_version_id) IS DISTINCT FROM (OLD.student_id,OLD.package_id,OLD.purpose,OLD.phase_id,OLD.trial_assignment_id,OLD.scoring_policy_version_id) THEN RAISE EXCEPTION 'Attempt source is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_attempt_guard BEFORE UPDATE OR DELETE ON public.assessment_attempts FOR EACH ROW EXECUTE FUNCTION public.measurement_attempt_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_variant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Variant family/lineage identity is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_variant_guard BEFORE UPDATE OR DELETE ON public.question_variants FOR EACH ROW EXECUTE FUNCTION public.measurement_variant_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_product_effect_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='xp_ledger' THEN
    IF EXISTS(SELECT 1 FROM public.assessment_attempts WHERE id=NEW.attempt_id AND purpose<>'REGULAR') THEN RAISE EXCEPTION 'Trial cannot award product XP' USING ERRCODE='23514'; END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.assessment_attempts WHERE id IN (NEW.unlocking_attempt_id,NEW.completion_attempt_id) AND purpose<>'REGULAR') THEN RAISE EXCEPTION 'Trial cannot change product progress' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_xp_guard BEFORE INSERT OR UPDATE ON public.xp_ledger FOR EACH ROW EXECUTE FUNCTION public.measurement_product_effect_guard();
--> statement-breakpoint
CREATE TRIGGER measurement_progress_guard BEFORE INSERT OR UPDATE ON public.level_progress FOR EACH ROW EXECUTE FUNCTION public.measurement_product_effect_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer; d text;
BEGIN
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.status='FROZEN') THEN RAISE EXCEPTION 'Frozen input history is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status='FROZEN' THEN
    SELECT count(*)::int, irt_compute.payload_digest(jsonb_build_object('contextId',NEW.context_id,'phaseId',NEW.phase_id,'cutoffAt',NEW.cutoff_at,'policy',NEW.policy,'respondentKeyVersion',NEW.respondent_key_version,'rows',coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb)))
      INTO n,d FROM public.response_snapshot_items i WHERE snapshot_id=NEW.id;
    IF TG_OP='INSERT' OR n=0 THEN RAISE EXCEPTION 'Build response rows before freezing input' USING ERRCODE='23514'; END IF;
    NEW.row_count:=n; NEW.digest:=d; NEW.frozen_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON public.response_snapshots FOR EACH ROW EXECUTE FUNCTION public.measurement_snapshot_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_snapshot_row_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s public.response_snapshots; source public.attempt_items;
BEGIN
  SELECT * INTO s FROM public.response_snapshots WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.snapshot_id ELSE NEW.snapshot_id END FOR UPDATE;
  IF s.status='FROZEN' THEN RAISE EXCEPTION 'Frozen snapshot rows cannot change' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND NEW.snapshot_id<>OLD.snapshot_id THEN RAISE EXCEPTION 'Snapshot ownership cannot change' USING ERRCODE='23514'; END IF;
  SELECT * INTO source FROM public.attempt_items WHERE id=NEW.attempt_item_id;
  IF source.attempt_id IS DISTINCT FROM NEW.attempt_id OR source.question_version_id IS DISTINCT FROM NEW.question_version_id OR source.rubric_version_id IS DISTINCT FROM NEW.rubric_version_id OR source.maximum_score_category IS DISTINCT FROM NEW.maximum_score_category OR source.max_points IS DISTINCT FROM NEW.max_points THEN
    RAISE EXCEPTION 'Snapshot scoring/source must match attempt evidence' USING ERRCODE='23514';
  END IF;
  IF NEW.completed_at>s.cutoff_at OR NEW.completed_at IS NULL OR NEW.response_state IN ('NOT_PRESENTED','INVALID') THEN
    IF NEW.operational_eligible THEN RAISE EXCEPTION 'Operationally invalid/late response cannot be eligible' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_snapshot_row_guard BEFORE INSERT OR UPDATE OR DELETE ON public.response_snapshot_items FOR EACH ROW EXECUTE FUNCTION public.measurement_snapshot_row_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s public.response_snapshots; e irt_compute.compute_executions; pin jsonb; ctx public.measurement_contexts; a public.configuration_approvals; phase public.trial_phases; wave public.generation_wave_items; package_digest text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Request history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['status','accepted_execution_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','accepted_execution_id']) OR (OLD.accepted_execution_id IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
      RAISE EXCEPTION 'Request input/accepted result is immutable' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO ctx FROM public.measurement_contexts WHERE id=NEW.context_id;
    IF NEW.snapshot_id IS NOT NULL THEN
      SELECT * INTO s FROM public.response_snapshots WHERE id=NEW.snapshot_id;
      IF s.status IS DISTINCT FROM 'FROZEN' OR s.context_id IS DISTINCT FROM NEW.context_id THEN RAISE EXCEPTION 'Request requires frozen input in its context' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.request_type='COMPARE_VARIANTS' THEN
      SELECT * INTO phase FROM public.trial_phases WHERE id=s.phase_id;
      IF phase.purpose IS DISTINCT FROM 'VARIANT_AB' OR phase.status IS DISTINCT FROM 'CLOSED' THEN RAISE EXCEPTION 'Compare requires a closed A/B phase' USING ERRCODE='23514'; END IF;
      NEW.baseline_id:=coalesce(NEW.baseline_id,phase.baseline_id); NEW.reference_set_id:=coalesce(NEW.reference_set_id,phase.reference_set_id);
      IF NEW.baseline_id IS DISTINCT FROM phase.baseline_id OR NEW.reference_set_id IS DISTINCT FROM phase.reference_set_id THEN RAISE EXCEPTION 'Compare input must retain phase baseline/references' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.baseline_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.calibration_baselines WHERE id=NEW.baseline_id AND context_id=NEW.context_id AND activated_at IS NOT NULL) THEN RAISE EXCEPTION 'Baseline must be active in request context' USING ERRCODE='23514'; END IF;
    IF NEW.reference_set_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.reference_sets WHERE id=NEW.reference_set_id AND context_id=NEW.context_id AND activated_at IS NOT NULL) THEN RAISE EXCEPTION 'References must be active in request context' USING ERRCODE='23514'; END IF;
    IF NEW.wave_item_id IS NOT NULL THEN
      SELECT * INTO wave FROM public.generation_wave_items WHERE id=NEW.wave_item_id FOR UPDATE;
      IF wave.context_id IS DISTINCT FROM NEW.context_id OR NOT EXISTS(SELECT 1 FROM public.generation_waves WHERE id=wave.wave_id AND status IN ('APPROVED','RUNNING')) THEN RAISE EXCEPTION 'Generation input must belong to authorized context/wave' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.package_id IS NOT NULL THEN
      SELECT manifest_digest INTO package_digest FROM public.assessment_packages WHERE id=NEW.package_id AND frozen_at IS NOT NULL;
      IF package_digest IS NULL THEN RAISE EXCEPTION 'Package analysis requires frozen composition' USING ERRCODE='23514'; END IF;
    END IF;
    IF jsonb_typeof(NEW.configuration_pins) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.configuration_pins)=0 THEN RAISE EXCEPTION 'Approved configuration pins are required' USING ERRCODE='23514'; END IF;
    FOR pin IN SELECT value FROM jsonb_array_elements(NEW.configuration_pins) LOOP
      SELECT * INTO a FROM public.configuration_approvals WHERE id=(pin->>'approvalId')::uuid;
      IF a.id IS NULL OR a.revoked_at IS NOT NULL OR a.approved_digest IS DISTINCT FROM pin->>'digest' OR a.scope->>'ecosystem' IS DISTINCT FROM ctx.ecosystem OR (a.scope ? 'contextId' AND a.scope->>'contextId'<>NEW.context_id::text) THEN RAISE EXCEPTION 'Configuration approval/digest/scope mismatch' USING ERRCODE='23514'; END IF;
    END LOOP;
    NEW.input_digest:=irt_compute.payload_digest(jsonb_build_object('requestType',NEW.request_type,'contextId',NEW.context_id,'snapshotDigest',s.digest,'waveItem',to_jsonb(wave),'packageId',NEW.package_id,'packageDigest',package_digest,'baselineId',NEW.baseline_id,'referenceSetId',NEW.reference_set_id,'configurationPins',NEW.configuration_pins,'contractVersion',NEW.contract_version,'dueAt',NEW.due_at));
    IF NEW.contract_version<>3 THEN RAISE EXCEPTION 'New compute requests use contract version 3' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.accepted_execution_id IS NOT NULL THEN
    SELECT * INTO e FROM irt_compute.compute_executions WHERE id=NEW.accepted_execution_id;
    IF e.request_id IS DISTINCT FROM NEW.id OR e.status IS DISTINCT FROM 'SUCCEEDED' OR EXISTS(SELECT 1 FROM irt_compute.compute_executions WHERE request_id=NEW.id AND attempt_number>e.attempt_number) OR NOT EXISTS(SELECT 1 FROM irt_compute.compute_outputs WHERE execution_id=e.id AND input_digest=NEW.input_digest) THEN RAISE EXCEPTION 'Only the completed current execution can be adopted' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.status='COMPLETED' AND NEW.accepted_execution_id IS NULL THEN RAISE EXCEPTION 'Completed request needs an accepted execution' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_request_guard BEFORE INSERT OR UPDATE OR DELETE ON public.analysis_requests FOR EACH ROW EXECUTE FUNCTION public.measurement_request_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_request_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.analytics_outbox(event_name,event_version,entity_type,entity_id,correlation_id,payload)
    VALUES('analysis.requested','3','analysis_request',NEW.id,NEW.id,jsonb_build_object('requestId',NEW.id,'requestType',NEW.request_type,'inputDigest',NEW.input_digest));
  INSERT INTO public.outbox_deliveries(outbox_id,consumer) SELECT id,'irt_compute' FROM public.analytics_outbox WHERE entity_id=NEW.id AND event_name='analysis.requested';
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_request_outbox AFTER INSERT ON public.analysis_requests FOR EACH ROW EXECUTE FUNCTION public.measurement_request_outbox();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION irt_compute.execution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE last_attempt integer; state text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Execution history cannot be deleted' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.request_id::text,3));
  SELECT status INTO state FROM public.analysis_requests WHERE id=NEW.request_id;
  IF state IN ('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'Request already terminal' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.service_principals WHERE id=NEW.service_principal_id AND enabled) THEN RAISE EXCEPTION 'Enabled service principal required' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT max(attempt_number) INTO last_attempt FROM irt_compute.compute_executions WHERE request_id=NEW.request_id;
    IF NEW.attempt_number<>coalesce(last_attempt,0)+1 OR NEW.status<>'RUNNING' OR NEW.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'New execution needs the next attempt and a live lease' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.status<>'RUNNING' OR (to_jsonb(NEW)-ARRAY['status','lease_expires_at','heartbeat_at','finished_at','failure_code']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','lease_expires_at','heartbeat_at','finished_at','failure_code']) THEN RAISE EXCEPTION 'Execution identity/terminal history is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.lease_expires_at<=clock_timestamp() AND NEW.status<>'EXPIRED' THEN RAISE EXCEPTION 'Stale lease cannot finish or renew' USING ERRCODE='23514'; END IF;
    IF NEW.status='EXPIRED' AND OLD.lease_expires_at>clock_timestamp() THEN RAISE EXCEPTION 'Live execution cannot expire' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER execution_guard BEFORE INSERT OR UPDATE OR DELETE ON irt_compute.compute_executions FOR EACH ROW EXECUTE FUNCTION irt_compute.execution_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION irt_compute.output_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e irt_compute.compute_executions; r public.analysis_requests;
BEGIN
  SELECT * INTO e FROM irt_compute.compute_executions WHERE id=NEW.execution_id FOR UPDATE;
  SELECT * INTO r FROM public.analysis_requests WHERE id=e.request_id;
  IF e.status IS DISTINCT FROM 'RUNNING' OR e.lease_expires_at<=clock_timestamp() OR NEW.input_digest IS DISTINCT FROM r.input_digest THEN RAISE EXCEPTION 'Artifact requires current execution and matching input' USING ERRCODE='23514'; END IF;
  IF NEW.dataset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM irt_compute.analysis_datasets WHERE id=NEW.dataset_id AND execution_id=e.id AND snapshot_id=r.snapshot_id AND status='SEALED') THEN RAISE EXCEPTION 'Artifact requires its sealed selection manifest' USING ERRCODE='23514'; END IF;
  IF r.snapshot_id IS NOT NULL AND NEW.dataset_id IS NULL THEN RAISE EXCEPTION 'Response analysis requires a selection manifest' USING ERRCODE='23514'; END IF;
  IF NEW.kind<>r.request_type AND NOT (r.request_type='COMPARE_VARIANTS' AND NEW.kind='GENERATE_VARIANTS') THEN RAISE EXCEPTION 'Artifact kind does not belong to requested work' USING ERRCODE='23514'; END IF;
  NEW.digest:=irt_compute.payload_digest(NEW.payload);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER output_guard BEFORE INSERT ON irt_compute.compute_outputs FOR EACH ROW EXECUTE FUNCTION irt_compute.output_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION irt_compute.dataset_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r public.analysis_requests; n integer; total integer;
BEGIN
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.status='SEALED') THEN RAISE EXCEPTION 'Sealed dataset is immutable' USING ERRCODE='23514'; END IF;
  SELECT req.* INTO r FROM public.analysis_requests req JOIN irt_compute.compute_executions e ON e.request_id=req.id WHERE e.id=NEW.execution_id;
  IF NEW.snapshot_id IS DISTINCT FROM r.snapshot_id THEN RAISE EXCEPTION 'Dataset must use execution input snapshot' USING ERRCODE='23514'; END IF;
  IF NEW.status='SEALED' THEN
    SELECT count(*)::int, count(*) FILTER(WHERE decision='INCLUDE')::int INTO total,n FROM irt_compute.analysis_response_selections WHERE dataset_id=NEW.id;
    IF total<>(SELECT row_count FROM public.response_snapshots WHERE id=NEW.snapshot_id) THEN RAISE EXCEPTION 'Manifest must account for every input row' USING ERRCODE='23514'; END IF;
    NEW.selected_count:=n; NEW.sealed_at:=clock_timestamp();
    SELECT irt_compute.payload_digest(jsonb_build_object('snapshotId',NEW.snapshot_id,'policyId',NEW.selection_policy_id,'rows',coalesce(jsonb_agg(to_jsonb(s) ORDER BY snapshot_item_id),'[]'::jsonb))) INTO NEW.digest FROM irt_compute.analysis_response_selections s WHERE dataset_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER dataset_guard BEFORE INSERT OR UPDATE OR DELETE ON irt_compute.analysis_datasets FOR EACH ROW EXECUTE FUNCTION irt_compute.dataset_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION irt_compute.selection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text;
BEGIN
  SELECT status INTO state FROM irt_compute.analysis_datasets WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.dataset_id ELSE NEW.dataset_id END FOR UPDATE;
  IF state='SEALED' THEN RAISE EXCEPTION 'Sealed selection cannot change' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND (NEW.dataset_id<>OLD.dataset_id OR NEW.snapshot_item_id<>OLD.snapshot_item_id OR NEW.snapshot_id<>OLD.snapshot_id) THEN RAISE EXCEPTION 'Selection source is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.decision='INCLUDE' AND NOT EXISTS(SELECT 1 FROM public.response_snapshot_items WHERE id=NEW.snapshot_item_id AND operational_eligible) THEN RAISE EXCEPTION 'Cannot include operationally excluded response' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(NEW.reasons) IS DISTINCT FROM 'array' OR (NEW.decision='EXCLUDE' AND jsonb_array_length(NEW.reasons)=0) THEN RAISE EXCEPTION 'Exclusion requires explicit reasons' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER selection_guard BEFORE INSERT OR UPDATE OR DELETE ON irt_compute.analysis_response_selections FOR EACH ROW EXECUTE FUNCTION irt_compute.selection_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_assert_adopted(p_output_id uuid, p_context_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM irt_compute.compute_outputs o JOIN irt_compute.compute_executions e ON e.id=o.execution_id JOIN public.analysis_requests r ON r.id=e.request_id
    WHERE o.id=p_output_id AND r.accepted_execution_id=e.id AND r.status='COMPLETED' AND r.input_digest=o.input_digest AND (p_context_id IS NULL OR r.context_id=p_context_id)) THEN
    RAISE EXCEPTION 'Canonical result must reference an adopted artifact in its context' USING ERRCODE='23514';
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION irt_compute.candidate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r irt_compute.generation_runs; oldrun irt_compute.generation_runs;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Candidate history is immutable; generate a replacement' USING ERRCODE='23514'; END IF;
  IF NEW.candidate_question_version_id IS NOT NULL THEN RAISE EXCEPTION 'New candidates use canonical import mappings, not legacy linkage' USING ERRCODE='23514'; END IF;
  SELECT * INTO r FROM irt_compute.generation_runs WHERE id=NEW.generation_run_id;
  IF NOT EXISTS(SELECT 1 FROM irt_compute.compute_executions WHERE id=r.execution_id AND status='RUNNING' AND lease_expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'Candidate writes require a live execution lease' USING ERRCODE='23514'; END IF;
  IF NEW.parent_original_question_version_id IS DISTINCT FROM r.original_question_version_id OR r.wave_item_id IS NULL OR r.execution_id IS NULL THEN RAISE EXCEPTION 'Candidate must pin its authorized original/wave/execution' USING ERRCODE='23514'; END IF;
  IF NEW.replacement_of_id IS NOT NULL THEN
    SELECT gr.* INTO oldrun FROM irt_compute.generation_candidates c JOIN irt_compute.generation_runs gr ON gr.id=c.generation_run_id WHERE c.id=NEW.replacement_of_id;
    IF oldrun.wave_item_id IS DISTINCT FROM r.wave_item_id OR oldrun.original_question_version_id IS DISTINCT FROM r.original_question_version_id THEN RAISE EXCEPTION 'Replacement stays in the same wave/family' USING ERRCODE='23514'; END IF;
  END IF;
  NEW.payload_digest:=irt_compute.payload_digest(NEW.payload); NEW.sealed_at:=clock_timestamp();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER candidate_guard BEFORE INSERT OR UPDATE OR DELETE ON irt_compute.generation_candidates FOR EACH ROW EXECUTE FUNCTION irt_compute.candidate_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_import_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c irt_compute.generation_candidates; q public.question_versions; r irt_compute.generation_runs;
BEGIN
  SELECT * INTO c FROM irt_compute.generation_candidates WHERE id=NEW.candidate_id;
  SELECT * INTO q FROM public.question_versions WHERE id=NEW.question_version_id;
  SELECT * INTO r FROM irt_compute.generation_runs WHERE id=c.generation_run_id;
  IF c.payload_digest IS DISTINCT FROM NEW.payload_digest OR c.parent_original_question_version_id IS DISTINCT FROM q.parent_original_question_version_id THEN RAISE EXCEPTION 'Import digest/lineage must match candidate' USING ERRCODE='23514'; END IF;
  IF jsonb_build_object('questionType',q.question_type,'stem',q.stem,'optionsOrStatements',q.options_or_statements,'answerKey',q.answer_key,'explanation',q.explanation,'media',q.media,'difficulty',q.difficulty,'rubricVersionId',q.scoring_rubric_version_id,'contentFingerprint',q.content_fingerprint) IS DISTINCT FROM c.payload THEN RAISE EXCEPTION 'Import must preserve actual candidate content/rubric' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.analysis_requests WHERE accepted_execution_id=r.execution_id AND status='COMPLETED') THEN RAISE EXCEPTION 'Import requires adopted execution' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM irt_compute.compute_outputs WHERE execution_id=r.execution_id AND kind='GENERATE_VARIANTS' AND payload->'candidateIds' ? NEW.candidate_id::text) THEN RAISE EXCEPTION 'Import must be listed in the adopted generation artifact' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_import_guard BEFORE INSERT ON public.candidate_imports FOR EACH ROW EXECUTE FUNCTION public.measurement_import_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_adopted_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b public.irt_batches; r public.analysis_requests; payload_item jsonb;
BEGIN
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
CREATE TRIGGER measurement_adopted_batch_guard BEFORE INSERT OR UPDATE ON public.irt_batches FOR EACH ROW EXECUTE FUNCTION public.measurement_adopted_result_guard();
--> statement-breakpoint
CREATE TRIGGER measurement_adopted_item_guard BEFORE INSERT OR UPDATE ON public.irt_item_results FOR EACH ROW EXECUTE FUNCTION public.measurement_adopted_result_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_baseline_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE result public.irt_item_results;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Baseline/reference history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'activated_at') IS DISTINCT FROM (to_jsonb(OLD)-'activated_at') OR OLD.activated_at IS NOT NULL) THEN RAISE EXCEPTION 'Frozen baseline/reference cannot be replaced in place' USING ERRCODE='23514'; END IF;
  PERFORM public.measurement_assert_adopted(NEW.source_output_id,NEW.context_id);
  IF NOT EXISTS(SELECT 1 FROM public.configuration_approvals a JOIN irt_compute.technical_policy_versions p ON p.id=a.technical_policy_version_id WHERE a.id=NEW.quality_approval_id AND a.revoked_at IS NULL AND p.kind='QUALITY_GATE') THEN RAISE EXCEPTION 'Active quality approval is required' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='calibration_baselines' THEN
    SELECT * INTO result FROM public.irt_item_results WHERE id=NEW.source_item_result_id;
    IF result.question_version_id IS DISTINCT FROM NEW.question_version_id OR result.rubric_version_id IS DISTINCT FROM NEW.rubric_version_id OR result.measurement_state<>'CALIBRATED' OR (SELECT context_id FROM public.irt_batches WHERE id=result.batch_id) IS DISTINCT FROM NEW.context_id THEN RAISE EXCEPTION 'Baseline must use calibrated evidence in its context' USING ERRCODE='23514'; END IF;
  ELSIF NEW.activated_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.reference_set_items WHERE reference_set_id=NEW.id) THEN RAISE EXCEPTION 'Reference set must have calibrated members before activation' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_baseline_guard BEFORE INSERT OR UPDATE OR DELETE ON public.calibration_baselines FOR EACH ROW EXECUTE FUNCTION public.measurement_baseline_guard();
--> statement-breakpoint
CREATE TRIGGER measurement_reference_guard BEFORE INSERT OR UPDATE OR DELETE ON public.reference_sets FOR EACH ROW EXECUTE FUNCTION public.measurement_baseline_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_reference_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE refs public.reference_sets; item public.irt_item_results;
BEGIN
  SELECT * INTO refs FROM public.reference_sets WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.reference_set_id ELSE NEW.reference_set_id END FOR UPDATE;
  IF refs.activated_at IS NOT NULL THEN RAISE EXCEPTION 'Active reference members are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT * INTO item FROM public.irt_item_results WHERE id=NEW.source_item_result_id;
  IF item.question_version_id IS DISTINCT FROM NEW.question_version_id OR item.rubric_version_id IS DISTINCT FROM NEW.rubric_version_id OR item.measurement_state<>'CALIBRATED' OR (SELECT context_id FROM public.irt_batches WHERE id=item.batch_id) IS DISTINCT FROM refs.context_id THEN RAISE EXCEPTION 'Reference member must be calibrated in its context' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_reference_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.reference_set_items FOR EACH ROW EXECUTE FUNCTION public.measurement_reference_item_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_phase_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ctx uuid; original uuid;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Trial phase history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.status<>'PLANNED' AND (to_jsonb(NEW)-ARRAY['status','closed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','closed_at']) THEN RAISE EXCEPTION 'Opened trial pins are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('CLOSED','CANCELLED') THEN RAISE EXCEPTION 'Terminal trial phase cannot reopen' USING ERRCODE='23514'; END IF;
  SELECT context_id,original_question_version_id INTO ctx,original FROM public.trial_studies WHERE id=NEW.study_id;
  IF (SELECT ecosystem FROM public.measurement_contexts WHERE id=ctx)<>'DRILL' THEN RAISE EXCEPTION 'A/B and pilot belong to Drill only' USING ERRCODE='23514'; END IF;
  IF NEW.status='OPEN' THEN
    IF NEW.opens_at IS NULL OR NEW.cutoff_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.trial_phase_packages WHERE phase_id=NEW.id) THEN RAISE EXCEPTION 'Open trial needs frozen packages and collection window' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.assessment_blueprint_versions WHERE id=NEW.blueprint_version_id AND status='SEALED') OR EXISTS(SELECT 1 FROM public.trial_phase_packages t JOIN public.assessment_packages p ON p.id=t.package_id WHERE t.phase_id=NEW.id AND p.frozen_at IS NULL) THEN RAISE EXCEPTION 'Trial blueprint and package manifests must be frozen before opening' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM public.trial_phase_packages t JOIN public.package_items i ON i.package_id=t.package_id LEFT JOIN public.scoring_rubric_versions r ON r.id=i.rubric_version_id WHERE t.phase_id=NEW.id AND (r.status IS DISTINCT FROM 'SEALED' OR r.approved_at IS NULL)) THEN RAISE EXCEPTION 'Trial scoring rubrics require approval before opening' USING ERRCODE='23514'; END IF;
    IF NEW.purpose='VARIANT_AB' AND (NOT EXISTS(SELECT 1 FROM public.calibration_baselines WHERE id=NEW.baseline_id AND context_id=ctx AND question_version_id=original AND activated_at IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.reference_sets WHERE id=NEW.reference_set_id AND context_id=ctx AND activated_at IS NOT NULL)) THEN RAISE EXCEPTION 'A/B requires active original baseline and local references' USING ERRCODE='23514'; END IF;
    IF NEW.purpose='VARIANT_AB' AND NOT EXISTS(SELECT 1 FROM public.trial_phase_packages WHERE phase_id=NEW.id AND arm='A') THEN RAISE EXCEPTION 'A/B requires both arms' USING ERRCODE='23514'; END IF;
    IF NEW.purpose='VARIANT_AB' AND NOT EXISTS(SELECT 1 FROM public.trial_phase_packages WHERE phase_id=NEW.id AND arm='B') THEN RAISE EXCEPTION 'A/B requires both arms' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_phase_guard BEFORE INSERT OR UPDATE OR DELETE ON public.trial_phases FOR EACH ROW EXECUTE FUNCTION public.measurement_phase_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.trial_cohort_members m JOIN public.trial_cohorts c ON c.id=m.cohort_id JOIN public.trial_phases p ON p.study_id=c.study_id WHERE m.id=NEW.cohort_member_id AND m.student_id=NEW.student_id AND p.id=NEW.phase_id AND p.status='OPEN' AND m.status IN ('ELIGIBLE','ASSIGNED')) THEN RAISE EXCEPTION 'Assignment must belong to an eligible member and open phase' USING ERRCODE='23514'; END IF;
  PERFORM public.measurement_assert_trial_eligible(NEW.student_id,NEW.package_id);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_assert_trial_eligible(p_student_id uuid, p_package_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE fam uuid;
BEGIN
  FOR fam IN SELECT DISTINCT v.question_id FROM public.package_items pi JOIN public.question_versions q ON q.id=pi.question_version_id JOIN public.question_variants v ON v.id=q.variant_id WHERE pi.package_id=p_package_id ORDER BY v.question_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(p_student_id::text||':'||fam::text,7));
    IF EXISTS(SELECT 1 FROM public.student_item_exposures e WHERE e.student_id=p_student_id AND e.family_id=fam) THEN RAISE EXCEPTION 'Prior family exposure prevents clean trial assignment/delivery' USING ERRCODE='23514'; END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_assignment_guard BEFORE INSERT ON public.trial_assignments FOR EACH ROW EXECUTE FUNCTION public.measurement_assignment_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_delivery_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m public.content_delivery_manifests; fam uuid; owner_id uuid;
BEGIN
  SELECT * INTO m FROM public.content_delivery_manifests WHERE id=NEW.manifest_id;
  SELECT v.question_id INTO fam FROM public.question_versions q JOIN public.question_variants v ON v.id=q.variant_id WHERE q.id=NEW.question_version_id;
  IF NEW.family_id IS DISTINCT FROM fam THEN RAISE EXCEPTION 'Delivery family must match content version' USING ERRCODE='23514'; END IF;
  IF NEW.attempt_item_id IS NOT NULL THEN SELECT a.student_id INTO owner_id FROM public.attempt_items i JOIN public.assessment_attempts a ON a.id=i.attempt_id WHERE i.id=NEW.attempt_item_id AND i.question_version_id=NEW.question_version_id AND a.assessment_type::text=m.module;
  ELSE SELECT p.student_id INTO owner_id FROM public.pvp_match_questions q JOIN public.pvp_players p ON p.match_id=q.match_id WHERE q.id=NEW.pvp_match_question_id AND q.question_version_id=NEW.question_version_id AND p.student_id=m.student_id AND m.module='PVP'; END IF;
  IF owner_id IS DISTINCT FROM m.student_id THEN RAISE EXCEPTION 'Delivery must belong to this student/module' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(m.student_id::text||':'||fam::text,7));
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_delivery_item_guard BEFORE INSERT ON public.content_delivery_items FOR EACH ROW EXECUTE FUNCTION public.measurement_delivery_item_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_delivery_exposure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m public.content_delivery_manifests; exp uuid;
BEGIN
  SELECT * INTO m FROM public.content_delivery_manifests WHERE id=NEW.manifest_id;
  INSERT INTO public.student_item_exposures(delivery_item_id,student_id,question_version_id,family_id,kind,module,occurred_at)
    VALUES(NEW.id,m.student_id,NEW.question_version_id,NEW.family_id,m.kind,m.module,m.issued_at) RETURNING id INTO exp;
  UPDATE public.trial_family_reservations r SET invalidated_at=m.issued_at,invalidating_exposure_id=exp,reason='PRIOR_FAMILY_EXPOSURE'
  FROM public.trial_cohort_members cm WHERE cm.id=r.cohort_member_id AND cm.student_id=m.student_id AND r.family_id=NEW.family_id AND r.invalidated_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.trial_assignments a JOIN public.assessment_attempts att ON att.trial_assignment_id=a.id JOIN public.attempt_items ai ON ai.attempt_id=att.id
      JOIN public.content_delivery_items di ON di.attempt_item_id=ai.id JOIN public.content_delivery_manifests dm ON dm.id=di.manifest_id
      WHERE a.cohort_member_id=cm.id AND dm.kind='ITEM_PAYLOAD_ISSUED' AND dm.issued_at<=m.issued_at);
  UPDATE public.trial_cohort_members cm SET status='INELIGIBLE',dropout_reason='PRIOR_FAMILY_EXPOSURE'
    WHERE EXISTS(SELECT 1 FROM public.trial_family_reservations r WHERE r.cohort_member_id=cm.id AND r.invalidating_exposure_id=exp);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_delivery_exposure AFTER INSERT ON public.content_delivery_items FOR EACH ROW EXECUTE FUNCTION public.measurement_delivery_exposure();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_assessment_delivery(attempt_id uuid, explanation boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a public.assessment_attempts; manifest uuid; manifest_kind text;
BEGIN
  SELECT * INTO a FROM public.assessment_attempts WHERE id=attempt_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Attempt missing' USING ERRCODE='23514'; END IF;
  manifest_kind:=CASE WHEN explanation THEN 'EXPLANATION_PAYLOAD_ISSUED' ELSE 'ITEM_PAYLOAD_ISSUED' END;
  SELECT id INTO manifest FROM public.content_delivery_manifests WHERE student_id=a.student_id AND idempotency_key=attempt_id::text||':'||manifest_kind;
  IF manifest IS NOT NULL THEN RETURN manifest; END IF;
  IF NOT explanation AND a.purpose<>'REGULAR' THEN PERFORM public.measurement_assert_trial_eligible(a.student_id,a.package_id); END IF;
  IF explanation AND a.purpose<>'REGULAR' AND NOT EXISTS(SELECT 1 FROM public.trial_phases WHERE id=a.phase_id AND status='CLOSED') THEN RAISE EXCEPTION 'Trial explanations wait until collection closes' USING ERRCODE='23514'; END IF;
  INSERT INTO public.content_delivery_manifests(student_id,module,kind,idempotency_key) VALUES(a.student_id,a.assessment_type,manifest_kind,attempt_id::text||':'||manifest_kind) RETURNING id INTO manifest;
  INSERT INTO public.content_delivery_items(manifest_id,question_version_id,family_id,attempt_item_id)
    SELECT manifest,ai.question_version_id,v.question_id,ai.id FROM public.attempt_items ai JOIN public.question_versions q ON q.id=ai.question_version_id JOIN public.question_variants v ON v.id=q.variant_id WHERE ai.attempt_id=a.id ORDER BY v.question_id;
  RETURN manifest;
END $$;
--> statement-breakpoint
-- These are explicitly unverified historical exposures, not a reconstructed view history.
INSERT INTO public.content_delivery_manifests(student_id,module,kind,idempotency_key,issued_at)
  SELECT student_id,assessment_type,'LEGACY_UNVERIFIED','legacy:'||id::text,started_at FROM public.assessment_attempts;
--> statement-breakpoint
INSERT INTO public.content_delivery_items(manifest_id,question_version_id,family_id,attempt_item_id)
  SELECT m.id,ai.question_version_id,v.question_id,ai.id FROM public.assessment_attempts a JOIN public.content_delivery_manifests m ON m.idempotency_key='legacy:'||a.id::text AND m.student_id=a.student_id
  JOIN public.attempt_items ai ON ai.attempt_id=a.id JOIN public.question_versions q ON q.id=ai.question_version_id JOIN public.question_variants v ON v.id=q.variant_id;
--> statement-breakpoint
INSERT INTO public.content_delivery_manifests(student_id,module,kind,idempotency_key,issued_at)
  SELECT p.student_id,'PVP','LEGACY_UNVERIFIED','legacy-pvp:'||q.id::text,q.started_at
  FROM public.pvp_match_questions q JOIN public.pvp_players p ON p.match_id=q.match_id WHERE q.started_at IS NOT NULL;
--> statement-breakpoint
INSERT INTO public.content_delivery_items(manifest_id,question_version_id,family_id,pvp_match_question_id)
  SELECT m.id,q.question_version_id,v.question_id,q.id FROM public.pvp_match_questions q
  JOIN public.pvp_players p ON p.match_id=q.match_id JOIN public.content_delivery_manifests m ON m.student_id=p.student_id AND m.idempotency_key='legacy-pvp:'||q.id::text
  JOIN public.question_versions ver ON ver.id=q.question_version_id JOIN public.question_variants v ON v.id=ver.variant_id;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_finalization_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch public.tryout_batches; expected integer; actual integer;
BEGIN
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
CREATE TRIGGER measurement_finalization_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tryout_result_finalizations FOR EACH ROW EXECUTE FUNCTION public.measurement_finalization_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_finalization_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f public.tryout_result_finalizations; pkg uuid; respondent jsonb;
BEGIN
  SELECT * INTO f FROM public.tryout_result_finalizations WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.finalization_id ELSE NEW.finalization_id END FOR UPDATE;
  IF f.published_at IS NOT NULL THEN RAISE EXCEPTION 'Published item/result cannot change' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND OLD.finalization_id<>NEW.finalization_id THEN RAISE EXCEPTION 'Finalization ownership cannot change' USING ERRCODE='23514'; END IF;
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
CREATE TRIGGER measurement_finalization_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tryout_finalization_items FOR EACH ROW EXECUTE FUNCTION public.measurement_finalization_child_guard();
--> statement-breakpoint
CREATE TRIGGER measurement_finalization_result_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tryout_attempt_results FOR EACH ROW EXECUTE FUNCTION public.measurement_finalization_child_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_activation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item public.irt_item_results;
BEGIN
  SELECT * INTO item FROM public.irt_item_results WHERE id=NEW.item_result_id;
  IF item.model_family='LEGACY' OR item.measurement_state<>'CALIBRATED' OR item.question_version_id IS DISTINCT FROM NEW.question_version_id OR item.rubric_version_id IS DISTINCT FROM NEW.rubric_version_id OR (SELECT context_id FROM public.irt_batches WHERE id=item.batch_id) IS DISTINCT FROM NEW.context_id THEN RAISE EXCEPTION 'Only calibrated results in exact version/rubric/context can activate' USING ERRCODE='23514'; END IF;
  INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(NEW.activated_by_user_id,'irt.parameter_activated','active_parameter_binding',NEW.id,jsonb_build_object('itemResultId',NEW.item_result_id,'contextId',NEW.context_id));
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_activation_guard BEFORE INSERT OR UPDATE ON public.active_parameter_bindings FOR EACH ROW EXECUTE FUNCTION public.measurement_activation_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_comparison_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE phase public.trial_phases; ctx uuid;
BEGIN
  IF NEW.source_output_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO phase FROM public.trial_phases WHERE id=NEW.phase_id;
  SELECT context_id INTO ctx FROM public.trial_studies WHERE id=phase.study_id;
  PERFORM public.measurement_assert_adopted(NEW.source_output_id,ctx);
  IF phase.purpose IS DISTINCT FROM 'VARIANT_AB' OR phase.status IS DISTINCT FROM 'CLOSED' OR NEW.baseline_id IS DISTINCT FROM phase.baseline_id OR NEW.reference_set_id IS DISTINCT FROM phase.reference_set_id OR NEW.candidate_question_version_id IS DISTINCT FROM phase.candidate_question_version_id THEN RAISE EXCEPTION 'Compare must preserve the closed A/B experiment pins' USING ERRCODE='23514'; END IF;
  IF NEW.comparison_state::text IS DISTINCT FROM (SELECT scientific_decision FROM irt_compute.compute_outputs WHERE id=NEW.source_output_id) THEN RAISE EXCEPTION 'Compare decision must match scientific artifact' USING ERRCODE='23514'; END IF;
  IF NEW.comparison_state IN ('PASS','DRIFT') AND NOT EXISTS(SELECT 1 FROM irt_compute.compute_outputs WHERE id=NEW.source_output_id AND payload->>'controlStable'='true' AND payload->>'referenceStable'='true') THEN RAISE EXCEPTION 'Compare/adjust requires stable original and references' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_comparison_guard BEFORE INSERT ON public.variant_evaluations FOR EACH ROW EXECUTE FUNCTION public.measurement_comparison_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_distribution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text;
BEGIN
  IF NEW.purpose NOT IN ('REGULAR','ORIGINAL_PILOT','VARIANT_AB','TRYOUT','PRETEST','PVP') THEN RAISE EXCEPTION 'Explicit distribution purpose required' USING ERRCODE='23514'; END IF;
  IF NEW.state='READY' THEN
    IF NOT EXISTS(SELECT 1 FROM public.question_versions WHERE id=NEW.question_version_id AND content_status='READY') THEN RAISE EXCEPTION 'Distribution requires content approval' USING ERRCODE='23514'; END IF;
    SELECT v.kind INTO kind FROM public.question_versions q JOIN public.question_variants v ON v.id=q.variant_id WHERE q.id=NEW.question_version_id;
    IF kind='VARIANT' AND NEW.purpose='REGULAR' AND (SELECT ecosystem FROM public.measurement_contexts WHERE id=NEW.context_id)='DRILL' AND NOT EXISTS(SELECT 1 FROM public.variant_evaluations ve JOIN public.trial_phases p ON p.id=ve.phase_id JOIN public.trial_studies s ON s.id=p.study_id WHERE ve.candidate_question_version_id=NEW.question_version_id AND s.context_id=NEW.context_id AND ve.comparison_state='PASS') THEN RAISE EXCEPTION 'Drill variant requires contextual Compare PASS' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_distribution_guard BEFORE INSERT ON public.item_distribution_decisions FOR EACH ROW EXECUTE FUNCTION public.measurement_distribution_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_trial_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE phase public.trial_phases; pkg public.assessment_packages;
BEGIN
  SELECT * INTO phase FROM public.trial_phases WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.phase_id ELSE NEW.phase_id END FOR UPDATE;
  IF phase.status<>'PLANNED' THEN RAISE EXCEPTION 'Trial package allocation is frozen after opening' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT * INTO pkg FROM public.assessment_packages WHERE id=NEW.package_id;
  IF pkg.purpose IS DISTINCT FROM phase.purpose OR pkg.blueprint_version_id IS DISTINCT FROM phase.blueprint_version_id OR
    (phase.purpose='ORIGINAL_PILOT' AND NEW.arm<>'PILOT') OR (phase.purpose='VARIANT_AB' AND NEW.arm NOT IN ('A','B')) THEN RAISE EXCEPTION 'Trial package must match phase purpose/blueprint/arm' USING ERRCODE='23514'; END IF;
  IF phase.purpose='ORIGINAL_PILOT' AND EXISTS(SELECT 1 FROM public.package_items pi JOIN public.question_versions q ON q.id=pi.question_version_id JOIN public.question_variants v ON v.id=q.variant_id WHERE pi.package_id=pkg.id AND v.kind<>'ORIGINAL') THEN RAISE EXCEPTION 'Pilot contains originals only' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_trial_package_guard BEFORE INSERT OR UPDATE OR DELETE ON public.trial_phase_packages FOR EACH ROW EXECUTE FUNCTION public.measurement_trial_package_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.invalidated_at IS NOT NULL OR (to_jsonb(NEW)-ARRAY['invalidated_at','invalidating_exposure_id','reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['invalidated_at','invalidating_exposure_id','reason']) OR NEW.invalidated_at IS NULL THEN RAISE EXCEPTION 'Reservation can only record its first invalidation' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_reservation_guard BEFORE UPDATE OR DELETE ON public.trial_family_reservations FOR EACH ROW EXECUTE FUNCTION public.measurement_reservation_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_pvp_delivery(p_student_id uuid, p_question_id uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE manifest uuid; q public.pvp_match_questions;
BEGIN
  SELECT * INTO q FROM public.pvp_match_questions WHERE id=p_question_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_student_id::text||':'||p_question_id::text,9));
  SELECT id INTO manifest FROM public.content_delivery_manifests WHERE student_id=p_student_id AND idempotency_key='pvp:'||p_question_id::text;
  IF manifest IS NOT NULL THEN RETURN manifest; END IF;
  INSERT INTO public.content_delivery_manifests(student_id,module,kind,idempotency_key) VALUES(p_student_id,'PVP','ITEM_PAYLOAD_ISSUED','pvp:'||p_question_id::text) RETURNING id INTO manifest;
  INSERT INTO public.content_delivery_items(manifest_id,question_version_id,family_id,pvp_match_question_id)
    SELECT manifest,q.question_version_id,v.question_id,p_question_id FROM public.question_versions ver JOIN public.question_variants v ON v.id=ver.variant_id WHERE ver.id=q.question_version_id;
  RETURN manifest;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION irt_compute.generation_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item public.generation_wave_items; req public.analysis_requests;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Generation provenance cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['status','finished_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','finished_at']) THEN RAISE EXCEPTION 'Generation provenance is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.wave_item_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM irt_compute.compute_executions WHERE id=NEW.execution_id AND status='RUNNING' AND lease_expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'Generation changes require a live execution lease' USING ERRCODE='23514'; END IF;
    SELECT * INTO item FROM public.generation_wave_items WHERE id=NEW.wave_item_id;
    SELECT r.* INTO req FROM public.analysis_requests r JOIN irt_compute.compute_executions e ON e.request_id=r.id WHERE e.id=NEW.execution_id;
    IF req.context_id IS DISTINCT FROM item.context_id OR NEW.original_question_version_id IS DISTINCT FROM item.original_question_version_id OR req.request_type NOT IN ('GENERATE_VARIANTS','COMPARE_VARIANTS') THEN RAISE EXCEPTION 'Generation must stay within authorized wave/context' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.generation_waves WHERE id=item.wave_id AND status IN ('APPROVED','RUNNING')) THEN RAISE EXCEPTION 'Generation wave is not authorized' USING ERRCODE='23514'; END IF;
  ELSIF TG_OP='INSERT' THEN RAISE EXCEPTION 'New generation requires an authorized wave' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER generation_run_guard BEFORE INSERT OR UPDATE OR DELETE ON irt_compute.generation_runs FOR EACH ROW EXECUTE FUNCTION irt_compute.generation_run_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION irt_compute.adjustment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE artifact irt_compute.compute_outputs; wave_item public.generation_wave_items; depth integer;
BEGIN
  SELECT * INTO artifact FROM irt_compute.compute_outputs WHERE id=NEW.source_output_id;
  SELECT w.* INTO wave_item FROM irt_compute.generation_candidates c JOIN irt_compute.generation_runs g ON g.id=c.generation_run_id JOIN public.generation_wave_items w ON w.id=g.wave_item_id WHERE c.id=NEW.candidate_id;
  IF artifact.scientific_decision IS DISTINCT FROM 'DRIFT' OR artifact.payload->>'controlStable' IS DISTINCT FROM 'true' OR artifact.payload->>'referenceStable' IS DISTINCT FROM 'true' OR NEW.iteration>wave_item.max_regenerate_attempts THEN RAISE EXCEPTION 'Adjustment requires stable drift evidence and approved iteration bounds' USING ERRCODE='23514'; END IF;
  WITH RECURSIVE lineage AS (SELECT id,replacement_of_id,1 AS n FROM irt_compute.generation_candidates WHERE id=NEW.candidate_id UNION ALL SELECT c.id,c.replacement_of_id,l.n+1 FROM irt_compute.generation_candidates c JOIN lineage l ON l.replacement_of_id=c.id) SELECT max(n) INTO depth FROM lineage;
  IF depth IS DISTINCT FROM NEW.iteration THEN RAISE EXCEPTION 'Adjustment iteration must match candidate lineage' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM irt_compute.technical_policy_versions WHERE id=NEW.policy_id AND kind='ADJUSTMENT' AND status='SEALED') THEN RAISE EXCEPTION 'Adjustment policy must be sealed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER adjustment_guard BEFORE INSERT ON irt_compute.adjustment_iterations FOR EACH ROW EXECUTE FUNCTION irt_compute.adjustment_guard();
--> statement-breakpoint
CREATE VIEW public.regular_assessment_attempts_v3 AS SELECT * FROM public.assessment_attempts WHERE purpose='REGULAR';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.package_can_distribute(p_package_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p.purpose='REGULAR'
    AND NOT EXISTS(SELECT 1 FROM public.package_items pi JOIN public.candidate_imports imported ON imported.question_version_id=pi.question_version_id
      WHERE pi.package_id=p.id AND p.assessment_type='DRILL' AND NOT EXISTS(SELECT 1 FROM public.item_distribution_decisions d JOIN public.measurement_contexts c ON c.id=d.context_id
        WHERE d.question_version_id=pi.question_version_id AND c.level_id=p.level_id AND d.purpose='REGULAR' AND d.state='READY'
          AND NOT EXISTS(SELECT 1 FROM public.item_distribution_decisions newer WHERE newer.question_version_id=d.question_version_id AND newer.context_id=d.context_id AND newer.purpose=d.purpose AND (newer.created_at,newer.id)>(d.created_at,d.id))))
    AND NOT EXISTS(SELECT 1 FROM public.package_items pi JOIN public.item_distribution_decisions d ON d.question_version_id=pi.question_version_id
      JOIN public.measurement_contexts c ON c.id=d.context_id
      WHERE pi.package_id=p.id AND ((p.assessment_type='DRILL' AND c.level_id=p.level_id AND d.purpose='REGULAR') OR (p.assessment_type='TRYOUT' AND c.tryout_batch_id IN (SELECT id FROM public.tryout_batches WHERE package_id=p.id) AND d.purpose='TRYOUT'))
        AND d.state IN ('HOLD','RETIRED') AND NOT EXISTS(SELECT 1 FROM public.item_distribution_decisions newer WHERE newer.question_version_id=d.question_version_id AND newer.context_id=d.context_id AND newer.purpose=d.purpose AND (newer.created_at,newer.id)>(d.created_at,d.id)))
    AND (p.frozen_at IS NULL OR EXISTS(SELECT 1 FROM public.package_quality_results WHERE package_id=p.id AND package_digest=p.manifest_digest AND decision='PASS'))
  FROM public.assessment_packages p WHERE p.id=p_package_id
$$;
--> statement-breakpoint
-- Views are narrow definer views: no SELECT privilege on underlying public tables is given to compute.
CREATE VIEW public.irt_input_requests_v3 AS SELECT id,request_type,context_id,snapshot_id,wave_item_id,package_id,configuration_pins,input_digest,contract_version,status,due_at,accepted_execution_id FROM public.analysis_requests;
--> statement-breakpoint
CREATE VIEW public.irt_input_contexts_v3 AS SELECT id,ecosystem,dimension,level_id,tryout_batch_id,scale_code,revision FROM public.measurement_contexts;
--> statement-breakpoint
CREATE VIEW public.irt_input_snapshots_v3 AS SELECT id,context_id,phase_id,cutoff_at,policy,policy_digest,respondent_key_version,digest,row_count,frozen_at FROM public.response_snapshots WHERE status='FROZEN';
--> statement-breakpoint
CREATE VIEW public.irt_input_responses_v3 AS SELECT i.* FROM public.response_snapshot_items i JOIN public.response_snapshots s ON s.id=i.snapshot_id WHERE s.status='FROZEN';
--> statement-breakpoint
CREATE VIEW public.irt_input_content_v3 AS SELECT q.id,v.question_id AS family_id,v.kind,q.parent_original_question_version_id,q.level_id,q.question_type,q.stem,q.options_or_statements,q.answer_key,q.explanation,q.media,q.difficulty,q.scoring_rubric_version_id,q.content_fingerprint,q.content_status,q.validation_state FROM public.question_versions q JOIN public.question_variants v ON v.id=q.variant_id;
--> statement-breakpoint
CREATE VIEW public.irt_input_approvals_v3 AS SELECT id,technical_policy_version_id,generator_template_id,generator_config_id,approved_digest,scope,approved_at,revoked_at FROM public.configuration_approvals;
--> statement-breakpoint
CREATE VIEW public.irt_input_wave_items_v3 AS SELECT i.*,w.status AS wave_status FROM public.generation_wave_items i JOIN public.generation_waves w ON w.id=i.wave_id;
--> statement-breakpoint
CREATE VIEW public.irt_input_packages_v3 AS SELECT p.id,p.assessment_type,p.purpose,p.blueprint_version_id,p.manifest_digest,pi.id AS package_item_id,pi.question_version_id,pi.display_order,pi.max_points,pi.rubric_version_id,pi.maximum_score_category,pi.item_role FROM public.assessment_packages p JOIN public.package_items pi ON pi.package_id=p.id;
--> statement-breakpoint
CREATE VIEW public.irt_input_trial_pins_v3 AS SELECT p.id,p.study_id,s.context_id,s.original_question_version_id,p.candidate_question_version_id,p.baseline_id,p.reference_set_id,p.blueprint_version_id,p.comparison_policy_id,p.purpose,p.operational_policy,p.operational_policy_digest,p.cutoff_at,p.status FROM public.trial_phases p JOIN public.trial_studies s ON s.id=p.study_id;
--> statement-breakpoint
CREATE VIEW public.irt_input_baselines_v3 AS SELECT * FROM public.calibration_baselines;
--> statement-breakpoint
CREATE VIEW public.irt_input_references_v3 AS SELECT s.id AS reference_set_id,s.context_id,s.version,s.digest,s.activated_at,i.question_version_id,i.rubric_version_id,i.parameter_snapshot,i.uncertainty FROM public.reference_sets s JOIN public.reference_set_items i ON i.reference_set_id=s.id;
--> statement-breakpoint
CREATE VIEW public.irt_input_rubrics_v3 AS SELECT id,code,version,question_type,maximum_score_category,definition,digest,status FROM public.scoring_rubric_versions;
--> statement-breakpoint
CREATE VIEW public.irt_input_principals_v3 AS SELECT id,code,enabled FROM public.service_principals;
--> statement-breakpoint
CREATE VIEW public.generator_configs AS SELECT * FROM irt_compute.generator_configs;
--> statement-breakpoint
CREATE VIEW public.generation_runs AS SELECT * FROM irt_compute.generation_runs;
--> statement-breakpoint
CREATE VIEW public.generation_candidates AS SELECT * FROM irt_compute.generation_candidates;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='numora_main_runtime') THEN CREATE ROLE numora_main_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='numora_irt_runtime') THEN CREATE ROLE numora_irt_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA irt_compute FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA irt_compute FROM PUBLIC;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM numora_main_runtime, numora_irt_runtime;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public,irt_compute TO numora_main_runtime,numora_irt_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO numora_main_runtime;
--> statement-breakpoint
DO $$ DECLARE v record; BEGIN
  FOR v IN SELECT schemaname,viewname FROM pg_views WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON %I.%I FROM numora_main_runtime',v.schemaname,v.viewname);
  END LOOP;
END $$;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA irt_compute TO numora_main_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA irt_compute TO numora_irt_runtime;
--> statement-breakpoint
GRANT SELECT ON public.irt_input_requests_v3,public.irt_input_contexts_v3,public.irt_input_snapshots_v3,public.irt_input_responses_v3,public.irt_input_content_v3,public.irt_input_approvals_v3,public.irt_input_wave_items_v3,public.irt_input_packages_v3,public.irt_input_trial_pins_v3,public.irt_input_baselines_v3,public.irt_input_references_v3,public.irt_input_rubrics_v3,public.irt_input_principals_v3 TO numora_irt_runtime;
--> statement-breakpoint
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','irt_compute') LOOP
    EXECUTE format('CREATE POLICY numora_main_access ON %I.%I FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true)',r.schemaname,r.tablename);
    IF r.schemaname='irt_compute' THEN EXECUTE format('CREATE POLICY numora_compute_access ON %I.%I FOR ALL TO numora_irt_runtime USING (true) WITH CHECK (true)',r.schemaname,r.tablename); END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- Compute trigger functions may inspect canonical invariants; they cannot be called as RPCs.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irt_compute' AND p.prorettype='trigger'::regtype LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER',f.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, irt_compute',f.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
  END LOOP;
END $$;
--> statement-breakpoint
-- Restrict service/browser RPC access to canonical helper functions.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'measurement_%' OR p.proname IN ('record_assessment_delivery','record_pvp_delivery','package_can_distribute')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO numora_main_runtime',f.signature);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA irt_compute FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA irt_compute FROM %I',role_name);
    END IF;
  END LOOP;
END $$;

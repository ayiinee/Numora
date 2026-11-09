-- Forward-only v2 distribution foundation. Does not activate Student routing.
CREATE TABLE public.assessment_distribution_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL, version integer NOT NULL CHECK(version>0),
 definition jsonb NOT NULL, digest text NOT NULL, approved_by_user_id uuid NOT NULL REFERENCES public.users(id),
 approved_at timestamptz NOT NULL, UNIQUE(code,version)
);
--> statement-breakpoint
CREATE TABLE public.assessment_arm_sets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), context_id uuid NOT NULL REFERENCES public.measurement_contexts(id),
 blueprint_version_id uuid NOT NULL REFERENCES public.assessment_blueprint_versions(id),
 policy_id uuid NOT NULL REFERENCES public.assessment_distribution_policies(id),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','OPEN','CLOSED','RETIRED')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assessment_arm_sets_open_uq ON public.assessment_arm_sets(context_id) WHERE status='OPEN';
--> statement-breakpoint
CREATE TABLE public.assessment_arms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), set_id uuid NOT NULL REFERENCES public.assessment_arm_sets(id),
 code text NOT NULL, kind text NOT NULL CHECK(kind IN ('ORIGINAL','VARIANT')),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','HELD','RETIRED')),
 current_revision_id uuid, UNIQUE(set_id,code), UNIQUE(id,set_id)
);
ALTER TABLE public.assessment_packages ADD COLUMN distribution_arm_id uuid REFERENCES public.assessment_arms(id);
DROP INDEX public.assessment_packages_drill_mvp_level_uq;
CREATE UNIQUE INDEX assessment_packages_drill_mvp_level_uq ON public.assessment_packages(level_id)
 WHERE assessment_type='DRILL' AND purpose='REGULAR' AND status='PUBLISHED' AND NOT is_demo AND distribution_arm_id IS NULL;
DROP INDEX public.assessment_packages_published_tryout_release_uq;
CREATE UNIQUE INDEX assessment_packages_published_tryout_release_uq ON public.assessment_packages(release_at)
 WHERE assessment_type='TRYOUT' AND status='PUBLISHED' AND distribution_arm_id IS NULL;
--> statement-breakpoint
CREATE TABLE public.assessment_arm_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), arm_id uuid NOT NULL REFERENCES public.assessment_arms(id),
 package_id uuid NOT NULL UNIQUE REFERENCES public.assessment_packages(id), revision integer NOT NULL CHECK(revision>0),
 anchor_question_version_ids uuid[] NOT NULL, manifest_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(arm_id,revision), UNIQUE(id,arm_id)
);
ALTER TABLE public.assessment_arms ADD CONSTRAINT assessment_arms_current_revision_fk
 FOREIGN KEY(current_revision_id,id) REFERENCES public.assessment_arm_revisions(id,arm_id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE TABLE public.tryout_batch_packages (
 batch_id uuid NOT NULL REFERENCES public.tryout_batches(id), package_id uuid NOT NULL REFERENCES public.assessment_packages(id),
 arm_id uuid REFERENCES public.assessment_arms(id), PRIMARY KEY(batch_id,package_id), UNIQUE(batch_id,arm_id)
);
INSERT INTO public.tryout_batch_packages(batch_id,package_id) SELECT id,package_id FROM public.tryout_batches;
DROP INDEX public.tryout_batches_package_uq;
CREATE INDEX tryout_batches_package_idx ON public.tryout_batches(package_id);
--> statement-breakpoint
CREATE TABLE public.assessment_arm_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), set_id uuid NOT NULL REFERENCES public.assessment_arm_sets(id),
 student_id uuid NOT NULL REFERENCES public.users(id), assigned_arm_id uuid NOT NULL,
 first_valid_evidence boolean NOT NULL DEFAULT false, exposure_facts jsonb NOT NULL DEFAULT '{}',
 assigned_at timestamptz NOT NULL DEFAULT now(), UNIQUE(set_id,student_id),
 FOREIGN KEY(assigned_arm_id,set_id) REFERENCES public.assessment_arms(id,set_id)
);
CREATE TABLE public.assessment_attempt_arm_deliveries (
 attempt_id uuid PRIMARY KEY REFERENCES public.assessment_attempts(id),
 assignment_id uuid NOT NULL REFERENCES public.assessment_arm_assignments(id),
 delivered_revision_id uuid NOT NULL REFERENCES public.assessment_arm_revisions(id),
 delivery_mode text NOT NULL CHECK(delivery_mode IN ('ASSIGNED','ORIGINAL_FALLBACK')),
 fallback_reason text, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((delivery_mode='ASSIGNED' AND fallback_reason IS NULL) OR
       (delivery_mode='ORIGINAL_FALLBACK' AND length(btrim(fallback_reason))>0))
);
ALTER TABLE public.assessment_attempts ADD COLUMN tryout_batch_id uuid REFERENCES public.tryout_batches(id);
DROP INDEX public.assessment_attempts_tryout_once_uq;
CREATE UNIQUE INDEX assessment_attempts_tryout_once_uq ON public.assessment_attempts(student_id,package_id)
 WHERE assessment_type='TRYOUT' AND tryout_batch_id IS NULL;
CREATE UNIQUE INDEX assessment_attempts_tryout_batch_once_uq ON public.assessment_attempts(student_id,tryout_batch_id)
 WHERE assessment_type='TRYOUT' AND tryout_batch_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE public.assessment_arm_distribution_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL REFERENCES public.assessment_arm_revisions(id),
 state public.distribution_state NOT NULL, reason text NOT NULL CHECK(length(btrim(reason))>0),
 actor_user_id uuid NOT NULL REFERENCES public.users(id), comparison_output_id uuid REFERENCES irt_compute.compute_outputs(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'V2 immutable fact; create a replacement' USING ERRCODE='23514'; END $$;
CREATE TRIGGER assessment_distribution_policies_immutable BEFORE UPDATE OR DELETE ON public.assessment_distribution_policies FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();
CREATE TRIGGER assessment_arm_revisions_immutable BEFORE UPDATE OR DELETE ON public.assessment_arm_revisions FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();
CREATE TRIGGER assessment_arm_assignments_immutable BEFORE UPDATE OR DELETE ON public.assessment_arm_assignments FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();
CREATE TRIGGER assessment_attempt_arm_deliveries_immutable BEFORE UPDATE OR DELETE ON public.assessment_attempt_arm_deliveries FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();
CREATE TRIGGER assessment_arm_distribution_events_immutable BEFORE UPDATE OR DELETE ON public.assessment_arm_distribution_events FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.digest:=irt_compute.payload_digest(NEW.definition);
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.approved_by_user_id AND role='ADMIN' AND admin_role IN ('SUPER_ADMIN','CONTENT_DATA_MODERATION')) THEN
  RAISE EXCEPTION 'V2 policy requires authorized content approval actor' USING ERRCODE='23514'; END IF;
 IF NEW.definition->>'regularRewards' IS DISTINCT FROM 'true' OR
    NEW.definition->>'preserveHistory' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'V2 regular rewards and history policy required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_v2_policy_guard BEFORE INSERT ON public.assessment_distribution_policies FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_policy_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a public.assessment_arms; s public.assessment_arm_sets; c public.measurement_contexts;
 p public.assessment_packages; n integer; expected integer; anchor_count integer; other uuid[];
BEGIN
 SELECT * INTO a FROM public.assessment_arms WHERE id=NEW.arm_id FOR UPDATE;
 SELECT * INTO s FROM public.assessment_arm_sets WHERE id=a.set_id FOR UPDATE;
 SELECT * INTO c FROM public.measurement_contexts WHERE id=s.context_id;
 SELECT * INTO p FROM public.assessment_packages WHERE id=NEW.package_id FOR UPDATE;
 expected:=CASE WHEN c.ecosystem='DRILL' THEN 10 ELSE 30 END;
 anchor_count:=CASE WHEN c.ecosystem='DRILL' THEN 3 ELSE 5 END;
 IF p.distribution_arm_id IS DISTINCT FROM a.id OR p.assessment_type::text IS DISTINCT FROM c.ecosystem OR
    p.purpose<>'REGULAR' OR (c.ecosystem='DRILL' AND p.level_id IS DISTINCT FROM c.level_id) OR
    p.curriculum_approval IS NULL OR p.is_demo OR p.scoring_policy_version_id IS NULL OR p.status<>'PUBLISHED' OR
    s.status IN ('CLOSED','RETIRED') THEN RAISE EXCEPTION 'V2 revision requires approved matching regular package' USING ERRCODE='23514'; END IF;
 IF coalesce(length(btrim(p.curriculum_approval->>'reference')),0)=0 OR p.curriculum_approval->>'approvedAt' IS NULL OR
    coalesce(p.curriculum_approval->>'compositionDigest',p.curriculum_approval->>'manifestDigest') IS DISTINCT FROM
      irt_compute.payload_digest(jsonb_build_object('packageId',p.id,'items',
        (SELECT jsonb_agg(to_jsonb(pi) ORDER BY pi.display_order,pi.id) FROM public.package_items pi WHERE pi.package_id=p.id))) THEN
  RAISE EXCEPTION 'V2 composition approval does not match actual items' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.assessment_blueprint_versions WHERE id=s.blueprint_version_id AND status='SEALED' AND approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL AND length(btrim(approval_reference))>0) THEN
  RAISE EXCEPTION 'V2 approved blueprint required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.assessment_blueprint_versions b WHERE b.id=s.blueprint_version_id
   AND b.definition->'anchorQuestionVersionIds' @> to_jsonb(NEW.anchor_question_version_ids)
   AND to_jsonb(NEW.anchor_question_version_ids) @> (b.definition->'anchorQuestionVersionIds')
   AND jsonb_array_length(b.definition->'anchorQuestionVersionIds')=anchor_count
   AND b.definition->'familyIds' = (SELECT jsonb_agg(v.question_id ORDER BY v.question_id)
      FROM public.package_items pi JOIN public.question_versions q ON q.id=pi.question_version_id
      JOIN public.question_variants v ON v.id=q.variant_id WHERE pi.package_id=p.id)) THEN
  RAISE EXCEPTION 'V2 actual anchors and family roster require approved blueprint pins' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM public.package_items WHERE package_id=p.id;
 IF n<>expected OR cardinality(NEW.anchor_question_version_ids)<>anchor_count OR
    (SELECT count(DISTINCT x) FROM unnest(NEW.anchor_question_version_ids) x)<>anchor_count OR
    EXISTS(SELECT 1 FROM unnest(NEW.anchor_question_version_ids) x WHERE NOT EXISTS
      (SELECT 1 FROM public.package_items WHERE package_id=p.id AND question_version_id=x)) THEN
  RAISE EXCEPTION 'V2 package size or common anchor manifest invalid' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.package_items pi JOIN public.question_versions q ON q.id=pi.question_version_id
   LEFT JOIN public.scoring_rubric_versions r ON r.id=q.scoring_rubric_version_id WHERE pi.package_id=p.id
   AND (q.content_status<>'READY' OR q.validation_state<>'CONTENT_VALID' OR r.status IS DISTINCT FROM 'SEALED')) OR
   (SELECT count(DISTINCT v.question_id) FROM public.package_items pi JOIN public.question_versions q ON q.id=pi.question_version_id
    JOIN public.question_variants v ON v.id=q.variant_id WHERE pi.package_id=p.id)<>expected THEN
  RAISE EXCEPTION 'V2 content/rubric/family validation required' USING ERRCODE='23514'; END IF;
 IF a.kind='ORIGINAL' AND EXISTS(SELECT 1 FROM public.package_items pi JOIN public.question_versions q ON q.id=pi.question_version_id
    JOIN public.question_variants v ON v.id=q.variant_id WHERE pi.package_id=p.id AND v.kind<>'ORIGINAL') THEN
  RAISE EXCEPTION 'Original arm cannot contain variants' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.package_items pi JOIN public.question_versions q ON q.id=pi.question_version_id
   JOIN public.question_variants v ON v.id=q.variant_id WHERE pi.package_id=p.id AND
   ((q.id=ANY(NEW.anchor_question_version_ids) AND v.kind<>'ORIGINAL') OR
    (a.kind='VARIANT' AND NOT q.id=ANY(NEW.anchor_question_version_ids) AND
     (v.kind<>'VARIANT' OR q.parent_original_question_version_id IS NULL)))) THEN
  RAISE EXCEPTION 'V2 anchors must be original; variant focal items require original lineage' USING ERRCODE='23514'; END IF;
 SELECT r.anchor_question_version_ids INTO other FROM public.assessment_arm_revisions r JOIN public.assessment_arms arm ON arm.current_revision_id=r.id
 WHERE arm.set_id=a.set_id AND arm.id<>a.id LIMIT 1;
 IF other IS NOT NULL AND NOT (NEW.anchor_question_version_ids @> other AND other @> NEW.anchor_question_version_ids) THEN
  RAISE EXCEPTION 'V2 common anchors must retain exact versions' USING ERRCODE='23514'; END IF;
 IF c.ecosystem='TRYOUT' AND s.status='OPEN' THEN RAISE EXCEPTION 'Open Tryout membership is frozen' USING ERRCODE='23514'; END IF;
 NEW.manifest_digest:=irt_compute.payload_digest(jsonb_build_object('packageId',p.id,'packageVersion',p.package_version,
   'approval',p.curriculum_approval,'scoringPolicy',p.scoring_policy_version_id,'anchors',NEW.anchor_question_version_ids,
   'items',(SELECT jsonb_agg(to_jsonb(pi) ORDER BY pi.display_order) FROM public.package_items pi WHERE pi.package_id=p.id)));
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_v2_revision_guard BEFORE INSERT ON public.assessment_arm_revisions FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_revision_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_validate_roster(p_set uuid, p_arm uuid DEFAULT NULL, p_revision uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE baseline uuid[]; anchors uuid[]; rec record; families uuid[];
BEGIN
 FOR rec IN SELECT r.* FROM public.assessment_arms a JOIN public.assessment_arm_revisions r
  ON r.id=CASE WHEN a.id=p_arm THEN p_revision ELSE a.current_revision_id END WHERE a.set_id=p_set LOOP
  SELECT array_agg(v.question_id ORDER BY v.question_id) INTO families FROM public.package_items pi
   JOIN public.question_versions q ON q.id=pi.question_version_id JOIN public.question_variants v ON v.id=q.variant_id
   WHERE pi.package_id=rec.package_id;
  IF baseline IS NOT NULL AND families IS DISTINCT FROM baseline THEN
   RAISE EXCEPTION 'V2 arm family rosters must match' USING ERRCODE='23514'; END IF;
  IF anchors IS NOT NULL AND NOT (anchors @> rec.anchor_question_version_ids AND rec.anchor_question_version_ids @> anchors) THEN
   RAISE EXCEPTION 'V2 common anchor versions must match' USING ERRCODE='23514'; END IF;
  baseline:=families; anchors:=rec.anchor_question_version_ids;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_set_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eco text; originals integer; variants integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'V2 set history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.measurement_contexts c JOIN public.assessment_distribution_policies p ON p.id=NEW.policy_id
   WHERE c.id=NEW.context_id AND p.definition->>'contextId'=c.id::text AND p.definition->>'ecosystem'=c.ecosystem) THEN
  RAISE EXCEPTION 'V2 distribution policy scope must match context and ecosystem' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.context_id,NEW.policy_id,NEW.blueprint_version_id,NEW.created_at) IS DISTINCT FROM
   (OLD.context_id,OLD.policy_id,OLD.blueprint_version_id,OLD.created_at) THEN RAISE EXCEPTION 'V2 set pins immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'DRAFT' AND NOT ((OLD.status='OPEN' AND NEW.status IN ('OPEN','CLOSED','RETIRED')) OR
    (OLD.status='CLOSED' AND NEW.status IN ('CLOSED','RETIRED')) OR (OLD.status='RETIRED' AND NEW.status='RETIRED')) THEN
  RAISE EXCEPTION 'Invalid V2 set transition' USING ERRCODE='23514'; END IF;
 IF NEW.status='OPEN' THEN
  PERFORM public.assessment_v2_validate_roster(NEW.id);
  SELECT ecosystem INTO eco FROM public.measurement_contexts WHERE id=NEW.context_id;
  SELECT count(*) FILTER(WHERE kind='ORIGINAL'),count(*) FILTER(WHERE kind='VARIANT') INTO originals,variants FROM public.assessment_arms WHERE set_id=NEW.id;
  IF originals<>1 OR variants<1 OR (eco='DRILL' AND variants<>1) OR
     EXISTS(SELECT 1 FROM public.assessment_arms WHERE set_id=NEW.id AND current_revision_id IS NULL) THEN
   RAISE EXCEPTION 'V2 requires original and variant arms with revisions' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_v2_set_guard BEFORE INSERT OR UPDATE OR DELETE ON public.assessment_arm_sets FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_set_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_arm_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s public.assessment_arm_sets; eco text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'V2 arm history cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM public.assessment_arm_sets WHERE id=NEW.set_id FOR UPDATE;
 SELECT ecosystem INTO eco FROM public.measurement_contexts WHERE id=s.context_id;
 IF TG_OP='INSERT' AND (s.status<>'DRAFT' OR (NEW.kind='ORIGINAL' OR eco='DRILL') AND
    EXISTS(SELECT 1 FROM public.assessment_arms WHERE set_id=NEW.set_id AND kind=NEW.kind)) THEN
  RAISE EXCEPTION 'V2 arm composition invalid or frozen' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.set_id,NEW.code,NEW.kind) IS DISTINCT FROM (OLD.set_id,OLD.code,OLD.kind) THEN
  RAISE EXCEPTION 'V2 arm identity immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id AND
    (s.status IN ('CLOSED','RETIRED') OR eco='TRYOUT' AND s.status='OPEN') THEN
  RAISE EXCEPTION 'V2 revision pointer frozen' USING ERRCODE='23514'; END IF;
 IF NEW.current_revision_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.assessment_arm_revisions WHERE id=NEW.current_revision_id AND arm_id=NEW.id) THEN
   RAISE EXCEPTION 'V2 revision must belong to arm' USING ERRCODE='23514'; END IF;
  PERFORM public.assessment_v2_validate_roster(NEW.set_id,NEW.id,NEW.current_revision_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_v2_arm_guard BEFORE INSERT OR UPDATE OR DELETE ON public.assessment_arms FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_arm_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_frozen_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pkg uuid; old_pkg uuid;
BEGIN
 IF TG_TABLE_NAME='package_items' THEN pkg:=CASE WHEN TG_OP='DELETE' THEN OLD.package_id ELSE NEW.package_id END;
 ELSE pkg:=OLD.id; END IF;
 IF TG_TABLE_NAME='package_items' AND TG_OP='UPDATE' THEN old_pkg:=OLD.package_id; END IF;
 IF EXISTS(SELECT 1 FROM public.assessment_arm_revisions WHERE package_id=pkg OR package_id=old_pkg) THEN
  RAISE EXCEPTION 'V2 pinned package is immutable; create a new revision' USING ERRCODE='23514'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER assessment_v2_frozen_package_guard BEFORE UPDATE OR DELETE ON public.assessment_packages FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_frozen_package_guard();
CREATE TRIGGER assessment_v2_frozen_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.package_items FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_frozen_package_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_pinned_content_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.package_items pi JOIN public.assessment_arm_revisions r ON r.package_id=pi.package_id WHERE pi.question_version_id=OLD.id)
 AND (to_jsonb(NEW)-ARRAY['content_status','validation_state','validation_decision_id','reviewed_by_user_id','reviewed_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['content_status','validation_state','validation_decision_id','reviewed_by_user_id','reviewed_at']) THEN
  RAISE EXCEPTION 'V2 pinned content must be revised through a new immutable version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_v2_pinned_content_guard BEFORE UPDATE ON public.question_versions FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_pinned_content_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_batch_membership_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b public.tryout_batches; a public.assessment_arms; s public.assessment_arm_sets; ctx public.measurement_contexts;
BEGIN
 SELECT * INTO b FROM public.tryout_batches WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.batch_id ELSE NEW.batch_id END FOR UPDATE;
 IF b.status<>'PLANNED' THEN RAISE EXCEPTION 'Tryout batch package list is frozen' USING ERRCODE='23514'; END IF;
 IF TG_OP<>'DELETE' AND NEW.arm_id IS NOT NULL THEN
  SELECT * INTO a FROM public.assessment_arms WHERE id=NEW.arm_id;
  SELECT * INTO s FROM public.assessment_arm_sets WHERE id=a.set_id;
  SELECT * INTO ctx FROM public.measurement_contexts WHERE id=s.context_id;
  IF ctx.ecosystem<>'TRYOUT' OR ctx.tryout_batch_id<>b.id OR NOT EXISTS
   (SELECT 1 FROM public.assessment_arm_revisions WHERE arm_id=a.id AND package_id=NEW.package_id) THEN
   RAISE EXCEPTION 'Tryout batch arm/package/context mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER assessment_v2_batch_membership_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tryout_batch_packages FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_batch_membership_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_batch_open_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_set_id uuid;
BEGIN
 IF NEW.status<>'PLANNED' AND EXISTS(SELECT 1 FROM public.tryout_batch_packages WHERE batch_id=NEW.id AND arm_id IS NOT NULL) THEN
  SELECT a.set_id INTO target_set_id FROM public.tryout_batch_packages m JOIN public.assessment_arms a ON a.id=m.arm_id WHERE m.batch_id=NEW.id LIMIT 1;
  IF NOT EXISTS(SELECT 1 FROM public.assessment_arm_sets s WHERE s.id=target_set_id AND s.status='OPEN') OR
     EXISTS(SELECT 1 FROM public.assessment_arms a WHERE a.set_id=target_set_id AND NOT EXISTS
       (SELECT 1 FROM public.tryout_batch_packages m JOIN public.assessment_arm_revisions r ON r.id=a.current_revision_id
         WHERE m.batch_id=NEW.id AND m.arm_id=a.id AND m.package_id=r.package_id)) OR
     EXISTS(SELECT 1 FROM public.tryout_batch_packages m LEFT JOIN public.assessment_arms a ON a.id=m.arm_id
       WHERE m.batch_id=NEW.id AND (a.set_id IS DISTINCT FROM target_set_id)) THEN
   RAISE EXCEPTION 'V2 Tryout batch must freeze all current arms of one open set' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_v2_batch_open_guard BEFORE INSERT OR UPDATE ON public.tryout_batches FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_batch_open_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s public.assessment_arm_sets; c public.measurement_contexts; prior boolean;
BEGIN
 SELECT * INTO s FROM public.assessment_arm_sets WHERE id=NEW.set_id FOR SHARE;
 SELECT * INTO c FROM public.measurement_contexts WHERE id=s.context_id;
 IF s.status<>'OPEN' OR NOT EXISTS(SELECT 1 FROM public.assessment_arms WHERE id=NEW.assigned_arm_id AND set_id=s.id AND status='ACTIVE') THEN
  RAISE EXCEPTION 'V2 assignment requires an open set and active arm' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.student_id::text||':'||c.id::text,71));
 SELECT EXISTS(SELECT 1 FROM public.assessment_attempts WHERE student_id=NEW.student_id AND
  ((c.ecosystem='DRILL' AND assessment_type='DRILL' AND level_id_at_start=c.level_id) OR
   (c.ecosystem='TRYOUT' AND tryout_batch_id=c.tryout_batch_id))) INTO prior;
 NEW.first_valid_evidence:=NOT prior;
 NEW.exposure_facts:=jsonb_build_object('hasPriorContextAttempt',prior,'priorFamilyExposureCount',
   (SELECT count(*) FROM public.student_item_exposures e WHERE e.student_id=NEW.student_id AND e.family_id IN
    (SELECT v.question_id FROM public.assessment_arms a JOIN public.assessment_arm_revisions r ON r.id=a.current_revision_id
     JOIN public.package_items pi ON pi.package_id=r.package_id JOIN public.question_versions q ON q.id=pi.question_version_id
     JOIN public.question_variants v ON v.id=q.variant_id WHERE a.set_id=s.id)),
   'priorModules',(SELECT coalesce(jsonb_agg(DISTINCT e.module),'[]'::jsonb) FROM public.student_item_exposures e WHERE e.student_id=NEW.student_id));
 IF c.ecosystem='TRYOUT' AND (NEW.exposure_facts->>'priorFamilyExposureCount')::integer>0 THEN NEW.first_valid_evidence:=false; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_v2_assignment_guard BEFORE INSERT ON public.assessment_arm_assignments FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_assignment_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ass public.assessment_arm_assignments; assigned public.assessment_arms; actual public.assessment_arms;
 r public.assessment_arm_revisions; a public.assessment_attempts; s public.assessment_arm_sets; c public.measurement_contexts;
BEGIN
 SELECT * INTO a FROM public.assessment_attempts WHERE id=NEW.attempt_id FOR UPDATE;
 SELECT * INTO ass FROM public.assessment_arm_assignments WHERE id=NEW.assignment_id;
 SELECT * INTO s FROM public.assessment_arm_sets WHERE id=ass.set_id FOR SHARE;
 SELECT * INTO c FROM public.measurement_contexts WHERE id=s.context_id;
 SELECT * INTO assigned FROM public.assessment_arms WHERE id=ass.assigned_arm_id FOR SHARE;
 SELECT * INTO r FROM public.assessment_arm_revisions WHERE id=NEW.delivered_revision_id;
 SELECT * INTO actual FROM public.assessment_arms WHERE id=r.arm_id FOR SHARE;
 IF s.status<>'OPEN' OR a.purpose<>'REGULAR' OR a.student_id IS DISTINCT FROM ass.student_id OR a.package_id IS DISTINCT FROM r.package_id OR
    actual.set_id IS DISTINCT FROM s.id OR actual.current_revision_id IS DISTINCT FROM r.id OR actual.status<>'ACTIVE' OR
    a.assessment_type::text IS DISTINCT FROM c.ecosystem OR (c.ecosystem='DRILL' AND a.level_id_at_start IS DISTINCT FROM c.level_id) THEN
  RAISE EXCEPTION 'V2 delivery identity/current revision mismatch' USING ERRCODE='23514'; END IF;
 IF c.ecosystem='TRYOUT' AND (a.tryout_batch_id IS DISTINCT FROM c.tryout_batch_id OR NOT EXISTS
   (SELECT 1 FROM public.tryout_batch_packages WHERE batch_id=c.tryout_batch_id AND package_id=r.package_id AND arm_id=actual.id)) THEN
  RAISE EXCEPTION 'V2 Tryout delivery requires batch membership' USING ERRCODE='23514'; END IF;
 IF NOT coalesce(public.package_can_distribute(r.package_id),false) THEN
  RAISE EXCEPTION 'V2 delivered revision is not distributable' USING ERRCODE='23514'; END IF;
 IF NEW.delivery_mode='ASSIGNED' THEN
  IF actual.id<>assigned.id THEN RAISE EXCEPTION 'Cannot silently change assigned arm' USING ERRCODE='23514'; END IF;
 ELSE
  IF c.ecosystem<>'DRILL' OR actual.kind<>'ORIGINAL' OR assigned.kind<>'VARIANT' OR
     (assigned.status='ACTIVE' AND public.package_can_distribute((SELECT package_id FROM public.assessment_arm_revisions WHERE id=assigned.current_revision_id))) OR NOT EXISTS(SELECT 1 FROM public.assessment_distribution_policies
       WHERE id=s.policy_id AND definition->>'allowOriginalFallback'='true') THEN
   RAISE EXCEPTION 'Original fallback requires unavailable variant and approved policy' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_v2_delivery_guard BEFORE INSERT ON public.assessment_attempt_arm_deliveries FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_delivery_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.package_id,NEW.student_id,NEW.tryout_batch_id) IS DISTINCT FROM (OLD.package_id,OLD.student_id,OLD.tryout_batch_id) THEN
  RAISE EXCEPTION 'Attempt delivery identity is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.tryout_batch_id IS NOT NULL AND (NEW.assessment_type<>'TRYOUT' OR NOT EXISTS(SELECT 1 FROM public.tryout_batch_packages WHERE batch_id=NEW.tryout_batch_id AND package_id=NEW.package_id)) THEN
  RAISE EXCEPTION 'Attempt Tryout membership mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.assessment_packages WHERE id=NEW.package_id AND distribution_arm_id IS NOT NULL) AND
    NOT EXISTS(SELECT 1 FROM public.assessment_attempt_arm_deliveries WHERE attempt_id=NEW.id) THEN
  RAISE EXCEPTION 'V2 attempt requires an immutable delivery pin' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER assessment_v2_attempt_guard AFTER INSERT OR UPDATE ON public.assessment_attempts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_attempt_guard();
--> statement-breakpoint
CREATE FUNCTION public.assessment_v2_distribution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q public.assessment_arm_revisions; s public.assessment_arm_sets;
BEGIN
 SELECT r.* INTO q FROM public.assessment_arm_revisions r WHERE r.id=NEW.revision_id;
 SELECT st.* INTO s FROM public.assessment_arm_sets st JOIN public.assessment_arms a ON a.set_id=st.id WHERE a.id=q.arm_id;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.actor_user_id AND role='ADMIN' AND admin_role IN ('SUPER_ADMIN','CONTENT_DATA_MODERATION')) THEN
  RAISE EXCEPTION 'V2 distribution event requires authorized content actor' USING ERRCODE='23514'; END IF;
 IF s.status IN ('CLOSED','RETIRED') OR NEW.state='PROVISIONAL' AND NEW.comparison_output_id IS NOT NULL THEN
  RAISE EXCEPTION 'Invalid V2 distribution transition/evidence' USING ERRCODE='23514'; END IF;
 IF NEW.state='READY' AND NOT EXISTS(SELECT 1 FROM irt_compute.compute_outputs o JOIN public.analysis_requests req ON req.id=(SELECT request_id FROM irt_compute.compute_executions WHERE id=o.execution_id)
   WHERE o.id=NEW.comparison_output_id AND o.scientific_decision='PASS' AND o.digest=irt_compute.payload_digest(o.payload) AND o.kind='COMPARE_VARIANTS'
     AND req.request_type='COMPARE_VARIANTS' AND req.package_id=q.package_id AND req.context_id=s.context_id AND req.accepted_execution_id=o.execution_id) THEN
  RAISE EXCEPTION 'READY requires adopted contextual PASS evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_v2_distribution_guard BEFORE INSERT ON public.assessment_arm_distribution_events FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_distribution_guard();
--> statement-breakpoint
ALTER FUNCTION public.package_can_distribute(uuid) RENAME TO package_can_distribute_legacy_v3;
CREATE FUNCTION public.package_can_distribute(p_package_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN p.distribution_arm_id IS NULL THEN public.package_can_distribute_legacy_v3(p.id) ELSE p.status='PUBLISHED' AND p.purpose='REGULAR' AND EXISTS(
  SELECT 1 FROM public.assessment_arms a JOIN public.assessment_arm_sets s ON s.id=a.set_id
  JOIN public.assessment_arm_revisions r ON r.id=a.current_revision_id
  WHERE a.id=p.distribution_arm_id AND r.package_id=p.id AND a.status='ACTIVE' AND s.status='OPEN'
  AND NOT EXISTS(SELECT 1 FROM public.package_items pi JOIN public.question_versions q ON q.id=pi.question_version_id
    JOIN public.scoring_rubric_versions rubric ON rubric.id=q.scoring_rubric_version_id
    WHERE pi.package_id=p.id AND (q.content_status<>'READY' OR q.validation_state<>'CONTENT_VALID' OR rubric.status<>'SEALED'))
  AND (SELECT state FROM public.assessment_arm_distribution_events WHERE revision_id=r.id ORDER BY created_at DESC,id DESC LIMIT 1)
      IN ('PROVISIONAL','READY')) END FROM public.assessment_packages p WHERE p.id=p_package_id
$$;
--> statement-breakpoint
ALTER TABLE public.assessment_distribution_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_arm_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_arms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_arm_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tryout_batch_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_arm_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_attempt_arm_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_arm_distribution_events ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['assessment_distribution_policies','assessment_arm_sets','assessment_arms','assessment_arm_revisions',
   'tryout_batch_packages','assessment_arm_assignments','assessment_attempt_arm_deliveries','assessment_arm_distribution_events'] LOOP
  EXECUTE format('CREATE POLICY main_runtime ON public.%I TO numora_main_runtime USING (true) WITH CHECK (true)',tab);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO numora_main_runtime',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',tab);
 END LOOP;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.package_can_distribute(uuid), public.package_can_distribute_legacy_v3(uuid), public.assessment_v2_validate_roster(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.package_can_distribute(uuid), public.package_can_distribute_legacy_v3(uuid), public.assessment_v2_validate_roster(uuid,uuid,uuid) TO numora_main_runtime;

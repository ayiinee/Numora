ALTER TABLE public.generator_packages ADD COLUMN drill_manifest jsonb, ADD COLUMN drill_import_digest text;
--> statement-breakpoint
ALTER TABLE public.generator_packages
  DROP CONSTRAINT generator_packages_count_ck,
  DROP CONSTRAINT generator_packages_source_package_ck,
  ADD CONSTRAINT generator_packages_count_ck CHECK (
    expected_count=CASE WHEN drill_manifest IS NOT NULL THEN 7
      WHEN assessment_type='DRILL' THEN 10 WHEN assessment_type='PRETEST' THEN 20 ELSE 30 END
    AND jsonb_array_length(mapping_ids)=expected_count AND jsonb_array_length(request_ids)=expected_count
  ),
  ADD CONSTRAINT generator_packages_source_package_ck CHECK (
    (source_package_id IS NOT NULL)=(assessment_type='TRYOUT' OR drill_manifest IS NOT NULL)
    AND (drill_manifest IS NULL OR (
      assessment_type='DRILL' AND drill_manifest->>'sourcePackageId'=source_package_id::text
      AND drill_manifest->>'levelId'=level_id::text
      AND drill_manifest->>'manifestDigest' ~ '^[a-f0-9]{64}$'
      AND jsonb_array_length(drill_manifest->'items')=10
    ) IS TRUE)
  ) NOT VALID,
  ADD CONSTRAINT generator_packages_drill_import_ck CHECK (
    drill_import_digest IS NULL AND (drill_manifest IS NULL OR canonical_package_id IS NULL)
    OR (drill_manifest IS NOT NULL AND canonical_package_id IS NOT NULL
      AND drill_import_digest IS NOT NULL AND drill_import_digest ~ '^[a-f0-9]{64}$')
  );
-- Keep the 0076 legacy TRYOUT exception for rows that predate source_package_id.
--> statement-breakpoint
CREATE UNIQUE INDEX generator_packages_drill_canonical_uq
  ON public.generator_packages(canonical_package_id) WHERE drill_manifest IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION public.guard_drill_variant_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['canonical_package_id','drill_import_digest']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['canonical_package_id','drill_import_digest']) OR
    (OLD.canonical_package_id IS NOT NULL AND NEW IS DISTINCT FROM OLD)
  THEN RAISE EXCEPTION 'Drill variant group pins are immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_drill_variant_group BEFORE UPDATE OR DELETE ON public.generator_packages
  FOR EACH ROW WHEN (OLD.drill_manifest IS NOT NULL) EXECUTE FUNCTION public.guard_drill_variant_group();
--> statement-breakpoint
CREATE FUNCTION public.guard_drill_variant_wave_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.analysis_requests WHERE wave_item_id=OLD.id) THEN
    RAISE EXCEPTION 'Requested Drill variant wave item is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_drill_variant_wave_item BEFORE UPDATE OR DELETE ON public.generation_wave_items
  FOR EACH ROW WHEN (OLD.constraints ? 'drillVariantManifest') EXECUTE FUNCTION public.guard_drill_variant_wave_item();
--> statement-breakpoint
CREATE FUNCTION public.guard_drill_variant_composition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.generator_packages g
    WHERE g.drill_manifest IS NOT NULL AND g.canonical_package_id IN (
      CASE WHEN TG_OP<>'INSERT' THEN OLD.package_id END,
      CASE WHEN TG_OP<>'DELETE' THEN NEW.package_id END
    )) THEN
    RAISE EXCEPTION 'Imported Drill variant composition is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_drill_variant_composition BEFORE INSERT OR UPDATE OR DELETE ON public.package_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_drill_variant_composition();
--> statement-breakpoint
CREATE FUNCTION public.guard_drill_variant_package() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pins jsonb;
BEGIN
  SELECT drill_manifest INTO pins FROM public.generator_packages
    WHERE canonical_package_id=OLD.id AND drill_manifest IS NOT NULL;
  IF pins IS NULL THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','release_at','distribution_arm_id','blueprint_version_id','curriculum_approval','manifest_digest'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','release_at','distribution_arm_id','blueprint_version_id','curriculum_approval','manifest_digest'])
  THEN RAISE EXCEPTION 'Imported Drill variant package pins are immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status='DRAFT' AND NEW.status='PUBLISHED' AND NOT coalesce((
    NEW.distribution_arm_id::text=pins->>'variantArmId'
    AND NEW.scoring_policy_version_id::text=pins->>'policyVersionId'
    AND NEW.blueprint_version_id::text=pins->>'blueprintVersionId'
    AND NEW.curriculum_approval->>'contextId'=pins->>'contextId'
    AND NEW.curriculum_approval->>'contextRevision'=pins->>'contextRevision'
    AND NEW.curriculum_approval->>'generationManifestDigest'=pins->>'manifestDigest'
    AND NEW.curriculum_approval->>'revokedAt' IS NULL
    AND NEW.curriculum_approval->>'approvedByUserId' IS NOT NULL
    AND length(trim(NEW.curriculum_approval->>'reference'))>0
    AND NEW.curriculum_approval->>'approvedAt' IS NOT NULL
    AND NEW.manifest_digest=NEW.curriculum_approval->>'compositionDigest'
    AND NOT EXISTS (SELECT 1 FROM public.package_items i JOIN public.question_versions v
      ON v.id=i.question_version_id WHERE i.package_id=OLD.id AND (v.reviewed_at IS NULL OR v.reviewed_by_user_id IS NULL))
  ),false) THEN RAISE EXCEPTION 'Drill variant requires scoped Curriculum approval and review' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_drill_variant_package BEFORE UPDATE ON public.assessment_packages
  FOR EACH ROW EXECUTE FUNCTION public.guard_drill_variant_package();
--> statement-breakpoint
CREATE FUNCTION public.guard_drill_variant_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['content_status','validation_state','validation_decision_id','reviewed_by_user_id','reviewed_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['content_status','validation_state','validation_decision_id','reviewed_by_user_id','reviewed_at'])
    AND EXISTS (SELECT 1 FROM public.package_items i JOIN public.generator_packages g ON g.canonical_package_id=i.package_id
      WHERE i.question_version_id=OLD.id AND g.drill_manifest IS NOT NULL)
  THEN RAISE EXCEPTION 'Imported Drill variant content must use a new question version' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_drill_variant_content BEFORE UPDATE ON public.question_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_drill_variant_content();
--> statement-breakpoint
CREATE VIEW public.generator_drill_sources_v2 AS
SELECT p.id,p.package_version,p.level_id,p.scoring_policy_version_id,s.context_id,s.blueprint_version_id,
  r.id AS original_revision_id,r.anchor_question_version_ids AS anchor_ids,v.id AS variant_arm_id
FROM public.assessment_packages p JOIN public.assessment_arms a ON a.id=p.distribution_arm_id
JOIN public.assessment_arm_revisions r ON r.id=a.current_revision_id AND r.package_id=p.id
JOIN public.assessment_arm_sets s ON s.id=a.set_id
JOIN public.assessment_arms v ON v.set_id=s.id AND v.kind='VARIANT'
JOIN public.assessment_blueprint_versions b ON b.id=s.blueprint_version_id
JOIN public.scoring_policy_versions policy ON policy.id=p.scoring_policy_version_id
WHERE p.assessment_type='DRILL' AND p.purpose='REGULAR' AND p.status='PUBLISHED' AND NOT p.is_demo
  AND a.kind='ORIGINAL' AND a.status='ACTIVE' AND s.status IN ('DRAFT','OPEN')
  AND b.status='SEALED' AND policy.status='PUBLISHED'
  AND p.curriculum_approval IS NOT NULL AND p.curriculum_approval->>'revokedAt' IS NULL;
CREATE VIEW public.generator_drill_source_items_v2 AS
SELECT i.package_id,i.question_version_id,i.display_order,i.max_points,i.rubric_version_id,
  i.maximum_score_category,v.question_id AS family_id,v.kind,q.content_fingerprint,
  irt_compute.payload_digest(jsonb_build_object('stem',q.stem,'options',q.options_or_statements,
    'answer',q.answer_key,'explanation',q.explanation,'media',q.media,
    'difficulty',q.difficulty,'questionType',q.question_type)) AS content_hash
FROM public.generator_drill_sources_v2 p JOIN public.package_items i ON i.package_id=p.id
JOIN public.question_versions q ON q.id=i.question_version_id AND q.level_id=p.level_id
JOIN public.question_variants v ON v.id=q.variant_id
JOIN public.scoring_rubric_versions rubric ON rubric.id=i.rubric_version_id AND rubric.id=q.scoring_rubric_version_id
WHERE q.content_status='READY' AND q.validation_state='CONTENT_VALID' AND rubric.status='SEALED';
GRANT SELECT ON public.generator_drill_sources_v2,public.generator_drill_source_items_v2 TO numora_irt_runtime;
REVOKE ALL ON FUNCTION public.guard_drill_variant_group(),public.guard_drill_variant_wave_item(),
  public.guard_drill_variant_composition(),public.guard_drill_variant_package(),public.guard_drill_variant_content() FROM PUBLIC;

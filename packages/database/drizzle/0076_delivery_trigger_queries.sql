-- Preserve row-trigger order, family locks, ownership checks and exposure history.
-- Consolidate SPI queries; do not defer or skip delivery bookkeeping.
CREATE OR REPLACE FUNCTION public.measurement_delivery_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fam uuid; manifest_student uuid; owner_id uuid;
BEGIN
  IF NEW.attempt_item_id IS NOT NULL THEN
    SELECT v.question_id, m.student_id, a.student_id INTO fam, manifest_student, owner_id
    FROM public.question_versions q
    JOIN public.question_variants v ON v.id=q.variant_id
    LEFT JOIN public.content_delivery_manifests m ON m.id=NEW.manifest_id
    LEFT JOIN public.attempt_items i ON i.id=NEW.attempt_item_id AND i.question_version_id=NEW.question_version_id
    LEFT JOIN public.assessment_attempts a ON a.id=i.attempt_id AND a.assessment_type::text=m.module
    WHERE q.id=NEW.question_version_id;
  ELSE
    SELECT v.question_id, m.student_id, p.student_id INTO fam, manifest_student, owner_id
    FROM public.question_versions q
    JOIN public.question_variants v ON v.id=q.variant_id
    LEFT JOIN public.content_delivery_manifests m ON m.id=NEW.manifest_id
    LEFT JOIN public.pvp_match_questions mq ON mq.id=NEW.pvp_match_question_id AND mq.question_version_id=NEW.question_version_id
    LEFT JOIN public.pvp_players p ON p.match_id=mq.match_id AND p.student_id=m.student_id AND m.module='PVP'
    WHERE q.id=NEW.question_version_id;
  END IF;
  IF NEW.family_id IS DISTINCT FROM fam THEN RAISE EXCEPTION 'Delivery family must match content version' USING ERRCODE='23514'; END IF;
  IF owner_id IS DISTINCT FROM manifest_student THEN RAISE EXCEPTION 'Delivery must belong to this student/module' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(manifest_student::text||':'||fam::text,7));
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.measurement_delivery_exposure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  WITH exposure AS (
    INSERT INTO public.student_item_exposures(delivery_item_id,student_id,question_version_id,family_id,kind,module,occurred_at)
    SELECT NEW.id,m.student_id,NEW.question_version_id,NEW.family_id,m.kind,m.module,m.issued_at
    FROM public.content_delivery_manifests m WHERE m.id=NEW.manifest_id
    RETURNING id,student_id,family_id,occurred_at
  ), invalidations AS (
    UPDATE public.trial_family_reservations r
    SET invalidated_at=e.occurred_at,invalidating_exposure_id=e.id,reason='PRIOR_FAMILY_EXPOSURE'
    FROM public.trial_cohort_members cm, exposure e
    WHERE cm.id=r.cohort_member_id AND cm.student_id=e.student_id AND r.family_id=e.family_id AND r.invalidated_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.trial_assignments a JOIN public.assessment_attempts att ON att.trial_assignment_id=a.id JOIN public.attempt_items ai ON ai.attempt_id=att.id
        JOIN public.content_delivery_items di ON di.attempt_item_id=ai.id JOIN public.content_delivery_manifests dm ON dm.id=di.manifest_id
        WHERE a.cohort_member_id=cm.id AND dm.kind='ITEM_PAYLOAD_ISSUED' AND dm.issued_at<=e.occurred_at)
    RETURNING r.cohort_member_id
  )
  UPDATE public.trial_cohort_members cm SET status='INELIGIBLE',dropout_reason='PRIOR_FAMILY_EXPOSURE'
  WHERE cm.id IN (SELECT cohort_member_id FROM invalidations);
  RETURN NEW;
END $$;

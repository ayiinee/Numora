-- Forward-only correction for PR #92; existing ledger rows and policy pins are unchanged.
CREATE OR REPLACE FUNCTION public.drill_reward_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a public.assessment_attempts; expected_xp numeric;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'XP ledger is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.policy_code IS NOT NULL OR NEW.policy_version IS NOT NULL THEN
  SELECT * INTO a FROM public.assessment_attempts WHERE id=NEW.attempt_id;
  IF a.status IS DISTINCT FROM 'GRADED' OR a.purpose IS DISTINCT FROM 'REGULAR'
     OR NEW.student_id IS DISTINCT FROM a.student_id OR NEW.occurred_at IS DISTINCT FROM a.finished_at THEN
   RAISE EXCEPTION 'Invalid reward provenance' USING ERRCODE='23514'; END IF;
  IF NEW.source_type='TRYOUT' THEN
   IF EXISTS (
    SELECT 1 FROM public.scoring_policy_versions
    WHERE id=a.scoring_policy_version_id AND policy_code='TRYOUT_PGK_PARTIAL_V1' AND version=1
   ) THEN
    -- Owner-approved partial policy: derive XP from persisted two-decimal points.
    SELECT round(sum(aa.awarded_points / ai.max_points)*10, 6) INTO expected_xp
     FROM public.attempt_items ai JOIN public.attempt_answers aa ON aa.attempt_item_id=ai.id
     WHERE ai.attempt_id=a.id;
   ELSE
    -- Preserve the historical category-based policy for its existing pins.
    SELECT ceil(sum(CASE WHEN aa.score_category IS NOT NULL THEN aa.score_category::numeric / ai.maximum_score_category ELSE aa.awarded_points / ai.max_points END)*10) INTO expected_xp
     FROM public.attempt_items ai JOIN public.attempt_answers aa ON aa.attempt_item_id=ai.id
     WHERE ai.attempt_id=a.id;
   END IF;
   IF a.assessment_type IS DISTINCT FROM 'TRYOUT' OR a.tryout_xp_policy_version IS DISTINCT FROM 1
      OR NEW.policy_code IS DISTINCT FROM 'TRYOUT_PRD_V06' OR NEW.policy_version IS DISTINCT FROM 1
      OR expected_xp IS NULL OR NEW.xp_amount IS DISTINCT FROM expected_xp
      OR NEW.base_xp IS DISTINCT FROM NEW.xp_amount OR NEW.bonus_xp IS DISTINCT FROM 0::numeric
      OR NEW.duration_seconds IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid TryOut reward provenance' USING ERRCODE='23514'; END IF;
  ELSE
   IF NEW.source_type<>'DRILL' OR NEW.policy_code IS DISTINCT FROM 'DRILL_PRD_V06' OR NEW.policy_version IS DISTINCT FROM 2
      OR a.drill_policy_version IS DISTINCT FROM 2
      OR NEW.base_xp IS NULL OR NEW.bonus_xp IS NULL OR NEW.duration_seconds IS NULL
      OR NEW.base_xp NOT BETWEEN 0 AND 100 OR NEW.bonus_xp NOT BETWEEN 0 AND 50 OR NEW.duration_seconds<0
      OR NEW.xp_amount IS DISTINCT FROM round(least(150, NEW.base_xp+NEW.bonus_xp))::integer THEN
     RAISE EXCEPTION 'Invalid Drill reward provenance' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

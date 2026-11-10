-- A Drill start takes shared arm locks before reading the current revision and state.
-- Serialize state events with those starts and with existing arm pointer updates.
CREATE FUNCTION public.lock_drill_arm_distribution_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM a.id
  FROM public.assessment_arm_revisions r
  JOIN public.assessment_arms a ON a.id = r.arm_id
  JOIN public.assessment_arm_sets s ON s.id = a.set_id
  JOIN public.measurement_contexts c ON c.id = s.context_id
  WHERE r.id = NEW.revision_id AND c.ecosystem = 'DRILL'
  FOR NO KEY UPDATE OF a;
  IF FOUND THEN
    -- Order decisions by when they take effect, even if their transactions began earlier.
    NEW.created_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER assessment_v2_drill_distribution_lock
BEFORE INSERT ON public.assessment_arm_distribution_events
FOR EACH ROW EXECUTE FUNCTION public.lock_drill_arm_distribution_event();

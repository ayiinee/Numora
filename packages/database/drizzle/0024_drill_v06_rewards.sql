ALTER TABLE "assessment_attempts" DROP CONSTRAINT "assessment_attempts_stars_ck";--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD COLUMN "drill_policy_version" integer;--> statement-breakpoint
ALTER TABLE "level_progress" ADD COLUMN "latest_stars" integer;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD COLUMN "policy_code" text;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD COLUMN "policy_version" integer;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD COLUMN "base_xp" integer;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD COLUMN "bonus_xp" numeric(18, 12);--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD COLUMN "duration_seconds" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_drill_policy_ck" CHECK ("assessment_attempts"."drill_policy_version" is null or ("assessment_attempts"."assessment_type" = 'DRILL' and "assessment_attempts"."drill_policy_version" = 2));--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_stars_ck" CHECK ("assessment_attempts"."stars" is null or ("assessment_attempts"."assessment_type" = 'DRILL' and "assessment_attempts"."stars" between 0 and 3));
--> statement-breakpoint
CREATE FUNCTION public.drill_policy_pin_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.drill_policy_version IS DISTINCT FROM OLD.drill_policy_version THEN
  RAISE EXCEPTION 'Drill policy pin is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.drill_policy_pin_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER drill_policy_pin_immutable BEFORE UPDATE ON public.assessment_attempts FOR EACH ROW EXECUTE FUNCTION public.drill_policy_pin_guard();
--> statement-breakpoint
CREATE FUNCTION public.drill_reward_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE a public.assessment_attempts; BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'XP ledger is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.policy_code IS NOT NULL OR NEW.policy_version IS NOT NULL THEN
  SELECT * INTO a FROM public.assessment_attempts WHERE id=NEW.attempt_id;
  IF NEW.source_type<>'DRILL' OR NEW.policy_code IS DISTINCT FROM 'DRILL_PRD_V06' OR NEW.policy_version IS DISTINCT FROM 2
     OR a.drill_policy_version IS DISTINCT FROM 2 OR a.status<>'GRADED' OR a.purpose<>'REGULAR'
     OR NEW.student_id IS DISTINCT FROM a.student_id OR NEW.occurred_at IS DISTINCT FROM a.finished_at
     OR NEW.base_xp IS NULL OR NEW.bonus_xp IS NULL OR NEW.duration_seconds IS NULL
     OR NEW.base_xp NOT BETWEEN 0 AND 100 OR NEW.bonus_xp NOT BETWEEN 0 AND 50 OR NEW.duration_seconds<0
     OR NEW.xp_amount IS DISTINCT FROM round(least(150, NEW.base_xp+NEW.bonus_xp))::integer THEN
    RAISE EXCEPTION 'Invalid Drill reward provenance' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.drill_reward_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER drill_reward_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.xp_ledger FOR EACH ROW EXECUTE FUNCTION public.drill_reward_guard();

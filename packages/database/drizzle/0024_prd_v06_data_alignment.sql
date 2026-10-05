ALTER TYPE "public"."content_status" ADD VALUE 'REVISION';--> statement-breakpoint
ALTER TYPE "public"."curation_status" ADD VALUE 'REVISION';--> statement-breakpoint
CREATE TABLE "class_student_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"banned_by_user_id" uuid NOT NULL,
	"banned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unbanned_by_user_id" uuid,
	"unbanned_at" timestamp with time zone,
	CONSTRAINT "class_student_bans_unban_ck" CHECK (("class_student_bans"."unbanned_at" is null and "class_student_bans"."unbanned_by_user_id" is null) or ("class_student_bans"."unbanned_at" is not null and "class_student_bans"."unbanned_at" >= "class_student_bans"."banned_at" and "class_student_bans"."unbanned_by_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "class_student_bans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "global_activity_leaderboard_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"total_xp" numeric(18, 6) DEFAULT 0 NOT NULL,
	"rank" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_activity_leaderboard_xp_ck" CHECK ("global_activity_leaderboard_entries"."total_xp" >= 0),
	CONSTRAINT "global_activity_leaderboard_rank_ck" CHECK ("global_activity_leaderboard_entries"."rank" is null or "global_activity_leaderboard_entries"."rank" > 0)
);
--> statement-breakpoint
ALTER TABLE "global_activity_leaderboard_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "levels" DROP CONSTRAINT "levels_number_ck";--> statement-breakpoint
ALTER TABLE "assessment_attempts" DROP CONSTRAINT "assessment_attempts_stars_ck";--> statement-breakpoint
DROP INDEX "class_memberships_active_student_uq";--> statement-breakpoint
ALTER TABLE "classes" ALTER COLUMN "teacher_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "class_leaderboard_entries" ALTER COLUMN "total_xp" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "xp_ledger" ALTER COLUMN "xp_amount" SET DATA TYPE numeric(14, 6);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_photo_object_key" text;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD COLUMN "end_reason" text;--> statement-breakpoint
ALTER TABLE "level_progress" ADD COLUMN "latest_stars" integer;--> statement-breakpoint
ALTER TABLE "level_progress" ADD COLUMN "latest_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "class_student_bans" ADD CONSTRAINT "class_student_bans_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_student_bans" ADD CONSTRAINT "class_student_bans_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_student_bans" ADD CONSTRAINT "class_student_bans_banned_by_user_id_users_id_fk" FOREIGN KEY ("banned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_student_bans" ADD CONSTRAINT "class_student_bans_unbanned_by_user_id_users_id_fk" FOREIGN KEY ("unbanned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_activity_leaderboard_entries" ADD CONSTRAINT "global_activity_leaderboard_entries_period_id_leaderboard_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."leaderboard_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_activity_leaderboard_entries" ADD CONSTRAINT "global_activity_leaderboard_entries_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_student_bans_active_uq" ON "class_student_bans" USING btree ("class_id","student_user_id") WHERE "class_student_bans"."unbanned_at" is null;--> statement-breakpoint
CREATE INDEX "class_student_bans_student_idx" ON "class_student_bans" USING btree ("student_user_id","class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "global_activity_leaderboard_period_student_uq" ON "global_activity_leaderboard_entries" USING btree ("period_id","student_id");--> statement-breakpoint
CREATE INDEX "global_activity_leaderboard_period_rank_idx" ON "global_activity_leaderboard_entries" USING btree ("period_id","rank");--> statement-breakpoint
-- The referenced unique index must exist before creating the composite FK.
CREATE UNIQUE INDEX "assessment_attempts_id_student_level_uq" ON "assessment_attempts" USING btree ("id","student_id","level_id_at_start");--> statement-breakpoint
ALTER TABLE "level_progress" ADD CONSTRAINT "level_progress_latest_attempt_scope_fk" FOREIGN KEY ("latest_attempt_id","student_id","level_id") REFERENCES "public"."assessment_attempts"("id","student_id","level_id_at_start") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_memberships_active_student_class_uq" ON "class_memberships" USING btree ("student_user_id","class_id") WHERE "class_memberships"."left_at" is null;--> statement-breakpoint
CREATE INDEX "class_memberships_active_student_idx" ON "class_memberships" USING btree ("student_user_id") WHERE "class_memberships"."left_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_packages_drill_mvp_level_uq" ON "assessment_packages" USING btree ("level_id") WHERE "assessment_packages"."assessment_type" = 'DRILL' and "assessment_packages"."purpose" = 'REGULAR' and "assessment_packages"."status" = 'PUBLISHED' and not "assessment_packages"."is_demo";--> statement-breakpoint
CREATE INDEX "class_leaderboard_period_class_rank_idx" ON "class_leaderboard_entries" USING btree ("period_id","class_id","rank");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_profile_photo_key_ck" CHECK ("users"."profile_photo_object_key" is null or length(trim("users"."profile_photo_object_key")) > 0);--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_end_reason_ck" CHECK ("class_memberships"."end_reason" is null or ("class_memberships"."left_at" is not null and "class_memberships"."end_reason" in ('LEFT', 'BANNED')));--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_number_ck" CHECK ("levels"."level_number" between 1 and 5);--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_ready_difficulty_ck" CHECK ("question_versions"."content_status" <> 'READY' or ("question_versions"."difficulty" is not null and length(trim("question_versions"."difficulty")) > 0));--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_stars_ck" CHECK ("assessment_attempts"."stars" is null or ("assessment_attempts"."assessment_type" = 'DRILL' and "assessment_attempts"."stars" between 0 and 3));--> statement-breakpoint
ALTER TABLE "level_progress" ADD CONSTRAINT "level_progress_latest_stars_ck" CHECK ("level_progress"."latest_stars" is null or "level_progress"."latest_stars" between 0 and 3);
--> statement-breakpoint
-- Only populate the new projection from preserved results. Never regrade history.
WITH latest AS (
  SELECT DISTINCT ON (student_id,level_id_at_start)
    student_id,level_id_at_start,id,stars
  FROM public.assessment_attempts
  WHERE assessment_type='DRILL' AND purpose='REGULAR' AND status='GRADED'
    AND finished_at IS NOT NULL AND level_id_at_start IS NOT NULL
  ORDER BY student_id,level_id_at_start,finished_at DESC,id DESC
)
UPDATE public.level_progress p SET latest_stars=l.stars,latest_attempt_id=l.id
FROM latest l WHERE p.student_id=l.student_id AND p.level_id=l.level_id_at_start;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON public.class_student_bans TO numora_main_runtime;
--> statement-breakpoint
CREATE POLICY numora_main_access ON public.class_student_bans
  FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Parent row locking serializes concurrent joins across different classes.
-- SECURITY INVOKER: the trusted NestJS runtime already owns these capabilities.
CREATE FUNCTION public.enforce_student_class_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM id FROM public.users WHERE id=NEW.student_user_id FOR NO KEY UPDATE;
  IF NEW.left_at IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.class_student_bans
      WHERE student_user_id=NEW.student_user_id AND class_id=NEW.class_id AND unbanned_at IS NULL) THEN
      RAISE EXCEPTION 'CLASS_BANNED' USING ERRCODE='23514';
    END IF;
    IF (SELECT count(*) FROM public.class_memberships
      WHERE student_user_id=NEW.student_user_id AND left_at IS NULL AND id<>NEW.id) >= 5 THEN
      RAISE EXCEPTION 'CLASS_LIMIT_REACHED' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enforce_student_class_membership() FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.enforce_student_class_membership() TO numora_main_runtime;
--> statement-breakpoint
CREATE TRIGGER student_class_membership_guard BEFORE INSERT OR UPDATE
  ON public.class_memberships FOR EACH ROW EXECUTE FUNCTION public.enforce_student_class_membership();
--> statement-breakpoint
CREATE FUNCTION public.end_banned_class_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM id FROM public.users WHERE id=NEW.student_user_id FOR NO KEY UPDATE;
  IF NEW.unbanned_at IS NULL THEN
    UPDATE public.class_memberships SET left_at=GREATEST(NEW.banned_at,joined_at),end_reason='BANNED'
      WHERE class_id=NEW.class_id AND student_user_id=NEW.student_user_id AND left_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.end_banned_class_membership() FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.end_banned_class_membership() TO numora_main_runtime;
--> statement-breakpoint
CREATE TRIGGER class_ban_membership_end AFTER INSERT OR UPDATE
  ON public.class_student_bans FOR EACH ROW EXECUTE FUNCTION public.end_banned_class_membership();
--> statement-breakpoint
CREATE FUNCTION public.release_teacher_classes() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    WITH released AS (
      UPDATE public.classes SET teacher_user_id=NULL,updated_at=NEW.ended_at
        WHERE teacher_user_id=NEW.teacher_user_id AND school_id=NEW.school_id RETURNING id
    )
    INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
      SELECT NEW.teacher_user_id,'class_teacher_released','class',id,
        jsonb_build_object('previousTeacherId',NEW.teacher_user_id,'schoolId',NEW.school_id)
      FROM released;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.release_teacher_classes() FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.release_teacher_classes() TO numora_main_runtime;
--> statement-breakpoint
CREATE TRIGGER teacher_school_leave_release AFTER UPDATE
  ON public.teacher_school_memberships FOR EACH ROW EXECUTE FUNCTION public.release_teacher_classes();
--> statement-breakpoint
-- New attempts opt into these published policies. Preserve previous policy versions.
INSERT INTO public.scoring_policy_versions(policy_code,version,configuration,status) VALUES
('DRILL_PRD_V06',1,'{"prdVersion":"0.6","questionType":"SINGLE_CHOICE","questionCount":10,"masteryScore":80,"variantCount":1,"stars":{"zero":0,"oneMax":50,"perfect":100},"xp":{"baseScale":100,"bonusWindowSeconds":900,"bonusMax":50,"cap":150}}','PUBLISHED'),
('TRYOUT_PRD_V06',1,'{"prdVersion":"0.6","questionCount":30,"equivalentCorrectXpMultiplier":10,"speedBonus":false}','PUBLISHED');
--> statement-breakpoint
-- XP is append-only, including when a runtime owns a broad RLS policy.
REVOKE UPDATE,DELETE ON public.xp_ledger FROM numora_main_runtime,numora_irt_runtime;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public.global_activity_leaderboard_entries TO numora_main_runtime;
--> statement-breakpoint
REVOKE ALL ON TABLE public.class_student_bans,public.global_activity_leaderboard_entries FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
CREATE POLICY numora_main_access ON public.global_activity_leaderboard_entries FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);

CREATE TABLE "pvp_active_rooms" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pvp_active_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "pvp_best_records_period_student_difficulty_uq";--> statement-breakpoint
DROP INDEX "pvp_leaderboard_entries_period_student_difficulty_uq";--> statement-breakpoint
DROP INDEX "pvp_players_match_student_uq";--> statement-breakpoint
DROP INDEX "pvp_players_match_slot_uq";--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD COLUMN "curriculum_approval" jsonb;--> statement-breakpoint
ALTER TABLE "leaderboard_periods" ADD COLUMN "projected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leaderboard_periods" ADD COLUMN "rank_policy_version" text DEFAULT 'legacy-competition-v0' NOT NULL;--> statement-breakpoint
ALTER TABLE "pvp_best_records" ADD COLUMN "data_mode" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "pvp_leaderboard_entries" ADD COLUMN "data_mode" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "pvp_matches" ADD COLUMN "data_mode" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "pvp_players" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pvp_active_rooms" ADD CONSTRAINT "pvp_active_rooms_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_active_rooms" ADD CONSTRAINT "pvp_active_rooms_match_id_pvp_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pvp_matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_active_rooms" ADD CONSTRAINT "pvp_active_rooms_player_id_pvp_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."pvp_players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pvp_active_rooms_match_idx" ON "pvp_active_rooms" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_best_records_period_student_difficulty_uq" ON "pvp_best_records" USING btree ("period_id","student_id","difficulty","data_mode");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_leaderboard_entries_period_student_difficulty_uq" ON "pvp_leaderboard_entries" USING btree ("period_id","student_id","difficulty","data_mode");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_players_match_student_uq" ON "pvp_players" USING btree ("match_id","student_id") WHERE "pvp_players"."left_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_players_match_slot_uq" ON "pvp_players" USING btree ("match_id","player_slot") WHERE "pvp_players"."left_at" is null;--> statement-breakpoint
ALTER TABLE "pvp_best_records" ADD CONSTRAINT "pvp_best_records_data_mode_ck" CHECK ("pvp_best_records"."data_mode" in ('demo', 'official', 'legacy'));--> statement-breakpoint
ALTER TABLE "pvp_leaderboard_entries" ADD CONSTRAINT "pvp_leaderboard_entries_data_mode_ck" CHECK ("pvp_leaderboard_entries"."data_mode" in ('demo', 'official', 'legacy'));--> statement-breakpoint
ALTER TABLE "pvp_matches" ADD CONSTRAINT "pvp_matches_data_mode_ck" CHECK ("pvp_matches"."data_mode" in ('demo', 'official', 'legacy'));
--> statement-breakpoint
-- Upgrades terminate outstanding old-policy rooms once, preserving completed history.
WITH cancelled AS (
  UPDATE public.pvp_matches SET status='CANCELLED', record_eligible=false,
    end_reason='POLICY_UPGRADE', ended_at=greatest(clock_timestamp(),coalesce(started_at,created_at))
  WHERE status IN ('WAITING','READY','RUNNING') RETURNING *
)
INSERT INTO public.analytics_outbox(event_name,entity_type,entity_id,actor_user_id,occurred_at,payload)
SELECT 'pvp_match_cancelled','pvp_match',id,creator_student_id,ended_at,
  jsonb_build_object('difficulty',difficulty) FROM cancelled;
--> statement-breakpoint
CREATE FUNCTION public.track_pvp_participation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.left_at IS NOT NULL THEN
    DELETE FROM public.pvp_active_rooms WHERE player_id=NEW.id;
  ELSIF EXISTS(SELECT 1 FROM public.pvp_matches WHERE id=NEW.match_id AND status IN ('WAITING','READY','RUNNING')) THEN
    INSERT INTO public.pvp_active_rooms(student_id,match_id,player_id)
      VALUES(NEW.student_id,NEW.match_id,NEW.id)
      ON CONFLICT(student_id) DO UPDATE SET player_id=EXCLUDED.player_id
      WHERE pvp_active_rooms.player_id=EXCLUDED.player_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'PVP_ACTIVE_ROOM_EXISTS' USING ERRCODE='23505', CONSTRAINT='pvp_active_rooms_pkey'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER pvp_participation AFTER INSERT OR UPDATE OF left_at ON public.pvp_players
  FOR EACH ROW EXECUTE FUNCTION public.track_pvp_participation();
--> statement-breakpoint
CREATE FUNCTION public.release_pvp_participation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('FINISHED','CANCELLED') THEN
    DELETE FROM public.pvp_active_rooms WHERE match_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER pvp_participation_release AFTER UPDATE OF status ON public.pvp_matches
  FOR EACH ROW EXECUTE FUNCTION public.release_pvp_participation();
--> statement-breakpoint
REVOKE ALL ON public.pvp_active_rooms FROM PUBLIC;
--> statement-breakpoint
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON public.pvp_active_rooms FROM %I',r);
      EXECUTE format('REVOKE ALL ON FUNCTION public.track_pvp_participation(),public.release_pvp_participation() FROM %I',r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public.pvp_active_rooms TO numora_main_runtime;
--> statement-breakpoint
CREATE POLICY numora_main_access ON public.pvp_active_rooms FOR ALL TO numora_main_runtime USING(true) WITH CHECK(true);
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.track_pvp_participation(),public.release_pvp_participation() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.track_pvp_participation(),public.release_pvp_participation() TO numora_main_runtime;
--> statement-breakpoint
INSERT INTO public.scoring_policy_versions(policy_code,version,configuration,effective_at,status)
VALUES('PVP_PRD_V06',1,'{"correctPoints":100,"bonusMax":50,"durations":{"easy":30,"medium":45,"hard":60},"reconnectSeconds":20,"roomLifetimeSeconds":600,"inviteLifetimeSeconds":600,"simultaneousDisconnect":"earliest-deadline-or-cancel"}',now(),'PUBLISHED')
ON CONFLICT(policy_code,version) DO NOTHING;

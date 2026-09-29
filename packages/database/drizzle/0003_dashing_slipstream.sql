CREATE TYPE "public"."attempt_status" AS ENUM('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('PRETEST', 'DRILL', 'TRYOUT', 'PVP');--> statement-breakpoint
CREATE TYPE "public"."package_status" AS ENUM('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."leaderboard_period_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."pvp_connection_status" AS ENUM('CONNECTED', 'DISCONNECTED', 'FORFEIT');--> statement-breakpoint
CREATE TYPE "public"."pvp_invite_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."pvp_match_status" AS ENUM('WAITING', 'READY', 'RUNNING', 'FINISHED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."xp_source_type" AS ENUM('DRILL', 'TRYOUT');--> statement-breakpoint
CREATE TYPE "public"."data_job_status" AS ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."evaluation_decision" AS ENUM('PASS', 'DRIFT', 'ANOMALY', 'NOT_ENOUGH_DATA', 'DEMO');--> statement-breakpoint
CREATE TYPE "public"."curation_status" AS ENUM('DRAFT', 'READY', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "competencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subchapter_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assessment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"assessment_type" "assessment_type" NOT NULL,
	"chapter_id_at_start" uuid,
	"class_id_at_start" uuid,
	"scoring_policy_version_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"status" "attempt_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"raw_points" numeric(10, 2),
	"score_0_100" numeric(5, 2),
	"stars" integer,
	CONSTRAINT "assessment_attempts_pretest_chapter_ck" CHECK ("assessment_attempts"."assessment_type" <> 'PRETEST' or "assessment_attempts"."chapter_id_at_start" is not null),
	CONSTRAINT "assessment_attempts_finished_ck" CHECK ("assessment_attempts"."finished_at" is null or "assessment_attempts"."finished_at" >= "assessment_attempts"."started_at"),
	CONSTRAINT "assessment_attempts_score_ck" CHECK ("assessment_attempts"."score_0_100" is null or ("assessment_attempts"."score_0_100" >= 0 and "assessment_attempts"."score_0_100" <= 100)),
	CONSTRAINT "assessment_attempts_stars_ck" CHECK ("assessment_attempts"."stars" is null or ("assessment_attempts"."assessment_type" = 'DRILL' and "assessment_attempts"."stars" between 1 and 3))
);
--> statement-breakpoint
ALTER TABLE "assessment_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assessment_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_code" text NOT NULL,
	"package_version" integer NOT NULL,
	"name" text NOT NULL,
	"assessment_type" "assessment_type" NOT NULL,
	"chapter_id" uuid,
	"level_id" uuid,
	"variant_index" integer,
	"duration_seconds" integer,
	"scoring_policy_version_id" uuid,
	"release_at" timestamp with time zone,
	"close_at" timestamp with time zone,
	"status" "package_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "assessment_packages_version_ck" CHECK ("assessment_packages"."package_version" > 0),
	CONSTRAINT "assessment_packages_duration_ck" CHECK ("assessment_packages"."duration_seconds" is null or "assessment_packages"."duration_seconds" > 0),
	CONSTRAINT "assessment_packages_release_ck" CHECK ("assessment_packages"."close_at" is null or "assessment_packages"."release_at" is null or "assessment_packages"."close_at" > "assessment_packages"."release_at"),
	CONSTRAINT "assessment_packages_scope_ck" CHECK (("assessment_packages"."assessment_type" <> 'PRETEST' or "assessment_packages"."chapter_id" is not null) and ("assessment_packages"."assessment_type" <> 'DRILL' or "assessment_packages"."level_id" is not null)),
	CONSTRAINT "assessment_packages_published_policy_ck" CHECK ("assessment_packages"."status" <> 'PUBLISHED' or "assessment_packages"."scoring_policy_version_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "assessment_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_item_id" uuid NOT NULL,
	"answer" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"awarded_points" numeric(10, 2),
	"graded_at" timestamp with time zone,
	CONSTRAINT "attempt_answers_points_ck" CHECK ("attempt_answers"."awarded_points" is null or "attempt_answers"."awarded_points" >= 0)
);
--> statement-breakpoint
ALTER TABLE "attempt_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attempt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"package_item_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	"max_points" numeric(10, 2) NOT NULL,
	CONSTRAINT "attempt_items_order_ck" CHECK ("attempt_items"."display_order" > 0),
	CONSTRAINT "attempt_items_points_ck" CHECK ("attempt_items"."max_points" > 0)
);
--> statement-breakpoint
ALTER TABLE "attempt_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "package_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	"max_points" numeric(10, 2) NOT NULL,
	CONSTRAINT "package_items_order_ck" CHECK ("package_items"."display_order" > 0),
	CONSTRAINT "package_items_points_ck" CHECK ("package_items"."max_points" > 0)
);
--> statement-breakpoint
ALTER TABLE "package_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scoring_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_code" text NOT NULL,
	"version" integer NOT NULL,
	"configuration" jsonb NOT NULL,
	"effective_at" timestamp with time zone,
	"status" "package_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "scoring_policy_versions_version_ck" CHECK ("scoring_policy_versions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "scoring_policy_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "class_leaderboard_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"rank" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_leaderboard_entries_xp_ck" CHECK ("class_leaderboard_entries"."total_xp" >= 0),
	CONSTRAINT "class_leaderboard_entries_rank_ck" CHECK ("class_leaderboard_entries"."rank" is null or "class_leaderboard_entries"."rank" > 0)
);
--> statement-breakpoint
ALTER TABLE "class_leaderboard_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leaderboard_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"status" "leaderboard_period_status" DEFAULT 'ACTIVE' NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "leaderboard_periods_range_ck" CHECK ("leaderboard_periods"."ends_at" > "leaderboard_periods"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "leaderboard_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pvp_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"match_question_id" uuid NOT NULL,
	"answer" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"base_points" numeric(10, 2) DEFAULT '0' NOT NULL,
	"speed_bonus" numeric(10, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "pvp_answers_points_ck" CHECK ("pvp_answers"."base_points" >= 0 and "pvp_answers"."speed_bonus" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pvp_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pvp_best_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"difficulty" text NOT NULL,
	"match_id" uuid NOT NULL,
	"best_points" numeric(10, 2) NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pvp_best_records_points_ck" CHECK ("pvp_best_records"."best_points" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pvp_best_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pvp_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"class_id_at_invite" uuid NOT NULL,
	"sender_student_id" uuid NOT NULL,
	"recipient_student_id" uuid NOT NULL,
	"status" "pvp_invite_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	CONSTRAINT "pvp_invites_distinct_students_ck" CHECK ("pvp_invites"."sender_student_id" <> "pvp_invites"."recipient_student_id"),
	CONSTRAINT "pvp_invites_expiry_ck" CHECK ("pvp_invites"."expires_at" is null or "pvp_invites"."expires_at" > "pvp_invites"."created_at"),
	CONSTRAINT "pvp_invites_response_ck" CHECK ("pvp_invites"."responded_at" is null or "pvp_invites"."responded_at" >= "pvp_invites"."created_at")
);
--> statement-breakpoint
ALTER TABLE "pvp_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pvp_leaderboard_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"difficulty" text NOT NULL,
	"best_points" numeric(10, 2) NOT NULL,
	"rank" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pvp_leaderboard_entries_points_ck" CHECK ("pvp_leaderboard_entries"."best_points" >= 0),
	CONSTRAINT "pvp_leaderboard_entries_rank_ck" CHECK ("pvp_leaderboard_entries"."rank" is null or "pvp_leaderboard_entries"."rank" > 0)
);
--> statement-breakpoint
ALTER TABLE "pvp_leaderboard_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pvp_match_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"package_item_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	"started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"status" text DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "pvp_match_questions_order_ck" CHECK ("pvp_match_questions"."display_order" > 0)
);
--> statement-breakpoint
ALTER TABLE "pvp_match_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pvp_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" text NOT NULL,
	"package_id" uuid NOT NULL,
	"creator_student_id" uuid NOT NULL,
	"difficulty" text NOT NULL,
	"status" "pvp_match_status" DEFAULT 'WAITING' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"record_eligible" boolean DEFAULT false NOT NULL,
	"scoring_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "pvp_matches_time_ck" CHECK ("pvp_matches"."ended_at" is null or ("pvp_matches"."started_at" is not null and "pvp_matches"."ended_at" >= "pvp_matches"."started_at"))
);
--> statement-breakpoint
ALTER TABLE "pvp_matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pvp_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"player_slot" integer NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"connection_status" "pvp_connection_status" DEFAULT 'CONNECTED' NOT NULL,
	"disconnected_at" timestamp with time zone,
	"reconnect_deadline_at" timestamp with time zone,
	"total_points" numeric(10, 2),
	"result" text,
	CONSTRAINT "pvp_players_slot_ck" CHECK ("pvp_players"."player_slot" in (1, 2)),
	CONSTRAINT "pvp_players_reconnect_ck" CHECK ("pvp_players"."reconnect_deadline_at" is null or ("pvp_players"."disconnected_at" is not null and "pvp_players"."reconnect_deadline_at" >= "pvp_players"."disconnected_at"))
);
--> statement-breakpoint
ALTER TABLE "pvp_players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "xp_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id_at_event" uuid,
	"source_type" "xp_source_type" NOT NULL,
	"attempt_id" uuid NOT NULL,
	"xp_amount" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_id" uuid,
	CONSTRAINT "xp_ledger_amount_ck" CHECK ("xp_ledger"."xp_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "xp_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calibration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_role" text NOT NULL,
	"anchor_scale_id" text,
	"model_version" text NOT NULL,
	"sample_size" integer NOT NULL,
	"status" "data_job_status" DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"notes" text,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "calibration_runs_sample_ck" CHECK ("calibration_runs"."sample_size" >= 0)
);
--> statement-breakpoint
ALTER TABLE "calibration_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "generation_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_run_id" uuid NOT NULL,
	"candidate_question_version_id" uuid NOT NULL,
	"validation_status" text NOT NULL,
	"failure_reason" text
);
--> statement-breakpoint
ALTER TABLE "generation_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"original_question_version_id" uuid NOT NULL,
	"generator_version" text NOT NULL,
	"random_seed" text NOT NULL,
	"parameter_values" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "data_job_status" DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "generation_runs_finished_ck" CHECK ("generation_runs"."finished_at" is null or "generation_runs"."finished_at" >= "generation_runs"."started_at")
);
--> statement-breakpoint
ALTER TABLE "generation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "generator_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_or_competency_id" text NOT NULL,
	"config_version" integer NOT NULL,
	"parameters" jsonb NOT NULL,
	"curriculum_limits" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generator_configs_version_ck" CHECK ("generator_configs"."config_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "generator_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "irt_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid,
	"batch_kind" text NOT NULL,
	"model_version" text NOT NULL,
	"status" "data_job_status" DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"result_released_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "irt_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "irt_item_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"sample_size" integer NOT NULL,
	"difficulty_b" numeric(12, 6),
	"discrimination_a" numeric(12, 6),
	"guessing_c" numeric(12, 6),
	"standard_error" jsonb,
	"scale_id" text,
	"data_status" text NOT NULL,
	CONSTRAINT "irt_item_results_sample_ck" CHECK ("irt_item_results"."sample_size" >= 0),
	CONSTRAINT "irt_item_results_insufficient_ck" CHECK ("irt_item_results"."sample_size" >= 30 or ("irt_item_results"."difficulty_b" is null and "irt_item_results"."discrimination_a" is null and "irt_item_results"."guessing_c" is null))
);
--> statement-breakpoint
ALTER TABLE "irt_item_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "variant_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_question_version_id" uuid NOT NULL,
	"original_question_version_id" uuid NOT NULL,
	"calibration_run_id" uuid,
	"delta_a" numeric(12, 6),
	"delta_b" numeric(12, 6),
	"delta_d" numeric(12, 6),
	"decision" "evaluation_decision" NOT NULL,
	"reviewed_by_user_id" uuid,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "variant_evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account_restrictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"actor_admin_id" uuid NOT NULL,
	CONSTRAINT "account_restrictions_end_ck" CHECK ("account_restrictions"."ends_at" is null or "account_restrictions"."ends_at" > "account_restrictions"."starts_at"),
	CONSTRAINT "account_restrictions_revoked_ck" CHECK ("account_restrictions"."revoked_at" is null or "account_restrictions"."revoked_at" >= "account_restrictions"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "account_restrictions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"event_version" text NOT NULL,
	"actor_user_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id_at_send" uuid NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "feedback_body_ck" CHECK (length(trim("feedback"."body")) between 1 and 1000),
	CONSTRAINT "feedback_read_at_ck" CHECK ("feedback"."read_at" is null or "feedback"."read_at" >= "feedback"."sent_at")
);
--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "learning_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"curation_status" "curation_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_videos_title_ck" CHECK (length(trim("learning_videos"."title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "learning_videos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "question_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_student_id" uuid NOT NULL,
	"attempt_answer_id" uuid NOT NULL,
	"category" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"follow_up" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "video_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_student_id" uuid NOT NULL,
	"mapping_id" uuid NOT NULL,
	"category" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"follow_up" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "video_subchapter_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"subchapter_id" uuid NOT NULL,
	"recommendation_order" integer NOT NULL,
	"status" "curation_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "video_subchapter_mappings_order_ck" CHECK ("video_subchapter_mappings"."recommendation_order" > 0)
);
--> statement-breakpoint
ALTER TABLE "video_subchapter_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Composite foreign keys below require these unique indexes first.
CREATE UNIQUE INDEX "competencies_subchapter_code_uq" ON "competencies" USING btree ("subchapter_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_attempts_pretest_once_uq" ON "assessment_attempts" USING btree ("student_id","chapter_id_at_start") WHERE "assessment_attempts"."assessment_type" = 'PRETEST' and "assessment_attempts"."status" in ('SUBMITTED', 'GRADED');--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_attempts_tryout_once_uq" ON "assessment_attempts" USING btree ("student_id","package_id") WHERE "assessment_attempts"."assessment_type" = 'TRYOUT';--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_attempts_id_package_uq" ON "assessment_attempts" USING btree ("id","package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_attempts_id_student_uq" ON "assessment_attempts" USING btree ("id","student_id");--> statement-breakpoint
CREATE INDEX "assessment_attempts_student_time_idx" ON "assessment_attempts" USING btree ("student_id","started_at");--> statement-breakpoint
CREATE INDEX "assessment_attempts_package_idx" ON "assessment_attempts" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_packages_family_version_uq" ON "assessment_packages" USING btree ("family_code","package_version");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_packages_id_type_uq" ON "assessment_packages" USING btree ("id","assessment_type");--> statement-breakpoint
CREATE INDEX "assessment_packages_type_status_idx" ON "assessment_packages" USING btree ("assessment_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_answers_attempt_item_uq" ON "attempt_answers" USING btree ("attempt_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_items_attempt_order_uq" ON "attempt_items" USING btree ("attempt_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_items_attempt_package_item_uq" ON "attempt_items" USING btree ("attempt_id","package_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "package_items_package_order_uq" ON "package_items" USING btree ("package_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "package_items_id_package_uq" ON "package_items" USING btree ("id","package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "package_items_id_question_version_uq" ON "package_items" USING btree ("id","question_version_id");--> statement-breakpoint
CREATE INDEX "package_items_question_version_idx" ON "package_items" USING btree ("question_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_policy_versions_code_version_uq" ON "scoring_policy_versions" USING btree ("policy_code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "class_leaderboard_entries_period_class_student_uq" ON "class_leaderboard_entries" USING btree ("period_id","class_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_periods_starts_at_uq" ON "leaderboard_periods" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_answers_player_question_uq" ON "pvp_answers" USING btree ("player_id","match_question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_best_records_period_student_difficulty_uq" ON "pvp_best_records" USING btree ("period_id","student_id","difficulty");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_invites_pending_recipient_uq" ON "pvp_invites" USING btree ("match_id","recipient_student_id") WHERE "pvp_invites"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "pvp_invites_recipient_status_idx" ON "pvp_invites" USING btree ("recipient_student_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_leaderboard_entries_period_student_difficulty_uq" ON "pvp_leaderboard_entries" USING btree ("period_id","student_id","difficulty");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_match_questions_match_order_uq" ON "pvp_match_questions" USING btree ("match_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_match_questions_match_item_uq" ON "pvp_match_questions" USING btree ("match_id","package_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_match_questions_id_match_uq" ON "pvp_match_questions" USING btree ("id","match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_matches_room_code_uq" ON "pvp_matches" USING btree ("room_code");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_matches_id_package_uq" ON "pvp_matches" USING btree ("id","package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_players_match_student_uq" ON "pvp_players" USING btree ("match_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_players_match_slot_uq" ON "pvp_players" USING btree ("match_id","player_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "pvp_players_id_match_uq" ON "pvp_players" USING btree ("id","match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_ledger_attempt_uq" ON "xp_ledger" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "xp_ledger_student_time_idx" ON "xp_ledger" USING btree ("student_id","occurred_at");--> statement-breakpoint
CREATE INDEX "xp_ledger_class_period_idx" ON "xp_ledger" USING btree ("class_id_at_event","period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_candidates_version_uq" ON "generation_candidates" USING btree ("candidate_question_version_id");--> statement-breakpoint
CREATE INDEX "generation_candidates_run_idx" ON "generation_candidates" USING btree ("generation_run_id");--> statement-breakpoint
CREATE INDEX "generation_runs_original_idx" ON "generation_runs" USING btree ("original_question_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generator_configs_template_version_uq" ON "generator_configs" USING btree ("template_or_competency_id","config_version");--> statement-breakpoint
CREATE INDEX "irt_batches_package_idx" ON "irt_batches" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "irt_item_results_batch_version_uq" ON "irt_item_results" USING btree ("batch_id","question_version_id");--> statement-breakpoint
CREATE INDEX "variant_evaluations_candidate_idx" ON "variant_evaluations" USING btree ("candidate_question_version_id");--> statement-breakpoint
CREATE INDEX "account_restrictions_user_idx" ON "account_restrictions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_events_name_time_idx" ON "analytics_events" USING btree ("event_name","occurred_at");--> statement-breakpoint
CREATE INDEX "feedback_student_time_idx" ON "feedback" USING btree ("student_id","sent_at");--> statement-breakpoint
CREATE INDEX "feedback_teacher_class_idx" ON "feedback" USING btree ("teacher_id","class_id_at_send");--> statement-breakpoint
CREATE INDEX "question_reports_status_time_idx" ON "question_reports" USING btree ("status","reported_at");--> statement-breakpoint
CREATE INDEX "video_reports_status_time_idx" ON "video_reports" USING btree ("status","reported_at");--> statement-breakpoint
CREATE UNIQUE INDEX "video_subchapter_mappings_pair_uq" ON "video_subchapter_mappings" USING btree ("video_id","subchapter_id");--> statement-breakpoint
CREATE INDEX "video_subchapter_mappings_subchapter_order_idx" ON "video_subchapter_mappings" USING btree ("subchapter_id","recommendation_order");--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_subchapter_id_subchapters_id_fk" FOREIGN KEY ("subchapter_id") REFERENCES "public"."subchapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_chapter_id_at_start_chapters_id_fk" FOREIGN KEY ("chapter_id_at_start") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_class_id_at_start_classes_id_fk" FOREIGN KEY ("class_id_at_start") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_scoring_policy_version_id_scoring_policy_versions_id_fk" FOREIGN KEY ("scoring_policy_version_id") REFERENCES "public"."scoring_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_package_type_fk" FOREIGN KEY ("package_id","assessment_type") REFERENCES "public"."assessment_packages"("id","assessment_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD CONSTRAINT "assessment_packages_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD CONSTRAINT "assessment_packages_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD CONSTRAINT "assessment_packages_scoring_policy_version_id_scoring_policy_versions_id_fk" FOREIGN KEY ("scoring_policy_version_id") REFERENCES "public"."scoring_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_item_id_attempt_items_id_fk" FOREIGN KEY ("attempt_item_id") REFERENCES "public"."attempt_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_package_item_id_package_items_id_fk" FOREIGN KEY ("package_item_id") REFERENCES "public"."package_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_attempt_package_fk" FOREIGN KEY ("attempt_id","package_id") REFERENCES "public"."assessment_attempts"("id","package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_package_item_scope_fk" FOREIGN KEY ("package_item_id","package_id") REFERENCES "public"."package_items"("id","package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_package_item_version_fk" FOREIGN KEY ("package_item_id","question_version_id") REFERENCES "public"."package_items"("id","question_version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_leaderboard_entries" ADD CONSTRAINT "class_leaderboard_entries_period_id_leaderboard_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."leaderboard_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_leaderboard_entries" ADD CONSTRAINT "class_leaderboard_entries_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_leaderboard_entries" ADD CONSTRAINT "class_leaderboard_entries_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_answers" ADD CONSTRAINT "pvp_answers_player_id_pvp_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."pvp_players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_answers" ADD CONSTRAINT "pvp_answers_match_question_id_pvp_match_questions_id_fk" FOREIGN KEY ("match_question_id") REFERENCES "public"."pvp_match_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_answers" ADD CONSTRAINT "pvp_answers_player_match_fk" FOREIGN KEY ("player_id","match_id") REFERENCES "public"."pvp_players"("id","match_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_answers" ADD CONSTRAINT "pvp_answers_question_match_fk" FOREIGN KEY ("match_question_id","match_id") REFERENCES "public"."pvp_match_questions"("id","match_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_best_records" ADD CONSTRAINT "pvp_best_records_period_id_leaderboard_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."leaderboard_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_best_records" ADD CONSTRAINT "pvp_best_records_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_best_records" ADD CONSTRAINT "pvp_best_records_match_id_pvp_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pvp_matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_invites" ADD CONSTRAINT "pvp_invites_match_id_pvp_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pvp_matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_invites" ADD CONSTRAINT "pvp_invites_class_id_at_invite_classes_id_fk" FOREIGN KEY ("class_id_at_invite") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_invites" ADD CONSTRAINT "pvp_invites_sender_student_id_users_id_fk" FOREIGN KEY ("sender_student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_invites" ADD CONSTRAINT "pvp_invites_recipient_student_id_users_id_fk" FOREIGN KEY ("recipient_student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_leaderboard_entries" ADD CONSTRAINT "pvp_leaderboard_entries_period_id_leaderboard_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."leaderboard_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_leaderboard_entries" ADD CONSTRAINT "pvp_leaderboard_entries_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_match_questions" ADD CONSTRAINT "pvp_match_questions_match_id_pvp_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pvp_matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_match_questions" ADD CONSTRAINT "pvp_match_questions_package_item_id_package_items_id_fk" FOREIGN KEY ("package_item_id") REFERENCES "public"."package_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_match_questions" ADD CONSTRAINT "pvp_match_questions_match_package_fk" FOREIGN KEY ("match_id","package_id") REFERENCES "public"."pvp_matches"("id","package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_match_questions" ADD CONSTRAINT "pvp_match_questions_package_item_scope_fk" FOREIGN KEY ("package_item_id","package_id") REFERENCES "public"."package_items"("id","package_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_matches" ADD CONSTRAINT "pvp_matches_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_matches" ADD CONSTRAINT "pvp_matches_creator_student_id_users_id_fk" FOREIGN KEY ("creator_student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_players" ADD CONSTRAINT "pvp_players_match_id_pvp_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pvp_matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_players" ADD CONSTRAINT "pvp_players_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_class_id_at_event_classes_id_fk" FOREIGN KEY ("class_id_at_event") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_period_id_leaderboard_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."leaderboard_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_attempt_student_fk" FOREIGN KEY ("attempt_id","student_id") REFERENCES "public"."assessment_attempts"("id","student_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_candidates" ADD CONSTRAINT "generation_candidates_generation_run_id_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_candidates" ADD CONSTRAINT "generation_candidates_candidate_question_version_id_question_versions_id_fk" FOREIGN KEY ("candidate_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_config_id_generator_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."generator_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_original_question_version_id_question_versions_id_fk" FOREIGN KEY ("original_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_batches" ADD CONSTRAINT "irt_batches_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_item_results" ADD CONSTRAINT "irt_item_results_batch_id_irt_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."irt_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_item_results" ADD CONSTRAINT "irt_item_results_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD CONSTRAINT "variant_evaluations_candidate_question_version_id_question_versions_id_fk" FOREIGN KEY ("candidate_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD CONSTRAINT "variant_evaluations_original_question_version_id_question_versions_id_fk" FOREIGN KEY ("original_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD CONSTRAINT "variant_evaluations_calibration_run_id_calibration_runs_id_fk" FOREIGN KEY ("calibration_run_id") REFERENCES "public"."calibration_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD CONSTRAINT "variant_evaluations_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_actor_admin_id_users_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_class_id_at_send_classes_id_fk" FOREIGN KEY ("class_id_at_send") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_reporter_student_id_users_id_fk" FOREIGN KEY ("reporter_student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_attempt_answer_id_attempt_answers_id_fk" FOREIGN KEY ("attempt_answer_id") REFERENCES "public"."attempt_answers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_reports" ADD CONSTRAINT "video_reports_reporter_student_id_users_id_fk" FOREIGN KEY ("reporter_student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_reports" ADD CONSTRAINT "video_reports_mapping_id_video_subchapter_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."video_subchapter_mappings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_subchapter_mappings" ADD CONSTRAINT "video_subchapter_mappings_video_id_learning_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."learning_videos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_subchapter_mappings" ADD CONSTRAINT "video_subchapter_mappings_subchapter_id_subchapters_id_fk" FOREIGN KEY ("subchapter_id") REFERENCES "public"."subchapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Domain data is served by the API, including the existing Drill tables.
-- Plain PostgreSQL test databases do not define Supabase roles.
DO $lockdown$
DECLARE
  client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', client_role);
    END IF;
  END LOOP;
END
$lockdown$;--> statement-breakpoint
ALTER TABLE public.leaderboard_periods
  ADD CONSTRAINT leaderboard_periods_no_overlap_excl
  EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&);

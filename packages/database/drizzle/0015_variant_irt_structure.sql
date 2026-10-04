CREATE TYPE "public"."assessment_purpose" AS ENUM('REGULAR', 'ORIGINAL_PILOT', 'VARIANT_AB');--> statement-breakpoint
CREATE TYPE "public"."comparison_state" AS ENUM('PENDING', 'INSUFFICIENT', 'PASS', 'DRIFT', 'NOT_COMPARABLE', 'ANOMALY');--> statement-breakpoint
CREATE TYPE "public"."configuration_state" AS ENUM('DRAFT', 'SEALED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."distribution_state" AS ENUM('PROVISIONAL', 'READY', 'HOLD', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."measurement_state" AS ENUM('UNCALIBRATED', 'INSUFFICIENT', 'CALIBRATION_FAILED', 'CALIBRATED', 'WATCH', 'DRIFT', 'ANOMALY');--> statement-breakpoint
CREATE TYPE "public"."response_state" AS ENUM('RESPONDED', 'OMITTED', 'NOT_PRESENTED', 'INVALID');--> statement-breakpoint
CREATE TYPE "public"."content_validation_state" AS ENUM('DRAFT', 'CONTENT_VALID', 'REVIEW', 'QUARANTINED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "irt_item_step_parameters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_result_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"value" numeric NOT NULL,
	"standard_error" numeric,
	CONSTRAINT "irt_item_step_parameters_bounds_ck" CHECK ("irt_item_step_parameters"."step" > 0 and ("irt_item_step_parameters"."standard_error" is null or "irt_item_step_parameters"."standard_error" >= 0))
);
--> statement-breakpoint
ALTER TABLE "irt_item_step_parameters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assessment_blueprint_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"digest" text NOT NULL,
	"status" "configuration_state" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_blueprint_versions_version_ck" CHECK ("assessment_blueprint_versions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "assessment_blueprint_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "irt_compute"."generator_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"digest" text NOT NULL,
	"status" "configuration_state" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generator_templates_version_ck" CHECK ("irt_compute"."generator_templates"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "irt_compute"."generator_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scoring_rubric_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"question_type" text NOT NULL,
	"maximum_score_category" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"digest" text NOT NULL,
	"status" "configuration_state" DEFAULT 'DRAFT' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_rubric_versions_bounds_ck" CHECK ("scoring_rubric_versions"."version" > 0 and "scoring_rubric_versions"."maximum_score_category" > 0),
	CONSTRAINT "scoring_rubric_versions_type_ck" CHECK ("scoring_rubric_versions"."question_type" in ('SINGLE_CHOICE','MULTIPLE_CHOICE_MULTIPLE_ANSWER','CATEGORY')),
	CONSTRAINT "scoring_rubric_versions_approval_ck" CHECK ("scoring_rubric_versions"."status" <> 'SEALED' or ("scoring_rubric_versions"."approved_by_user_id" is not null and "scoring_rubric_versions"."approved_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "scoring_rubric_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_principals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_principals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "irt_compute"."technical_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"definition" jsonb NOT NULL,
	"digest" text NOT NULL,
	"status" "configuration_state" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_policy_versions_version_ck" CHECK ("irt_compute"."technical_policy_versions"."version" > 0),
	CONSTRAINT "technical_policy_versions_kind_ck" CHECK ("irt_compute"."technical_policy_versions"."kind" in ('VALIDATOR','IRT_MODEL','QUALITY_GATE','COMPARISON','ADJUSTMENT','SCORE_MAPPING','PACKAGE_EVALUATION','TRIAL_REQUIREMENTS'))
);
--> statement-breakpoint
ALTER TABLE "irt_compute"."technical_policy_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "active_parameter_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"rubric_version_id" uuid NOT NULL,
	"item_result_id" uuid NOT NULL,
	"activated_by_user_id" uuid NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_parameter_bindings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "analysis_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_type" text NOT NULL,
	"context_id" uuid NOT NULL,
	"snapshot_id" uuid,
	"wave_item_id" uuid,
	"package_id" uuid,
	"configuration_pins" jsonb NOT NULL,
	"input_digest" text NOT NULL,
	"contract_version" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"due_at" timestamp with time zone,
	"accepted_execution_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_requests_type_ck" CHECK ("analysis_requests"."request_type" in ('CALIBRATE_ORIGINAL','GENERATE_VARIANTS','COMPARE_VARIANTS','EVALUATE_PACKAGE','MONITOR_PRODUCTION','CALIBRATE_TRYOUT')),
	CONSTRAINT "analysis_requests_status_ck" CHECK ("analysis_requests"."status" in ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
	CONSTRAINT "analysis_requests_input_ck" CHECK (("analysis_requests"."request_type" = 'GENERATE_VARIANTS' and "analysis_requests"."wave_item_id" is not null) or ("analysis_requests"."request_type" = 'EVALUATE_PACKAGE' and "analysis_requests"."package_id" is not null) or ("analysis_requests"."request_type" in ('CALIBRATE_ORIGINAL','COMPARE_VARIANTS','MONITOR_PRODUCTION','CALIBRATE_TRYOUT') and "analysis_requests"."snapshot_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "analysis_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assessment_errata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"correction_version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"digest" text NOT NULL,
	"approved_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_errata_version_ck" CHECK ("assessment_errata"."correction_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "assessment_errata" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calibration_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"rubric_version_id" uuid NOT NULL,
	"source_item_result_id" uuid NOT NULL,
	"source_output_id" uuid NOT NULL,
	"quality_approval_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"parameter_snapshot" jsonb NOT NULL,
	"uncertainty" jsonb NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calibration_baselines_version_ck" CHECK ("calibration_baselines"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "calibration_baselines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "candidate_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"payload_digest" text NOT NULL,
	"imported_by_user_id" uuid,
	"imported_by_service_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_imports_actor_ck" CHECK (num_nonnulls("candidate_imports"."imported_by_user_id", "candidate_imports"."imported_by_service_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "candidate_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "configuration_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"technical_policy_version_id" uuid,
	"generator_template_id" uuid,
	"generator_config_id" uuid,
	"approved_digest" text NOT NULL,
	"scope" jsonb NOT NULL,
	"approved_by_user_id" uuid NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuration_approvals_one_target_ck" CHECK (num_nonnulls("configuration_approvals"."technical_policy_version_id", "configuration_approvals"."generator_template_id", "configuration_approvals"."generator_config_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "configuration_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_delivery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manifest_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"attempt_item_id" uuid,
	"pvp_match_question_id" uuid,
	CONSTRAINT "content_delivery_items_source_ck" CHECK (num_nonnulls("content_delivery_items"."attempt_item_id", "content_delivery_items"."pvp_match_question_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "content_delivery_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_delivery_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"module" text NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_delivery_manifests_module_ck" CHECK ("content_delivery_manifests"."module" in ('PRETEST','DRILL','TRYOUT','PVP')),
	CONSTRAINT "content_delivery_manifests_kind_ck" CHECK ("content_delivery_manifests"."kind" in ('ITEM_PAYLOAD_ISSUED','EXPLANATION_PAYLOAD_ISSUED','LEGACY_UNVERIFIED'))
);
--> statement-breakpoint
ALTER TABLE "content_delivery_manifests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_validation_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"state" "content_validation_state" NOT NULL,
	"reviewer_user_id" uuid,
	"service_principal_id" uuid,
	"source_output_id" uuid,
	"configuration_approval_id" uuid,
	"evidence" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_validation_decisions_actor_ck" CHECK (num_nonnulls("content_validation_decisions"."reviewer_user_id", "content_validation_decisions"."service_principal_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "content_validation_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "generation_wave_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wave_id" uuid NOT NULL,
	"original_question_version_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"generator_config_id" uuid NOT NULL,
	"configuration_approval_id" uuid NOT NULL,
	"target_count" integer NOT NULL,
	"max_regenerate_attempts" integer NOT NULL,
	"constraints" jsonb NOT NULL,
	CONSTRAINT "generation_wave_items_counts_ck" CHECK ("generation_wave_items"."target_count" > 0 and "generation_wave_items"."max_regenerate_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "generation_wave_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "generation_waves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"approved_at" timestamp with time zone,
	"constraints" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_waves_status_ck" CHECK ("generation_waves"."status" in ('DRAFT','APPROVED','RUNNING','COMPLETED','STOPPED'))
);
--> statement-breakpoint
ALTER TABLE "generation_waves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "item_distribution_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_version_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"state" "distribution_state" NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"source_output_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_distribution_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "measurement_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ecosystem" text NOT NULL,
	"dimension" text NOT NULL,
	"level_id" uuid,
	"tryout_batch_id" uuid,
	"scale_code" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"replaces_context_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurement_contexts_scope_ck" CHECK (("measurement_contexts"."ecosystem" = 'DRILL' and "measurement_contexts"."level_id" is not null and "measurement_contexts"."tryout_batch_id" is null) or ("measurement_contexts"."ecosystem" = 'TRYOUT' and "measurement_contexts"."tryout_batch_id" is not null and "measurement_contexts"."level_id" is null)),
	CONSTRAINT "measurement_contexts_revision_ck" CHECK ("measurement_contexts"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "measurement_contexts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "monitoring_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"source_output_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"state" "measurement_state" NOT NULL,
	"evidence" jsonb NOT NULL,
	"distribution_decision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitoring_findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outbox_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbox_id" uuid NOT NULL,
	"consumer" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"retry_at" timestamp with time zone,
	"failure_code" text,
	CONSTRAINT "outbox_deliveries_attempts_ck" CHECK ("outbox_deliveries"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "outbox_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "package_quality_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"blueprint_version_id" uuid NOT NULL,
	"source_output_id" uuid NOT NULL,
	"evaluation_approval_id" uuid NOT NULL,
	"package_digest" text NOT NULL,
	"decision" "comparison_state" NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "package_quality_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reference_set_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_set_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"rubric_version_id" uuid NOT NULL,
	"source_item_result_id" uuid NOT NULL,
	"parameter_snapshot" jsonb NOT NULL,
	"uncertainty" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reference_set_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reference_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"source_output_id" uuid NOT NULL,
	"quality_approval_id" uuid NOT NULL,
	"evidence" jsonb NOT NULL,
	"digest" text NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_sets_version_ck" CHECK ("reference_sets"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "reference_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "response_snapshot_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"respondent_id" text NOT NULL,
	"attempt_id" uuid NOT NULL,
	"attempt_item_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"rubric_version_id" uuid NOT NULL,
	"assignment_id" uuid,
	"arm" text,
	"raw_answer" jsonb,
	"score_category" integer,
	"maximum_score_category" integer NOT NULL,
	"fully_correct" boolean,
	"awarded_points" numeric,
	"max_points" numeric NOT NULL,
	"response_state" text NOT NULL,
	"operational_eligible" boolean NOT NULL,
	"operational_exclusion_reasons" jsonb NOT NULL,
	"exposure_facts" jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "response_snapshot_items_category_ck" CHECK ("response_snapshot_items"."maximum_score_category" > 0 and ("response_snapshot_items"."score_category" is null or "response_snapshot_items"."score_category" between 0 and "response_snapshot_items"."maximum_score_category")),
	CONSTRAINT "response_snapshot_items_state_ck" CHECK ("response_snapshot_items"."response_state" in ('RESPONDED','OMITTED','NOT_PRESENTED','INVALID')),
	CONSTRAINT "response_snapshot_items_points_ck" CHECK ("response_snapshot_items"."max_points" > 0 and ("response_snapshot_items"."awarded_points" is null or "response_snapshot_items"."awarded_points" between 0 and "response_snapshot_items"."max_points"))
);
--> statement-breakpoint
ALTER TABLE "response_snapshot_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "response_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context_id" uuid NOT NULL,
	"phase_id" uuid,
	"status" text DEFAULT 'BUILDING' NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"policy" jsonb NOT NULL,
	"policy_digest" text NOT NULL,
	"respondent_key_version" text NOT NULL,
	"digest" text,
	"row_count" integer,
	"frozen_at" timestamp with time zone,
	"replaces_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "response_snapshots_status_ck" CHECK ("response_snapshots"."status" in ('BUILDING','FROZEN')),
	CONSTRAINT "response_snapshots_freeze_ck" CHECK ("response_snapshots"."status" <> 'FROZEN' or ("response_snapshots"."digest" is not null and "response_snapshots"."row_count" >= 0 and "response_snapshots"."frozen_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "response_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_item_exposures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_item_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"module" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_item_exposures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"cohort_member_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"arm" text NOT NULL,
	"allocation_digest" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"counts" jsonb NOT NULL,
	"response_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_checkpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_cohort_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"dropout_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_cohort_members_status_ck" CHECK ("trial_cohort_members"."status" in ('PLANNED','ELIGIBLE','INELIGIBLE','ASSIGNED','COMPLETED','DROPPED'))
);
--> statement-breakpoint
ALTER TABLE "trial_cohort_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"role" text NOT NULL,
	"class_id" uuid,
	"period_starts_at" timestamp with time zone NOT NULL,
	"period_ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_cohorts_role_ck" CHECK ("trial_cohorts"."role" in ('PILOT','AB')),
	CONSTRAINT "trial_cohorts_window_ck" CHECK ("trial_cohorts"."period_ends_at" > "trial_cohorts"."period_starts_at")
);
--> statement-breakpoint
ALTER TABLE "trial_cohorts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_eligibility_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"assignment_id" uuid,
	"eligible" boolean NOT NULL,
	"reasons" jsonb NOT NULL,
	"facts" jsonb NOT NULL,
	"policy_digest" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_eligibility_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_family_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_member_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidating_exposure_id" uuid,
	"reason" text,
	CONSTRAINT "trial_family_reservations_invalid_ck" CHECK (("trial_family_reservations"."invalidated_at" is null and "trial_family_reservations"."invalidating_exposure_id" is null and "trial_family_reservations"."reason" is null) or ("trial_family_reservations"."invalidated_at" is not null and "trial_family_reservations"."invalidating_exposure_id" is not null and "trial_family_reservations"."reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "trial_family_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_phase_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"arm" text NOT NULL,
	CONSTRAINT "trial_phase_packages_arm_ck" CHECK ("trial_phase_packages"."arm" in ('PILOT','A','B'))
);
--> statement-breakpoint
ALTER TABLE "trial_phase_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"purpose" "assessment_purpose" NOT NULL,
	"candidate_question_version_id" uuid,
	"baseline_id" uuid,
	"reference_set_id" uuid,
	"blueprint_version_id" uuid NOT NULL,
	"comparison_policy_id" uuid,
	"operational_policy" jsonb NOT NULL,
	"operational_policy_digest" text NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"opens_at" timestamp with time zone,
	"cutoff_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_phases_purpose_ck" CHECK ("trial_phases"."purpose" <> 'REGULAR'),
	CONSTRAINT "trial_phases_status_ck" CHECK ("trial_phases"."status" in ('PLANNED','OPEN','CLOSED','CANCELLED')),
	CONSTRAINT "trial_phases_ab_pins_ck" CHECK ("trial_phases"."purpose" <> 'VARIANT_AB' or "trial_phases"."status" = 'PLANNED' or ("trial_phases"."candidate_question_version_id" is not null and "trial_phases"."baseline_id" is not null and "trial_phases"."reference_set_id" is not null and "trial_phases"."comparison_policy_id" is not null)),
	CONSTRAINT "trial_phases_pilot_ck" CHECK ("trial_phases"."purpose" <> 'ORIGINAL_PILOT' or "trial_phases"."candidate_question_version_id" is null),
	CONSTRAINT "trial_phases_window_ck" CHECK ("trial_phases"."cutoff_at" is null or ("trial_phases"."opens_at" is not null and "trial_phases"."cutoff_at" > "trial_phases"."opens_at"))
);
--> statement-breakpoint
ALTER TABLE "trial_phases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trial_studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context_id" uuid NOT NULL,
	"original_question_version_id" uuid NOT NULL,
	"requirements_policy_id" uuid NOT NULL,
	"requirements_approval_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_studies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tryout_attempt_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finalization_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"score" numeric,
	"theta" numeric,
	"standard_error" numeric,
	"raw_points" numeric,
	"maximum_points" numeric,
	"rank" integer,
	"percentile" numeric,
	"coverage" jsonb NOT NULL,
	CONSTRAINT "tryout_attempt_results_bounds_ck" CHECK (("tryout_attempt_results"."rank" is null or "tryout_attempt_results"."rank" > 0) and ("tryout_attempt_results"."percentile" is null or "tryout_attempt_results"."percentile" between 0 and 100) and ("tryout_attempt_results"."standard_error" is null or "tryout_attempt_results"."standard_error" >= 0))
);
--> statement-breakpoint
ALTER TABLE "tryout_attempt_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tryout_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"result_due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"release_policy" jsonb,
	"release_policy_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tryout_batches_status_ck" CHECK ("tryout_batches"."status" in ('PLANNED','OPEN','CLOSED','PROCESSING','PUBLISHED')),
	CONSTRAINT "tryout_batches_window_ck" CHECK ("tryout_batches"."closes_at" > "tryout_batches"."starts_at" and "tryout_batches"."cutoff_at" >= "tryout_batches"."closes_at" and "tryout_batches"."result_due_at" = "tryout_batches"."closes_at" + interval '72 hours')
);
--> statement-breakpoint
ALTER TABLE "tryout_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tryout_finalization_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finalization_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"included" boolean NOT NULL,
	"max_points" numeric NOT NULL,
	"reason" text NOT NULL,
	"erratum_id" uuid,
	CONSTRAINT "tryout_finalization_items_points_ck" CHECK ("tryout_finalization_items"."max_points" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tryout_finalization_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tryout_result_finalizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"mode" text NOT NULL,
	"source_output_id" uuid,
	"scoring_policy_version_id" uuid NOT NULL,
	"mapping_approval_id" uuid,
	"policy_snapshot" jsonb NOT NULL,
	"digest" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tryout_result_finalizations_mode_ck" CHECK ("tryout_result_finalizations"."mode" in ('IRT','FALLBACK','UNSCORABLE')),
	CONSTRAINT "tryout_result_finalizations_irt_ck" CHECK ("tryout_result_finalizations"."mode" <> 'IRT' or ("tryout_result_finalizations"."source_output_id" is not null and "tryout_result_finalizations"."mapping_approval_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "tryout_result_finalizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "irt_compute"."adjustment_iterations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_output_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"replacement_candidate_id" uuid,
	"from_config_id" uuid NOT NULL,
	"to_config_id" uuid,
	"policy_id" uuid NOT NULL,
	"iteration" integer NOT NULL,
	"changes" jsonb NOT NULL,
	"stop_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adjustment_iterations_iteration_ck" CHECK ("irt_compute"."adjustment_iterations"."iteration" > 0)
);
--> statement-breakpoint
ALTER TABLE "irt_compute"."adjustment_iterations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "irt_compute"."analysis_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"selection_policy_id" uuid NOT NULL,
	"status" text DEFAULT 'BUILDING' NOT NULL,
	"digest" text,
	"selected_count" integer,
	"sealed_at" timestamp with time zone,
	CONSTRAINT "analysis_datasets_status_ck" CHECK ("irt_compute"."analysis_datasets"."status" in ('BUILDING','SEALED')),
	CONSTRAINT "analysis_datasets_sealed_ck" CHECK ("irt_compute"."analysis_datasets"."status" <> 'SEALED' or ("irt_compute"."analysis_datasets"."digest" is not null and "irt_compute"."analysis_datasets"."selected_count" >= 0 and "irt_compute"."analysis_datasets"."sealed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "irt_compute"."analysis_datasets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "irt_compute"."analysis_response_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"snapshot_item_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reasons" jsonb NOT NULL,
	CONSTRAINT "analysis_response_selections_decision_ck" CHECK ("irt_compute"."analysis_response_selections"."decision" in ('INCLUDE','EXCLUDE'))
);
--> statement-breakpoint
ALTER TABLE "irt_compute"."analysis_response_selections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "irt_compute"."candidate_validation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"validator_policy_id" uuid NOT NULL,
	"source_output_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"checks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_validation_results_decision_ck" CHECK ("irt_compute"."candidate_validation_results"."decision" in ('CONTENT_VALID','REVIEW','QUARANTINED'))
);
--> statement-breakpoint
ALTER TABLE "irt_compute"."candidate_validation_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "irt_compute"."compute_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"fencing_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"service_principal_id" uuid NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"failure_code" text,
	CONSTRAINT "compute_executions_attempt_ck" CHECK ("irt_compute"."compute_executions"."attempt_number" > 0),
	CONSTRAINT "compute_executions_status_ck" CHECK ("irt_compute"."compute_executions"."status" in ('RUNNING','SUCCEEDED','FAILED','EXPIRED')),
	CONSTRAINT "compute_executions_finished_ck" CHECK (("irt_compute"."compute_executions"."status" = 'RUNNING' and "irt_compute"."compute_executions"."finished_at" is null) or ("irt_compute"."compute_executions"."status" <> 'RUNNING' and "irt_compute"."compute_executions"."finished_at" >= "irt_compute"."compute_executions"."started_at"))
);
--> statement-breakpoint
ALTER TABLE "irt_compute"."compute_executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "irt_compute"."compute_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"dataset_id" uuid,
	"kind" text NOT NULL,
	"sequence_number" integer DEFAULT 1 NOT NULL,
	"contract_version" integer DEFAULT 3 NOT NULL,
	"input_digest" text NOT NULL,
	"digest" text NOT NULL,
	"payload" jsonb NOT NULL,
	"scientific_decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compute_outputs_sequence_ck" CHECK ("irt_compute"."compute_outputs"."sequence_number" > 0 and "irt_compute"."compute_outputs"."contract_version" >= 3),
	CONSTRAINT "compute_outputs_decision_ck" CHECK ("irt_compute"."compute_outputs"."scientific_decision" in ('PASS','DRIFT','ANOMALY','INSUFFICIENT','CALIBRATION_FAILED','NOT_COMPARABLE','CONTENT_VALID','REVIEW','TRYOUT_QUALITY_PASS'))
);
--> statement-breakpoint
ALTER TABLE "irt_compute"."compute_outputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "question_versions" DROP CONSTRAINT "question_versions_review_ck";--> statement-breakpoint
ALTER TABLE "irt_item_results" DROP CONSTRAINT "irt_item_results_insufficient_ck";--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_runs" DROP CONSTRAINT "generation_runs_finished_ck";--> statement-breakpoint
ALTER TABLE "irt_compute"."generator_configs" DROP CONSTRAINT "generator_configs_version_ck";--> statement-breakpoint
DROP INDEX "assessment_attempts_drill_active_uq";--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ALTER COLUMN "candidate_question_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "parent_original_question_version_id" uuid;--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "revised_from_question_version_id" uuid;--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "level_id" uuid;--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "scoring_rubric_version_id" uuid;--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "content_fingerprint" text;--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "validation_state" "content_validation_state" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_versions" ADD COLUMN "validation_decision_id" uuid;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD COLUMN "purpose" "assessment_purpose" DEFAULT 'REGULAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD COLUMN "phase_id" uuid;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD COLUMN "trial_assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD COLUMN "purpose" "assessment_purpose" DEFAULT 'REGULAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD COLUMN "blueprint_version_id" uuid;--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD COLUMN "manifest_digest" text;--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD COLUMN "frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD COLUMN "score_category" integer;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD COLUMN "fully_correct" boolean;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD COLUMN "response_state" "response_state";--> statement-breakpoint
ALTER TABLE "attempt_items" ADD COLUMN "rubric_version_id" uuid;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD COLUMN "maximum_score_category" integer;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD COLUMN "item_role" text DEFAULT 'REGULAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "package_items" ADD COLUMN "rubric_version_id" uuid;--> statement-breakpoint
ALTER TABLE "package_items" ADD COLUMN "maximum_score_category" integer;--> statement-breakpoint
ALTER TABLE "package_items" ADD COLUMN "item_role" text DEFAULT 'REGULAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "irt_batches" ADD COLUMN "context_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_batches" ADD COLUMN "response_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_batches" ADD COLUMN "analysis_request_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_batches" ADD COLUMN "source_output_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_item_results" ADD COLUMN "model_family" text DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
ALTER TABLE "irt_item_results" ADD COLUMN "rubric_version_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_item_results" ADD COLUMN "eligible_respondent_count" integer;--> statement-breakpoint
ALTER TABLE "irt_item_results" ADD COLUMN "measurement_state" "measurement_state" DEFAULT 'UNCALIBRATED' NOT NULL;--> statement-breakpoint
ALTER TABLE "irt_item_results" ADD COLUMN "quality_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD COLUMN "phase_id" uuid;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD COLUMN "baseline_id" uuid;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD COLUMN "reference_set_id" uuid;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD COLUMN "source_output_id" uuid;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD COLUMN "control_item_result_id" uuid;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD COLUMN "candidate_item_result_id" uuid;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD COLUMN "comparison_state" "comparison_state";--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD COLUMN "evidence" jsonb;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_runs" ADD COLUMN "wave_item_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_runs" ADD COLUMN "execution_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ADD COLUMN "parent_original_question_version_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ADD COLUMN "replacement_of_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ADD COLUMN "payload_digest" text;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ADD COLUMN "random_seed" text;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ADD COLUMN "parameter_values" jsonb;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ADD COLUMN "sealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "irt_compute"."generator_configs" ADD COLUMN "template_version_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_compute"."generator_configs" ADD COLUMN "context_id" uuid;--> statement-breakpoint
ALTER TABLE "irt_compute"."generator_configs" ADD COLUMN "digest" text;--> statement-breakpoint
ALTER TABLE "irt_compute"."generator_configs" ADD COLUMN "status" "configuration_state" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "irt_item_step_parameters_step_uq" ON "irt_item_step_parameters" USING btree ("item_result_id","step");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_blueprint_versions_code_version_uq" ON "assessment_blueprint_versions" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "generator_templates_code_version_uq" ON "irt_compute"."generator_templates" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_rubric_versions_code_version_uq" ON "scoring_rubric_versions" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "service_principals_code_uq" ON "service_principals" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "technical_policy_versions_code_version_uq" ON "irt_compute"."technical_policy_versions" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "active_parameter_bindings_scope_uq" ON "active_parameter_bindings" USING btree ("context_id","question_version_id","rubric_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_requests_idempotency_uq" ON "analysis_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_errata_version_uq" ON "assessment_errata" USING btree ("question_version_id","correction_version");--> statement-breakpoint
CREATE UNIQUE INDEX "calibration_baselines_version_uq" ON "calibration_baselines" USING btree ("context_id","question_version_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_imports_candidate_uq" ON "candidate_imports" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_imports_version_uq" ON "candidate_imports" USING btree ("question_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_delivery_items_manifest_version_uq" ON "content_delivery_items" USING btree ("manifest_id","question_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_delivery_manifests_key_uq" ON "content_delivery_manifests" USING btree ("student_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_wave_items_scope_uq" ON "generation_wave_items" USING btree ("wave_id","original_question_version_id","context_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_waves_code_uq" ON "generation_waves" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_contexts_scale_revision_uq" ON "measurement_contexts" USING btree ("scale_code","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_contexts_id_ecosystem_uq" ON "measurement_contexts" USING btree ("id","ecosystem");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_deliveries_consumer_uq" ON "outbox_deliveries" USING btree ("outbox_id","consumer");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_set_items_version_uq" ON "reference_set_items" USING btree ("reference_set_id","question_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_sets_context_version_uq" ON "reference_sets" USING btree ("context_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "response_snapshot_items_source_uq" ON "response_snapshot_items" USING btree ("snapshot_id","attempt_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "response_snapshot_items_id_snapshot_uq" ON "response_snapshot_items" USING btree ("id","snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_item_exposures_delivery_uq" ON "student_item_exposures" USING btree ("delivery_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_assignments_student_phase_uq" ON "trial_assignments" USING btree ("phase_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_assignments_scope_uq" ON "trial_assignments" USING btree ("id","student_id","package_id","phase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_checkpoints_cutoff_uq" ON "trial_checkpoints" USING btree ("phase_id","cutoff_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_cohort_members_student_uq" ON "trial_cohort_members" USING btree ("cohort_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_family_reservations_member_family_uq" ON "trial_family_reservations" USING btree ("cohort_member_id","family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_phase_packages_package_uq" ON "trial_phase_packages" USING btree ("phase_id","package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_phase_packages_identity_uq" ON "trial_phase_packages" USING btree ("phase_id","package_id","arm");--> statement-breakpoint
CREATE UNIQUE INDEX "tryout_attempt_results_attempt_uq" ON "tryout_attempt_results" USING btree ("finalization_id","attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tryout_batches_package_uq" ON "tryout_batches" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tryout_finalization_items_version_uq" ON "tryout_finalization_items" USING btree ("finalization_id","question_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tryout_result_finalizations_version_uq" ON "tryout_result_finalizations" USING btree ("batch_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "tryout_result_finalizations_published_uq" ON "tryout_result_finalizations" USING btree ("batch_id") WHERE "tryout_result_finalizations"."published_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "adjustment_iterations_candidate_iteration_uq" ON "irt_compute"."adjustment_iterations" USING btree ("candidate_id","iteration");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_datasets_id_snapshot_uq" ON "irt_compute"."analysis_datasets" USING btree ("id","snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_response_selections_source_uq" ON "irt_compute"."analysis_response_selections" USING btree ("dataset_id","snapshot_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compute_executions_request_attempt_uq" ON "irt_compute"."compute_executions" USING btree ("request_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "compute_executions_request_active_uq" ON "irt_compute"."compute_executions" USING btree ("request_id") WHERE "irt_compute"."compute_executions"."status" = 'RUNNING';--> statement-breakpoint
CREATE UNIQUE INDEX "compute_executions_id_request_uq" ON "irt_compute"."compute_executions" USING btree ("id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compute_outputs_execution_kind_sequence_uq" ON "irt_compute"."compute_outputs" USING btree ("execution_id","kind","sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "question_variants_original_family_uq" ON "question_variants" USING btree ("question_id") WHERE "question_variants"."kind" = 'ORIGINAL';--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_attempts_trial_assignment_uq" ON "assessment_attempts" USING btree ("trial_assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_packages_id_purpose_uq" ON "assessment_packages" USING btree ("id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_attempts_drill_active_uq" ON "assessment_attempts" USING btree ("student_id","level_id_at_start") WHERE "assessment_attempts"."assessment_type" = 'DRILL' and "assessment_attempts"."purpose" = 'REGULAR' and "assessment_attempts"."status" = 'IN_PROGRESS';--> statement-breakpoint
ALTER TABLE "irt_item_step_parameters" ADD CONSTRAINT "irt_item_step_parameters_item_result_id_irt_item_results_id_fk" FOREIGN KEY ("item_result_id") REFERENCES "public"."irt_item_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_rubric_versions" ADD CONSTRAINT "scoring_rubric_versions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_parameter_bindings" ADD CONSTRAINT "active_parameter_bindings_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_parameter_bindings" ADD CONSTRAINT "active_parameter_bindings_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_parameter_bindings" ADD CONSTRAINT "active_parameter_bindings_rubric_version_id_scoring_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."scoring_rubric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_parameter_bindings" ADD CONSTRAINT "active_parameter_bindings_item_result_id_irt_item_results_id_fk" FOREIGN KEY ("item_result_id") REFERENCES "public"."irt_item_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_parameter_bindings" ADD CONSTRAINT "active_parameter_bindings_activated_by_user_id_users_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_snapshot_id_response_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."response_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_wave_item_id_generation_wave_items_id_fk" FOREIGN KEY ("wave_item_id") REFERENCES "public"."generation_wave_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_accepted_execution_id_compute_executions_id_fk" FOREIGN KEY ("accepted_execution_id") REFERENCES "irt_compute"."compute_executions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_errata" ADD CONSTRAINT "assessment_errata_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_errata" ADD CONSTRAINT "assessment_errata_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_baselines" ADD CONSTRAINT "calibration_baselines_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_baselines" ADD CONSTRAINT "calibration_baselines_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_baselines" ADD CONSTRAINT "calibration_baselines_rubric_version_id_scoring_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."scoring_rubric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_baselines" ADD CONSTRAINT "calibration_baselines_source_item_result_id_irt_item_results_id_fk" FOREIGN KEY ("source_item_result_id") REFERENCES "public"."irt_item_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_baselines" ADD CONSTRAINT "calibration_baselines_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_baselines" ADD CONSTRAINT "calibration_baselines_quality_approval_id_configuration_approvals_id_fk" FOREIGN KEY ("quality_approval_id") REFERENCES "public"."configuration_approvals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_imports" ADD CONSTRAINT "candidate_imports_candidate_id_generation_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "irt_compute"."generation_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_imports" ADD CONSTRAINT "candidate_imports_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_imports" ADD CONSTRAINT "candidate_imports_imported_by_user_id_users_id_fk" FOREIGN KEY ("imported_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_imports" ADD CONSTRAINT "candidate_imports_imported_by_service_id_service_principals_id_fk" FOREIGN KEY ("imported_by_service_id") REFERENCES "public"."service_principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_approvals" ADD CONSTRAINT "configuration_approvals_technical_policy_version_id_technical_policy_versions_id_fk" FOREIGN KEY ("technical_policy_version_id") REFERENCES "irt_compute"."technical_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_approvals" ADD CONSTRAINT "configuration_approvals_generator_template_id_generator_templates_id_fk" FOREIGN KEY ("generator_template_id") REFERENCES "irt_compute"."generator_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_approvals" ADD CONSTRAINT "configuration_approvals_generator_config_id_generator_configs_id_fk" FOREIGN KEY ("generator_config_id") REFERENCES "irt_compute"."generator_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_approvals" ADD CONSTRAINT "configuration_approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_delivery_items" ADD CONSTRAINT "content_delivery_items_manifest_id_content_delivery_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."content_delivery_manifests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_delivery_items" ADD CONSTRAINT "content_delivery_items_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_delivery_items" ADD CONSTRAINT "content_delivery_items_family_id_questions_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_delivery_items" ADD CONSTRAINT "content_delivery_items_attempt_item_id_attempt_items_id_fk" FOREIGN KEY ("attempt_item_id") REFERENCES "public"."attempt_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_delivery_manifests" ADD CONSTRAINT "content_delivery_manifests_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_validation_decisions" ADD CONSTRAINT "content_validation_decisions_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_validation_decisions" ADD CONSTRAINT "content_validation_decisions_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_validation_decisions" ADD CONSTRAINT "content_validation_decisions_service_principal_id_service_principals_id_fk" FOREIGN KEY ("service_principal_id") REFERENCES "public"."service_principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_validation_decisions" ADD CONSTRAINT "content_validation_decisions_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_validation_decisions" ADD CONSTRAINT "content_validation_decisions_configuration_approval_id_configuration_approvals_id_fk" FOREIGN KEY ("configuration_approval_id") REFERENCES "public"."configuration_approvals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_wave_items" ADD CONSTRAINT "generation_wave_items_wave_id_generation_waves_id_fk" FOREIGN KEY ("wave_id") REFERENCES "public"."generation_waves"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_wave_items" ADD CONSTRAINT "generation_wave_items_original_question_version_id_question_versions_id_fk" FOREIGN KEY ("original_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_wave_items" ADD CONSTRAINT "generation_wave_items_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_wave_items" ADD CONSTRAINT "generation_wave_items_generator_config_id_generator_configs_id_fk" FOREIGN KEY ("generator_config_id") REFERENCES "irt_compute"."generator_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_wave_items" ADD CONSTRAINT "generation_wave_items_configuration_approval_id_configuration_approvals_id_fk" FOREIGN KEY ("configuration_approval_id") REFERENCES "public"."configuration_approvals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_waves" ADD CONSTRAINT "generation_waves_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_distribution_decisions" ADD CONSTRAINT "item_distribution_decisions_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_distribution_decisions" ADD CONSTRAINT "item_distribution_decisions_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_distribution_decisions" ADD CONSTRAINT "item_distribution_decisions_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_contexts" ADD CONSTRAINT "measurement_contexts_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_contexts" ADD CONSTRAINT "measurement_contexts_tryout_batch_id_tryout_batches_id_fk" FOREIGN KEY ("tryout_batch_id") REFERENCES "public"."tryout_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_contexts" ADD CONSTRAINT "measurement_contexts_replaces_context_id_measurement_contexts_id_fk" FOREIGN KEY ("replaces_context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_findings" ADD CONSTRAINT "monitoring_findings_request_id_analysis_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."analysis_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_findings" ADD CONSTRAINT "monitoring_findings_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_findings" ADD CONSTRAINT "monitoring_findings_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_findings" ADD CONSTRAINT "monitoring_findings_distribution_decision_id_item_distribution_decisions_id_fk" FOREIGN KEY ("distribution_decision_id") REFERENCES "public"."item_distribution_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_deliveries" ADD CONSTRAINT "outbox_deliveries_outbox_id_analytics_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."analytics_outbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_quality_results" ADD CONSTRAINT "package_quality_results_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_quality_results" ADD CONSTRAINT "package_quality_results_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_quality_results" ADD CONSTRAINT "package_quality_results_blueprint_version_id_assessment_blueprint_versions_id_fk" FOREIGN KEY ("blueprint_version_id") REFERENCES "public"."assessment_blueprint_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_quality_results" ADD CONSTRAINT "package_quality_results_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_quality_results" ADD CONSTRAINT "package_quality_results_evaluation_approval_id_configuration_approvals_id_fk" FOREIGN KEY ("evaluation_approval_id") REFERENCES "public"."configuration_approvals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_set_items" ADD CONSTRAINT "reference_set_items_reference_set_id_reference_sets_id_fk" FOREIGN KEY ("reference_set_id") REFERENCES "public"."reference_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_set_items" ADD CONSTRAINT "reference_set_items_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_set_items" ADD CONSTRAINT "reference_set_items_rubric_version_id_scoring_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."scoring_rubric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_set_items" ADD CONSTRAINT "reference_set_items_source_item_result_id_irt_item_results_id_fk" FOREIGN KEY ("source_item_result_id") REFERENCES "public"."irt_item_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_sets" ADD CONSTRAINT "reference_sets_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_sets" ADD CONSTRAINT "reference_sets_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_sets" ADD CONSTRAINT "reference_sets_quality_approval_id_configuration_approvals_id_fk" FOREIGN KEY ("quality_approval_id") REFERENCES "public"."configuration_approvals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_snapshot_items" ADD CONSTRAINT "response_snapshot_items_snapshot_id_response_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."response_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_snapshot_items" ADD CONSTRAINT "response_snapshot_items_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_snapshot_items" ADD CONSTRAINT "response_snapshot_items_attempt_item_id_attempt_items_id_fk" FOREIGN KEY ("attempt_item_id") REFERENCES "public"."attempt_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_snapshot_items" ADD CONSTRAINT "response_snapshot_items_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_snapshot_items" ADD CONSTRAINT "response_snapshot_items_rubric_version_id_scoring_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."scoring_rubric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_snapshot_items" ADD CONSTRAINT "response_snapshot_items_assignment_id_trial_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."trial_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_snapshots" ADD CONSTRAINT "response_snapshots_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_snapshots" ADD CONSTRAINT "response_snapshots_phase_id_trial_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."trial_phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_snapshots" ADD CONSTRAINT "response_snapshots_replaces_snapshot_id_response_snapshots_id_fk" FOREIGN KEY ("replaces_snapshot_id") REFERENCES "public"."response_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_item_exposures" ADD CONSTRAINT "student_item_exposures_delivery_item_id_content_delivery_items_id_fk" FOREIGN KEY ("delivery_item_id") REFERENCES "public"."content_delivery_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_item_exposures" ADD CONSTRAINT "student_item_exposures_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_item_exposures" ADD CONSTRAINT "student_item_exposures_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_item_exposures" ADD CONSTRAINT "student_item_exposures_family_id_questions_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_assignments" ADD CONSTRAINT "trial_assignments_phase_id_trial_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."trial_phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_assignments" ADD CONSTRAINT "trial_assignments_cohort_member_id_trial_cohort_members_id_fk" FOREIGN KEY ("cohort_member_id") REFERENCES "public"."trial_cohort_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_assignments" ADD CONSTRAINT "trial_assignments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_assignments" ADD CONSTRAINT "trial_assignments_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_assignments" ADD CONSTRAINT "trial_assignments_phase_package_fk" FOREIGN KEY ("phase_id","package_id","arm") REFERENCES "public"."trial_phase_packages"("phase_id","package_id","arm") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_checkpoints" ADD CONSTRAINT "trial_checkpoints_phase_id_trial_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."trial_phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_checkpoints" ADD CONSTRAINT "trial_checkpoints_response_snapshot_id_response_snapshots_id_fk" FOREIGN KEY ("response_snapshot_id") REFERENCES "public"."response_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_cohort_members" ADD CONSTRAINT "trial_cohort_members_cohort_id_trial_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."trial_cohorts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_cohort_members" ADD CONSTRAINT "trial_cohort_members_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_cohorts" ADD CONSTRAINT "trial_cohorts_study_id_trial_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."trial_studies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_cohorts" ADD CONSTRAINT "trial_cohorts_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_eligibility_snapshots" ADD CONSTRAINT "trial_eligibility_snapshots_phase_id_trial_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."trial_phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_eligibility_snapshots" ADD CONSTRAINT "trial_eligibility_snapshots_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_eligibility_snapshots" ADD CONSTRAINT "trial_eligibility_snapshots_assignment_id_trial_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."trial_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_family_reservations" ADD CONSTRAINT "trial_family_reservations_cohort_member_id_trial_cohort_members_id_fk" FOREIGN KEY ("cohort_member_id") REFERENCES "public"."trial_cohort_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_family_reservations" ADD CONSTRAINT "trial_family_reservations_family_id_questions_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_family_reservations" ADD CONSTRAINT "trial_family_reservations_invalidating_exposure_id_student_item_exposures_id_fk" FOREIGN KEY ("invalidating_exposure_id") REFERENCES "public"."student_item_exposures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_phase_packages" ADD CONSTRAINT "trial_phase_packages_phase_id_trial_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."trial_phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_phase_packages" ADD CONSTRAINT "trial_phase_packages_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_phases" ADD CONSTRAINT "trial_phases_study_id_trial_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."trial_studies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_phases" ADD CONSTRAINT "trial_phases_candidate_question_version_id_question_versions_id_fk" FOREIGN KEY ("candidate_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_phases" ADD CONSTRAINT "trial_phases_baseline_id_calibration_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."calibration_baselines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_phases" ADD CONSTRAINT "trial_phases_reference_set_id_reference_sets_id_fk" FOREIGN KEY ("reference_set_id") REFERENCES "public"."reference_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_phases" ADD CONSTRAINT "trial_phases_blueprint_version_id_assessment_blueprint_versions_id_fk" FOREIGN KEY ("blueprint_version_id") REFERENCES "public"."assessment_blueprint_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_phases" ADD CONSTRAINT "trial_phases_comparison_policy_id_technical_policy_versions_id_fk" FOREIGN KEY ("comparison_policy_id") REFERENCES "irt_compute"."technical_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_studies" ADD CONSTRAINT "trial_studies_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_studies" ADD CONSTRAINT "trial_studies_original_question_version_id_question_versions_id_fk" FOREIGN KEY ("original_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_studies" ADD CONSTRAINT "trial_studies_requirements_policy_id_technical_policy_versions_id_fk" FOREIGN KEY ("requirements_policy_id") REFERENCES "irt_compute"."technical_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_studies" ADD CONSTRAINT "trial_studies_requirements_approval_id_configuration_approvals_id_fk" FOREIGN KEY ("requirements_approval_id") REFERENCES "public"."configuration_approvals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_attempt_results" ADD CONSTRAINT "tryout_attempt_results_finalization_id_tryout_result_finalizations_id_fk" FOREIGN KEY ("finalization_id") REFERENCES "public"."tryout_result_finalizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_attempt_results" ADD CONSTRAINT "tryout_attempt_results_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_batches" ADD CONSTRAINT "tryout_batches_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_finalization_items" ADD CONSTRAINT "tryout_finalization_items_finalization_id_tryout_result_finalizations_id_fk" FOREIGN KEY ("finalization_id") REFERENCES "public"."tryout_result_finalizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_finalization_items" ADD CONSTRAINT "tryout_finalization_items_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_finalization_items" ADD CONSTRAINT "tryout_finalization_items_erratum_id_assessment_errata_id_fk" FOREIGN KEY ("erratum_id") REFERENCES "public"."assessment_errata"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_result_finalizations" ADD CONSTRAINT "tryout_result_finalizations_batch_id_tryout_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."tryout_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_result_finalizations" ADD CONSTRAINT "tryout_result_finalizations_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_result_finalizations" ADD CONSTRAINT "tryout_result_finalizations_scoring_policy_version_id_scoring_policy_versions_id_fk" FOREIGN KEY ("scoring_policy_version_id") REFERENCES "public"."scoring_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_result_finalizations" ADD CONSTRAINT "tryout_result_finalizations_mapping_approval_id_configuration_approvals_id_fk" FOREIGN KEY ("mapping_approval_id") REFERENCES "public"."configuration_approvals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."adjustment_iterations" ADD CONSTRAINT "adjustment_iterations_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."adjustment_iterations" ADD CONSTRAINT "adjustment_iterations_candidate_id_generation_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "irt_compute"."generation_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."adjustment_iterations" ADD CONSTRAINT "adjustment_iterations_replacement_candidate_id_generation_candidates_id_fk" FOREIGN KEY ("replacement_candidate_id") REFERENCES "irt_compute"."generation_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."adjustment_iterations" ADD CONSTRAINT "adjustment_iterations_from_config_id_generator_configs_id_fk" FOREIGN KEY ("from_config_id") REFERENCES "irt_compute"."generator_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."adjustment_iterations" ADD CONSTRAINT "adjustment_iterations_to_config_id_generator_configs_id_fk" FOREIGN KEY ("to_config_id") REFERENCES "irt_compute"."generator_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."adjustment_iterations" ADD CONSTRAINT "adjustment_iterations_policy_id_technical_policy_versions_id_fk" FOREIGN KEY ("policy_id") REFERENCES "irt_compute"."technical_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."analysis_datasets" ADD CONSTRAINT "analysis_datasets_execution_id_compute_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "irt_compute"."compute_executions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."analysis_datasets" ADD CONSTRAINT "analysis_datasets_snapshot_id_response_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."response_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."analysis_datasets" ADD CONSTRAINT "analysis_datasets_selection_policy_id_technical_policy_versions_id_fk" FOREIGN KEY ("selection_policy_id") REFERENCES "irt_compute"."technical_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."analysis_response_selections" ADD CONSTRAINT "analysis_response_selections_dataset_fk" FOREIGN KEY ("dataset_id","snapshot_id") REFERENCES "irt_compute"."analysis_datasets"("id","snapshot_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."analysis_response_selections" ADD CONSTRAINT "analysis_response_selections_snapshot_fk" FOREIGN KEY ("snapshot_item_id","snapshot_id") REFERENCES "public"."response_snapshot_items"("id","snapshot_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."candidate_validation_results" ADD CONSTRAINT "candidate_validation_results_candidate_id_generation_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "irt_compute"."generation_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."candidate_validation_results" ADD CONSTRAINT "candidate_validation_results_validator_policy_id_technical_policy_versions_id_fk" FOREIGN KEY ("validator_policy_id") REFERENCES "irt_compute"."technical_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."candidate_validation_results" ADD CONSTRAINT "candidate_validation_results_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."compute_executions" ADD CONSTRAINT "compute_executions_request_id_analysis_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."analysis_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."compute_executions" ADD CONSTRAINT "compute_executions_service_principal_id_service_principals_id_fk" FOREIGN KEY ("service_principal_id") REFERENCES "public"."service_principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."compute_outputs" ADD CONSTRAINT "compute_outputs_execution_id_compute_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "irt_compute"."compute_executions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."compute_outputs" ADD CONSTRAINT "compute_outputs_dataset_id_analysis_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "irt_compute"."analysis_datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_distribution_decisions_scope_idx" ON "item_distribution_decisions" USING btree ("question_version_id","context_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "student_item_exposures_family_time_idx" ON "student_item_exposures" USING btree ("student_id","family_id","occurred_at");--> statement-breakpoint
CREATE INDEX "compute_outputs_digest_idx" ON "irt_compute"."compute_outputs" USING btree ("digest");--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_parent_original_question_version_id_question_versions_id_fk" FOREIGN KEY ("parent_original_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_revised_from_question_version_id_question_versions_id_fk" FOREIGN KEY ("revised_from_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_scoring_rubric_version_id_scoring_rubric_versions_id_fk" FOREIGN KEY ("scoring_rubric_version_id") REFERENCES "public"."scoring_rubric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_validation_decision_id_content_validation_decisions_id_fk" FOREIGN KEY ("validation_decision_id") REFERENCES "public"."content_validation_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_phase_id_trial_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."trial_phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_trial_assignment_id_trial_assignments_id_fk" FOREIGN KEY ("trial_assignment_id") REFERENCES "public"."trial_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_package_purpose_fk" FOREIGN KEY ("package_id","purpose") REFERENCES "public"."assessment_packages"("id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_trial_assignment_scope_fk" FOREIGN KEY ("trial_assignment_id","student_id","package_id","phase_id") REFERENCES "public"."trial_assignments"("id","student_id","package_id","phase_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD CONSTRAINT "assessment_packages_blueprint_version_id_assessment_blueprint_versions_id_fk" FOREIGN KEY ("blueprint_version_id") REFERENCES "public"."assessment_blueprint_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_rubric_version_id_scoring_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."scoring_rubric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_rubric_version_id_scoring_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."scoring_rubric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_batches" ADD CONSTRAINT "irt_batches_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_batches" ADD CONSTRAINT "irt_batches_response_snapshot_id_response_snapshots_id_fk" FOREIGN KEY ("response_snapshot_id") REFERENCES "public"."response_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_batches" ADD CONSTRAINT "irt_batches_analysis_request_id_analysis_requests_id_fk" FOREIGN KEY ("analysis_request_id") REFERENCES "public"."analysis_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_batches" ADD CONSTRAINT "irt_batches_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_item_results" ADD CONSTRAINT "irt_item_results_rubric_version_id_scoring_rubric_versions_id_fk" FOREIGN KEY ("rubric_version_id") REFERENCES "public"."scoring_rubric_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD CONSTRAINT "variant_evaluations_phase_id_trial_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."trial_phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD CONSTRAINT "variant_evaluations_baseline_id_calibration_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."calibration_baselines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD CONSTRAINT "variant_evaluations_reference_set_id_reference_sets_id_fk" FOREIGN KEY ("reference_set_id") REFERENCES "public"."reference_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD CONSTRAINT "variant_evaluations_source_output_id_compute_outputs_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "irt_compute"."compute_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD CONSTRAINT "variant_evaluations_control_item_result_id_irt_item_results_id_fk" FOREIGN KEY ("control_item_result_id") REFERENCES "public"."irt_item_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_evaluations" ADD CONSTRAINT "variant_evaluations_candidate_item_result_id_irt_item_results_id_fk" FOREIGN KEY ("candidate_item_result_id") REFERENCES "public"."irt_item_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_runs" ADD CONSTRAINT "generation_runs_wave_item_id_generation_wave_items_id_fk" FOREIGN KEY ("wave_item_id") REFERENCES "public"."generation_wave_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_runs" ADD CONSTRAINT "generation_runs_execution_id_compute_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "irt_compute"."compute_executions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ADD CONSTRAINT "generation_candidates_parent_original_question_version_id_question_versions_id_fk" FOREIGN KEY ("parent_original_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ADD CONSTRAINT "generation_candidates_replacement_of_id_generation_candidates_id_fk" FOREIGN KEY ("replacement_of_id") REFERENCES "irt_compute"."generation_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."generator_configs" ADD CONSTRAINT "generator_configs_template_version_id_generator_templates_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "irt_compute"."generator_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irt_compute"."generator_configs" ADD CONSTRAINT "generator_configs_context_id_measurement_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."measurement_contexts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_versions_fingerprint_idx" ON "question_versions" USING btree ("content_fingerprint");--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_review_ck" CHECK ("question_versions"."content_status" <> 'READY' or ("question_versions"."reviewed_by_user_id" is not null and "question_versions"."reviewed_at" is not null) or "question_versions"."validation_decision_id" is not null);--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_trial_ck" CHECK (("assessment_attempts"."purpose" = 'REGULAR' and "assessment_attempts"."phase_id" is null and "assessment_attempts"."trial_assignment_id" is null) or ("assessment_attempts"."purpose" <> 'REGULAR' and "assessment_attempts"."assessment_type" = 'DRILL' and "assessment_attempts"."phase_id" is not null and "assessment_attempts"."trial_assignment_id" is not null and "assessment_attempts"."raw_points" is null and "assessment_attempts"."score_0_100" is null and "assessment_attempts"."stars" is null and "assessment_attempts"."unlocked_level_id" is null));--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD CONSTRAINT "assessment_packages_purpose_ck" CHECK ("assessment_packages"."purpose" = 'REGULAR' or ("assessment_packages"."assessment_type" = 'DRILL' and "assessment_packages"."blueprint_version_id" is not null));--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_category_ck" CHECK ("attempt_answers"."score_category" is null or "attempt_answers"."score_category" >= 0);--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_category_ck" CHECK ("attempt_items"."maximum_score_category" is null or "attempt_items"."maximum_score_category" > 0);--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_category_ck" CHECK ("package_items"."maximum_score_category" is null or "package_items"."maximum_score_category" > 0);--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_role_ck" CHECK ("package_items"."item_role" in ('REGULAR','ORIGINAL','FOCAL','REFERENCE'));--> statement-breakpoint
ALTER TABLE "irt_item_results" ADD CONSTRAINT "irt_item_results_model_ck" CHECK ("irt_item_results"."model_family" in ('LEGACY','2PL','GPCM') and ("irt_item_results"."model_family" = 'LEGACY' or ("irt_item_results"."guessing_c" is null and "irt_item_results"."rubric_version_id" is not null and "irt_item_results"."eligible_respondent_count" is not null and "irt_item_results"."eligible_respondent_count" between 0 and "irt_item_results"."sample_size")));--> statement-breakpoint
ALTER TABLE "irt_item_results" ADD CONSTRAINT "irt_item_results_insufficient_ck" CHECK ("irt_item_results"."model_family" <> 'LEGACY' or "irt_item_results"."sample_size" >= 30 or ("irt_item_results"."difficulty_b" is null and "irt_item_results"."discrimination_a" is null and "irt_item_results"."guessing_c" is null));--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_runs" ADD CONSTRAINT "generation_runs_finished_ck" CHECK ("irt_compute"."generation_runs"."finished_at" is null or "irt_compute"."generation_runs"."finished_at" >= "irt_compute"."generation_runs"."started_at");--> statement-breakpoint
ALTER TABLE "irt_compute"."generation_candidates" ADD CONSTRAINT "generation_candidates_payload_ck" CHECK ("irt_compute"."generation_candidates"."candidate_question_version_id" is not null or ("irt_compute"."generation_candidates"."payload" is not null and "irt_compute"."generation_candidates"."payload_digest" is not null and "irt_compute"."generation_candidates"."random_seed" is not null and "irt_compute"."generation_candidates"."parameter_values" is not null and "irt_compute"."generation_candidates"."parent_original_question_version_id" is not null));--> statement-breakpoint
ALTER TABLE "irt_compute"."generator_configs" ADD CONSTRAINT "generator_configs_version_ck" CHECK ("irt_compute"."generator_configs"."config_version" > 0);
--> statement-breakpoint
ALTER TABLE "content_delivery_items" ADD CONSTRAINT "content_delivery_items_pvp_fk" FOREIGN KEY ("pvp_match_question_id") REFERENCES "public"."pvp_match_questions"("id") ON DELETE restrict ON UPDATE no action;

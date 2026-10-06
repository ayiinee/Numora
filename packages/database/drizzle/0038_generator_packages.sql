CREATE TABLE "generator_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"operation_key" text NOT NULL,
	"operation_fingerprint" text NOT NULL,
	"assessment_type" text NOT NULL,
	"title" text NOT NULL,
	"expected_count" integer NOT NULL,
	"chapter_id" uuid,
	"level_id" uuid,
	"mapping_ids" jsonb NOT NULL,
	"request_ids" jsonb NOT NULL,
	"canonical_package_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generator_packages_type_ck" CHECK ("generator_packages"."assessment_type" in ('DRILL','PRETEST','TRYOUT')),
	CONSTRAINT "generator_packages_title_ck" CHECK (length(trim("generator_packages"."title")) between 1 and 160),
	CONSTRAINT "generator_packages_arrays_ck" CHECK (jsonb_typeof("generator_packages"."mapping_ids")='array' and jsonb_typeof("generator_packages"."request_ids")='array'),
	CONSTRAINT "generator_packages_count_ck" CHECK ("generator_packages"."expected_count"=case "generator_packages"."assessment_type" when 'DRILL' then 10 when 'PRETEST' then 20 when 'TRYOUT' then 30 end and jsonb_array_length("generator_packages"."mapping_ids")="generator_packages"."expected_count" and jsonb_array_length("generator_packages"."request_ids")="generator_packages"."expected_count"),
	CONSTRAINT "generator_packages_scope_ck" CHECK (("generator_packages"."assessment_type"='TRYOUT' and "generator_packages"."chapter_id" is null and "generator_packages"."level_id" is null) or ("generator_packages"."assessment_type"='DRILL' and "generator_packages"."chapter_id" is not null and "generator_packages"."level_id" is not null) or ("generator_packages"."assessment_type"='PRETEST' and "generator_packages"."chapter_id" is not null and "generator_packages"."level_id" is null))
);
--> statement-breakpoint
ALTER TABLE "generator_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "generator_packages" ADD CONSTRAINT "generator_packages_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generator_packages" ADD CONSTRAINT "generator_packages_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generator_packages" ADD CONSTRAINT "generator_packages_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generator_packages" ADD CONSTRAINT "generator_packages_canonical_package_id_assessment_packages_id_fk" FOREIGN KEY ("canonical_package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generator_packages_operation_uq" ON "generator_packages" USING btree ("actor_user_id","operation_key");--> statement-breakpoint
CREATE INDEX "generator_packages_created_idx" ON "generator_packages" USING btree ("created_at");--> statement-breakpoint
REVOKE ALL ON public.generator_packages FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.generator_packages TO numora_main_runtime;
CREATE POLICY numora_main_access ON public.generator_packages FOR ALL TO numora_main_runtime USING(true) WITH CHECK(true);

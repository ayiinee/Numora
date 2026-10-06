CREATE TABLE "pretest_chapter_states" (
	"student_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"skipped_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pretest_chapter_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD COLUMN "pretest_result" jsonb;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pretest_chapter_states" ADD CONSTRAINT "pretest_chapter_states_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pretest_chapter_states" ADD CONSTRAINT "pretest_chapter_states_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pretest_chapter_states_student_chapter_uq" ON "pretest_chapter_states" USING btree ("student_id","chapter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_attempts_pretest_active_uq" ON "assessment_attempts" USING btree ("student_id","chapter_id_at_start") WHERE "assessment_attempts"."assessment_type" = 'PRETEST' and "assessment_attempts"."status" = 'IN_PROGRESS';--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_revision_ck" CHECK ("attempt_answers"."revision" >= 0);
--> statement-breakpoint
REVOKE ALL ON public.pretest_chapter_states FROM PUBLIC;
--> statement-breakpoint
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON public.pretest_chapter_states FROM %I',r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON public.pretest_chapter_states TO numora_main_runtime;
--> statement-breakpoint
CREATE POLICY numora_main_access ON public.pretest_chapter_states FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);

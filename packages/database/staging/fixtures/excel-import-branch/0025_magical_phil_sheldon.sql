ALTER TABLE "questions" ADD COLUMN "usage_type" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "source_question_id" uuid;--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD COLUMN "import_source" jsonb;--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD COLUMN "content_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_source_question_id_questions_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_usage_competency_idx" ON "questions" USING btree ("usage_type","primary_competency_id");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_usage_ck" CHECK ("questions"."usage_type" is null or "questions"."usage_type" in ('DRILL','PRETEST','TRYOUT'));--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_source_question_ck" CHECK ("questions"."source_question_id" is null or "questions"."source_question_id" <> "questions"."id");--> statement-breakpoint
ALTER TABLE "assessment_packages" ADD CONSTRAINT "assessment_packages_content_revision_ck" CHECK ("assessment_packages"."content_revision" >= 0);
--> statement-breakpoint
-- The existing measurement_item_guard rejects deletion from frozen packages.
-- Only package membership DELETE is granted; question/history permissions stay intact.
GRANT DELETE ON public.package_items TO numora_main_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.content_import_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.content_import_versions WHERE question_version_id=OLD.id) THEN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['reviewed_at','reviewed_by_user_id'])=(to_jsonb(OLD)-ARRAY['reviewed_at','reviewed_by_user_id']) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Imported content is immutable; reimport to create a revision' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.question_usage_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (OLD.usage_type IS NOT NULL AND NEW.usage_type IS DISTINCT FROM OLD.usage_type) OR NEW.source_question_id IS DISTINCT FROM OLD.source_question_id THEN
  RAISE EXCEPTION 'Question purpose and copy lineage are immutable; create a new identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.question_usage_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER question_usage_immutable BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.question_usage_guard();

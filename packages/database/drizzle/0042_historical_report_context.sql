ALTER TABLE "question_reports" ADD COLUMN "revision_question_version_id" uuid;--> statement-breakpoint
ALTER TABLE "video_reports" ADD COLUMN "target_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_revision_question_version_id_question_versions_id_fk" FOREIGN KEY ("revision_question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION public.report_context_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','follow_up','revision_question_version_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','follow_up','revision_question_version_id']) THEN
  RAISE EXCEPTION 'Report context is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.report_context_immutable_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER question_report_context_immutable BEFORE UPDATE OR DELETE ON public.question_reports FOR EACH ROW EXECUTE FUNCTION public.report_context_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER video_report_context_immutable BEFORE UPDATE OR DELETE ON public.video_reports FOR EACH ROW EXECUTE FUNCTION public.report_context_immutable_guard();

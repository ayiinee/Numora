ALTER TABLE "question_versions" DROP CONSTRAINT "question_versions_ready_difficulty_ck";
--> statement-breakpoint
CREATE FUNCTION public.question_version_ready_metadata_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE usage text;
BEGIN
 IF NEW.content_status = 'READY' AND (NEW.difficulty IS NULL OR length(trim(NEW.difficulty))=0) THEN
  SELECT q.usage_type INTO usage FROM public.question_variants v JOIN public.questions q ON q.id=v.question_id WHERE v.id=NEW.variant_id;
  IF usage IS DISTINCT FROM 'TRYOUT' THEN RAISE EXCEPTION 'Difficulty is required outside Tryout' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER question_version_ready_metadata_guard BEFORE INSERT OR UPDATE ON public.question_versions FOR EACH ROW EXECUTE FUNCTION public.question_version_ready_metadata_guard();
--> statement-breakpoint
CREATE FUNCTION public.question_usage_ready_metadata_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.usage_type IS DISTINCT FROM 'TRYOUT' AND EXISTS (SELECT 1 FROM public.question_variants v JOIN public.question_versions qv ON qv.variant_id=v.id WHERE v.question_id=NEW.id AND qv.content_status='READY' AND (qv.difficulty IS NULL OR length(trim(qv.difficulty))=0)) THEN
 RAISE EXCEPTION 'Difficulty is required outside Tryout' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER question_usage_ready_metadata_guard BEFORE UPDATE OF usage_type ON public.questions FOR EACH ROW EXECUTE FUNCTION public.question_usage_ready_metadata_guard();

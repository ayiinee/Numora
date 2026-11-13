CREATE TABLE public.pvp_content_revision (
 singleton boolean PRIMARY KEY DEFAULT true,
 revision uuid NOT NULL DEFAULT gen_random_uuid(),
 CONSTRAINT pvp_content_revision_singleton CHECK (singleton = true)
);
INSERT INTO public.pvp_content_revision DEFAULT VALUES;
ALTER TABLE public.pvp_content_revision ENABLE ROW LEVEL SECURITY;
CREATE POLICY main_read ON public.pvp_content_revision
 FOR SELECT TO numora_main_runtime USING (true);
GRANT SELECT ON public.pvp_content_revision TO numora_main_runtime;
REVOKE ALL ON public.pvp_content_revision FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.invalidate_pvp_content_cache() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 UPDATE public.pvp_content_revision SET revision = gen_random_uuid() WHERE singleton;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_pvp_content_cache() FROM PUBLIC;
--> statement-breakpoint
-- A committed content mutation and its new revision become visible together.
-- Take the revision lock before changing content, including direct SQL and TRUNCATE.
DO $$
DECLARE relation_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY[
  'question_versions', 'question_variants', 'questions', 'content_validation_decisions',
  'chapters', 'subchapters', 'competencies', 'levels'
 ] LOOP
  EXECUTE format(
   'CREATE TRIGGER invalidate_pvp_content_cache BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_pvp_content_cache()',
   relation_name
  );
 END LOOP;
END $$;

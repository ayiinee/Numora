CREATE OR REPLACE FUNCTION public.content_import_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.content_import_versions WHERE question_version_id=OLD.id) THEN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['content_status','reviewed_by_user_id','reviewed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['content_status','reviewed_by_user_id','reviewed_at']) THEN
   RAISE EXCEPTION 'Imported payload is immutable; create a revision' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;

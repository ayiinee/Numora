-- ENGINEERING DECISION: owner approved Admin-recorded Curriculum approval and separate Publish.
-- Content bytes stay immutable; reviewed versions may advance through their content lifecycle.
CREATE OR REPLACE FUNCTION public.content_import_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.content_import_versions WHERE question_version_id=OLD.id) THEN
    IF TG_OP='UPDATE' AND
      (to_jsonb(NEW)-ARRAY['reviewed_at','reviewed_by_user_id','content_status','validation_state']) =
      (to_jsonb(OLD)-ARRAY['reviewed_at','reviewed_by_user_id','content_status','validation_state']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Imported content is immutable; reimport to create a revision' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

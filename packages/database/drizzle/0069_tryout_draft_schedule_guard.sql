-- Drafts have never opened to students; expired dates must remain repairable.
-- Published batches still freeze at their start time; cancellation remains terminal.
CREATE OR REPLACE FUNCTION public.tryout_admin_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b public.tryout_batches; bid uuid;
BEGIN
 IF TG_TABLE_NAME='tryout_batches' THEN
  IF OLD.admin_title IS NOT NULL AND ((OLD.admin_published_at IS NOT NULL AND OLD.starts_at<=clock_timestamp()) OR OLD.cancelled_at IS NOT NULL)
   AND ROW(NEW.admin_title,NEW.package_id,NEW.starts_at,NEW.closes_at,NEW.cutoff_at,NEW.result_due_at,NEW.mandiri_package_id,NEW.admin_published_at,NEW.cancelled_at,NEW.cancellation_reason,NEW.config_revision)
    IS DISTINCT FROM ROW(OLD.admin_title,OLD.package_id,OLD.starts_at,OLD.closes_at,OLD.cutoff_at,OLD.result_due_at,OLD.mandiri_package_id,OLD.admin_published_at,OLD.cancelled_at,OLD.cancellation_reason,OLD.config_revision)
   THEN RAISE EXCEPTION 'Tryout batch configuration is locked' USING ERRCODE='23514'; END IF;
 ELSE
  bid:=CASE WHEN TG_OP='DELETE' THEN OLD.batch_id ELSE NEW.batch_id END;
  SELECT * INTO b FROM public.tryout_batches WHERE id=bid FOR SHARE;
  IF b.admin_title IS NOT NULL AND ((b.admin_published_at IS NOT NULL AND b.starts_at<=clock_timestamp()) OR b.cancelled_at IS NOT NULL)
   THEN RAISE EXCEPTION 'Tryout batch delegation is locked' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

-- Owner-approved: recipients may change until close; package and attempt pins remain frozen.
CREATE OR REPLACE FUNCTION public.tryout_admin_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b public.tryout_batches; bid uuid; frozen boolean;
BEGIN
 IF TG_TABLE_NAME='tryout_batches' THEN
  frozen := OLD.cancelled_at IS NOT NULL OR (OLD.admin_published_at IS NOT NULL AND OLD.starts_at<=clock_timestamp());
  IF OLD.admin_title IS NOT NULL AND frozen THEN
   IF ROW(NEW.admin_title,NEW.package_id,NEW.starts_at,NEW.closes_at,NEW.cutoff_at,NEW.result_due_at,NEW.admin_published_at,NEW.cancelled_at,NEW.cancellation_reason)
     IS DISTINCT FROM ROW(OLD.admin_title,OLD.package_id,OLD.starts_at,OLD.closes_at,OLD.cutoff_at,OLD.result_due_at,OLD.admin_published_at,OLD.cancelled_at,OLD.cancellation_reason)
    OR ((OLD.cancelled_at IS NOT NULL OR OLD.closes_at<=clock_timestamp()) AND ROW(NEW.mandiri_package_id,NEW.config_revision) IS DISTINCT FROM ROW(OLD.mandiri_package_id,OLD.config_revision))
   THEN RAISE EXCEPTION 'Tryout batch configuration is locked' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
   RAISE EXCEPTION 'Cannot move batch configuration' USING ERRCODE='23514';
  END IF;
  bid:=CASE WHEN TG_OP='DELETE' THEN OLD.batch_id ELSE NEW.batch_id END;
  SELECT * INTO b FROM public.tryout_batches WHERE id=bid FOR UPDATE;
  IF b.admin_title IS NOT NULL AND (b.cancelled_at IS NOT NULL OR
    (b.admin_published_at IS NOT NULL AND
     CASE WHEN TG_TABLE_NAME='tryout_school_delegations' THEN b.closes_at<=clock_timestamp() ELSE b.starts_at<=clock_timestamp() END))
   THEN RAISE EXCEPTION 'Tryout batch configuration is locked' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

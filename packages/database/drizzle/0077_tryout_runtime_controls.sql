-- Owner-requested Tryout runtime controls: 75-minute attempts, overlapping
-- published batches, and stopping an already-open batch.
ALTER TABLE public.tryout_batches
  DROP CONSTRAINT IF EXISTS tryout_admin_schedule_excl;
--> statement-breakpoint
UPDATE public.assessment_packages
SET duration_seconds = 4500
WHERE assessment_type = 'TRYOUT'
  AND is_demo = false
  AND status IN ('PUBLISHED', 'CLOSED')
  AND manifest_digest IS NULL
  AND duration_seconds IS DISTINCT FROM 4500;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.tryout_admin_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b public.tryout_batches; bid uuid; frozen boolean; stopping boolean;
BEGIN
 IF TG_TABLE_NAME='tryout_batches' THEN
  frozen := OLD.cancelled_at IS NOT NULL OR (OLD.admin_published_at IS NOT NULL AND OLD.starts_at<=clock_timestamp());
  stopping := OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL
    AND OLD.admin_published_at IS NOT NULL AND OLD.starts_at<=clock_timestamp()
    AND OLD.closes_at>clock_timestamp() AND length(trim(NEW.cancellation_reason))>0
    AND NEW.admin_title IS NOT DISTINCT FROM OLD.admin_title
    AND NEW.package_id IS NOT DISTINCT FROM OLD.package_id
    AND NEW.starts_at IS NOT DISTINCT FROM OLD.starts_at
    AND NEW.closes_at IS NOT DISTINCT FROM OLD.closes_at
    AND NEW.cutoff_at IS NOT DISTINCT FROM OLD.cutoff_at
    AND NEW.result_due_at IS NOT DISTINCT FROM OLD.result_due_at
    AND NEW.mandiri_package_id IS NOT DISTINCT FROM OLD.mandiri_package_id
    AND NEW.admin_published_at IS NOT DISTINCT FROM OLD.admin_published_at
    AND NEW.config_revision = OLD.config_revision + 1;
  IF OLD.admin_title IS NOT NULL AND frozen AND NOT stopping THEN
   IF ROW(NEW.admin_title,NEW.package_id,NEW.starts_at,NEW.admin_published_at,NEW.cancelled_at,NEW.cancellation_reason)
     IS DISTINCT FROM ROW(OLD.admin_title,OLD.package_id,OLD.starts_at,OLD.admin_published_at,OLD.cancelled_at,OLD.cancellation_reason)
    OR ((OLD.cancelled_at IS NOT NULL OR OLD.closes_at<=clock_timestamp()) AND ROW(NEW.mandiri_package_id,NEW.config_revision) IS DISTINCT FROM ROW(OLD.mandiri_package_id,OLD.config_revision))
   THEN RAISE EXCEPTION 'Tryout batch configuration is locked' USING ERRCODE='23514'; END IF;
   IF ROW(NEW.closes_at,NEW.cutoff_at,NEW.result_due_at) IS DISTINCT FROM ROW(OLD.closes_at,OLD.cutoff_at,OLD.result_due_at)
    AND NOT (OLD.cancelled_at IS NULL AND OLD.admin_published_at IS NOT NULL AND OLD.starts_at<=clock_timestamp() AND OLD.closes_at>clock_timestamp()
      AND OLD.status IN ('PLANNED','OPEN') AND NEW.closes_at>OLD.closes_at AND NEW.cutoff_at=NEW.closes_at AND NEW.result_due_at=NEW.closes_at+interval '72 hours')
   THEN RAISE EXCEPTION 'Only an open batch may extend its closing time' USING ERRCODE='23514'; END IF;
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

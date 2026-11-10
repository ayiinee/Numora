-- Serialize cancellation with dispatch/adoption/publication; retain all existing authorization.
CREATE OR REPLACE FUNCTION public.irt_calibration_cancel_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.request_id::text,53));
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.actor_user_id AND role='ADMIN' AND status='ACTIVE' AND admin_role IN ('SUPER_ADMIN','CONTENT_DATA_MODERATION')) THEN RAISE EXCEPTION 'Content Admin required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

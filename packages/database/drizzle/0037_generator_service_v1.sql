CREATE OR REPLACE FUNCTION public.measurement_dispatch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r public.analysis_requests; previous integer; e irt_compute.compute_executions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.request_id::text,3));
  SELECT * INTO r FROM public.analysis_requests WHERE id=NEW.request_id FOR UPDATE;
  SELECT max(generation) INTO previous FROM public.analysis_request_dispatches WHERE request_id=NEW.request_id;
  IF r.request_type NOT IN ('CALIBRATE_TRYOUT','GENERATE_VARIANTS') OR r.status IN ('COMPLETED','CANCELLED') OR NEW.generation<>coalesce(previous,0)+1 THEN RAISE EXCEPTION 'Invalid dispatch authorization' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.actor_user_id AND role='ADMIN' AND status='ACTIVE') THEN RAISE EXCEPTION 'Active Admin dispatch required' USING ERRCODE='23514'; END IF;
  IF r.request_type='GENERATE_VARIANTS' AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.actor_user_id AND admin_role IN ('SUPER_ADMIN','CONTENT_DATA_MODERATION')) THEN RAISE EXCEPTION 'Content Admin dispatch required' USING ERRCODE='23514'; END IF;
  IF previous IS NOT NULL THEN
    SELECT * INTO e FROM irt_compute.compute_executions WHERE request_id=NEW.request_id ORDER BY attempt_number DESC LIMIT 1;
    IF e.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.analysis_request_dispatches WHERE id=e.dispatch_id AND request_id=NEW.request_id AND generation=previous)
      OR (e.status='RUNNING' AND e.lease_expires_at>clock_timestamp()) OR (e.status='SUCCEEDED' AND r.status<>'FAILED') THEN RAISE EXCEPTION 'Retry requires failed or expired work for current dispatch' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
DROP INDEX public.candidate_imports_version_uq;
CREATE INDEX candidate_imports_version_idx ON public.candidate_imports(question_version_id);

CREATE TABLE "analysis_request_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"operation_key" text NOT NULL,
	"operation_fingerprint" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_dispatch_generation_ck" CHECK ("analysis_request_dispatches"."generation" > 0)
);
--> statement-breakpoint
ALTER TABLE "analysis_request_dispatches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "irt_compute"."compute_executions" ADD COLUMN "dispatch_id" uuid;--> statement-breakpoint
ALTER TABLE "analysis_request_dispatches" ADD CONSTRAINT "analysis_request_dispatches_request_id_analysis_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."analysis_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_request_dispatches" ADD CONSTRAINT "analysis_request_dispatches_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_dispatch_operation_uq" ON "analysis_request_dispatches" USING btree ("operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_dispatch_generation_uq" ON "analysis_request_dispatches" USING btree ("request_id","generation");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_dispatch_id_request_uq" ON "analysis_request_dispatches" USING btree ("id","request_id");--> statement-breakpoint
ALTER TABLE "irt_compute"."compute_executions" ADD CONSTRAINT "compute_executions_dispatch_id_analysis_request_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."analysis_request_dispatches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "irt_batches_source_output_uq" ON "irt_batches" USING btree ("source_output_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compute_executions_dispatch_uq" ON "irt_compute"."compute_executions" USING btree ("dispatch_id");
--> statement-breakpoint
GRANT SELECT,INSERT ON public.analysis_request_dispatches TO numora_main_runtime;
CREATE POLICY numora_main_access ON public.analysis_request_dispatches FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
CREATE TRIGGER measurement_dispatch_append_only BEFORE UPDATE OR DELETE ON public.analysis_request_dispatches FOR EACH ROW EXECUTE FUNCTION public.measurement_append_only();
CREATE VIEW public.irt_input_dispatches_v3 AS SELECT id,request_id,generation FROM public.analysis_request_dispatches;
GRANT SELECT ON public.irt_input_dispatches_v3 TO numora_irt_runtime;
--> statement-breakpoint
CREATE FUNCTION public.measurement_dispatch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r public.analysis_requests; previous integer; e irt_compute.compute_executions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.request_id::text,3));
  SELECT * INTO r FROM public.analysis_requests WHERE id=NEW.request_id FOR UPDATE;
  SELECT max(generation) INTO previous FROM public.analysis_request_dispatches WHERE request_id=NEW.request_id;
  IF r.request_type<>'CALIBRATE_TRYOUT' OR r.status IN ('COMPLETED','CANCELLED') OR NEW.generation<>coalesce(previous,0)+1 THEN RAISE EXCEPTION 'Invalid dispatch authorization' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.actor_user_id AND role='ADMIN' AND status='ACTIVE') THEN RAISE EXCEPTION 'Active Admin dispatch required' USING ERRCODE='23514'; END IF;
  IF previous IS NOT NULL THEN
    SELECT * INTO e FROM irt_compute.compute_executions WHERE request_id=NEW.request_id ORDER BY attempt_number DESC LIMIT 1;
    IF e.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.analysis_request_dispatches WHERE id=e.dispatch_id AND request_id=NEW.request_id AND generation=previous)
      OR (e.status='RUNNING' AND e.lease_expires_at>clock_timestamp()) OR (e.status='SUCCEEDED' AND r.status<>'FAILED') THEN RAISE EXCEPTION 'Retry requires failed or expired work for current dispatch' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_dispatch_guard BEFORE INSERT ON public.analysis_request_dispatches FOR EACH ROW EXECUTE FUNCTION public.measurement_dispatch_guard();
REVOKE ALL ON FUNCTION public.measurement_dispatch_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION irt_compute.dispatch_execution_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,irt_compute AS $$
DECLARE d public.analysis_request_dispatches; r public.analysis_requests;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.request_id::text,3));
  SELECT * INTO r FROM public.analysis_requests WHERE id=NEW.request_id FOR UPDATE;
  SELECT * INTO d FROM public.analysis_request_dispatches WHERE request_id=NEW.request_id ORDER BY generation DESC LIMIT 1;
  IF TG_OP='INSERT' THEN
    IF d.id IS NOT NULL AND (NEW.dispatch_id IS DISTINCT FROM d.id OR r.status<>'PENDING') THEN RAISE EXCEPTION 'Current pending dispatch required' USING ERRCODE='23514'; END IF;
    IF NEW.dispatch_id IS NOT NULL AND d.id IS DISTINCT FROM NEW.dispatch_id THEN RAISE EXCEPTION 'Dispatch belongs to another request' USING ERRCODE='23514'; END IF;
    IF d.id IS NOT NULL THEN UPDATE public.analysis_requests SET status='RUNNING' WHERE id=NEW.request_id; END IF;
  ELSE
    IF NEW.dispatch_id IS DISTINCT FROM OLD.dispatch_id THEN RAISE EXCEPTION 'Execution dispatch is immutable' USING ERRCODE='23514'; END IF;
    IF d.id IS NOT NULL AND NEW.dispatch_id=d.id AND NEW.status IN ('FAILED','EXPIRED') THEN UPDATE public.analysis_requests SET status='FAILED' WHERE id=NEW.request_id; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dispatch_execution_guard BEFORE INSERT OR UPDATE ON irt_compute.compute_executions FOR EACH ROW EXECUTE FUNCTION irt_compute.dispatch_execution_guard();
REVOKE ALL ON FUNCTION irt_compute.dispatch_execution_guard() FROM PUBLIC;

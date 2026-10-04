ALTER TABLE "analysis_requests" ADD COLUMN "baseline_id" uuid;--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD COLUMN "reference_set_id" uuid;--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_baseline_id_calibration_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."calibration_baselines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_reference_set_id_reference_sets_id_fk" FOREIGN KEY ("reference_set_id") REFERENCES "public"."reference_sets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE VIEW public.irt_input_requests_v3 AS SELECT id,request_type,context_id,snapshot_id,wave_item_id,package_id,configuration_pins,input_digest,contract_version,status,due_at,accepted_execution_id,baseline_id,reference_set_id FROM public.analysis_requests;
--> statement-breakpoint
CREATE FUNCTION public.measurement_wave_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='generation_waves' THEN
    IF TG_OP='DELETE' OR (OLD.approved_at IS NOT NULL AND (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')) THEN RAISE EXCEPTION 'Approved generation wave is immutable' USING ERRCODE='23514'; END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.analysis_requests WHERE wave_item_id=OLD.id) THEN RAISE EXCEPTION 'Requested generation input is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_wave_guard BEFORE UPDATE OR DELETE ON public.generation_waves FOR EACH ROW EXECUTE FUNCTION public.measurement_wave_guard();
--> statement-breakpoint
CREATE TRIGGER measurement_wave_item_guard BEFORE UPDATE OR DELETE ON public.generation_wave_items FOR EACH ROW EXECUTE FUNCTION public.measurement_wave_guard();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.measurement_wave_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.measurement_step_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item public.irt_item_results; expected jsonb;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Adopted step parameters are immutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO item FROM public.irt_item_results WHERE id=NEW.item_result_id;
  IF item.model_family IS DISTINCT FROM 'GPCM' THEN RAISE EXCEPTION 'Step parameters belong to GPCM only' USING ERRCODE='23514'; END IF;
  SELECT step.value INTO expected FROM public.irt_batches b CROSS JOIN LATERAL jsonb_array_elements(b.output_snapshot->'items') i CROSS JOIN LATERAL jsonb_array_elements(i.value->'steps') step
    WHERE b.id=item.batch_id AND i.value->>'questionVersionId'=item.question_version_id::text AND (step.value->>'step')::integer=NEW.step;
  IF expected IS NULL OR (expected->>'value')::numeric IS DISTINCT FROM NEW.value OR (expected->>'standardError')::numeric IS DISTINCT FROM NEW.standard_error THEN RAISE EXCEPTION 'GPCM steps must copy the adopted artifact' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER measurement_step_guard BEFORE INSERT OR UPDATE OR DELETE ON public.irt_item_step_parameters FOR EACH ROW EXECUTE FUNCTION public.measurement_step_guard();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.measurement_step_guard() FROM PUBLIC;

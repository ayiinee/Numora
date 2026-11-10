-- Preserve legacy checks; read research steps from the actual v1 outcome.
CREATE OR REPLACE FUNCTION public.measurement_step_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item public.irt_item_results; expected jsonb; batch public.irt_batches;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Adopted step parameters are immutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO item FROM public.irt_item_results WHERE id=NEW.item_result_id;
  IF item.model_family IS DISTINCT FROM 'GPCM' THEN RAISE EXCEPTION 'Step parameters belong to GPCM only' USING ERRCODE='23514'; END IF;
  SELECT * INTO batch FROM public.irt_batches WHERE id=item.batch_id;
  IF batch.source_calibration_artifact_id IS NOT NULL THEN
    SELECT step.value INTO expected FROM jsonb_array_elements(batch.output_snapshot#>'{outcome,items}') i
      CROSS JOIN LATERAL jsonb_array_elements(i.value#>'{parameters,steps}') step
      WHERE i.value->>'questionVersionId'=item.question_version_id::text AND (step.value->>'step')::integer=NEW.step;
  ELSE
  SELECT step.value INTO expected FROM public.irt_batches b CROSS JOIN LATERAL jsonb_array_elements(b.output_snapshot->'items') i CROSS JOIN LATERAL jsonb_array_elements(i.value->'steps') step
    WHERE b.id=item.batch_id AND i.value->>'questionVersionId'=item.question_version_id::text AND (step.value->>'step')::integer=NEW.step;
  END IF;
  IF expected IS NULL OR (expected->>'value')::numeric IS DISTINCT FROM NEW.value OR (expected->>'standardError')::numeric IS DISTINCT FROM NEW.standard_error THEN RAISE EXCEPTION 'GPCM steps must copy the adopted artifact' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

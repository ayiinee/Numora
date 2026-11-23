CREATE TABLE public.tryout_variant_generation_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  operation_key text NOT NULL,
  operation_fingerprint text NOT NULL,
  source_package_id uuid NOT NULL REFERENCES public.assessment_packages(id) ON DELETE RESTRICT,
  source_package_version integer NOT NULL CHECK (source_package_version > 0),
  source_content_revision integer NOT NULL CHECK (source_content_revision >= 0),
  anchor_question_version_ids jsonb NOT NULL,
  focal_question_version_ids jsonb NOT NULL,
  mapping_ids jsonb NOT NULL,
  config_ids jsonb NOT NULL,
  approval_digests jsonb NOT NULL,
  request_ids jsonb NOT NULL,
  input_digest text NOT NULL,
  status text NOT NULL DEFAULT 'GENERATING' CHECK (status IN ('GENERATING','FAILED','READY','IMPORTED')),
  generated_package_id uuid REFERENCES public.assessment_packages(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT tryout_variant_generation_arrays_ck CHECK (
    jsonb_typeof(anchor_question_version_ids)='array' AND jsonb_array_length(anchor_question_version_ids)=5 AND
    jsonb_typeof(focal_question_version_ids)='array' AND jsonb_array_length(focal_question_version_ids)=25 AND
    jsonb_typeof(mapping_ids)='array' AND jsonb_array_length(mapping_ids)=25 AND
    jsonb_typeof(config_ids)='array' AND jsonb_array_length(config_ids)=25 AND
    jsonb_typeof(approval_digests)='array' AND jsonb_array_length(approval_digests)=25 AND
    jsonb_typeof(request_ids)='array' AND jsonb_array_length(request_ids)=25
  ),
  CONSTRAINT tryout_variant_generation_source_ck CHECK (status <> 'IMPORTED' OR generated_package_id IS NOT NULL)
);
CREATE UNIQUE INDEX tryout_variant_generation_operation_uq
  ON public.tryout_variant_generation_processes(actor_user_id, operation_key);
CREATE INDEX tryout_variant_generation_source_idx
  ON public.tryout_variant_generation_processes(source_package_id, created_at DESC);
ALTER TABLE public.tryout_variant_generation_processes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tryout_variant_generation_processes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.tryout_variant_generation_processes TO numora_main_runtime;
CREATE POLICY numora_main_access ON public.tryout_variant_generation_processes
  FOR ALL TO numora_main_runtime USING(true) WITH CHECK(true);
CREATE OR REPLACE FUNCTION public.tryout_variant_generation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.actor_user_id,NEW.operation_key,NEW.operation_fingerprint,NEW.source_package_id,
      NEW.source_package_version,NEW.source_content_revision,NEW.anchor_question_version_ids,
      NEW.focal_question_version_ids,NEW.mapping_ids,NEW.config_ids,NEW.approval_digests,
      NEW.request_ids,NEW.input_digest,NEW.created_at)
     IS DISTINCT FROM
     (OLD.actor_user_id,OLD.operation_key,OLD.operation_fingerprint,OLD.source_package_id,
      OLD.source_package_version,OLD.source_content_revision,OLD.anchor_question_version_ids,
      OLD.focal_question_version_ids,OLD.mapping_ids,OLD.config_ids,OLD.approval_digests,
      OLD.request_ids,OLD.input_digest,OLD.created_at)
  THEN RAISE EXCEPTION 'Tryout variant generation input is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tryout_variant_generation_immutable
  BEFORE UPDATE ON public.tryout_variant_generation_processes
  FOR EACH ROW EXECUTE FUNCTION public.tryout_variant_generation_immutable();

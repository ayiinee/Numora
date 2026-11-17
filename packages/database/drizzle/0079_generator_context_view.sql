-- Expose package-bound TRYOUT context pin to restricted generator reader.
-- Forward-only: 0016 owns original view; this replacement preserves existing
-- columns and appends generation_package_id for package generation.
CREATE OR REPLACE VIEW public.irt_input_contexts_v3 AS
SELECT id,ecosystem,dimension,level_id,tryout_batch_id,scale_code,revision,generation_package_id
FROM public.measurement_contexts;
--> statement-breakpoint
GRANT SELECT ON public.irt_input_contexts_v3 TO numora_irt_runtime;

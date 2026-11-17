ALTER TABLE public.measurement_contexts
  ADD COLUMN generation_package_id uuid;
--> statement-breakpoint
ALTER TABLE public.measurement_contexts
  ADD CONSTRAINT measurement_contexts_generation_package_id_assessment_packages_id_fk
  FOREIGN KEY (generation_package_id) REFERENCES public.assessment_packages(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.measurement_contexts
  DROP CONSTRAINT measurement_contexts_scope_ck;
--> statement-breakpointt
ALTER TABLE public.measurement_contexts
  ADD CONSTRAINT measurement_contexts_scope_ck CHECK (
    (ecosystem='DRILL' AND level_id IS NOT NULL AND tryout_batch_id IS NULL AND generation_package_id IS NULL)
    OR (ecosystem='TRYOUT' AND level_id IS NULL AND (
      (tryout_batch_id IS NOT NULL AND generation_package_id IS NULL)
      OR (tryout_batch_id IS NULL AND generation_package_id IS NOT NULL)
    ))
  );
--> statement-breakpoint
CREATE UNIQUE INDEX measurement_contexts_generation_package_uq
  ON public.measurement_contexts(generation_package_id)
  WHERE generation_package_id IS NOT NULL;

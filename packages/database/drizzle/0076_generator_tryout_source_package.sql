ALTER TABLE public.generator_packages
  ADD COLUMN source_package_id uuid;
--> statement-breakpoint
ALTER TABLE public.generator_packages
  ADD CONSTRAINT generator_packages_source_package_id_assessment_packages_id_fk
  FOREIGN KEY (source_package_id) REFERENCES public.assessment_packages(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.generator_packages
  ADD CONSTRAINT generator_packages_source_package_ck
  CHECK (
    (assessment_type='TRYOUT' AND source_package_id IS NOT NULL)
    OR (assessment_type<>'TRYOUT' AND source_package_id IS NULL)
  ) NOT VALID;

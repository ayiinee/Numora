ALTER TABLE public.tryout_school_delegations
  ADD COLUMN allocation_mode text NOT NULL DEFAULT 'SINGLE_PACKAGE',
  ADD COLUMN variant_package_id uuid,
  ADD CONSTRAINT tryout_school_delegations_allocation_mode_ck
    CHECK (
      (allocation_mode = 'SINGLE_PACKAGE' AND variant_package_id IS NULL)
      OR (allocation_mode = 'BALANCED_50_50' AND variant_package_id IS NOT NULL AND variant_package_id <> package_id)
    ),
  ADD CONSTRAINT tryout_school_delegations_variant_fk
    FOREIGN KEY (batch_id, variant_package_id)
    REFERENCES public.tryout_batch_packages(batch_id, package_id);
--> statement-breakpoint
CREATE TABLE public.tryout_batch_student_allocations (
  batch_id uuid NOT NULL REFERENCES public.tryout_batches(id),
  student_id uuid NOT NULL REFERENCES public.users(id),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  package_id uuid NOT NULL,
  allocation_mode text NOT NULL CHECK (allocation_mode = 'BALANCED_50_50'),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, student_id, school_id),
  FOREIGN KEY (batch_id, package_id)
    REFERENCES public.tryout_batch_packages(batch_id, package_id)
);
ALTER TABLE public.tryout_batch_student_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY main_runtime ON public.tryout_batch_student_allocations
  TO numora_main_runtime USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON public.tryout_batch_student_allocations TO numora_main_runtime;
REVOKE ALL ON public.tryout_batch_student_allocations FROM PUBLIC;
CREATE TRIGGER tryout_batch_student_allocations_immutable
  BEFORE UPDATE OR DELETE ON public.tryout_batch_student_allocations
  FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();

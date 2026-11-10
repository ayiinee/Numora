-- Finalizer staging only. No publication, XP, or historical attempt writes.
CREATE TABLE public.irt_finalization_runs_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.irt_batches(id) ON DELETE RESTRICT,
  receipt_id uuid NOT NULL UNIQUE REFERENCES public.irt_artifact_adoption_receipts_v1(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('PENDING','RUNNING','READY','FAILED','CANCELLED')),
  policy_snapshot jsonb NOT NULL,
  digest text NOT NULL,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(batch_id, version)
);
--> statement-breakpoint
CREATE TABLE public.irt_finalization_results_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.irt_finalization_runs_v1(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL REFERENCES public.assessment_attempts(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('IRT','FALLBACK','UNSCORABLE','INSUFFICIENT','NOT_COMPARABLE')),
  score numeric,
  theta numeric,
  standard_error numeric,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(run_id, attempt_id),
  CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  CHECK ((mode='IRT' AND score IS NOT NULL AND theta IS NOT NULL) OR mode<>'IRT')
);
--> statement-breakpoint
ALTER TABLE public.irt_finalization_runs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irt_finalization_results_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY main_access ON public.irt_finalization_runs_v1 FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
CREATE POLICY main_access ON public.irt_finalization_results_v1 FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.irt_finalization_runs_v1, public.irt_finalization_results_v1 TO numora_main_runtime;

-- Forward-only research artifact adoption receipt.
-- Keeps legacy v3 adoption untouched and does not publish grades or XP.
CREATE TABLE public.irt_artifact_adoption_receipts_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.irt_calibration_requests_v1(id) ON DELETE RESTRICT,
  execution_id uuid REFERENCES irt_compute.compute_executions(id) ON DELETE RESTRICT,
  artifact_id uuid UNIQUE REFERENCES irt_compute.calibration_artifacts_v1(id) ON DELETE RESTRICT,
  artifact_digest text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','ADOPTED','FAILED')),
  failure_code text,
  batch_id uuid UNIQUE REFERENCES public.irt_batches(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE TABLE public.irt_artifact_adoption_packages_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.irt_artifact_adoption_receipts_v1(id) ON DELETE RESTRICT,
  package_id uuid NOT NULL REFERENCES public.assessment_packages(id) ON DELETE RESTRICT,
  package_version integer NOT NULL CHECK (package_version > 0),
  arm_id uuid NOT NULL,
  arm_kind text NOT NULL CHECK (arm_kind IN ('ORIGINAL','VARIANT')),
  manifest_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (receipt_id, package_id, arm_id),
  UNIQUE (receipt_id, arm_id)
);
--> statement-breakpoint
CREATE TABLE public.irt_artifact_adoption_attempts_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.irt_artifact_adoption_receipts_v1(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL REFERENCES public.assessment_attempts(id) ON DELETE RESTRICT,
  respondent_id text NOT NULL,
  package_id uuid NOT NULL REFERENCES public.assessment_packages(id) ON DELETE RESTRICT,
  package_version integer NOT NULL CHECK (package_version > 0),
  assigned_arm_id uuid NOT NULL,
  delivered_arm_id uuid NOT NULL,
  result_status text NOT NULL CHECK (result_status IN ('SCORED','INSUFFICIENT','NOT_COMPARABLE','UNSCORABLE')),
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (receipt_id, attempt_id),
  UNIQUE (receipt_id, respondent_id)
);
--> statement-breakpoint
ALTER TABLE public.irt_batches
  ADD COLUMN source_request_id uuid REFERENCES public.analysis_requests(id) ON DELETE RESTRICT,
  ADD COLUMN source_execution_id uuid REFERENCES irt_compute.compute_executions(id) ON DELETE RESTRICT,
  ADD COLUMN source_calibration_artifact_id uuid REFERENCES irt_compute.calibration_artifacts_v1(id) ON DELETE RESTRICT,
  ADD COLUMN adoption_receipt_id uuid UNIQUE REFERENCES public.irt_artifact_adoption_receipts_v1(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX irt_artifact_adoption_attempts_attempt_idx ON public.irt_artifact_adoption_attempts_v1(attempt_id);
CREATE INDEX irt_artifact_adoption_receipts_status_idx ON public.irt_artifact_adoption_receipts_v1(status, created_at);
ALTER TABLE public.irt_artifact_adoption_receipts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irt_artifact_adoption_packages_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irt_artifact_adoption_attempts_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY main_access ON public.irt_artifact_adoption_receipts_v1 FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
CREATE POLICY main_access ON public.irt_artifact_adoption_packages_v1 FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
CREATE POLICY main_access ON public.irt_artifact_adoption_attempts_v1 FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.irt_artifact_adoption_receipts_v1, public.irt_artifact_adoption_packages_v1, public.irt_artifact_adoption_attempts_v1 TO numora_main_runtime;

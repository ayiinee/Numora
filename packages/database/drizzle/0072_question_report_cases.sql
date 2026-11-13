-- Backfill case state without rewriting source reports or their audit records.
LOCK TABLE public.question_reports IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE public.question_report_cases (
  id uuid PRIMARY KEY REFERENCES public.question_reports(id) ON DELETE RESTRICT,
  question_version_id uuid NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  status public.report_status NOT NULL,
  follow_up text,
  revision_question_version_id uuid REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 0,
  CONSTRAINT question_report_cases_version_uq UNIQUE (question_version_id),
  CONSTRAINT question_report_cases_revision_ck CHECK (revision >= 0)
);
--> statement-breakpoint
ALTER TABLE public.question_report_cases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.question_report_cases FROM PUBLIC, numora_irt_runtime;
--> statement-breakpoint
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON public.question_report_cases FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE POLICY main_access ON public.question_report_cases FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.question_report_cases TO numora_main_runtime;
--> statement-breakpoint
CREATE INDEX question_reports_answer_idx ON public.question_reports (attempt_answer_id);
--> statement-breakpoint
CREATE INDEX attempt_items_question_version_idx ON public.attempt_items (question_version_id);
--> statement-breakpoint
WITH sources AS (
  SELECT r.*, i.question_version_id,
    first_value(r.id) OVER (PARTITION BY i.question_version_id ORDER BY r.reported_at, r.id) AS case_id,
    (SELECT max(a.created_at) FROM public.audit_logs a
      WHERE a.entity_type = 'question_report' AND a.entity_id = r.id AND a.action = 'report_updated') AS moderated_at
  FROM public.question_reports r
  JOIN public.attempt_answers a ON a.id = r.attempt_answer_id
  JOIN public.attempt_items i ON i.id = a.attempt_item_id
)
INSERT INTO public.question_report_cases (id, question_version_id, status, follow_up, revision_question_version_id)
SELECT DISTINCT ON (question_version_id) case_id, question_version_id, status, follow_up, revision_question_version_id
FROM sources
ORDER BY question_version_id,
  CASE status WHEN 'OPEN' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END,
  coalesce(moderated_at, reported_at) DESC, id DESC;
--> statement-breakpoint
CREATE FUNCTION public.attach_question_report_case() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  version_id uuid;
  report_case public.question_report_cases;
BEGIN
  SELECT i.question_version_id INTO STRICT version_id
  FROM public.attempt_answers a JOIN public.attempt_items i ON i.id = a.attempt_item_id
  WHERE a.id = NEW.attempt_answer_id;

  INSERT INTO public.question_report_cases (id, question_version_id, status, follow_up, revision_question_version_id)
  VALUES (NEW.id, version_id, NEW.status, NEW.follow_up, NEW.revision_question_version_id)
  ON CONFLICT (question_version_id) DO NOTHING;
  IF FOUND THEN RETURN NEW; END IF;

  SELECT * INTO STRICT report_case FROM public.question_report_cases
  WHERE question_version_id = version_id FOR UPDATE;

  IF report_case.status IN ('RESOLVED', 'REJECTED') THEN
    UPDATE public.question_report_cases SET status = 'OPEN', follow_up = NULL,
      revision_question_version_id = NULL, revision = revision + 1 WHERE id = report_case.id;
    INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata, created_at)
    VALUES ('report_case_reopened', 'question_report_case', report_case.id,
      jsonb_build_object('status', 'OPEN', 'reason', 'Laporan baru diterima.'), clock_timestamp());
  ELSE
    UPDATE public.question_report_cases SET revision = revision + 1 WHERE id = report_case.id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.attach_question_report_case() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER question_report_attach_case AFTER INSERT ON public.question_reports
FOR EACH ROW EXECUTE FUNCTION public.attach_question_report_case();

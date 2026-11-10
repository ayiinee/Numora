ALTER TABLE public.tryout_batches
 ADD COLUMN admin_title text,
 ADD COLUMN config_revision integer NOT NULL DEFAULT 1 CHECK (config_revision > 0),
 ADD COLUMN admin_published_at timestamptz,
 ADD COLUMN cancelled_at timestamptz,
 ADD COLUMN cancellation_reason text,
 ADD COLUMN mandiri_package_id uuid REFERENCES public.assessment_packages(id),
 ADD CONSTRAINT tryout_admin_title_ck CHECK (admin_title IS NULL OR length(trim(admin_title)) BETWEEN 1 AND 160),
 ADD CONSTRAINT tryout_admin_cancel_ck CHECK (cancelled_at IS NULL OR (admin_title IS NOT NULL AND length(trim(cancellation_reason)) > 0)),
 ADD CONSTRAINT tryout_admin_schedule_excl EXCLUDE USING gist (tstzrange(starts_at, closes_at, '[)') WITH &&)
 WHERE (admin_title IS NOT NULL AND admin_published_at IS NOT NULL AND cancelled_at IS NULL);
--> statement-breakpoint
CREATE TABLE public.tryout_school_delegations (
 batch_id uuid NOT NULL REFERENCES public.tryout_batches(id),
 school_id uuid NOT NULL REFERENCES public.schools(id),
 package_id uuid NOT NULL,
 PRIMARY KEY(batch_id,school_id),
 FOREIGN KEY(batch_id,package_id) REFERENCES public.tryout_batch_packages(batch_id,package_id)
);
ALTER TABLE public.tryout_school_delegations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.tryout_student_assignments (
 attempt_id uuid PRIMARY KEY REFERENCES public.assessment_attempts(id),
 batch_id uuid NOT NULL REFERENCES public.tryout_batches(id),
 student_id uuid NOT NULL REFERENCES public.users(id),
 school_id uuid REFERENCES public.schools(id),
 package_id uuid NOT NULL,
 allocation_method text NOT NULL DEFAULT 'ADMIN_DELEGATION' CHECK (allocation_method='ADMIN_DELEGATION'),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(batch_id,student_id),
 FOREIGN KEY(batch_id,package_id) REFERENCES public.tryout_batch_packages(batch_id,package_id)
);
ALTER TABLE public.tryout_student_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY main_runtime ON public.tryout_school_delegations TO numora_main_runtime USING (true) WITH CHECK (true);
CREATE POLICY main_runtime ON public.tryout_student_assignments TO numora_main_runtime USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tryout_school_delegations TO numora_main_runtime;
GRANT SELECT,INSERT ON public.tryout_student_assignments TO numora_main_runtime;
GRANT DELETE ON public.tryout_batch_packages TO numora_main_runtime;
REVOKE ALL ON public.tryout_school_delegations,public.tryout_student_assignments FROM PUBLIC;
CREATE TRIGGER tryout_student_assignments_immutable BEFORE UPDATE OR DELETE ON public.tryout_student_assignments FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();
--> statement-breakpoint
CREATE FUNCTION public.tryout_delegation_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.assessment_attempts a WHERE a.id=NEW.attempt_id
  AND a.tryout_batch_id=NEW.batch_id AND a.student_id=NEW.student_id
  AND a.package_id=NEW.package_id AND a.assessment_type='TRYOUT') THEN
  RAISE EXCEPTION 'Tryout assignment must match its attempt' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tryout_delegation_assignment_guard BEFORE INSERT ON public.tryout_student_assignments FOR EACH ROW EXECUTE FUNCTION public.tryout_delegation_assignment_guard();
REVOKE ALL ON FUNCTION public.tryout_delegation_assignment_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tryout_delegation_assignment_guard() TO numora_main_runtime;
--> statement-breakpoint
CREATE FUNCTION public.tryout_admin_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b public.tryout_batches; bid uuid;
BEGIN
 IF TG_TABLE_NAME='tryout_batches' THEN
  IF OLD.admin_title IS NOT NULL AND (OLD.starts_at<=clock_timestamp() OR OLD.cancelled_at IS NOT NULL)
   AND ROW(NEW.admin_title,NEW.package_id,NEW.starts_at,NEW.closes_at,NEW.cutoff_at,NEW.result_due_at,NEW.mandiri_package_id,NEW.admin_published_at,NEW.cancelled_at,NEW.cancellation_reason,NEW.config_revision)
    IS DISTINCT FROM ROW(OLD.admin_title,OLD.package_id,OLD.starts_at,OLD.closes_at,OLD.cutoff_at,OLD.result_due_at,OLD.mandiri_package_id,OLD.admin_published_at,OLD.cancelled_at,OLD.cancellation_reason,OLD.config_revision)
   THEN RAISE EXCEPTION 'Tryout batch configuration is locked' USING ERRCODE='23514'; END IF;
 ELSE
  bid:=CASE WHEN TG_OP='DELETE' THEN OLD.batch_id ELSE NEW.batch_id END;
  SELECT * INTO b FROM public.tryout_batches WHERE id=bid FOR SHARE;
  IF b.admin_title IS NOT NULL AND (b.starts_at<=clock_timestamp() OR b.cancelled_at IS NOT NULL)
   THEN RAISE EXCEPTION 'Tryout batch delegation is locked' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER tryout_admin_config_guard BEFORE UPDATE ON public.tryout_batches FOR EACH ROW EXECUTE FUNCTION public.tryout_admin_config_guard();
CREATE TRIGGER tryout_admin_package_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tryout_batch_packages FOR EACH ROW EXECUTE FUNCTION public.tryout_admin_config_guard();
CREATE TRIGGER tryout_admin_school_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tryout_school_delegations FOR EACH ROW EXECUTE FUNCTION public.tryout_admin_config_guard();
REVOKE ALL ON FUNCTION public.tryout_admin_config_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tryout_admin_config_guard() TO numora_main_runtime;

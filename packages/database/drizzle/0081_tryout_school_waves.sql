CREATE TABLE "tryout_waves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"original_package_id" uuid NOT NULL,
	"variant_package_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tryout_waves_pair_ck" CHECK ("tryout_waves"."original_package_id" <> "tryout_waves"."variant_package_id")
);
--> statement-breakpoint

ALTER TABLE "tryout_waves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE "tryout_wave_claims" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"wave_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"school_id" uuid,
	"package_id" uuid NOT NULL
);
--> statement-breakpoint

ALTER TABLE "tryout_wave_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "tryout_batches" ADD COLUMN "wave_id" uuid;--> statement-breakpoint

ALTER TABLE "tryout_waves" ADD CONSTRAINT "tryout_waves_original_package_id_assessment_packages_id_fk" FOREIGN KEY ("original_package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tryout_waves" ADD CONSTRAINT "tryout_waves_variant_package_id_assessment_packages_id_fk" FOREIGN KEY ("variant_package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tryout_wave_claims" ADD CONSTRAINT "tryout_wave_claims_attempt_id_assessment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tryout_wave_claims" ADD CONSTRAINT "tryout_wave_claims_wave_id_tryout_waves_id_fk" FOREIGN KEY ("wave_id") REFERENCES "public"."tryout_waves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tryout_wave_claims" ADD CONSTRAINT "tryout_wave_claims_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tryout_wave_claims" ADD CONSTRAINT "tryout_wave_claims_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "tryout_wave_claims_school_uq" ON "tryout_wave_claims" USING btree ("wave_id","student_id","school_id") WHERE "tryout_wave_claims"."school_id" is not null;--> statement-breakpoint

CREATE UNIQUE INDEX "tryout_wave_claims_mandiri_uq" ON "tryout_wave_claims" USING btree ("wave_id","student_id") WHERE "tryout_wave_claims"."school_id" is null;--> statement-breakpoint

ALTER TABLE "tryout_batches" ADD CONSTRAINT "tryout_batches_wave_id_tryout_waves_id_fk" FOREIGN KEY ("wave_id") REFERENCES "public"."tryout_waves"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE POLICY main_runtime ON public.tryout_waves TO numora_main_runtime USING (true) WITH CHECK (true);
CREATE POLICY main_runtime ON public.tryout_wave_claims TO numora_main_runtime USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON public.tryout_waves, public.tryout_wave_claims TO numora_main_runtime;
-- Row locking requires UPDATE privilege; immutable trigger still rejects mutations.
GRANT UPDATE(id) ON public.tryout_waves TO numora_main_runtime;
REVOKE ALL ON public.tryout_waves, public.tryout_wave_claims FROM PUBLIC;
CREATE TRIGGER tryout_waves_immutable BEFORE UPDATE OR DELETE ON public.tryout_waves FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();
CREATE TRIGGER tryout_wave_claims_immutable BEFORE UPDATE OR DELETE ON public.tryout_wave_claims FOR EACH ROW EXECUTE FUNCTION public.assessment_v2_immutable();
--> statement-breakpoint
CREATE FUNCTION public.guard_tryout_wave_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.users WHERE id=NEW.student_id FOR NO KEY UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.assessment_attempts a JOIN public.tryout_batches b ON b.id=a.tryout_batch_id JOIN public.tryout_student_assignments s ON s.attempt_id=a.id
      WHERE a.id=NEW.attempt_id AND a.student_id=NEW.student_id AND a.package_id=NEW.package_id AND b.wave_id=NEW.wave_id AND s.school_id IS NOT DISTINCT FROM NEW.school_id)
    THEN RAISE EXCEPTION 'TRYOUT_WAVE_ASSIGNMENT_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM public.tryout_wave_claims c WHERE c.student_id=NEW.student_id AND c.wave_id=NEW.wave_id AND (c.school_id IS NULL OR NEW.school_id IS NULL OR c.school_id=NEW.school_id))
    THEN RAISE EXCEPTION 'TRYOUT_WAVE_OPPORTUNITY_USED' USING ERRCODE='23505'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tryout_wave_claim_guard BEFORE INSERT ON public.tryout_wave_claims FOR EACH ROW EXECUTE FUNCTION public.guard_tryout_wave_claim();

--> statement-breakpoint
-- Compare against first actual item delivery, not attempt start. Two parallel
-- attempts can both start before either payload is issued.
CREATE FUNCTION public.tryout_prior_exposure_sources(p_student uuid, p_item uuid)
RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT ARRAY(SELECT DISTINCT CASE WHEN e.kind='EXPLANATION_PAYLOAD_ISSUED' THEN 'EXPLANATION' ELSE e.module END
    FROM public.student_item_exposures e
    JOIN public.content_delivery_items di ON di.id=e.delivery_item_id
    WHERE e.student_id=p_student AND e.family_id=(SELECT family_id FROM public.content_delivery_items WHERE attempt_item_id=p_item LIMIT 1)
    AND (e.occurred_at,e.id) < (SELECT own.occurred_at,own.id FROM public.student_item_exposures own
      JOIN public.content_delivery_items oi ON oi.id=own.delivery_item_id
      WHERE own.student_id=p_student AND oi.attempt_item_id=p_item AND own.kind='ITEM_PAYLOAD_ISSUED'
      ORDER BY own.occurred_at,own.id LIMIT 1))
$$;
REVOKE ALL ON FUNCTION public.tryout_prior_exposure_sources(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tryout_prior_exposure_sources(uuid,uuid) TO numora_main_runtime;

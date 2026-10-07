ALTER TABLE "xp_ledger" ALTER COLUMN "base_xp" SET DATA TYPE numeric(14, 6);--> statement-breakpoint
ALTER TABLE "scoring_policy_versions" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "scoring_policy_versions" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scoring_policy_versions" ADD COLUMN "approval_reference" text;--> statement-breakpoint
ALTER TABLE "scoring_policy_versions" ADD CONSTRAINT "scoring_policy_versions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_policy_versions" ADD CONSTRAINT "scoring_policy_versions_approval_ck" CHECK (("scoring_policy_versions"."approved_by_user_id" is null and "scoring_policy_versions"."approved_at" is null and "scoring_policy_versions"."approval_reference" is null) or ("scoring_policy_versions"."approved_by_user_id" is not null and "scoring_policy_versions"."approved_at" is not null and "scoring_policy_versions"."approval_reference" is not null and length(trim("scoring_policy_versions"."approval_reference")) > 0));
--> statement-breakpoint
CREATE FUNCTION public.admin_scoring_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Scoring policy history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF (OLD.status='PUBLISHED' OR OLD.approved_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.assessment_attempts WHERE scoring_policy_version_id=OLD.id)) AND
    (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
    RAISE EXCEPTION 'Approved or used scoring policy is immutable; create a new version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER admin_scoring_policy_guard BEFORE UPDATE OR DELETE ON public.scoring_policy_versions FOR EACH ROW EXECUTE FUNCTION public.admin_scoring_policy_guard();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.admin_scoring_policy_guard() FROM PUBLIC;

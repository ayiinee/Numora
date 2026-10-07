ALTER TABLE "assessment_blueprint_versions" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "assessment_blueprint_versions" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessment_blueprint_versions" ADD COLUMN "approval_reference" text;--> statement-breakpoint
ALTER TABLE "assessment_blueprint_versions" ADD CONSTRAINT "assessment_blueprint_versions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_blueprint_versions" ADD CONSTRAINT "assessment_blueprint_versions_approval_ck" CHECK (("assessment_blueprint_versions"."approved_by_user_id" is null and "assessment_blueprint_versions"."approved_at" is null and "assessment_blueprint_versions"."approval_reference" is null) or ("assessment_blueprint_versions"."approved_by_user_id" is not null and "assessment_blueprint_versions"."approved_at" is not null and "assessment_blueprint_versions"."approval_reference" is not null and length(trim("assessment_blueprint_versions"."approval_reference")) > 0));
--> statement-breakpoint
-- Legacy seed/demo packages have no editorial manifest. New publisher/review pins always do.
CREATE OR REPLACE FUNCTION public.admin_authored_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked boolean;
BEGIN
  SELECT manifest_digest IS NOT NULL INTO locked FROM public.assessment_packages
    WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.package_id ELSE NEW.package_id END FOR UPDATE;
  IF locked THEN RAISE EXCEPTION 'Published/reviewed package items are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

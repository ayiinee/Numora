-- Editorial publication pins do not impersonate scientific frozen_at/quality acceptance.
CREATE FUNCTION public.admin_authored_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.status='PUBLISHED' OR OLD.manifest_digest IS NOT NULL) AND (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
    RAISE EXCEPTION 'Published/reviewed package pins are immutable; create a new version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER admin_authored_package_guard BEFORE UPDATE ON public.assessment_packages FOR EACH ROW EXECUTE FUNCTION public.admin_authored_package_guard();
--> statement-breakpoint
CREATE FUNCTION public.admin_authored_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked boolean;
BEGIN
  SELECT status='PUBLISHED' OR manifest_digest IS NOT NULL INTO locked FROM public.assessment_packages
    WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.package_id ELSE NEW.package_id END FOR UPDATE;
  IF locked THEN RAISE EXCEPTION 'Published/reviewed package items are immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER admin_authored_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.package_items FOR EACH ROW EXECUTE FUNCTION public.admin_authored_item_guard();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.admin_authored_package_guard(),public.admin_authored_item_guard() FROM PUBLIC;

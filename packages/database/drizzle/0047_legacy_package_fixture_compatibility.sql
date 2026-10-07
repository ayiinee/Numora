-- Editorial manifests pin new production publications/reviews. Legacy seed/demo packages
-- retain the existing used/frozen guards and the API's published-edit prohibition.
CREATE OR REPLACE FUNCTION public.admin_authored_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.manifest_digest IS NOT NULL AND (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
  RAISE EXCEPTION 'Reviewed/published editorial pins are immutable; create a new version' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

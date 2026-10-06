-- Supabase installs owner default ACLs for Data API roles. RLS alone does not
-- protect owner-executed views or SECURITY DEFINER functions. Domain access is
-- through NestJS; preserve the explicit main/compute grants from ADR-005/011.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE role_name text; helper record;
BEGIN
  FOR helper IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND
      (p.proname LIKE 'measurement_%' OR
       p.proname IN ('record_assessment_delivery','record_pvp_delivery','package_can_distribute'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', helper.signature);
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role_name);
      FOR helper IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND
          (p.proname LIKE 'measurement_%' OR
           p.proname IN ('record_assessment_delivery','record_pvp_delivery','package_can_distribute'))
      LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', helper.signature, role_name);
      END LOOP;
      -- Defaults apply to the migration owner and public schema only. Supabase
      -- Auth/Storage schemas and explicit server runtime grants are untouched.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;

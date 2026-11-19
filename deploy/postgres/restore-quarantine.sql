\set ON_ERROR_STOP on
-- Local administrator only, on a NEW empty PR 2 target. Never disconnect active sessions.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
  IF current_database() !~ '^numora_(production|test_vps_restore_[a-f0-9]{32})$'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
    OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'numora_owner'
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')
    OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema'))
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
    OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')
    OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) THEN
    RAISE EXCEPTION 'Quarantine requires a new empty owner target without other sessions';
  END IF;
END $$;
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC,numora_api,numora_worker,numora_compute',current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO numora_migrator',current_database()) \gexec
COMMIT;
-- Remains closed after restore. No automatic GRANT CONNECT/unquarantine command.

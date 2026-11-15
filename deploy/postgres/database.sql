\set ON_ERROR_STOP on
\if :{?database_name}
\else
  \set database_name numora_production
\endif
-- Test names are used only by the disposable integration fixture.
SELECT :'database_name' ~ '^numora_(production|test_[a-z0-9_]+)$' AS valid_name \gset
\if :valid_name
\else
  \echo 'Expected numora_production or a disposable numora_test_* database'
  \quit 3
\endif
DO $$ BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
    OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'Bootstrap requires the local administrator on PostgreSQL 16';
  END IF;
END $$;
SELECT format('CREATE DATABASE %I OWNER numora_owner TEMPLATE template0 ENCODING %L', :'database_name','UTF8')
WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname=:'database_name') \gexec
-- Reconnect with the same admin connection settings, then atomically configure this database.
\connect :database_name
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $$ BEGIN
  IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'numora_owner'
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','irt_compute','drizzle') AND c.relowner<>'numora_owner'::regrole)
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','irt_compute','drizzle') AND p.proowner<>'numora_owner'::regrole) THEN
    RAISE EXCEPTION 'Unexpected database/object ownership; bootstrap does not remap restored objects';
  END IF;
END $$;
ALTER DATABASE :database_name SET timezone = 'UTC';
REVOKE ALL ON DATABASE :database_name FROM PUBLIC;
GRANT CONNECT ON DATABASE :database_name TO numora_api,numora_worker,numora_compute,numora_migrator;
ALTER SCHEMA public OWNER TO numora_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO numora_main_runtime,numora_irt_runtime;
-- Migrations connect as a dedicated login and create all objects as the stable NOLOGIN owner.
ALTER ROLE numora_migrator IN DATABASE :database_name SET role = 'numora_owner';
ALTER ROLE numora_api IN DATABASE :database_name SET search_path = pg_catalog,public;
ALTER ROLE numora_worker IN DATABASE :database_name SET search_path = pg_catalog,public;
ALTER ROLE numora_compute IN DATABASE :database_name SET search_path = pg_catalog,irt_compute,public;
ALTER ROLE numora_api IN DATABASE :database_name SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE numora_worker IN DATABASE :database_name SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE numora_compute IN DATABASE :database_name SET idle_in_transaction_session_timeout = '60s';
-- Table/sequence/function privileges, RLS and policies belong exclusively to canonical migrations.
COMMIT;

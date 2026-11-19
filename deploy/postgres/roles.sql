\set ON_ERROR_STOP on
-- Cluster bootstrap by the local PostgreSQL administrator, before migrations/restore.
-- No password literals: new logins cannot authenticate until provisioned with \password.
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $$
DECLARE item record; existing record;
BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'Bootstrap requires the local administrator on PostgreSQL 16';
  END IF;
  -- Validate every existing role before creating or granting anything. Never repair an
  -- unexpected privileged account silently or reset an existing password on a rerun.
  FOR item IN SELECT * FROM (VALUES
    ('numora_owner',false,false,-1),
    ('numora_main_runtime',false,false,-1),
    ('numora_irt_runtime',false,false,-1),
    ('numora_api',true,true,12),
    ('numora_worker',true,true,12),
    ('numora_compute',true,true,4),
    ('numora_migrator',true,false,2)
  ) AS roles(name,login,inherit,connection_limit) LOOP
    SELECT * INTO existing FROM pg_roles WHERE rolname=item.name;
    IF FOUND AND (existing.rolsuper OR existing.rolcreatedb OR existing.rolcreaterole
      OR existing.rolreplication OR existing.rolbypassrls
      OR existing.rolcanlogin<>item.login OR existing.rolinherit<>item.inherit
      OR existing.rolconnlimit<>item.connection_limit) THEN
      RAISE EXCEPTION 'Existing bootstrap role attributes differ; inspect before proceeding';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid
    WHERE member.rolname IN ('numora_owner','numora_main_runtime','numora_irt_runtime',
      'numora_api','numora_worker','numora_compute','numora_migrator')
    AND (m.admin_option OR NOT (
      (member.rolname IN ('numora_api','numora_worker') AND parent.rolname='numora_main_runtime' AND m.inherit_option AND NOT m.set_option)
      OR (member.rolname='numora_compute' AND parent.rolname='numora_irt_runtime' AND m.inherit_option AND NOT m.set_option)
      OR (member.rolname='numora_migrator' AND parent.rolname='numora_owner' AND NOT m.inherit_option AND m.set_option)
    ))
  ) OR EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid
    WHERE parent.rolname IN ('numora_owner','numora_api','numora_worker','numora_compute','numora_migrator')
      AND NOT (parent.rolname='numora_owner' AND member.rolname='numora_migrator'
        AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)
  ) THEN RAISE EXCEPTION 'Existing bootstrap memberships differ; inspect before proceeding'; END IF;
  FOR item IN SELECT * FROM (VALUES
    ('numora_owner',false,false,-1),('numora_main_runtime',false,false,-1),
    ('numora_irt_runtime',false,false,-1),('numora_api',true,true,12),
    ('numora_worker',true,true,12),('numora_compute',true,true,4),('numora_migrator',true,false,2)
  ) AS roles(name,login,inherit,connection_limit) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=item.name) THEN
      EXECUTE format('CREATE ROLE %I %s %s NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT %s',
        item.name,CASE WHEN item.login THEN 'LOGIN' ELSE 'NOLOGIN' END,
        CASE WHEN item.inherit THEN 'INHERIT' ELSE 'NOINHERIT' END,item.connection_limit);
    END IF;
  END LOOP;
END $$;
GRANT numora_main_runtime TO numora_api,numora_worker WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT numora_irt_runtime TO numora_compute WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT numora_owner TO numora_migrator WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
COMMIT;

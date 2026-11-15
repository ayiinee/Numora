import type { Sql, TransactionSql } from 'postgres';
import { backupCheck, backupSchemas } from './backup-config.js';

type Query = Sql | TransactionSql;
export const qualifiedRelation = (sql: Query, schema: string, name: string) =>
  sql.unsafe([schema, name].map((part) => '"' + part.replaceAll('"', '""') + '"').join('.'));
export type TableProof = { schema: string; name: string; rows: string; sums: string[] };
export type SequenceProof = { schema: string; name: string; lastValue: string; isCalled: boolean };

/** Counts and commutative SHA-256 row accumulators run on the DB; row data never leaves as JSON. */
export async function tableProofs(sql: Query): Promise<TableProof[]> {
  const tables = await sql<{ schema: string; name: string }[]>`
    SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=ANY(${[...backupSchemas]}) AND c.relkind IN ('r','m') ORDER BY 1,2`;
  const result: TableProof[] = [];
  for (const table of tables) {
    const [proof] = await sql<{ rows: string; sums: string[] }[]>`
      WITH hashes AS MATERIALIZED (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS hash
        FROM ONLY ${qualifiedRelation(sql, table.schema, table.name)} t)
      SELECT count(*)::text AS rows, ARRAY[
        coalesce(sum(('x'||substr(hash,1,16))::bit(64)::bigint::numeric),0)::text,
        coalesce(sum(('x'||substr(hash,17,16))::bit(64)::bigint::numeric),0)::text,
        coalesce(sum(('x'||substr(hash,33,16))::bit(64)::bigint::numeric),0)::text,
        coalesce(sum(('x'||substr(hash,49,16))::bit(64)::bigint::numeric),0)::text] AS sums FROM hashes`;
    result.push({ ...table, ...proof! });
  }
  return result;
}

export async function sequenceProofs(sql: Query): Promise<SequenceProof[]> {
  const sequences = await sql<{ schema: string; name: string }[]>`
    SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=ANY(${[...backupSchemas]}) AND c.relkind='S' ORDER BY 1,2`;
  const result: SequenceProof[] = [];
  for (const sequence of sequences) {
    const [state] = await sql<{ lastValue: string; isCalled: boolean }[]>`
      SELECT last_value::text AS "lastValue",is_called AS "isCalled" FROM ${qualifiedRelation(sql, sequence.schema, sequence.name)}`;
    result.push({ ...sequence, ...state! });
  }
  return result;
}

export async function catalog(sql: Query) {
  const schemas = [...backupSchemas];
  const [identity] = await sql`
    SELECT current_database() AS database,session_user AS login,current_user AS actor,
      current_setting('server_version_num')::int AS "versionNum",current_setting('server_version') AS version,
      pg_database_size(current_database())::text AS "databaseBytes",
      pg_encoding_to_char(d.encoding) AS encoding,d.datcollate AS collate,d.datctype AS ctype
    FROM pg_database d WHERE datname=current_database()`;
  backupCheck(identity, 'Database identity is unavailable');
  const namespaces = await sql`SELECT nspname AS name,pg_get_userbyid(nspowner) AS owner,
    coalesce(nspacl,acldefault('n',nspowner))::text AS acl,
    EXISTS(SELECT 1 FROM aclexplode(coalesce(nspacl,acldefault('n',nspowner))) a
      WHERE a.grantee=0 AND a.privilege_type='USAGE') AS "publicUsage"
    FROM pg_namespace WHERE nspname=ANY(${schemas}) ORDER BY 1`;
  backupCheck(namespaces.length === 3, 'All three application schemas must exist');
  const relations = await sql`
    SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner,
      c.relrowsecurity AS rls,c.relforcerowsecurity AS "forceRls",
      coalesce(c.relacl,acldefault((CASE WHEN c.relkind='S' THEN 'S' ELSE 'r' END)::"char",c.relowner))::text AS acl,
      CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE NULL END AS definition,
      c.reloptions AS options FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=ANY(${schemas}) ORDER BY 1,2`;
  backupCheck(
    !relations.some((item) => ['f'].includes(item.kind)),
    'Foreign-table data needs a separate reviewed backup scope',
  );
  const columns = await sql`
    SELECT n.nspname AS schema,c.relname AS relation,
      row_number() OVER(PARTITION BY c.oid ORDER BY a.attnum)::int AS position,a.attname AS name,
      format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull",a.attidentity AS identity,
      a.attgenerated AS generated,pg_get_expr(d.adbin,d.adrelid) AS "default",coalesce(a.attacl,'{}')::text AS acl
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname=ANY(${schemas}) AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,3`;
  const constraints = await sql`
    SELECT n.nspname AS schema,c.conname AS name,c.conrelid::regclass::text AS relation,
      c.convalidated AS validated,pg_get_constraintdef(c.oid,true) AS definition
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=ANY(${schemas}) ORDER BY 1,3,2`;
  const indexes = await sql`
    SELECT n.nspname AS schema,c.relname AS name,i.indisvalid AS valid,pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=ANY(${schemas}) ORDER BY 1,2`;
  const functions = await sql`
    SELECT n.nspname AS schema,p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,
      p.prosecdef AS "securityDefiner",coalesce(p.proacl,acldefault('f',p.proowner))::text AS acl,p.proconfig AS config,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname=ANY(${schemas}) AND p.prokind IN ('f','p') ORDER BY 1,2`;
  const triggers = await sql`
    SELECT n.nspname AS schema,c.relname AS relation,t.tgname AS name,t.tgenabled AS enabled,
      pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(${schemas}) AND NOT t.tgisinternal ORDER BY 1,2,3`;
  const policies = await sql`SELECT schemaname AS schema,tablename AS relation,policyname AS name,
    permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=ANY(${schemas}) ORDER BY 1,2,3`;
  const defaults = await sql`
    SELECT pg_get_userbyid(d.defaclrole) AS owner,n.nspname AS schema,d.defaclobjtype AS type,d.defaclacl::text AS acl
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    WHERE n.nspname=ANY(${schemas}) OR d.defaclnamespace=0 ORDER BY 1,2,3`;
  const types = await sql`
    SELECT n.nspname AS schema,t.typname AS name,t.typtype AS type,pg_get_userbyid(t.typowner) AS owner,
      coalesce(t.typacl,acldefault('T',t.typowner))::text AS acl,ARRAY(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname=ANY(${schemas}) AND t.typtype IN ('e','d','r') ORDER BY 1,2`;
  const extensions = await sql`SELECT e.extname AS name,e.extversion AS version,n.nspname AS schema,
    pg_get_userbyid(e.extowner) AS owner FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1`;
  const dependencies = await sql`
    SELECT DISTINCT src.type AS "sourceType",src.identity AS source,dst.type AS "targetType",dst.identity AS target,dst.schema AS "targetSchema"
    FROM pg_depend d CROSS JOIN LATERAL pg_identify_object(d.classid,d.objid,d.objsubid) src
    CROSS JOIN LATERAL pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) dst
    WHERE src.schema=ANY(${schemas}) AND dst.schema IS NOT NULL AND NOT dst.schema=ANY(${schemas})
      AND dst.schema !~ '^pg_' AND dst.schema<>'information_schema' ORDER BY 1,2,3,4`;
  const roles =
    await sql`SELECT rolname AS name,rolsuper AS superuser,rolinherit AS inherit,rolcreaterole AS "createRole",
    rolcreatedb AS "createDb",rolcanlogin AS login,rolreplication AS replication,rolbypassrls AS "bypassRls",
    rolconnlimit AS "connectionLimit" FROM pg_roles ORDER BY 1`;
  const memberships =
    await sql`SELECT parent.rolname AS parent,member.rolname AS member,m.admin_option AS admin,
    m.inherit_option AS inherit,m.set_option AS set FROM pg_auth_members m
    JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member ORDER BY 1,2`;
  // No SQL text, backend IPs, tokens or role password hashes in the manifest.
  const sessions =
    await sql`SELECT usename AS login,application_name AS application,state,count(*)::int AS count
    FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY 1,2,3 ORDER BY 1,2,3`;
  const largeObjects = await sql`SELECT count(*)::text AS count FROM pg_largeobject_metadata`;
  backupCheck(
    largeObjects[0]!.count === '0',
    'Large objects require an explicitly expanded backup scope',
  );
  const history =
    await sql`SELECT id,hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY id`;
  backupCheck(history.length > 0, 'Migration history must be present');
  return {
    identity,
    namespaces,
    relations,
    columns,
    constraints,
    indexes,
    functions,
    triggers,
    policies,
    defaults,
    types,
    extensions,
    dependencies,
    roles,
    memberships,
    sessions,
    history,
  };
}

/** Canonical comparison excludes volatile identities/sessions/cluster roles and ACL ordering. */
export function stableCatalog(value: Awaited<ReturnType<typeof catalog>>) {
  const {
    namespaces,
    relations,
    columns,
    constraints,
    indexes,
    functions,
    triggers,
    policies,
    types,
    defaults,
    history,
  } = value;
  const normalize = (rows: unknown) =>
    JSON.stringify(rows, (_key, item) => {
      if (
        typeof item === 'string' &&
        item.startsWith('{') &&
        item.endsWith('}') &&
        item.includes('=')
      )
        return item.slice(1, -1).split(',').sort().join(',');
      return item;
    });
  return normalize({
    namespaces,
    relations,
    columns,
    constraints,
    indexes,
    functions,
    triggers,
    policies,
    types,
    defaults,
    history,
  });
}

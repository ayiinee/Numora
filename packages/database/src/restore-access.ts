import type { Sql, TransactionSql } from 'postgres';
import { backupCheck, backupSchemas } from './backup-config.js';

export type Grant = { grantee: string; grantor: string; privilege: string; grantable: boolean };
export type AccessObject = {
  kind: string;
  schema: string | null;
  name: string;
  identity: string;
  column: string | null;
  owner: string;
  grants: Grant[];
};
export const accessKey = (item: AccessObject) =>
  JSON.stringify([
    item.kind,
    item.schema,
    item.name,
    item.identity,
    item.column,
    item.kind === 'DEFAULT' ? item.owner : null,
  ]);
export const sortAccess = (items: AccessObject[]) =>
  items
    .sort((a, b) => (accessKey(a) < accessKey(b) ? -1 : accessKey(a) > accessKey(b) ? 1 : 0))
    .map((item) => ({
      ...item,
      grants: [...item.grants].sort((a, b) =>
        JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0,
      ),
    }));
export const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';

/** Explicit empty ACL objects are retained; never parse aclitem text or rewrite a SQL dump. */
export async function restoreAccess(sql: Sql | TransactionSql): Promise<AccessObject[]> {
  const rows = await sql<(Omit<AccessObject, 'grants'> & Grant)[]>`
    WITH objects AS (
      SELECT 'SCHEMA' AS kind,nspname AS schema,nspname AS name,'' AS identity,NULL::text AS column,
        nspowner AS owner,coalesce(nspacl,acldefault('n',nspowner)) AS acl FROM pg_namespace WHERE nspname=ANY(${[...backupSchemas]})
      UNION ALL SELECT CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,n.nspname,c.relname,'',NULL,c.relowner,
        coalesce(c.relacl,acldefault((CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END)::"char",c.relowner))
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=ANY(${[...backupSchemas]}) AND c.relkind IN ('r','p','v','m','S')
      UNION ALL SELECT 'COLUMN',n.nspname,c.relname,'',a.attname,c.relowner,coalesce(a.attacl,'{}')
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=ANY(${[...backupSchemas]}) AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped
      UNION ALL SELECT 'FUNCTION',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),NULL,p.proowner,
        coalesce(p.proacl,acldefault('f',p.proowner)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname=ANY(${[...backupSchemas]}) AND p.prokind IN ('f','p')
      UNION ALL SELECT 'TYPE',n.nspname,t.typname,'',NULL,t.typowner,coalesce(t.typacl,acldefault('T',t.typowner))
        FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=ANY(${[...backupSchemas]}) AND t.typtype IN ('e','d','r')
      UNION ALL SELECT 'DEFAULT',n.nspname,d.defaclobjtype::text,'',NULL,d.defaclrole,d.defaclacl
        FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname=ANY(${[...backupSchemas]}) OR d.defaclnamespace=0
    ) SELECT o.kind,o.schema,o.name,o.identity,o.column,pg_get_userbyid(o.owner) AS owner,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' WHEN a.grantee IS NOT NULL THEN pg_get_userbyid(a.grantee) END AS grantee,
      pg_get_userbyid(a.grantor) AS grantor,a.privilege_type AS privilege,a.is_grantable AS grantable
    FROM objects o LEFT JOIN LATERAL aclexplode(CASE WHEN cardinality(o.acl)>0 THEN o.acl ELSE NULL::aclitem[] END) a ON true
    ORDER BY o.kind,o.schema,o.name,o.identity,o.column`;
  const objects = new Map<string, AccessObject>();
  for (const row of rows) {
    const object: AccessObject = {
      kind: row.kind,
      schema: row.schema,
      name: row.name,
      identity: row.identity,
      column: row.column,
      owner: row.owner,
      grants: [],
    };
    const key = accessKey(object),
      item = objects.get(key) ?? object;
    if (row.grantee !== null)
      item.grants.push({
        grantee: row.grantee,
        grantor: row.grantor,
        privilege: row.privilege,
        grantable: row.grantable,
      });
    objects.set(key, item);
  }
  return sortAccess([...objects.values()]);
}

const privileges: Record<string, readonly string[]> = {
  SCHEMA: ['USAGE', 'CREATE'],
  TABLE: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
  SEQUENCE: ['USAGE', 'SELECT', 'UPDATE'],
  COLUMN: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
  FUNCTION: ['EXECUTE'],
  TYPE: ['USAGE'],
  r: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
  S: ['USAGE', 'SELECT', 'UPDATE'],
  f: ['EXECUTE'],
  T: ['USAGE'],
  n: ['USAGE', 'CREATE'],
};
const defaultKinds: Record<string, string> = {
  r: 'TABLES',
  S: 'SEQUENCES',
  f: 'FUNCTIONS',
  T: 'TYPES',
  n: 'SCHEMAS',
};

export function aclStatements(object: AccessObject): string[] {
  backupCheck(
    object.owner === 'numora_owner' &&
      (object.schema === null || (backupSchemas as readonly string[]).includes(object.schema)),
    'ACL replay must target the stable owner and approved schemas',
  );
  // Retain the fixed owner's schema USAGE/CREATE while resolving objects for the replay.
  const roles = [
    'PUBLIC',
    ...(object.kind === 'SCHEMA' ? [] : ['numora_owner']),
    'numora_main_runtime',
    'numora_irt_runtime',
  ];
  const role = (value: string) => (value === 'PUBLIC' ? 'PUBLIC' : identifier(value));
  const table = object.schema ? identifier(object.schema) + '.' + identifier(object.name) : '';
  let prefix = '',
    on = '';
  if (object.kind === 'DEFAULT') {
    backupCheck(defaultKinds[object.name], 'Unsupported default privilege kind');
    prefix =
      'ALTER DEFAULT PRIVILEGES FOR ROLE numora_owner' +
      (object.schema ? ' IN SCHEMA ' + identifier(object.schema) : '') +
      ' ';
    on = defaultKinds[object.name]!;
  } else if (object.kind === 'SCHEMA') on = 'SCHEMA ' + identifier(object.name);
  else if (object.kind === 'FUNCTION') on = 'FUNCTION ' + table + '(' + object.identity + ')';
  else if (object.kind === 'COLUMN') on = 'TABLE ' + table;
  else {
    backupCheck(['TABLE', 'SEQUENCE', 'TYPE'].includes(object.kind), 'Unsupported ACL object kind');
    on = object.kind + ' ' + table;
  }
  const statements =
    object.kind === 'COLUMN'
      ? [
          'REVOKE ALL (' +
            identifier(object.column!) +
            ') ON ' +
            on +
            ' FROM ' +
            roles.map(role).join(','),
        ]
      : [prefix + 'REVOKE ALL ON ' + on + ' FROM ' + roles.map(role).join(',')];
  for (const grant of object.grants) {
    backupCheck(
      ['PUBLIC', 'numora_owner', 'numora_main_runtime', 'numora_irt_runtime'].includes(
        grant.grantee,
      ) &&
        grant.grantor === 'numora_owner' &&
        privileges[object.kind === 'DEFAULT' ? object.name : object.kind]?.includes(
          grant.privilege,
        ),
      'Unsupported role, grantor or privilege in ACL replay',
    );
    statements.push(
      prefix +
        'GRANT ' +
        grant.privilege +
        (object.kind === 'COLUMN' ? ' (' + identifier(object.column!) + ')' : '') +
        ' ON ' +
        on +
        ' TO ' +
        role(grant.grantee) +
        (grant.grantable ? ' WITH GRANT OPTION' : ''),
    );
  }
  return statements;
}

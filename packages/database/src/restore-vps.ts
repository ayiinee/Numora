import { lstat, mkdir, readFile, realpath, rmdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { Sql, TransactionSql } from 'postgres';
import { backupCheck, backupTarget } from './backup-config.js';
import { catalog, sequenceProofs, tableProofs } from './backup-catalog.js';
import {
  aclStatements,
  accessKey,
  restoreAccess,
  sortAccess,
  type AccessObject,
} from './restore-access.js';
import {
  mappedAccess,
  ownerMapping,
  restoreSelection,
  structuralCatalog,
  type Mapping,
} from './restore-plan.js';
import {
  assertIdentity,
  database,
  fileHash,
  privatePath,
  privateWrite,
  sessionSettings,
  toolEnvironment,
  toolRun,
  toolVersion,
  verifyBackup,
  type Inventory,
} from './backup-runtime.js';

export function vpsRestoreTarget(env: NodeJS.ProcessEnv) {
  const url = backupTarget(env, 'TARGET');
  backupCheck(
    decodeURIComponent(url.username) === 'numora_migrator' &&
      /^\/(?:numora_production|numora_test_vps_restore_[a-f0-9]{32})$/.test(url.pathname) &&
      !url.hostname.endsWith('.supabase.co') &&
      !url.hostname.endsWith('.pooler.supabase.com'),
    'VPS restore requires the dedicated migrator and an explicit new production/restore-test target',
  );
  return url;
}

export async function newReport(path: string) {
  backupCheck(isAbsolute(path), 'Use an absolute private restore-plan/report path');
  await privatePath(dirname(path), true);
  backupCheck(
    (await realpath(dirname(path))) === resolve(dirname(path)),
    'Restore report parent must not traverse symbolic links',
  );
  try {
    await lstat(path);
    backupCheck(false, 'Restore plan/report already exists');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
}

async function assertConnectionFence(sql: Sql | TransactionSql) {
  const grants =
    await sql`SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee
    FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
    WHERE d.datname=current_database() AND a.privilege_type IN ('CONNECT','CREATE','TEMPORARY')`;
  backupCheck(
    grants.every((row) => ['numora_owner', 'numora_migrator'].includes(row.grantee)),
    'New target must be connection-fenced: no PUBLIC/runtime/other database access',
  );
}

export async function prepareVpsRestore(folder: string, mappingFile: string, report: string) {
  await newReport(report);
  const { manifest, inventory } = await verifyBackup(folder);
  backupCheck(
    manifest.sourceMajor === 16,
    'This VPS mapping profile requires a PostgreSQL 16 source archive',
  );
  const mapping = ownerMapping(JSON.parse(await readFile(mappingFile, 'utf8')));
  const access = mappedAccess(inventory, mapping);
  const selection = restoreSelection(await readFile(join(folder, 'archive.list'), 'utf8'));
  await privateWrite(
    report,
    JSON.stringify(
      {
        format: 'NUMORA_VPS_RESTORE_PLAN_V1',
        preparedAt: new Date().toISOString(),
        manifestSha256: await fileHash(join(folder, 'manifest.json')),
        mappingSha256: await fileHash(mappingFile),
        sourceMajor: manifest.sourceMajor,
        mapping,
        access,
        selection,
        semantics:
          'ALL_OBJECTS_OWNED_BY_numora_owner;DROP_REVIEWED_GRANTEES;NO_PUBLIC_SCHEMA_ACCESS;KEEP_DATA_AND_RUNTIME_GROUP_GRANTS',
        execution: 'NOT_APPLIED;TARGET_MUST_BE_EMPTY_AND_CONNECTION_FENCED',
      },
      null,
      2,
    ) + '\n',
  );
}

async function runtimeRoleBoundary(sql: Sql) {
  const roles =
    await sql`SELECT r.rolname AS name,r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls AS elevated,
    r.rolcanlogin AS login,r.rolinherit AS inherit,
    EXISTS(SELECT 1 FROM pg_roles p WHERE pg_has_role(r.oid,p.oid,'MEMBER') AND
      (p.rolsuper OR p.rolcreatedb OR p.rolcreaterole OR p.rolreplication OR p.rolbypassrls OR
        p.rolname IN ('pg_read_all_data','pg_write_all_data','pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_signal_backend','pg_maintain'))) AS inherited_elevation,
    pg_has_role(r.oid,'numora_owner','MEMBER') AS owner_member,
    pg_has_role(r.oid,'numora_main_runtime','MEMBER') AS main_member,
    pg_has_role(r.oid,'numora_irt_runtime','MEMBER') AS compute_member
    FROM pg_roles r WHERE r.rolname IN ('numora_owner','numora_migrator','numora_api','numora_worker','numora_compute','numora_main_runtime','numora_irt_runtime')`;
  backupCheck(roles.length === 7, 'Provision all seven reviewed VPS roles before restore');
  for (const role of roles) {
    backupCheck(
      !role.elevated && !role.inherited_elevation,
      'VPS roles must not have direct/inherited administrative or BYPASSRLS privileges',
    );
    if (['numora_owner', 'numora_main_runtime', 'numora_irt_runtime'].includes(role.name))
      backupCheck(!role.login, 'Owner/runtime groups must remain NOLOGIN');
    else backupCheck(role.login, 'Service/migration identities must be separate logins');
    if (['numora_api', 'numora_worker'].includes(role.name))
      backupCheck(
        role.main_member && !role.compute_member && !role.owner_member && role.inherit,
        'API/worker must inherit Main only, without owner or Compute membership',
      );
    if (role.name === 'numora_compute')
      backupCheck(
        role.compute_member && !role.main_member && !role.owner_member && role.inherit,
        'Compute must inherit Compute only, without owner/Main membership',
      );
    if (role.name === 'numora_migrator')
      backupCheck(
        role.owner_member && !role.main_member && !role.compute_member && !role.inherit,
        'Migrator must use the separate owner role without runtime memberships',
      );
  }
  const memberships =
    await sql`SELECT parent.rolname AS parent,member.rolname AS member,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS set
    FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
    WHERE member.rolname IN ('numora_owner','numora_main_runtime','numora_irt_runtime','numora_api','numora_worker','numora_compute','numora_migrator')
      OR parent.rolname IN ('numora_owner','numora_api','numora_worker','numora_compute','numora_migrator')`;
  backupCheck(
    memberships.length === 4 &&
      memberships.every(
        (row) =>
          !row.admin &&
          ((['numora_api', 'numora_worker'].includes(row.member) &&
            row.parent === 'numora_main_runtime' &&
            row.inherit &&
            !row.set) ||
            (row.member === 'numora_compute' &&
              row.parent === 'numora_irt_runtime' &&
              row.inherit &&
              !row.set) ||
            (row.member === 'numora_migrator' &&
              row.parent === 'numora_owner' &&
              !row.inherit &&
              row.set)),
      ),
    'VPS role memberships differ from the reviewed bootstrap',
  );
}

async function targetPreflight(sql: Sql, url: URL, major: number) {
  await sql.begin('READ ONLY', async (tx) => {
    await sessionSettings(tx);
    const [state] = await tx`SELECT current_user AS actor,session_user AS login,
      pg_get_userbyid(d.datdba) AS owner,
      (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) AS others
      FROM pg_database d WHERE datname=current_database()`;
    backupCheck(
      state?.actor === 'numora_owner' &&
        state.login === 'numora_migrator' &&
        state.owner === 'numora_owner' &&
        state.others === 0,
      'Restore must run locally as migrator/owner on a new dedicated owner database without other sessions',
    );
    // pg_stat_ssl masks session details when current_user is the NOLOGIN owner rather
    // than the backend login. Inspect as the original migrator, then restore its owner context.
    await tx.unsafe('SET LOCAL ROLE NONE');
    backupCheck(
      (await assertIdentity(tx, url)) === major,
      'Archive, restore tools and VPS server major must match',
    );
    await tx.unsafe('SET LOCAL ROLE numora_owner');
    await assertConnectionFence(tx);
    const schemas =
      await tx`SELECT nspname,pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema'`;
    const [objects] =
      await tx`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'`;
    backupCheck(
      schemas.length === 1 &&
        schemas[0]!.nspname === 'public' &&
        schemas[0]!.owner === 'numora_owner' &&
        objects?.count === 0,
      'Restore target must contain only the empty bootstrap public schema; no overwrite is supported',
    );
    const extra =
      await tx`SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')+
      (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')+
      (SELECT count(*) FROM pg_default_acl WHERE defaclrole='numora_owner'::regrole) AS count`;
    backupCheck(
      extra[0]!.count === '0',
      'Bootstrap owner must have no existing custom functions/types/default privileges',
    );
  });
  await runtimeRoleBoundary(sql);
}

export async function applyAccess(sql: Sql, expected: AccessObject[]) {
  await sql.begin('READ WRITE', async (tx) => {
    await sessionSettings(tx);
    const actual = await restoreAccess(tx);
    const actualObjects = new Map(
      actual.filter((item) => item.kind !== 'DEFAULT').map((item) => [accessKey(item), item]),
    );
    const replay: string[][] = [];
    for (const item of expected) {
      if (item.kind !== 'DEFAULT')
        backupCheck(
          actualObjects.has(accessKey(item)),
          'Restored ACL object inventory differs from the source plan',
        );
      // Names/identities used for SQL come from the target catalog. Only reviewed privileges/roles are replayed.
      const target = item.kind === 'DEFAULT' ? item : actualObjects.get(accessKey(item))!;
      replay.push(aclStatements({ ...target, grants: item.grants }));
    }
    backupCheck(
      actualObjects.size === expected.filter((item) => item.kind !== 'DEFAULT').length,
      'Restored target has extra ACL objects',
    );
    // Table REVOKE can also erase column grants. Finish all resets before replaying any grants.
    for (const statements of replay) await tx.unsafe(statements[0]!);
    for (const statements of replay)
      for (const statement of statements.slice(1)) await tx.unsafe(statement);
  });
}

export async function verifyMappedRestore(
  sql: Sql,
  inventory: Inventory,
  expected: AccessObject[],
) {
  await runtimeRoleBoundary(sql);
  await sql.begin('ISOLATION LEVEL REPEATABLE READ READ ONLY', async (tx) => {
    await sessionSettings(tx);
    const actual = await catalog(tx);
    backupCheck(
      structuralCatalog(actual) === structuralCatalog(inventory),
      'Restored structural schema/function/policy/history evidence differs',
    );
    backupCheck(
      actual.namespaces.every((row) => row.owner === 'numora_owner') &&
        actual.relations.every((row) => row.owner === 'numora_owner') &&
        actual.functions.every((row) => row.owner === 'numora_owner') &&
        actual.types.every((row) => row.owner === 'numora_owner'),
      'Restored objects and SECURITY DEFINER functions must all have the stable non-login owner',
    );
    const access = actual.restoreAccess.filter(
      (item) => item.kind !== 'DEFAULT' || item.owner === 'numora_owner',
    );
    backupCheck(
      JSON.stringify(sortAccess(access)) === JSON.stringify(expected),
      'Restored grants/default privileges differ from the approved mapping',
    );
    backupCheck(
      JSON.stringify(await tableProofs(tx)) === JSON.stringify(inventory.tableProofs),
      'Restored row counts or fingerprints differ',
    );
    backupCheck(
      JSON.stringify(await sequenceProofs(tx)) === JSON.stringify(inventory.sequenceAfter),
      'Restored sequence state differs',
    );
    const [permissions] = await tx`SELECT
      has_table_privilege('numora_api','public.users','SELECT') AND has_table_privilege('numora_worker','public.users','SELECT') AS main_reads,
      has_table_privilege('numora_compute','public.users','SELECT') OR has_table_privilege('numora_compute','public.users','INSERT') OR has_table_privilege('numora_compute','public.users','UPDATE') AS compute_pii,
      has_table_privilege('numora_main_runtime','irt_compute.compute_outputs','INSERT') OR has_table_privilege('numora_main_runtime','irt_compute.compute_outputs','UPDATE') OR has_table_privilege('numora_main_runtime','irt_compute.compute_outputs','DELETE') AS main_artifact_write,
      has_table_privilege('numora_compute','public.irt_input_principals_v3','SELECT') AS compute_input,
      has_schema_privilege('numora_api','public','CREATE') OR has_schema_privilege('numora_compute','irt_compute','CREATE') OR has_database_privilege('numora_api',current_database(),'CREATE') AS runtime_ddl`;
    backupCheck(
      permissions?.main_reads &&
        !permissions.compute_pii &&
        !permissions.main_artifact_write &&
        permissions.compute_input &&
        !permissions.runtime_ddl,
      'Mapped Main/Compute read/write/DDL boundaries failed',
    );
  });
}

export async function restoreVps(url: URL, folder: string, planFile: string, report: string) {
  backupCheck(
    decodeURIComponent(url.username) === 'numora_migrator' &&
      /^\/(?:numora_production|numora_test_vps_restore_[a-f0-9]{32})$/.test(url.pathname),
    'Mapped restore is restricted to the dedicated migrator and reviewed target names',
  );
  const addresses = await lookup(url.hostname, { all: true });
  backupCheck(
    addresses.length > 0 && addresses.every((item) => ['127.0.0.1', '::1'].includes(item.address)),
    'Run mapped restore only against a TLS DNS endpoint resolving exclusively to loopback',
  );
  await newReport(report);
  await privatePath(planFile, false);
  const { manifest, inventory } = await verifyBackup(folder);
  const planText = await readFile(planFile, 'utf8');
  const planSha256 = createHash('sha256').update(planText).digest('hex');
  const plan = JSON.parse(planText) as {
    format: string;
    manifestSha256: string;
    mapping: Mapping;
    access: AccessObject[];
    selection: string;
  };
  backupCheck(
    plan.format === 'NUMORA_VPS_RESTORE_PLAN_V1' &&
      plan.manifestSha256 === (await fileHash(join(folder, 'manifest.json'))),
    'Restore plan is not bound to this verified archive manifest',
  );
  const mapping = ownerMapping(plan.mapping),
    expected = mappedAccess(inventory, mapping);
  backupCheck(
    JSON.stringify(expected) === JSON.stringify(plan.access) &&
      plan.selection === restoreSelection(await readFile(join(folder, 'archive.list'), 'utf8')),
    'Restore plan was edited or no longer matches the reviewed mapping/archive',
  );
  backupCheck(
    manifest.sourceMajor === 16,
    'This VPS bootstrap/restore profile currently supports PostgreSQL 16 only',
  );
  const client = database(url),
    temporary = join(dirname(report), `.numora-vps-restore-${process.pid}`);
  await mkdir(temporary, { mode: 0o700 });
  const credentials = await toolEnvironment(url, temporary);
  try {
    backupCheck(
      (await toolVersion('pg_restore')) === manifest.sourceMajor,
      'Restore utility major must match the archive',
    );
    await targetPreflight(client, url, manifest.sourceMajor);
    await privateWrite(join(temporary, 'restore.list'), plan.selection);
    await toolRun(
      'pg_restore',
      [
        '--no-password',
        '--exit-on-error',
        '--single-transaction',
        '--no-owner',
        '--no-acl',
        '--role=numora_owner',
        `--use-list=${join(temporary, 'restore.list')}`,
        `--dbname=${decodeURIComponent(url.pathname.slice(1))}`,
        join(folder, 'application.dump'),
      ],
      { ...credentials.env, PGOPTIONS: '-c statement_timeout=300000' },
    );
    await applyAccess(client, expected);
    await verifyMappedRestore(client, inventory, expected);
    await assertConnectionFence(client);
    await privateWrite(
      report,
      JSON.stringify(
        {
          format: 'NUMORA_VPS_RESTORE_REPORT_V1',
          completedAt: new Date().toISOString(),
          manifestSha256: plan.manifestSha256,
          planSha256,
          result: 'PASS',
          target: {
            host: url.hostname,
            port: Number(url.port || 5432),
            database: decodeURIComponent(url.pathname.slice(1)),
            owner: 'numora_owner',
            login: 'numora_migrator',
          },
          connectionFence: 'REMAINS_CLOSED',
          runtimeReady: false,
          checked: [
            'owners',
            'structured-acls-and-defaults',
            'structural-schema-history',
            'table-proofs',
            'sequences',
            'main-compute-boundaries',
          ],
          remaining: [
            'real-runtime-login-preflight',
            'content-and-Auth-critical-flow-QA',
            'IRT-re-enrollment-and-resource-pins',
            'reviewed-cutover-rollback',
          ],
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await client.end({ timeout: 5 });
    await credentials.cleanup();
    await unlink(join(temporary, 'restore.list')).catch(() => {});
    await rmdir(temporary);
  }
}

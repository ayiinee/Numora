import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { Sql } from 'postgres';
import { backupCheck } from './backup-config.js';
import { privatePath } from './backup-runtime.js';
import { restoreAccess, sortAccess, type AccessObject } from './restore-access.js';
import {
  verifyProductionDatabase,
  type ProductionTarget,
  type ProductionService,
} from './production-runtime.js';

export interface RestoreEvidence {
  reportSha256: string;
  planSha256: string;
  manifestSha256: string;
  target: { host: string; port: number; database: string; owner: string; login: string };
  access: AccessObject[];
}

/** Only fixed diagnostics leave this module; private reports may contain schema metadata. */
export async function readRestoreEvidence(
  reportFile: string,
  planFile: string,
): Promise<RestoreEvidence> {
  backupCheck(
    isAbsolute(reportFile) && isAbsolute(planFile),
    'Use absolute private restore evidence paths',
  );
  await privatePath(reportFile, false);
  await privatePath(planFile, false);
  const reportText = await readFile(reportFile, 'utf8');
  const planText = await readFile(planFile, 'utf8');
  return restoreEvidence(JSON.parse(reportText), JSON.parse(planText), {
    reportSha256: createHash('sha256').update(reportText).digest('hex'),
    planSha256: createHash('sha256').update(planText).digest('hex'),
  });
}

export function restoreEvidence(
  report: Record<string, unknown>,
  plan: Record<string, unknown>,
  hashes: { reportSha256: string; planSha256: string },
): RestoreEvidence {
  const target = report?.target as RestoreEvidence['target'] | undefined;
  backupCheck(
    report?.format === 'NUMORA_VPS_RESTORE_REPORT_V1' &&
      report.result === 'PASS' &&
      report.runtimeReady === false &&
      report.connectionFence === 'REMAINS_CLOSED' &&
      plan?.format === 'NUMORA_VPS_RESTORE_PLAN_V1' &&
      report.planSha256 === hashes.planSha256 &&
      typeof report.manifestSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(report.manifestSha256) &&
      report.manifestSha256 === plan.manifestSha256 &&
      target?.owner === 'numora_owner' &&
      target.login === 'numora_migrator' &&
      typeof target.host === 'string' &&
      Number.isInteger(target.port) &&
      target.port > 0 &&
      typeof target.database === 'string' &&
      Array.isArray(plan.access) &&
      plan.access.length > 0,
    'A matching PASS restore report with endpoint pins and its original plan are required',
  );
  return {
    ...hashes,
    manifestSha256: report.manifestSha256,
    target,
    access: plan.access as AccessObject[],
  };
}

export function assertRestoredTarget(
  service: ProductionService,
  target: ProductionTarget,
  evidence: RestoreEvidence,
) {
  backupCheck(
    target.profile === 'production-vps' &&
      target.host === evidence.target.host &&
      target.port === evidence.target.port &&
      target.database === evidence.target.database &&
      target.login === `numora_${service}` &&
      target.databaseRole === target.login,
    'Runtime must use its own VPS login on the restored endpoint recorded in the report',
  );
}

// Explicit bounded reads compile runtime columns/permissions without transferring business rows.
const reads = {
  api: [
    'SELECT id,auth_user_id,status,role FROM public.users LIMIT 0',
    'SELECT id,student_user_id,left_at FROM public.class_memberships LIMIT 0',
    'SELECT id,status,package_id,student_id FROM public.assessment_attempts LIMIT 0',
    'SELECT id,source_type,attempt_id FROM public.xp_ledger LIMIT 0',
    'SELECT revision FROM public.pvp_content_revision LIMIT 0',
  ],
  worker: [
    'SELECT id,processed_at,failed_at FROM public.analytics_outbox LIMIT 0',
    'SELECT event_id FROM public.analytics_events LIMIT 0',
    'SELECT id,status,deadline_at FROM public.assessment_attempts LIMIT 0',
    'SELECT id,source_key FROM public.notification_outbox LIMIT 0',
    'SELECT id,status FROM public.leaderboard_periods LIMIT 0',
  ],
} as const;

/** No workers, HTTP calls, seeds, migrations, write probes, sequence calls or grant changes. */
export async function inspectRestoredRuntime(
  client: Sql,
  service: ProductionService,
  target: ProductionTarget,
  evidence: RestoreEvidence,
) {
  assertRestoredTarget(service, target, evidence);
  await verifyProductionDatabase(client, target);
  await client.begin('ISOLATION LEVEL REPEATABLE READ READ ONLY', async (tx) => {
    await tx.unsafe('SET LOCAL search_path = pg_catalog');
    await tx.unsafe("SET LOCAL statement_timeout = '5s'");
    await tx.unsafe("SET LOCAL lock_timeout = '1s'");
    backupCheck(
      (await tx`SELECT current_setting('transaction_read_only') AS readonly`)[0]?.readonly === 'on',
      'Runtime inspection must remain read-only',
    );
    const actual = (await restoreAccess(tx)).filter(
      (item) => item.kind !== 'DEFAULT' || item.owner === 'numora_owner',
    );
    backupCheck(
      JSON.stringify(sortAccess(actual)) === JSON.stringify(evidence.access),
      'Owner or object/column/default privileges drifted since the mapped restore',
    );
    const memberships =
      await tx`SELECT rolname FROM pg_roles WHERE rolname<>current_user AND pg_has_role(current_user,oid,'MEMBER')`;
    const [direct] = await tx`SELECT m.admin_option,m.inherit_option,m.set_option,r.rolreplication
      FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
      JOIN pg_roles parent ON parent.oid=m.roleid
      WHERE r.rolname=current_user AND parent.rolname='numora_main_runtime'`;
    backupCheck(
      memberships.length === 1 &&
        memberships[0]?.rolname === 'numora_main_runtime' &&
        direct &&
        !direct.admin_option &&
        direct.inherit_option &&
        !direct.set_option &&
        !direct.rolreplication,
      'Runtime login must retain only its reviewed Main membership',
    );
    const [databaseRights] =
      await tx`SELECT has_database_privilege(current_database(),'CONNECT') AS connect, has_database_privilege(current_database(),'CREATE') AS create, has_database_privilege(current_database(),'TEMPORARY') AS temporary`;
    backupCheck(
      databaseRights?.connect && !databaseRights.create && !databaseRights.temporary,
      'Runtime database rights must be CONNECT only',
    );
    for (const query of reads[service]) await tx.unsafe(query);
  });
  return {
    format: 'NUMORA_VPS_RUNTIME_INSPECTION_V1',
    completedAt: new Date().toISOString(),
    result: 'PASS',
    service,
    target: {
      host: target.host,
      port: target.port,
      database: target.database,
      login: target.login,
    },
    restoreReportSha256: evidence.reportSha256,
    planSha256: evidence.planSha256,
    manifestSha256: evidence.manifestSha256,
    checked: [
      'runtime-identity-TLS-and-role',
      'mapped-owner-object-column-default-ACLs',
      'exact-Main-membership-options-and-replication-boundary',
      'database-rights',
      'bounded-read-contracts',
    ],
    scope: 'READ_ONLY_RUNTIME_DATABASE_INSPECTION',
    runtimeReady: false,
    cutoverReady: false,
    remaining: [
      'real-Auth-and-critical-flow-QA',
      'isolated-worker-and-queue-rehearsal',
      'capacity-off-host-recovery-cutover-rollback',
    ],
  };
}

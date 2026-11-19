# PostgreSQL VPS preparation integration — 20 November 2026

**ENGINEERING DECISION — owner request:** review/reconcile the preparation stack against current main and rerun checks on the combined release. This integration does not merge into main, deploy, change service env, create a source backup account, access Supabase/VPS data, activate a backup timer or authorize cutover. PostgreSQL remains the durable business store and Supabase Auth remains separate.

## Pinned inputs

| Input                                 | Commit                                     |
| ------------------------------------- | ------------------------------------------ |
| main                                  | `24eeaf971947ae856a553394edb4d7f54d93594f` |
| #191 Production configuration/startup | `9b1f703479f2141aeec5bb348af6ca913c282cad` |
| #192 bootstrap/connection budget      | `2b1c7b641cdec22fde8423eb44cc86ee978ec456` |
| #193 inventory/backup                 | `1b82457e96d1787c2dd2e14ade359e35172455ac` |
| #196 mapped owner/privilege restore   | `3d16809355f62728b0caa43303067f11b9e5af94` |
| #199 restored API/worker verification | `d5810c6bdaba7e0f0e1807b7ff879acec1fc2056` |
| #203 encrypted off-host archive       | `2abe2279893c2f03476a1f737ce3f43d231fbba0` |

The integration branch starts from the pinned main and merges the entire ancestry of #203. Original PR commits remain ancestors, rather than being copied by hand. Git merges cleanly; that is not sufficient test evidence. Original stacked PRs remain open until the owner chooses an integration/merge strategy; do not merge both an unrelated rewritten copy and this stack. Current main's IRT runtime/resource-pin fixes and later product changes remain intact.

## Review and reconciliation

- Keep main's canonical journal and migrations 0075–0079 unchanged. The new Tryout allocation, runtime controls, generator source-package/context view and associated schema must be exercised by fresh migration and archive restore. Integration adds no SQL migration and does not replay migrations against a real restored target.
- Keep main's client/query/transaction optimizations, current assessment finalization and identity access, and current generator/PDF behavior. The merge does not select the old versions of these files.
- Preserve main's prebuilt production browser E2E flow together with the stack's TLS PostgreSQL, fixed role/bootstrap, backup, restic and restored API/worker CI steps. Required checks execute on the combined SHA; previous stack runs are historical evidence only.
- Preserve Development/staging guard checks, Redis switch/failover tooling and source-writer fencing. Those tools must not silently switch a database endpoint or override the Production profile checks.
- Main's `.env.staging.example` used `NODE_ENV=production` with `numora:staging:` queues, which conflicted with the preparation stack's Production-only profiles. Add the explicit `staging-supabase` profile for that existing dedicated topology, retain its queue isolation and reject shared Development/Production projects. Stage URLs must use verify-full and match explicit runtime pins; remove migration/evidence credentials from runtime processes. Local Development and both Production profiles retain their existing namespace boundaries. Guard regression tests cover the profile intersection.
- Review finding fixed here: startup preflight previously omitted `rolreplication` from its live role query/validator, while bootstrap and mapped-restore checks already rejected it. Both direct and reachable replication-role elevation are now rejected. A real TLS integration probe elevates only its owned fixture login, expects rejection, then restores NOREPLICATION. No runtime grant is widened.
- Mapped restore retains exact owner/object/column/default privilege validation and no-overwrite/closed-CONNECT gates. Off-host publish/recovery retains private artifact checks, pinned encrypted repository/snapshot, no retention deletion and no runtime activation. Source version, provider dependencies, role-map and actual recovery remain operational gates, not inferred from the fixture.

Validation outcomes and exact tested commit/run URL are recorded in this integration PR's checks/body. Do not read this document as a claim that a pending/skipped suite, an actual VPS restore or real Auth login has passed. The clean-SHA connected-release guard stays unchanged.

## Operator handoff after code acceptance

**Known operator state, 20 November 2026:** the owner can access the VPS through PuTTY; no dedicated source backup DB account is available yet. The agent has not been given an SSH session/alias. Therefore no real inventory or restore is represented by this integration.

Use the PuTTY session for the read-only commands in [bootstrap inventory](POSTGRES_VPS_BOOTSTRAP.md#1-inventory-before-installation) and record RAM/disk/process counts, PostgreSQL source major/extensions, actual deployed SHA/start command/process manager and all writers. Review the exact section in that runbook if its anchor changes. Do not send env dumps, PM2 full configuration, command lines, passwords or tokens to chat. Pending source backup identity must be provisioned separately after identifying the source version and privileges required for complete `public`/`irt_compute`/`drizzle` access. Do not add an elevated backup role to API/worker env or copy Supabase cluster roles.

Next operational sequence: review inventory/version and capacity → provision a restricted source backup identity through the approved workflow → create/verify a fresh private archive → rehearse mapped restore on an isolated Linux target → run runtime/critical-flow QA and off-host recovery. Follow [inventory/backup](POSTGRES_BACKUP_INVENTORY.md), [mapped restore](POSTGRES_VPS_RESTORE.md), [API/worker checks](POSTGRES_VPS_RUNTIME_TESTING.md) and [off-host recovery](POSTGRES_VPS_OFFHOST_BACKUP.md). Actual account provisioning, source/VPS access and mutating operator actions need their own concrete target context; this code integration does not execute them.

Production cutover still requires final freeze/drain of every source writer (including local Development sharing Supabase), final backup, approved maintenance/session handling, validated target and reviewed rollback. After the first VPS write, switching the URL back alone is not a data-safe rollback.

# API and worker after PostgreSQL VPS restore — preparation PR 5

**ENGINEERING DECISION — owner request, 16 November 2026:** prepare API/worker verification after the [mapped restore](POSTGRES_VPS_RESTORE.md), under [ADR-012](../adr/ADR-012-development-supabase-production-postgres.md). This is operator tooling and disposable integration coverage. No actual Supabase/VPS access, restored production writes, env changes, queue consumption, merge or cutover is performed during implementation. Supabase Development/Auth and historical UUIDs/results/XP/policy pins retain their existing boundaries.

## Evidence and gate order

1. Review and integrate the stacked configuration/bootstrap/backup/restore PRs with current main, including its separate IRT resource/runtime-pin fixes. Build and test the resulting clean SHA; evidence from a predecessor SHA is not acceptance for that deployment. No new migration is introduced here.
2. Complete source/VPS inventory, source-major compatibility, reviewed writer inventory, fresh verified backup, offline owner map/plan and mapped restore. Save archive/plan/restore-report checksums in the private recovery record. The restore report must say PASS, `runtimeReady=false`, and `connectionFence=REMAINS_CLOSED`. New reports include TLS endpoint host/port; older reports lacking these pins are rejected by runtime inspection. Do not edit a report to add missing evidence; rehearse from a new verified restore.
3. Keep normal API/worker/Compute and all other writers stopped for the restored target. Review the private report/plan as trusted operator evidence, not as signatures or authorization. Checksums detect changes but cannot authenticate an invented report.
4. Inspect each runtime login as below. Then rehearse mutating flows and real worker consumption on an isolated recovery copy, with dedicated accounts and queue resources. Never aim a normal test suite at production or shared Supabase Development.
5. Complete real Auth/critical-flow QA, capacity and off-host recovery gates, and review the cutover/rollback record before allowing normal writers. A runtime inspection PASS alone cannot authorize deployment or replay.

## Read-only inspection with each service's credentials

The restore tool leaves runtime CONNECT closed. An administrator must first review the exact PASS report and target, then allow **only the login being inspected** to CONNECT. This is a separate reviewed operator step; the inspection command never changes grants. Keep application/worker processes stopped while their credentials are used by the short-lived inspector. Do not run `database.sql` again, since that would reopen other runtime logins.

For the standard production target, use the local administrative socket and the intended database explicitly:

```sh
# Run only after checking the actual database identity and reviewed restore evidence.
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d numora_production \
  -c 'GRANT CONNECT ON DATABASE numora_production TO numora_api'
```

Inject the API's private Production env from its existing process manager/secret source into a **separate inspector process**, not a running API process. Use the [API/worker templates](POSTGRES_VPS_CONFIGURATION.md) without copying a Development `.env`. Preserve stable Auth configuration, teacher-token pepper and IRT/pseudonym secrets. No migration credential may enter this process. Build the database package first:

```sh
pnpm --filter @tka/database build
pnpm db:vps:runtime-check api /PRIVATE_PATH/restore-report.json /PRIVATE_PATH/restore-plan.json /PRIVATE_PATH/api-inspection.json
```

Repeat using the worker's own env and a fresh output file, after explicitly granting only `numora_worker` CONNECT for that inspection:

```sh
pnpm db:vps:runtime-check worker /PRIVATE_PATH/restore-report.json /PRIVATE_PATH/restore-plan.json /PRIVATE_PATH/worker-inspection.json
```

The commands require POSIX private files outside the checkout (directories 0700/files 0600), a fresh absolute output path, `NODE_ENV=production`, `NUMORA_DEPLOYMENT_PROFILE=production-vps`, the matching pinned host/port/database and fixed `numora_api` or `numora_worker` login. Existing static production checks still apply, including verified TLS, separate credentials, pool declaration, TLS Redis configuration and API Auth/CORS configuration. CA trust must be injected before Node starts, for example with `NODE_EXTRA_CA_CERTS`; no certificate verification is disabled. Static Redis/Auth validation here does not connect to those services.

Each command opens one short-lived PostgreSQL connection with a five-second connection timeout and read-only default. It verifies actual TLS/session identity and the non-owner Main-only boundary; then uses a repeatable-read, read-only transaction with five-second statement and one-second lock timeouts. It compares all mapped owner/object/column/default ACLs against the original plan, rejects unexpected transitive memberships or CREATE/TEMP database rights, and compiles bounded `LIMIT 0` reads used by the selected service. No business rows are exported and no writes, sequence increments, function/trigger execution, migrations, seeds, HTTP calls or queue jobs are attempted. This validates read contracts/permissions, not the correctness of returned RLS-filtered rows.

PASS is written only after successful inspection and connection closure. It binds the consumed restore report, plan and manifest checksums, service/endpoint/login and checked scope. It retains `runtimeReady=false` and `cutoverReady=false`. It does **not** rescan data fingerprints, prove every query/schema contract, verify current migration history/function bodies, exercise write grants or establish current content eligibility. The original restore verification and subsequent QA remain required; do not migrate/change the schema between those gates without repeating the affected evidence.

If a check fails, no PASS is recorded. Keep processes stopped, inspect the fixed diagnostic and private configuration, and reconcile the actual drift rather than adding blanket grants. Revoke runtime CONNECT again while investigating. Revoking CONNECT prevents new sessions; it does not disconnect existing ones, so verify that only the inspector connected and that it closed. There is no automatic revoke, termination, cleanup, retry, worker start or activation in this command.

## Disposable restored API/worker integration coverage

The required Linux CI step builds API and worker, then runs the mapped-restore integration case with `NUMORA_RESTORE_RUNTIME_PROBE=true`. It requires a dedicated localhost PostgreSQL 16/TLS fixture, matching-major clients and localhost Redis; missing service inputs must not be interpreted as successful coverage. The default package test can skip an unavailable restore fixture. The explicit CI step supplies the required inputs and runs the probe.

The parent fixture creates its own random test source/target, migrates the source, takes a verified three-schema archive, restores through `numora_migrator`, and verifies the closed connection fence. Only that test-owned target is then opened. The read-only inspections run through real restricted API/worker TLS connections and detect a deliberately changed grant.

The child refuses production/cloud targets, administrative logins, non-test database names or developer dotenv files. It runs the built full Nest application with real domain services and localhost Auth transport fixtures, exercises health/database health, missing/invalid token rejection, restored Auth-UUID profile lookup, student-to-Admin denial and a profile update. It then verifies a failed transaction rolls back both a profile mutation and its analytics outbox record, and commits a second pair atomically.

The actual worker runs through `runWorker` as `numora_worker`, using a private test TLS relay to the disposable Redis service and a random BullMQ prefix. Its real startup polls process the committed outbox; simulated redelivery leaves exactly one analytics event. A bootstrap queue job completes, graceful shutdown returns zero, and no worker startup/poll/shutdown error is accepted. Only this run's queue/database resources are cleaned up. API/worker Production role/TLS preflights are exercised separately using the real sessions; the app rehearsal uses `NODE_ENV=test` for localhost Auth and test database names. No Production guard is relaxed and no synthetic content or IRT/generator path is enabled.

This is engineering integration evidence, not Google OAuth, academic-content acceptance, production performance or full assessment/PvP QA. Fixture Auth does not prove the actual Supabase project or Google redirect configuration.

## Actual API/worker acceptance on the recovery copy

Use the same reviewed build, restored content and restricted role topology, isolated queue namespace/Redis resources, dedicated accounts and the actual secret/configuration rules. Use the [QA workflow](../testing/QA_GUIDE.md) for scenario execution and evidence. Do not reuse the development/cloud test URLs as staging. Before starting a worker, inspect restored pending outbox, overdue Tryout deadlines, notification discovery and leaderboard periods: ordinary startup immediately performs these jobs, so even an idle worker can change durable state. A new queue prefix does not stop PostgreSQL-backed polls from touching restored rows.

| Gate                   | Required evidence                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth and authorization | Real Supabase/Google login maps to the same existing `users.auth_user_id`/account UUID. No duplicate account or provider migration. Student cannot call Admin/other-owner Teacher actions. Preserve teacher-token pepper and token expiry/single-use behavior.              |
| API lifecycle          | Read curriculum/progress/history; start/resume/answer/submit supported assessments; duplicate submit creates no duplicate result/XP/outbox; failed transaction is atomic. Historical content/scoring/XP stays pinned.                                                       |
| Worker recovery        | Expected restored outbox backlog drains once semantically; retry/poison events remain observable; overdue Tryout recovery, notifications, hourly projections and restart do not duplicate durable facts. Verify new queue isolation and old-source worker fencing together. |
| Cache/PvP              | Use isolated cache namespace/resources so source-target caches cannot mix. Verify content invalidation, timer/deadline behavior, private answer delivery, 20-second reconnect and recovery using approved eligible content. Do not enable demo content to pass.             |
| Operations             | API health and DB health, sanitized failures, graceful shutdown, role/connection counts, pool/lock waits, query bytes/duration and Redis/worker metrics. Measure on this VPS; no capacity claim follows from CI.                                                            |
| IRT                    | Existing activation flags remain unchanged. Re-enroll reviewed deployment resource/login/principal pins separately before actual IRT operation. Never rewrite stored evidence or enable inactive paths to test migration.                                                   |

Retain sanitized outcomes and the exact SHA/configuration fingerprints/checksum references privately. Tokens, raw profiles/logs, credentials and database archives stay out of Git/public artifacts. Full connected-release acceptance retains the existing clean-SHA guard; this PR does not weaken or replace it. Real cutover still needs a frozen/drained source, final backup, off-host recovery test, reviewed rollback boundaries and an explicit writer switch.

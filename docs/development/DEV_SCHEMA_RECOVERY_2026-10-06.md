# Development schema recovery — 6 October 2026

**ENGINEERING EVIDENCE — historical incident, 6 October 2026.** This document
records a completed recovery of one verified Development database. The counts,
hashes, migration identifiers and runtime results below describe that incident;
they are not a current environment inventory or instructions to repeat its SQL.
Documentation reconciliation date: 19 October 2026.

`pnpm dev` on `feat/admin-irt-analytics` at `2145350`
failed during `db:check`. The development sandbox was missing Admin tables and
approval/report columns from migrations `0028_admin_invitations` through
`0036_legacy_package_fixture_compatibility`.

## Cause and recovery

The verified target was development project `pkamenfnwmoeisccnrnk`, historically
named Numora-Staging, over TLS on the session pooler. Its 42 migration records
already included the separate Pretest/PvP branch. The latest database cursor was
`1791261680000`, greater than all nine Admin migration timestamps. Ordinary
cursor-based migration skipped those files. The integrated migrator's safeguards
rejected the unrecognized skipped chain; simply rerunning migration could not
reconcile it.

The recovery restored a fresh backup into isolated PostgreSQL 17 on loopback
port 55438, then rehearsed the exact nine committed Admin SQL files. The same
files were applied to the verified sandbox in one transaction with their
original SHA-256 hashes and timestamps. The runner checked the complete baseline
history, prerequisite hashes, current row digests, missing Admin tables and
backup/rehearsal evidence before applying. Data/history verification ran before
commit. No old migration record or published SQL file was rewritten.

This was an operator reconciliation for this specific audited database history.
It does not authorize replaying arbitrary skipped migrations. Keep migrations
separate from application startup; do not reset or seed a database to resolve
this error. The integration mapping below records the later reconciliation work.

## Later integration mapping — PR #92

**ENGINEERING EVIDENCE — checked 19 October 2026:** [PR #92](https://github.com/ayiinee/Numora/pull/92)
is still open. Its integration snapshot `a52b9db` retains main `8d27bed` migrations
`0000`–`0038` and appends the nine Admin migrations as `0039`–`0047`. The following
mapping belongs to that integration branch; the appended files are not yet in
main at this checkpoint.

| Original incident migration                 | Appended name in PR #92                     |
| ------------------------------------------- | ------------------------------------------- |
| `0028_admin_invitations`                    | `0039_admin_invitations`                    |
| `0029_admin_recovery_operations`            | `0040_admin_recovery_operations`            |
| `0030_content_revision_guard`               | `0041_content_revision_guard`               |
| `0031_historical_report_context`            | `0042_historical_report_context`            |
| `0032_assessment_policy_approval`           | `0043_assessment_policy_approval`           |
| `0033_partial_reward_provenance`            | `0044_partial_reward_provenance`            |
| `0034_admin_authored_package_pins`          | `0045_admin_authored_package_pins`          |
| `0035_pretest_blueprint_approval`           | `0046_pretest_blueprint_approval`           |
| `0036_legacy_package_fixture_compatibility` | `0047_legacy_package_fixture_compatibility` |

The SQL bytes remain unchanged in that integration. Its migrator recognizes a
specific previously published Admin-fork history, preserves existing records and
avoids replaying already-applied Admin DDL; unknown histories still fail closed.
See the [integration evidence at the pinned snapshot](https://github.com/ayiinee/Numora/blob/a52b9dbb3b69471ca1993116f429ceec79ee5519/docs/development/ADMIN_MAIN_SYNC_2026-10-07.md#migration-compatibility).

This watcher/documentation change adds no migration and does not apply either
chain. Before any future rollout, verify the actually merged SHA, environment
identity, backup and migration history against the reviewed migration tooling.
Do not apply both numbered chains manually or assume that this incident's database
history matches the known fork accepted by PR #92.

## Historical backup and verification — 6 October 2026

Restricted local artifacts are in
`D:/numora-sandbox-backups/2026-10-06-admin-2145350`.
The `before.dump` custom archive has SHA-256
`4721565424645df8d842beb53a53956f43ad9e69fbbe1a18211dc7426804c8c2`.
It covers schema/data in public, drizzle and irt_compute. It is not a full
Supabase backup: Auth, Storage and project settings are outside its scope.

- Restore and rehearsal succeeded; row counts and original-column digests of
  all 112 existing public/irt_compute tables were preserved.
- Cloud verification preserved all 147 existing public/irt_compute/Auth/Storage
  table counts and row digests, plus all 42 previous migration records. There
  were 51 migration records after recovery, including the nine original Admin hashes.
- Both new Admin tables had RLS enabled; anon, authenticated and service_role
  had no relation privileges on them.
- Re-running the official migrator succeeded without changing migration history.
- `pnpm db:check` and `pnpm dev:prepare` passed: 110 expected application tables
  and their required columns were present, with RLS enabled.
- The migration journal and integrated migration suites passed all eight tests
  against isolated PostgreSQL, without skips.

## API watch configuration

The runtime smoke also exposed repeated API incremental compilation. A temporary
watch probe recorded events for the API's own generated `apps/api/dist`
directory. `apps/api/tsconfig.json` now excludes `./dist` from directory watching
using TypeScript's [watchOptions.excludeDirectories](https://www.typescriptlang.org/tsconfig/excludeDirectories.html).
The normal source/build exclusions remain in place; this additionally prevents
watch events from generated output. The probe is not part of application startup.

Historical final verification used ordinary `pnpm dev`, without the probe. API compilation
reported zero errors and the application started. Web `/`, API `/api/v1/health`
and `/api/v1/health/database` all returned HTTP 200. API typecheck, build and
formatting checks passed. The smoke processes and temporary rehearsal PostgreSQL were
stopped afterward so the developer can start the normal command without port
conflicts.

The existing operator credential was supplied only to migration/verification
processes. `.env`, product rules and historical rewards were not changed.
Runtime and migration credentials remain separate operational
concerns. These checks do not establish Curriculum, email delivery, independent
QA or release acceptance.

## Watcher change verification — 19 October 2026

The watcher fix is proposed separately from PR #92, on main `8d27bed`.
Verification of this change is limited to local compiler/build and watcher
behavior without loading Development credentials. It does not repeat the
historical database recovery or revalidate the current Cloud environment.

- `pnpm exec turbo run build --filter=@tka/api`: all four build tasks passed
  (database, assessment engine, IRT orchestration and API).
- `pnpm --filter @tka/api typecheck` and root `pnpm lint` passed.
- A temporary compiler-watch smoke used TypeScript's `createWatchProgram` with
  the actual API configuration: the initial compilation remained stable for four
  seconds; writing an ignored output marker in `dist` caused no compilation for
  another four seconds; changing a temporary source file triggered exactly one
  recompilation and remained stable for four more seconds. Both compilations
  reported zero compiler errors. The watcher was closed and temporary files
  removed. This checks compiler watching, not Nest application startup.
- All nine SQL mappings above matched byte-for-byte between original snapshot
  `3c3efea` and integration snapshot `a52b9db`; no SQL was executed.

These checks did not load `.env`, start application services, or mutate a Cloud
database, Auth account, email or media object. Local checks and the new PR's CI
are separate evidence; CI status must be read from the actual PR head.

# Application inventory and backup — preparation PR 3

**ENGINEERING DECISION — owner direction, 15 November 2026:** implement inventory/backup preparation for moving Production business PostgreSQL to VPS while Development stays Supabase. [ADR-012](../adr/ADR-012-development-supabase-production-postgres.md), [configuration](POSTGRES_VPS_CONFIGURATION.md) and [bootstrap](POSTGRES_VPS_BOOTSTRAP.md) apply. This tool does not switch application env, provision servers/roles, freeze writers, enable features, migrate Auth or perform Production restore/cutover.

## Scope and completion evidence

The custom-format archive contains **all three** application schemas: `public`, `irt_compute`, and `drizzle`. It retains application data/UUIDs (including `users.auth_user_id`), question/rubric/policy versions, historical attempts/results/XP, sequences, constraints, indexes, functions, triggers, policies/RLS, original ownership/ACLs, and migration history. Canonical migrations are not replayed during restore. Bootstrap SQL and migration journal remain unchanged by this PR.

The artifact set is `application.dump`, `archive.list`, `inventory.json`, `writers.json`, and a last-written `manifest.json`. The manifest lists scope, source/client major, start/end times, file lengths and SHA-256 for each payload file. No complete manifest is written if a query/dump/utility warning fails. A partial directory is retained for private operator inspection; there is no automatic deletion or reuse. Verification requires the exact artifact set, private permissions, matching checksums and a valid inventory.

Acceptance has separate evidence:

1. Inventory is reviewed, including source major/extensions/dependencies and **every writer**.
2. Backup creation and offline `verify` succeed; artifacts are access-restricted and an independently protected copy/checksum exists.
3. A separate local restore rehearsal succeeds, producing a new report bound to the manifest SHA-256. The immutable original manifest remains `NOT_REHEARSED`; preserve its matching rehearsal report with it.
4. Source-specific ownership/grant mapping, actual VPS restore, critical-flow QA and cutover/rollback are later acceptance gates. A checksum or successful fixture restore alone does not establish those.

CI exercises only disposable synthetic databases. No real Supabase backup, inventory or VPS restore is run by the implementation task. Operator execution of the following source commands is still outstanding.

## 1. Review all writers and dependencies

Copy `deploy/postgres/backup-writers.example.json` to a private file. Replace its review timestamp, operator/owner aliases and every example state using actual deployment inventory. It intentionally fails with the placeholder timestamp. Add separate entries for each API/worker replica, scheduler, generator/IRT instance, cron/CI job, migration runner, ad-hoc SQL/importer, and local Development or local Staging process sharing the source. Mark a missing category explicitly `not-deployed`; do not infer it from a moment with no database sessions. The validator checks completeness/format, not that an operator actually stopped a process.

Use process-manager inventory, systemd timers, cron, CI schedules, the separate generator/IRT deployment and each developer's process/env inventory. API can write through HTTP/WebSocket and its PvP scheduler; worker includes outbox, leaderboards, notification/tryout recovery and optional generator/IRT polling. Disabling one queue does not stop these writers. Do not collect command lines or env dumps containing secrets into the report. Use aliases rather than personal emails/credentials.

Source catalog inventory records database encoding/collation/version/size, extension versions, tables/columns/owners/ACLs, functions (including SECURITY DEFINER and search paths), views/types, indexes/constraints, triggers, RLS policies/default privileges, catalog-visible cross-schema dependencies and Drizzle hashes/cursors. It also records role attributes/memberships **without role passwords** and a point-in-time session summary without SQL text/backend IPs. Full role inventory is metadata, not executable bootstrap SQL; it is never automatically replayed. Idle/disconnected writers and dynamic SQL dependencies cannot be proven absent by catalog/session queries. Review function bodies and external extension/foreign-server/provider dependencies as well.

`inventory` uses catalogs and estimated table statistics; it does not scan every row or export a dump. In particular, estimates may be `-1` or stale. All three schemas and migration history are required. Foreign-table data and large objects fail this initial scope rather than silently disappearing. Supabase-specific references into `auth`, `storage`, `extensions`, Vault, FDWs or other excluded schemas require a reviewed expanded scope before rehearsal/cutover. A schema-selected `pg_dump` does not automatically include dependencies outside those schemas.

## 2. Operator host, credentials and tools

Run artifacts on a trusted **POSIX/Linux host** with repository-pinned Node/pnpm and built `@tka/database` artifacts. Windows host artifact operations are deliberately rejected because POSIX modes do not establish Windows ACL privacy; use a separately prepared Linux/WSL filesystem, not a Windows-mounted folder with permissive modes. Unit/catalog checks on Windows do not count as a full archive/permissions rehearsal.

Install/review `pg_dump` and `pg_restore` from the **same major as the source**. The tool supports inventory on PostgreSQL 16+ and requires matching source/dump/restore major for backup/rehearsal. This does not assert the Supabase source is version 16. Use `NUMORA_BACKUP_PG_BIN` to select the reviewed utility directory. Do not down-version restore a newer source into the PR 2 PostgreSQL-16 template. Client minor/security releases can differ; use supported patched releases.

Inject `deploy/postgres/backup.env.example` settings from an operator-controlled file/process manager. This tool never loads Development `.env`. Pins cover host/port/database/login separately from the URL. URLs require verified TLS and no query overrides; default Supabase direct or **session** connections are suitable, transaction-pooler port 6543 is rejected. Review the actual endpoint mode even on a custom port. Global TLS disabling and inherited `PGOPTIONS` are rejected. Application `DATABASE_URL` is not used.

Use a designated approved source backup identity with access to **all** scoped rows/objects/sequences, migration history and required catalog views. The tool sets `row_security=off`; insufficient permissions fail, and there is no `--enable-row-security` fallback that would produce a partial backup. Provision/approve access separately. The tool never grants privileges or creates a source role. Restore uses a separate local administrative identity capable of restoring original ownership/ACLs.

Custom/private CAs require both `NODE_EXTRA_CA_CERTS` (Node, before process start) and `NUMORA_BACKUP_CA_FILE` (libpq). Passwords are supplied to utilities through a temporary private `.pgpass` in the private run directory, removed on ordinary completion/failure. A forced kill can leave that file; keep partial folders private and inspect them before any transfer. Credentials are never passed as command arguments or echoed. Public console errors use fixed diagnostics and discard raw provider/utility stderr. A utility warning rejects acceptance too; investigate privately rather than suppressing it or loosening RLS/TLS.

Prepare a private parent directory owned by the operator. Children use 0700 directories/0600 files, no symlinks/hard-linked files, and exclusive new names. Checks enforce current ownership and no group/world permission bits. Account/root access, host compromise and encrypted-volume policy remain operational controls. A PostgreSQL custom archive is compressed, **not encrypted**. Private inventory/function definitions and archive contents can contain confidential data; never upload them as CI artifacts, PR attachments or chat logs.

```sh
umask 077
install -d -m 0700 /PRIVATE_OPERATOR_PATH/numora-backups
# Build first using the repository's pinned Node and pnpm.
pnpm --filter @tka/database build

# Credentials already injected privately; replace paths with reviewed actual files.
pnpm db:backup inventory /PRIVATE_OPERATOR_PATH/numora-backups/source-inventory.json /PRIVATE_OPERATOR_PATH/writers.json
```

The inventory/report path must be new. Examine the private report locally; do not print it to shared terminal logs. Free disk must cover the archive, inventory, restore working set, indexes/WAL/temp and retained copies. Source size is not the compressed archive size. The tool does not install disk alerts or an off-host retention service.

## 3. Create and verify the archive

```sh
pnpm db:backup create /PRIVATE_OPERATOR_PATH/numora-backups/run-001 /PRIVATE_OPERATOR_PATH/writers.json
pnpm db:backup verify /PRIVATE_OPERATOR_PATH/numora-backups/run-001
```

`create` retains a **read-only repeatable-read transaction** while exporting a PostgreSQL snapshot to `pg_dump`. It holds ACCESS SHARE locks on existing scoped tables to reject conflicting DDL within a five-second lock wait; schedule a migration/schema-change freeze for the backup window. New concurrent DDL is not a supported source state. Counts and row fingerprints come from that same transaction/snapshot, avoiding a moving before/after table-count comparison.

Fingerprints compute SHA-256 per canonical JSON row in PostgreSQL, with UTC/ISO settings, then return count plus four commutative numeric accumulators. This reduces result transfer to one short proof per table instead of sending a second copy of every row to Node. It still scans/serializes every table on the source, can use CPU/temp I/O and retain a long-lived snapshot; schedule/measure it. It is an integrity comparison, not a cryptographic commitment resistant to a malicious database operator. File SHA-256 covers archive bytes. Five-minute statement timeouts and a fifteen-minute utility bound fail closed; large sources need separately reviewed timeout/resource changes, not silent incomplete results.

**Sequences are not MVCC snapshot data.** Before/after values are retained and changes block the initial rehearsal path. Even unchanged observations do not prove writer quiescence. A normal online backup has a consistent table snapshot but is **not the final migration cutover backup**: writes after the snapshot remain on the source. Final cutover needs a separately coordinated freeze/drain of every source writer, including local Development/Staging that shares this project; no dual-write or automatic synchronization is implemented here. Stable/cycled sequence edge cases and external side effects also require the freeze.

`verify` is offline, requires no source/target credentials and changes no DB. Missing/corrupt files, extra unfinished files or permissive permissions reject it. SHA-256 detects corruption relative to the manifest, not authenticity if someone can replace both; record the manifest checksum independently in the approved protected backup record. After an approved encrypted/off-host copy, run `verify` again on a private restored/downloaded copy. This PR does not choose retention/RPO/RTO values or transfer real data to a storage provider.

## 4. Original-owner restore rehearsal

`rehearse` is intentionally limited to a fresh **localhost** database named `numora_restore_test_<32 lowercase hex characters>`, with the same PostgreSQL major and no user schemas (including the default empty `public`). An operator/test fixture must create that database on an isolated cluster and remove its empty initial public schema beforehand. The tool never creates/drops/cleans databases, overwrites an existing schema, uses `--clean`, disables triggers/RLS, replays migration/seed scripts, or auto-imports roles.

Review original source owner, grantee and default-privilege role names from inventory and archive listing, and provision only the necessary compatible test roles on the isolated cluster. Do not execute `pg_dumpall` or copy Supabase administrative cluster roles/passwords wholesale. Dynamic role/extension dependencies may require more preparation. The restore utility preserves original owners and ACLs in one transaction with `--exit-on-error`; missing privileges/roles are failures, never silently ignored. Unknown cross-schema dependencies and changing sequences block this initial rehearsal.

Inject the separate `NUMORA_BACKUP_REHEARSAL_*` pins/URL, with TLS trusted for `localhost`, then run:

```sh
pnpm db:backup rehearse /PRIVATE_OPERATOR_PATH/numora-backups/run-001 /PRIVATE_OPERATOR_PATH/numora-backups/rehearsal-001.json
```

After restore, the tool reproduces the initial `public` schema's PUBLIC USAGE baseline **only when the source catalog explicitly recorded it**; pg_dump otherwise assumes that initdb baseline already exists. It does not add this permission when the source revoked it. The restore utility itself runs in one transaction; this narrowly scoped baseline correction is a separate local transaction before verification. ACL comparison expands PostgreSQL default privileges and ignores ACL entry ordering; column comparison uses the relative order of live columns because dumps do not reproduce physical holes left by dropped columns.

The tool then compares schema definitions, ownership/ACLs, default privileges, constraints/indexes, types/views, functions/triggers/policies, migration history, every table's count/fingerprint, and sequence values. A PASS report is written only after those checks. A verification failure can leave the restored **local test DB** for inspection with no PASS report; there is no destructive rollback/cleanup command. Do not attach API/worker, generator or Compute to it. Stored SQL/SECURITY DEFINER bodies in a dump must be trusted/reviewed before any restore; checksums do not sandbox SQL.

This verifies original-owner logical recovery. The [PR 4 mapped restore procedure](POSTGRES_VPS_RESTORE.md) separately maps source owners/default privileges (including SECURITY DEFINER owners) to the reviewed `numora_owner` topology and verifies Main/Compute grants. It skips dump ACLs only together with mandatory structured per-object ACL replay and an enforced closed database connection fence; `--no-acl` alone, blanket grants or elevated runtime credentials remain unacceptable shortcuts. Supabase Auth stays external; preserved `auth_user_id` mappings still require a real login smoke test later.

## Boundaries and test evidence

Supabase Auth account/password/session data, managed Storage, R2 object bytes, Redis/queues, external generator/IRT files/secrets, certificates/CA keys, PostgreSQL configuration/WAL/PITR and cluster role passwords are **outside** this application archive. Inventory records extension versions and cluster role metadata but does not make these resources recoverable. The retention store, private encryption keys and critical external assets need their own approved backup/recovery procedures.

Tests cover target/TLS and writer validation, sanitized errors, real canonical-schema backup/restore with original owners/ACLs, UUID/Auth mapping and opaque historical payloads, all-table fingerprints/sequences/migration history, private permissions, checksum corruption, incomplete directories, refusal to overwrite/reuse and external dependency detection. Full artifact/restore tests run on disposable Linux PostgreSQL/TLS in CI; Windows unit tests remain distinct. No product behavior, scoring/XP history or source schema is changed.

Primary references: [PostgreSQL pg_dump scope/snapshot/RLS](https://www.postgresql.org/docs/16/app-pgdump.html), [snapshot export and sequence caveats](https://www.postgresql.org/docs/16/functions-admin.html), [pg_dumpall cluster globals](https://www.postgresql.org/docs/16/app-pg-dumpall.html), [pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html), and [Supabase backups and external Storage scope](https://supabase.com/docs/guides/platform/backups).

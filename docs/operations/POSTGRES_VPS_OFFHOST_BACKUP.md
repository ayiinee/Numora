# Encrypted off-host archive and recovery — preparation PR 6

**ENGINEERING DECISION — owner request, 16 November 2026:** continue migration preparation after [restored API/worker verification](POSTGRES_VPS_RUNTIME_TESTING.md). This PR provides a reviewable encrypted archive transport/recovery profile, not an activated backup service or real cloud transfer. [ADR-013](../adr/ADR-013-encrypted-offhost-archives.md) is **PROPOSED** pending operator/storage review. [ADR-012](../adr/ADR-012-development-supabase-production-postgres.md), existing product/identity/history rules and the source/VPS inventory gates still apply.

## Scope and acceptance stages

The input is the existing private five-file [application archive](POSTGRES_BACKUP_INVENTORY.md), including `public`, `irt_compute` and `drizzle`. No new database connection/dump is made by publication or retrieval. UUIDs/Auth mappings, versions, scores/XP and migration history remain archive content; the tool never recalculates them. The local custom dump is unencrypted; restic supplies the encrypted storage layer. Its encryption and repository identity model are described in the [official design](https://restic.readthedocs.io/en/stable/100_references.html#design).

| Evidence                    | Meaning                                                                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `db:backup verify` | Local archive scope/checksums/private permissions match its manifest.                                                                                                                                                                  |
| `publish-offhost` receipt   | A committed encrypted snapshot matches the reviewed repository, archive path, manifest and deployment alias. `recoveryReady=false`; no retrieval or physical failure-domain acceptance is implied.                                     |
| `recover-offhost` report    | An exact snapshot was decrypted into a new private folder, restic verification succeeded and every archive checksum matches the independently recorded manifest. `databaseRestored=false`, `runtimeReady=false`, `cutoverReady=false`. |
| DB and runtime rehearsal    | Separately run original-owner or mapped restore and API/worker/critical-flow QA. Retrieval is not DB acceptance or cutover approval.                                                                                                   |

No real provider account/bucket, encryption key, schedule, secret, backup transfer, database restore or deployment is configured by this implementation. CI uses an owned local encrypted repository and disposable PostgreSQL/TLS only; that does not prove actual S3 authorization/TLS/provider behavior or VPS disaster recovery.

## 1. Review the storage and key boundary

The operator must choose a genuinely separate failure domain and private bucket/prefix/account policy. URL pins alone cannot prove physical separation. Review provider quotas, capacity, transfer time, access logging, credential rotation, retention and deletion/immutability/versioning behavior. Keep business-asset and backup credentials separate. An application runtime must not receive S3 backup credentials, repository password or migration credentials.

Provision/init the new repository as a separate reviewed operator action using the [official repository procedure](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#s3-compatible-storage). The wrapper does not run `init`. Review `restic cat config` privately and record its **full** ID independently; do not copy an unreviewed ID merely to bypass a mismatch. The initial profile supports format 2 and restic **0.19.1**. Install from trusted [release artifacts](https://github.com/restic/restic/releases/tag/v0.19.1), verify published checksums/signatures, and review updates before changing the pinned profile. CI downloads the Linux binary into its temporary directory and verifies its pinned release SHA-256; it does not install anything on the VPS.

Use a high-entropy, single-line repository password of at least 32 characters, distinct from storage credentials. Keep its actual file private (0600, owned by the operator), outside Git/checkout. Escrow the password and access-recovery instructions independently of the VPS, and test access from a second trusted recovery host. File checks/length validation cannot prove escrow exists. Do not rotate/replace the password file without using the reviewed key-management procedure and testing the remaining access path.

Copy `deploy/postgres/offhost.env.example` to the operator's private secret source and replace every placeholder. The wrapper only accepts canonical `s3:https://hostname/bucket/prefix` configuration matching separate origin/path pins, a full repository ID, explicit scoped access key/secret/region, a non-personal host alias, an absolute executable/password path and an operator-declared transfer limit. Local/IP/loopback repositories, embedded URL credentials, query/fragment overrides, password commands, alternate repository files, insecure password/TLS modes and proxy overrides are rejected. Custom storage CA trust may use `RESTIC_CACERT`; certificate verification is retained.

Only a minimal child environment is passed to restic. It excludes application env, database/Auth credentials and inherited backend/credential-command settings. Two S3 connections, two Go scheduler threads and no local restic cache limit this profile's concurrency/cache use; they do not guarantee a memory/CPU budget on the shared 8-GB VPS. Measure actual archive scan/encryption/network load, disk free space and DB/runtime latency before scheduling. Transfer limits are in KiB/s; the example 2048 is **PROPOSED**, not measured capacity. Each utility invocation has a 15-minute bound; a timeout/warning/nonzero exit rejects acceptance. Larger archives need a reviewed budget/profile change.

## 2. Publish a verified immutable archive

First produce and verify a complete archive using PR 3's source identity, snapshot, DDL-freeze, writer inventory and private-file rules. Never include unfinished directories, a temporary `.pgpass`, extra reports, env files or raw logs. Private archive files/directories remain 0600/0700 on a POSIX filesystem. Do not mutate an archive after it is created. Final cutover still requires a fresh backup after all source writers are frozen/drained; an online snapshot is not a writer switch or ongoing synchronization.

Inject the separate operator storage env before Node starts, then:

```sh
pnpm --filter @tka/database build
pnpm db:backup verify /PRIVATE_PATH/run-001
pnpm db:backup publish-offhost /PRIVATE_PATH/run-001 /PRIVATE_PATH/publication-001.json
```

Publication verifies the archive before any storage command, checks the actual client/repository identity/password access, creates a snapshot with manifest/alias tags, and validates returned snapshot metadata. It then rechecks local archive checksums and manifest stability. The new private receipt is outside the immutable archive, bound to full repository/snapshot IDs and the manifest checksum; it records `recoveryReady=false`. Existing output files are never overwritten. A failed upload may leave an encrypted remote snapshot/pack or an owned lock after a forced kill, but no successful local receipt is written; inspect separately rather than auto-pruning/unlocking/retrying with weaker settings.

Store the receipt and manifest checksum independently in the protected recovery record. Checksums are integrity references, not signatures or authorization; someone able to replace both metadata and independent records is outside that guarantee. Do not attach archives/receipts/raw restic output to PRs, chats or CI artifacts. Console messages are fixed; provider stderr and per-file paths are not printed by the wrapper.

## 3. Retrieve an exact snapshot into a new private directory

Use the trusted receipt, repository access/password and the independently recorded **64-character manifest SHA-256**, on a trusted POSIX recovery host. The destination must not exist; its parent must already be private/owned (0700), outside the checkout and free of symlink traversal. Use compatible operator ownership/UIDs or review metadata restoration first; failed file ownership/permissions must not be bypassed silently. Budget space for the recovered unencrypted archive plus PostgreSQL restore/index/WAL/temp work.

```sh
pnpm db:backup recover-offhost /PRIVATE_PATH/publication-001.json REPLACE_RECORDED_MANIFEST_SHA256 /PRIVATE_PATH/recovered-001 /PRIVATE_PATH/recovery-001.json
pnpm db:backup verify /PRIVATE_PATH/recovered-001
```

Retrieval rechecks client/repository identity and exact snapshot/path/tags/alias before creating the destination. It uses the full snapshot ID and recorded archive subtree, with verification and `--overwrite never`; it never selects `latest`, restores to the original location or runs `--delete`. The archive is checked again against its original manifest and independent checksum. The report binds the exact consumed receipt bytes, repository, snapshot and manifest. Failed recovery leaves the private destination for inspection without a PASS report; there is no automatic overwrite, recursive deletion or repair.

Continue with PR 3's original-owner rehearsal or PR 4's [mapped owner/grant restore](POSTGRES_VPS_RESTORE.md), then PR 5's [API/worker checks](POSTGRES_VPS_RUNTIME_TESTING.md) and actual critical-flow QA. Original restore/ACL/TLS/source-major/dependency/sequence gates remain enforced. No archive retrieval command creates a DB, grants CONNECT, starts a worker, consumes restored outbox or enables IRT/generator/publication.

## 4. Scheduling, retention and failure response

**OPEN — operational approval:** [BACKUP_RESTORE](BACKUP_RESTORE.md) records RPO ≤24h/RTO ≤4h as planning targets pending OPEN-09. This PR sets no accepted recovery SLO, retention duration, calendar schedule or deletion policy. Automatic scheduling remains inactive until owners review storage/key escrow, measured backup/recovery times, space, source DDL windows and alert ownership. A future timer must serialize runs, preserve failures, use exclusive run/output names and track backup freshness plus verified-recovery age; process success alone is insufficient.

The wrapper offers no `forget`, `prune`, `unlock`, repair, key change or repository deletion command. Ordinary restic operations acquire/release their own locks. Separate retention/deletion privileges and reviewed storage protections must address compromised writer credentials; encryption alone does not make storage undeletable. Do not disable repository locking to resolve an overlap. A missing snapshot, wrong ID/password, corruption, interrupted transfer or elapsed bound requires investigation and a new exclusive recovery path. Keep at least the previously independently verified recovery point until a reviewed retention decision permits removal.

The application archive excludes Supabase Auth account/session/password state, R2 object bytes, Redis/queues, service secrets, certificates/CA keys, PostgreSQL physical/WAL/PITR state and external generator/IRT files. Preserve their separate recovery procedures and account mappings. This profile does not turn local Development into staging, synchronize Supabase/VPS, or authorize final cutover.

## Test evidence and limits

Configuration tests cover pins, HTTPS-only routing, credential isolation, local/IP/unsafe mode rejection and exact snapshot metadata. A Linux integration fixture creates a canonical three-schema backup with a known Auth UUID, uses real restic encryption on an owned **local** repository through test-only runner injection, publishes/retrieves an exact snapshot, verifies archive bytes, restores PostgreSQL and checks that UUID mapping. Wrong repository/password/manifest, existing outputs/targets, invalid archives and recovered corruption are rejected. The operator CLI accepts no local-storage test bypass. Real S3 transport, provider policy, escrow recovery on another machine, VPS load and full production disaster recovery remain operator acceptance work.

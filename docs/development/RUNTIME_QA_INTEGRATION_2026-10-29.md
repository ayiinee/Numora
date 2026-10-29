# Runtime/QA integration after Admin #110

**ENGINEERING DECISION — owner instruction, 29 October 2026:** integrate runtime PR #102 and the additional QA/runtime/dependency work in #109 against accepted `main` `ca28a876b10387d3645c36d2d5d3696425726e12`. Preserve the current Admin flow, original source histories and existing product decisions. The owner subsequently selected **Supabase Development after testing and verified backup** as the migration target. Independent review, application deployment and acceptance remain separate.

Inputs: #102 `b8734c6fbab62d18b7c644be94c2bb988ab899e0`, #109 `f0790739529280b93df7a7f0f2b8244cdfa89824`. The source branches remain unchanged.

## Integration constraints

- Keep canonical SQL and journal entries `0000`–`0048` byte-identical to accepted main. Append the immutable runtime PvP trigger at the next position. The type widening already exists in `0043`; preserve #110's policy-specific XP guard.
- Archive the original runtime `0039/0040` and published Admin SQL/hashes as provenance. Known history bridges preserve original rows, reject unknown/partial histories and never replay an existing trigger. Older broad XP guards must not shadow `0048`.
- Retain rich-question validation, media/answer API methods, latest Admin UI/tests and main's Admin-fork bridge. Carry over generator-mode main API routing, the Chapter 3 allowlist, Redis-independent PvP deadlines and recovery timestamps, worker/result optimizations, QA tooling and dependency remediation.
- Do not reinterpret academic OPEN items or treat historical failed load/manual reports as acceptance. Final integration tests and exact source SHA are recorded below once available.

## Verification plan

Fresh schema, upgrade from canonical main/Admin, audited Admin forks and original runtime history; replay; partial/unknown history and drift rollback; immutable historical rewards and both partial/legacy XP. Run database/API/worker/web suites, lint/types/contracts/build, Redis transport, connected release/IRT/PvP and complete browser coverage on the final source.

## Audited Development history and adoption boundary

Read-only inspection verified the documented Development project `pkamenfnwmoeisccnrnk`, PostgreSQL 17.6, database/operator `postgres`, session/direct TLS connection on port 5432. Its 62 history rows combine the audited legacy Staging baseline, earlier Admin positions, CRLF variants and later upload/generator/runtime records. They do not match either source PR journal and must not be replaced wholesale.

Original SQL for four modern recorded hashes was not found in Git or retained local source. This integration does **not** claim those hashes are identical to canonical files. Instead, the committed `staging/fixtures/development-20261029/provenance.json` pins the exact observed 62-row prefix and the canonical SQL hashes. It records readable structural witnesses derived from a fresh canonical database and independently compared to the restored Cloud snapshot:

- `content_upload_sessions` and `generator_packages`: columns/types/defaults, constraints, indexes, policies and RLS are equal. Their existing data and the earlier import backfill are adopted without replaying that backfill.
- The 0033/0037 aliases are additionally proved to be exact CRLF representations of the unchanged canonical files.
- The current XP function token sequence equals the archived runtime decimal guard, including quoted literals. The PvP function has the known legacy `RETURN OLD` body; its enabled BEFORE UPDATE OF status trigger has the expected function/attributes.
- The XP immutable INSERT/UPDATE/DELETE trigger, decimal types and valid unique attempt index must be present and enabled before adoption.

`reconcileDevelopmentHistory` accepts only this exact prefix, validated canonical SQL and inspected objects. It appends canonical cursors from 0003 onward, preserving every existing row and hash, then applies forward 0048. For 0049 it replaces/revokes the function while retaining the inspected trigger identity; fresh databases run the full unchanged 0049 SQL. The repaired PvP function raises SQLSTATE 23514, rolling back the complete legacy cancellation transaction. Existing rewards, attempts, content and policy pins are untouched.

Unknown/partial history, schema/function/trigger drift, disabled XP protection or changed canonical files cause rejection inside the migration transaction. This is an explicit adoption of inspected schema with preserved provenance, not a general permission to skip unknown SQL. New fixtures reproduce the mixed history only on newly created synthetic local databases.

## Backup and rollout procedure

1. Use the pinned Node 24.22.1/pnpm 12.6.0 and immutable source commit. Keep 0000–0048 SQL/journal entries unchanged; 0049 is generated with Drizzle's custom migration workflow.
2. Complete package, authorization, transport, connected and browser gates on the combined source. CI uses PostgreSQL 16/Redis 7; the Cloud backup rehearsal uses PostgreSQL 17.11 to match the server generation.
3. Verify the configured Development project/owner/TLS target. Capture a repeatable-read exported snapshot and back up business schemas (`public`, `drizzle`, `irt_compute`) plus separate Auth/Storage data. Restrict the backup directory to the operator and verify PGDMP format, archive lists and SHA-256.
4. Restore the business archive into a new loopback PostgreSQL 17 database. Verify original-column row counts/digests before upgrading; run the official integrated migrator and replay. Preserve all business data and the complete original history prefix; only append canonical adoption/migration records.
5. Immediately before Cloud application, check that history and data still match the verified backup/rehearsal; refresh the snapshot and rehearsal if they changed. Use bounded database locks/timeouts and the official runner, without resetting schema or editing history manually.
6. Verify original-column business/Auth/Storage digests, original history rows, effective partial/legacy XP guard, PvP rejection function/trigger and replay idempotency. Record actual results and source SHA in the integration PR and private operator artifacts.

The initial snapshot covers 152 business/metadata/Auth/Storage tables. Restricted artifacts are under `D:/numora-sandbox-backups/2026-10-29-runtime-qa-ca28a87/`; business archive SHA-256 is `16cf8f410a8a0d21acdda0b4befebf6aa9fc9948fccd5c3ba3484e8494cf09d8`, Auth/Storage data archive SHA-256 is `ab08a629ffecdabb791d4f33651265c3e488b6f83bb82e07923e7f3e9e141d84`. This is not a full managed Supabase/object-store/settings backup; Auth/Storage schema restoration and external objects are outside this business migration rehearsal.

## Verification and remaining acceptance

The earlier 68-test database sweep, targeted upgrade checks, monorepo typecheck and lint are development evidence; final-head CI/rehearsal results belong to the integration PR's validation section. Historical failed SIS-001 load/OOM findings and manual keyboard, real OAuth, staging and academic acceptance remain open. No product parameter, publication approval, seed, account or deployed application version is changed by the migration procedure.

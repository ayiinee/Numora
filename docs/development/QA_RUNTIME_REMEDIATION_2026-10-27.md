# QA runtime remediation and PR #102 recovery

**ENGINEERING DECISION — implementation requested by the owner, 27 October 2026.**
The QA branch includes the scenario workflow, SIS-001 worker/result optimizations,
and the runtime repairs from [PR #102](https://github.com/ayiinee/Numora/pull/102).
Historical reports retain their original versions and outcomes.

## P0 dependency scope

- Node 24.22.1, with bundled Undici 7.30.1, is the minimum supported Node 24 runtime.
  CI and `.node-version` agree. Local verification uses an official portable build
  verified against its published SHA-256; the global Node/Codex installation is unchanged.
- Web uses Next and `@next/env` 16.4.1. API uses `@nestjs/platform-express` 12.3.2,
  including Multer 2.5.0. A scoped `express>body-parser` override selects 2.4.0 because
  Express's dependency range still permits the vulnerable 2.3.x release.
- This implements P0 from the checked-in dependency triage. Remaining production
  and development advisories are still open; no audit ignore or safety-limit change
  is introduced. Deployment runtime versions still require operator verification.

## Recovery chronology

A fixture engine can persist a match with a clock ahead of a recovering engine.
The same condition is possible after host clock correction. Recovery previously
attempted to write `ended_at < started_at` and PostgreSQL correctly rejected the
whole transaction with `pvp_matches_time_ck` (23514).

Cancellation now derives its terminal timestamp with PostgreSQL `greatest` against
the persisted start/creation time. Pending invitations and the cancellation outbox
event use that exact persisted value, retaining microsecond precision. Existing
terminal state, room-claim release, no-record cancellation, immutable XP and the
database constraint remain intact. This does not trust a browser clock or change
question/reconnect deadlines. Regression reproduces the old failure and checks
WAITING/RUNNING recovery, replay, event identity, claims, no XP, microseconds and
direct rejection of an invalid database timestamp.

## Reconciliation with Ferdi's migration snapshot

**PROPOSED merge candidate, not a deployment instruction.** PR #92 snapshot
`a52b9dbb3b69471ca1993116f429ceec79ee5519` already assigns 0039–0047 to nine
Admin migrations. PR #102 independently assigns 0039/0040 to runtime guards.
Both published SQL versions are archived byte-for-byte in test fixtures with
provenance hashes. No remote branch, shared database or old migration record is rewritten.

`runtimeAdminCandidate` materializes an isolated joint journal:

| Joint candidate | Published source |
| --- | --- |
| 0000–0038 | common main |
| 0039–0047 | unchanged Admin SQL from PR #92 |
| 0048 | unchanged `0039_pvp_transient_queue_guard` from PR #102 |
| 0049 | unchanged `0040_tryout_reward_decimal_guard` from PR #102 |

The ordering is significant: Admin's older partial-reward guard still uses `ceil`.
The reviewed decimal guard must be restored after it, preserving the six-decimal
equivalent-correct formula and previously posted amounts. A database that already
applied PR #102 must not replay the trigger-creation SQL. The integrated migrator
recognizes only the complete known runtime prefix and exact archived Admin hashes
in this 50-entry candidate, preserves original history rows, applies missing Admin
DDL transactionally, restores the idempotent reward function and records canonical
cursors. Unknown/partial histories fail closed; schema drift rolls back DDL/history.

Fresh, PR #102 and PR #92 database histories are rehearsed against the candidate.
The live branch journal remains 0000–0040 while the Admin PR is unmerged. Ferdi's
PR still needs its normal integration review and the agreed combined journal;
this rehearsal neither claims his approval nor merges his application features.
Before deployment, verify the actually merged journal/SHA, backup and target
history. Never apply two conflicting chains manually.

## Evidence and remaining acceptance

API integration files and workspace test tasks run serially because existing
published-package fixtures mutate a shared test database. This also prevents
database package seeds from racing API fixtures in CI. Concurrent submissions,
consumers and reconnect races inside test cases remain concurrent and unchanged.
This is runner isolation, not retries, skipped assertions or a load-profile change.

New verification is linked to SIS-001 optimization run
`5a091494-b077-4a09-95aa-8f06ac18ea21`; its PASS volume/load and FAIL audit are
historical evidence, not approval for the changed dependency graph. New full QA
retains volume 1k/10k/100k, drain 120 seconds, HTTP timeout 15 seconds, original VUs
and the 60-minute post-build budget. Manual keyboard and the missing original
academic workbook remain separate from automated acceptance. Local auth fixtures
do not verify Google OAuth or staging/production.

# PvP random Drill bank

**ENGINEERING DECISION — temporary owner exception, 7 October 2026:** [temporary READY content mode](PVP_TEMPORARY_READY_CONTENT.md) permits the existing accepted uncalibrated single-choice pool in DEMO only. Explicit activation replaces difficulty matching with the exact owner-accepted marker. Strict mode remains the default; the linked document includes replacement steps.

**ENGINEERING DECISION — owner approved, 7 October 2026:** new PvP rooms draw ten questions directly from the READY Drill bank across all chapters, using the host's PvP difficulty selection. This supersedes the separately published PvP-package/Curriculum-manifest requirement for new rooms in both DEMO and official modes. Existing server mode, policy, scoring and historical result dimensions remain intact. No new question flag or UI choice is introduced.

## Eligible content

- Question family `usage_type=DRILL`, family and version READY, competency/subchapter/chapter READY, and linked level READY when present.
- Latest READY version per variant; reviewed by an Admin or backed by an existing CONTENT_VALID validation decision. Difficulty comes from EASY/MEDIUM/HARD metadata, never a Drill level-number inference.
- Only valid single-choice text questions supported by the current decoder; media requiring unsupported rendering and PGK are excluded. DRAFT import/review is not READY and is never promoted by PvP.
- Group by question family. Uniformly sample ten distinct families without replacement, randomly choose one eligible variant per family, then shuffle their order with server randomness. No cross-difficulty fallback or duplicate padding.

## Durable delivery

Availability uses the same eligibility checks, counts families and writes nothing. Fewer than ten valid families returns `PVP_CONTENT_UNAVAILABLE`. Create checks idempotency first, selects/locks/revalidates candidates, then inserts a DRAFT internal PvP package, its items, the frozen manifest, room, players and question references in one transaction. The database's existing freeze trigger generates the canonical digest. One internal package belongs to one room; no Admin publication step is needed.

**ENGINEERING IMPLEMENTATION — availability reads.** An availability request checks the published scoring policy once. Temporary mode reads the shared bank once for all three timer choices. Strict mode checks each difficulty's bank. The browser refreshes availability after room entry, exit, or completion, including a terminal server snapshot. An ordinary answer acknowledgement leaves the availability query alone.

Availability selects the family ID and the question fields used by the single-choice and media validators. It shares the SQL eligibility filters and application validator with room creation. Room creation reads full version rows for selection and transactional revalidation.

**ENGINEERING DECISION — cache implementation, 13 November 2026.** Availability shares validated content booleans through Redis with a 60-second TTL. Keys include a database connection hash, deployment prefix, content mode, difficulty (one shared pool for temporary mode), decoder revision and PostgreSQL content revision. A small revision read on each request detects committed mutations to versions, variants, families, review decisions and READY hierarchy, including direct SQL. Migration 0072 updates the revision within the content transaction. Content mutations take a shared revision-row lock and therefore serialize briefly. A rollback preserves the previous revision.

Concurrent misses within one API process share one validation. API replicas share Redis entries; a simultaneous cold miss on different replicas may validate once per replica. Redis errors fall back to validation, with a 250-ms connection/command timeout and no offline command queue. Policy, runtime guards and active rooms are checked per request. Cache entries contain only booleans. Create continues to select, lock and revalidate authoritative content in its transaction.

Apply migration 0072 before restarting the API. Existing Redis configuration is reused. Drain active rooms according to the restart runbook. Database restores must invalidate this Redis namespace if revision values are restored. The TTL and timeout are implementation choices and can be adjusted after measurement.

Both players and reconnects use saved version IDs/order. Retry returns the existing room without sampling again. Published scoring-policy validation, timing, answers, reconnects, XP separation and outbox remain server-authoritative. Existing packages/rooms continue to be read by their original references. The cache revision uses migration 0072.

## QA and rollout

**ENGINEERING DECISION - owner UI request, 7 October 2026:** remove the standalone `PvP DEMO` lobby card and its obsolete synthetic-content copy. The lobby uses the existing authenticated REST/WebSocket backend and new rooms use the READY Drill bank described above. This presentation change does not switch server mode or rewrite historical records; the in-match notice still follows `isDemo`.

Use isolated PostgreSQL/Redis fixtures with explicitly READY Drill families; verify difficulty, hierarchy, review, latest versions, family deduplication, malformed/unsupported exclusions, pools of 0/9/10/>10, deterministic random tests, concurrent idempotency and transaction rollback. Connected two-player QA covers equal questions/order, saved answers/reconnect, pinned versions and no keys in responses. Drain rooms before deployment because the existing API restart policy cancels outstanding matches. Enable new rooms only when the scheduler/policy and at least one difficulty's ten eligible families are available; no writes to the active content bank are part of this rollout.


## Verification - 7 October 2026

**ENGINEERING UPDATE:** 44 focused unit/integration tests pass on isolated PostgreSQL 16 and Redis 7.2, including bank eligibility/sampling, transaction rollback/idempotency, PvP REST/Socket.IO, notifications and leaderboards. The two-browser connected acceptance passes all three difficulties, matching questions/order, browser reload reconnect, frozen ten-family READY Drill snapshots, finished results and leaderboard projection. Workspace lint/typecheck, API/worker/production-web builds and contract/type freshness checks pass. Browser verification used the shared working tree production build with local fixture authentication; it is not real-identity staging acceptance. No active content bank was seeded or promoted.

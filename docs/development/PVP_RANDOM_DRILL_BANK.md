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

Both players and reconnects use saved version IDs/order. Retry returns the existing room without sampling again. Published scoring-policy validation, timing, answers, reconnects, XP separation and outbox remain server-authoritative. Existing packages/rooms continue to be read by their original references. No schema migration, automatic seed, READY promotion or history rewrite is required.

## QA and rollout

**ENGINEERING DECISION - owner UI request, 7 October 2026:** remove the standalone `PvP DEMO` lobby card and its obsolete synthetic-content copy. The lobby uses the existing authenticated REST/WebSocket backend and new rooms use the READY Drill bank described above. This presentation change does not switch server mode or rewrite historical records; the in-match notice still follows `isDemo`.

Use isolated PostgreSQL/Redis fixtures with explicitly READY Drill families; verify difficulty, hierarchy, review, latest versions, family deduplication, malformed/unsupported exclusions, pools of 0/9/10/>10, deterministic random tests, concurrent idempotency and transaction rollback. Connected two-player QA covers equal questions/order, saved answers/reconnect, pinned versions and no keys in responses. Drain rooms before deployment because the existing API restart policy cancels outstanding matches. Enable new rooms only when the scheduler/policy and at least one difficulty's ten eligible families are available; no writes to the active content bank are part of this rollout.


## Verification - 7 October 2026

**ENGINEERING UPDATE:** 44 focused unit/integration tests pass on isolated PostgreSQL 16 and Redis 7.2, including bank eligibility/sampling, transaction rollback/idempotency, PvP REST/Socket.IO, notifications and leaderboards. The two-browser connected acceptance passes all three difficulties, matching questions/order, browser reload reconnect, frozen ten-family READY Drill snapshots, finished results and leaderboard projection. Workspace lint/typecheck, API/worker/production-web builds and contract/type freshness checks pass. Browser verification used the shared working tree production build with local fixture authentication; it is not real-identity staging acceptance. No active content bank was seeded or promoted.

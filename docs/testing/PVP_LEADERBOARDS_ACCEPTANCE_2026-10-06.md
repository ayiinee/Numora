# JOB-16 / JOB-17 — verification, 6 October 2026

**ENGINEERING UPDATE — subsequent owner-authorized cloud operation:** migration/replay, DEMO seed/replay, cloud-connected runtime activation and authenticated QA REST checks now pass on the existing Development sandbox. [Cloud evidence](../operations/PVP_CLOUD_ACTIVATION_2026-10-06.md). The local results below remain historical evidence; the earlier no-cloud-operation statement is superseded by that report. Two Google-authenticated browser acceptance and public staging hosting are still not established.

**ENGINEERING UPDATE:** implementation is present in the uncommitted working tree based on `e7cf11db1a7039b81c32f24a158994630ecc8781`. Existing learning/UI work was retained. This report covers isolated local verification; it does not establish staging acceptance or official Curriculum publication.

Specification: [approved behavior](../development/PVP_LEADERBOARDS_JOB16_17.md). Operations: [rollout/disable/approval procedure](../operations/PVP_LEADERBOARDS_ROLLOUT.md).

## Verification outcomes

| Check | Result |
|---|---|
| Workspace lint | PASS, no warnings |
| Workspace typecheck | PASS, all 14 build/typecheck tasks; final API recheck after receipt change |
| Database, assessment, IRT, API, worker and optimized Next webpack builds | PASS |
| OpenAPI generation, REST/WebSocket generation/check, JSON Schema validation | PASS, 8 schemas |
| Root script checks | PASS, 68 tests, zero skipped |
| API full regression/integration | PASS, 39 files / 178 tests, zero skipped |
| Final policy/engine/transport/leaderboard integration | PASS, 18 tests; final guest retry fix additionally passes 12 flow/transport tests |
| Web full regression | PASS, 30 files / 225 tests |
| Worker regression/integration | PASS, 6 files / 16 tests, zero skipped |
| Database final regression/integration | PASS, 13 files / 33 tests, zero skipped |
| Simulator PvP visual/interaction E2E | PASS, 393px and 1440px; screenshots inspected |
| Connected two-browser E2E | PASS on final API/web/worker build, all three difficulties |
| Empty database migration and replay/upgrade | PASS; frozen legacy archive ranks/rewards preserved; default Supabase grants revoked for new table/functions |
| Backup/restore rehearsal | PASS, isolated final fixture restore approximately 4.8 seconds |

Connected E2E uses distinct Mandiri and School browser contexts, the production Nest domain providers, native PostgreSQL 16.15, local Redis 6.0.16, and an explicitly isolated Auth transport fixture. There are no product-route mocks or domain provider overrides. BullMQ emitted its Redis 6.2+ advisory; this records the actual local service version, not staging infrastructure validation.

The browser test creates/joins/readies each difficulty, locks ten answers on both clients, checks FINISHED/COMPLETED/recordEligible durability, runs the production projection, and verifies mode-separated Best Poin and own rank in REST/UI. It also submits a real Drill attempt and verifies that class/global amounts equal the posted ledger reward. Tryout submit/reward behavior is covered by API integration; reward formulas were not changed by this increment.

Final restored fixture totals: three eligible completed DEMO matches, thirty immutable question pins, six DEMO best records, one reward ledger row, and thirty migration history entries. Upgrade/replay tests separately preserve competition-ranked archives as legacy and reject conflicting active rooms directly in PostgreSQL. Critical engine tests cover exact 20-second reconnect, unequal/equal offline deadlines, guest replacement, terminal retries, lost Redis cache/jobs, and restart cancellation. Final guest leave receipt test proves delayed retry cannot evict a new participation in the same room.

Local artifacts are in `.tmp/job16-acceptance/`: `connected-evidence.json`, `verification-manifest.json`, migration/test logs and local-only backup files. The manifest records base SHA and source hashes for the combined uncommitted workspace; credentials, browser storage and auth sessions are excluded from evidence. Simulator screenshots are in `.tmp/redesign-phase5/`. Synthetic identities and content are QA fixtures, not academic approval.

## Remaining release boundary

**OPEN — operations handoff:** target deployment environment/API/worker/web hosts and two actual authenticated identities have not been supplied for this run. No shared cloud migration, seed, deployment or activation was performed. Complete the rollout on the designated target with its backup and immutable artifact SHA, then record authentic identity match → projection → leaderboard evidence and independent review/sign-off.

**OPEN — Curriculum delivery dependency:** official non-DEMO package approval/difficulty evidence remains required. DEMO points must never migrate into the official board. PGK rubric, IRT compute and XP formula changes remain outside this job.

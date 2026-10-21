# Runtime reliability repairs — 21 October 2026

**ENGINEERING DECISION — implementation of ADR-006/ADR-009 and existing owner decisions:** repair runtime integration without changing scoring formulas, publishing content or rewriting historical results.

- Student learning HTTP and PvP WebSocket clients use `NEXT_PUBLIC_MAIN_API_URL` in generator demo mode, with the existing localhost fallback. Outside that mode they retain `NEXT_PUBLIC_API_URL`. This completes the routing boundary documented in [generator service v1](../content/GENERATOR_SERVICE_V1.md).
- Drill start accepts the existing non-demo Chapter 3 policy v1 allowlist alongside normal runtime approval. Distribution, publication, hierarchy, level locks and immutable policy pins remain required. See [the owner exception](DRILL_CHAPTER3_OWNER_EXCEPTION.md).
- PvP commands acknowledge committed state before queue scheduling and broadcasts. Redis loss or queue errors leave PostgreSQL deadlines active; readiness follows successful durable sweeps. Notification failure does not stop other matches, and an initial failed sweep is retried by the interval. Actual API restart still cancels outstanding matches through `SERVER_RESTARTED`.
- Migration `0039_pvp_transient_queue_guard` rejects legacy `SERVICE_INTERRUPTED` cancellations with a constraint error. Rejecting the complete transaction preserves room claims and other related records; silently returning the old match row would leave cancellation side effects committed.
- Migration `0040_tryout_reward_decimal_guard` widens `base_xp` from integer to numeric(14,6) and validates Tryout XP at the same six-decimal precision already used by the finalizer and `xp_amount`. It retains equivalent-correct ×10, source/student/timestamp/policy checks and immutable ledger behavior. Existing integer amounts remain exact; it does not modify posted rewards. The later [7 October owner decision](../product/OPEN_DECISIONS.md) supersedes the historical rounding text in the earlier XP notes.

## Rollout and verification

Apply committed migrations through the normal migration runner before deploying the API/worker. Upgrade legacy schedulers together: their transient cancellation attempts will be rejected until replaced. No shared database migration or deployment is performed by this PR preparation.

Regression coverage includes generator-demo HTTP routing, queue absence, durable deadline processing, notification failures, database failure, Socket.IO Redis-disconnect behavior, transactional room-claim preservation, six-decimal Tryout XP validation and immutable ledger writes. PostgreSQL tests require an isolated loopback `TEST_DATABASE_URL`; Socket.IO integration also requires `TEST_REDIS_URL`. The PR records which checks were executed and which service-dependent checks remain for CI.

Local verification passed 9 targeted API unit tests, 3 PostgreSQL migration/guard tests and 13 PostgreSQL PvP/Tryout lifecycle tests. Fresh canonical migration and replay were verified on a disposable embedded PostgreSQL cluster, which was stopped afterwards. Redis transport and connected browser release checks remain for CI. An initial full web test/build attempt hit Windows memory/process failures; 238 web assertions passed in that run, but it was not an overall pass.

Academic approval, Curriculum mapping and IRT dependencies remain open as previously documented. This repair does not create new product rules or synthetic production approvals.

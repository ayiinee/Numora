**ENGINEERING DECISION - owner approved, 7 October 2026:** new PvP rooms randomly draw ten distinct READY Drill question families across all chapters at the difficulty selected in PvP. Admin review or existing CONTENT_VALID evidence, valid difficulty/content and READY hierarchy replace separate PvP-package approval for both DEMO and official modes. No additional question marker/UI choice or automatic content publication is introduced. Per-room immutable packages preserve retry/reconnect and history. [Source, compatibility and QA](../development/PVP_RANDOM_DRILL_BANK.md).

# JOB-16 / JOB-17 rollout

**ENGINEERING UPDATE — owner instruction, 6 October 2026:** migration `0029`, opt-in PvP DEMO seed and activation have now been applied to the currently configured Development cloud sandbox. API/worker/web run on the current computer with cloud dependencies. [Cloud evidence and remaining acceptance](PVP_CLOUD_ACTIVATION_2026-10-06.md). This supersedes the earlier “no cloud activation performed” status for this environment; public staging hosting and two Google-identity acceptance remain outstanding.

**ENGINEERING DECISION — owner approved 6 October 2026:** initial rollout is DEMO. Official publication requires Curriculum approval; local authentication fixtures do not establish staging acceptance. Approved behavior: [module specification](../development/PVP_LEADERBOARDS_JOB16_17.md).

## Configuration and publication

Deploy one API instance with its PvP scheduler, a worker, and web. Runtime `DATABASE_URL` uses `numora_main_runtime`; migration credentials remain exclusively in the designated runner. Redis uses TLS and a deployment-specific `BULLMQ_PREFIX`. `PVP_MODE=disabled` is the default. Only the server selects `demo` or `official`; do not expose mode or approval inputs through browser configuration.

`0029_pvp_leaderboard_activation.sql` adds the published PVP_PRD_V06 v1 policy, participation constraints and mode/provenance dimensions. It cancels outstanding pre-upgrade rooms with an atomic cancellation outbox event. Finished results, reward ledgers and existing archived ranks remain intact. Existing PvP records retain `legacy`; they do not become official records.

1. Review the final diff and migration; obtain a fresh database backup and restore it into an isolated rehearsal target using [backup procedure](BACKUP_RESTORE.md). Record backup reference, SHA, durations and integrity results without secrets.
2. Run the canonical `pnpm --filter @tka/database db:migrate` with `DATABASE_MIGRATION_URL` in the migration runner. Repeat against rehearsal to verify idempotency. Do not use a dashboard schema edit.
3. Deploy immutable API/worker/web artifacts with `PVP_MODE=disabled`. Confirm health, projection startup and current `projected_at` timestamps, including empty boards.
4. Seed separately with `pnpm --filter @tka/database db:seed:pvp`: explicit `ALLOW_DEMO_SEED=true`, sandbox `PVP_DEMO_SEED_PROJECT_REF`, matching `SUPABASE_URL`, and TLS `DATABASE_URL`. The seed checks drift, runs in one transaction, creates no accounts/XP, and is safe to replay. It refuses unnamed cloud targets.
5. Set `PVP_MODE=demo`, `PVP_NEW_MATCHES_ENABLED=true`, then deploy/restart the single API instance. Confirm `/api/v1/pvp/availability` reports all three difficulties and the UI labels DEMO. API restart cancels outstanding rooms without best records; finished results remain durable.
6. Run staging acceptance with two actual authenticated student identities, one Mandiri and one School. Record scenario outcomes, artifact SHA, timestamps, environment reference and opaque match/period IDs. Exclude credentials, tokens, email and student PII from evidence.

For new rooms, both modes require at least ten distinct valid READY Drill families of the selected difficulty, reviewed content and READY hierarchy. The server generates and freezes the per-room package in the create transaction; no separate PvP-package approval is required. Existing package approvals remain historical evidence. Academic metadata still comes from the content review workflow. Switch mode after draining current rooms; result dimensions remain separate. The opt-in PvP seed above is historical activation evidence and does not provision the new Drill bank. This change does not seed or promote active content. See [bank eligibility and QA](../development/PVP_RANDOM_DRILL_BANK.md).

The schema is additive, but pre-increment API/worker versions do not understand guest history and mode dimensions. After new participation/results exist, disable matches and forward-fix using a compatible artifact; do not roll the worker back to a version that merges modes or rewrites archived ranks. Database restoration is rehearsed in isolation, never over the active target as a routine rollback.

## Acceptance scenarios

- All difficulties: same ten question IDs/order for both players; simultaneous Ready; locked first answer; duplicate/late answer; fake score/time rejected; keys/explanations absent during arena.
- Waiting: guest leaves and is replaced, Ready resets, original expiry remains; host leave cancels; room/invite expiry; filling a room cancels other pending invites; accept rechecks recipient and active shared class; concurrent create/join from multiple tabs leaves one claim.
- Recovery: reconnect through 20 seconds inclusive; later reconnect forfeits; earliest of two unequal deadlines loses; equal deadlines cancel; terminal retries/reconnect preserve final state. Redis loss, missing jobs and API restart cannot award forfeit/cancellation best records.
- Activity: actual Drill/Tryout submit creates one ledger reward; class/global copy the stored decimal amount; zero XP, multiple classes, immediate ban/leave filtering and Top 10/self work. PvP and Pretest add no activity XP.
- Best Poin: FINISHED + COMPLETED + recordEligible only; DEMO/official/legacy never mix; ties are dense and podium ties are lists. Hourly/startup projection is repeatable, reconciles missed weeks before archive, and stamps empty periods.
- Archives: Thursday 00:00 WIB boundaries, unknown period rejection, active class membership on both listing/detail, historical totals/ranks preserved after membership changes. Rehearse downtime across several weeks and restore/upgrade.

## Monitoring and disabling new matches

Monitor health, availability by difficulty, scheduler Redis errors, cancellation outbox events, worker `[leaderboard] class projection` logs, current period `projected_at`, and the REST `stale`, `nextUpdateAt`, `rankPolicyVersion`, `dataMode` fields. A Redis error disables availability; PostgreSQL remains the durable source of results. Alerts should name a failure code/environment without tokens or personal payloads.

Set `PVP_NEW_MATCHES_ENABLED=false` to prevent new room creation while retaining the selected policy for current matches. Availability returns `PVP_NEW_MATCHES_DISABLED`; active participants can open their recovery link. Environment changes normally require redeployment; restart cancels active rooms according to the interruption policy. If operations supports updating environment in-process, existing running matches can finish normally. After rooms are drained/cancelled, `PVP_MODE=disabled` fully gates the feature. Re-enabling must verify Redis/scheduler and per-difficulty content again. Do not delete results, rewards, archives or queue-independent database truth.

## Local verification

Connected test harness: `apps/api/scripts/serve-pvp-chain.mjs`, production domain providers with isolated localhost auth fixtures, PostgreSQL and Redis. Database must be named `numora_test_job16_e2e`; no shared cloud target is allowed.

Build database/assessment/IRT packages, API and worker. Build web with `NUMORA_WEB_DIST_DIR=.next-job16`, `NEXT_PUBLIC_API_URL=http://localhost:3451/api/v1`, `API_INTERNAL_URL` matching, `NEXT_PUBLIC_SUPABASE_URL=http://localhost:3452`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=job16-test-only-public-key`. Use `NUMORA_LOW_MEMORY=true` and `next build --webpack` on a constrained Windows machine. Apply migrations through the runner first. Then set isolated `TEST_DATABASE_URL`/`TEST_REDIS_URL` and run:

```text
pnpm --filter @tka/web exec playwright test --config=playwright.pvp-connected.config.ts
```

Evidence is emitted to `.tmp/job16-acceptance/connected-evidence.json`, without auth state or credential-bearing traces. The simulator E2E remains a separate UI regression suite. Staging sign-off is pending until actual identity acceptance and deployment evidence have been recorded.

**ENGINEERING DECISION - owner approved, 7 October 2026:** new PvP rooms randomly draw ten distinct READY Drill question families across all chapters at the difficulty selected in PvP. Admin review or existing CONTENT_VALID evidence, valid difficulty/content and READY hierarchy replace separate PvP-package approval for both DEMO and official modes. No additional question marker/UI choice or automatic content publication is introduced. Per-room immutable packages preserve retry/reconnect and history. [Source, compatibility and QA](../development/PVP_RANDOM_DRILL_BANK.md).

# JOB-16 / JOB-17 — PvP activation and valid leaderboards

**ENGINEERING DECISION — owner approved, 6 October 2026:** initial staging uses labelled DEMO matches. Official activation waits for Curriculum-approved content/difficulty. This specification supersedes fixture-only OPEN-07 treatment and historical Top 20/tie proposals.

## Approved behavior

**ENGINEERING DECISION - owner UI request, 7 October 2026:** use a more compact PvP leaderboard: smaller headings, podium portraits/pedestals, point labels and participant rows, with reduced card padding and gaps. Apply this only to the PvP tab across all difficulties and responsive widths; retain at least 44px interactive targets. Class/activity presentation, server ranks, points, ties and archives retain their existing behavior.

- **PRD RULE:** ten identical questions, first answer locked, advance after both answers or deadline, server points/time. Correct = 100 + floor(50 × remaining / duration); wrong/blank = 0. Easy/medium/hard durations = 30/45/60 seconds. Room/invitation lifetime = 600 seconds.
- **ENGINEERING DECISION:** one active room/account; tabs share participation. Guest leaving/exceeding reconnect grace in waiting releases the slot and resets Ready without extending expiry. Host leaving/exceeding grace cancels. Both current players must explicitly be Ready and connected.
- **ENGINEERING DECISION:** guest leave receipts are persisted in the transactional outbox with the command request ID. A delayed retry after that student rejoins the same room cannot end their replacement participation.
- **PRD RULE / boundary:** reconnect through 20 seconds inclusive; after that forfeit. Timer continues. **ENGINEERING DECISION:** both offline: earliest expired deadline loses; identical deadlines cancel without results. System interruption/restart cancels without records. Terminal state is immutable.
- **PRD RULE:** only FINISHED/COMPLETED/record-eligible matches produce Best Poin. Forfeit excludes the whole match. **ENGINEERING DECISION:** DEMO and official PvP records/projections are separate; deployment selects display mode, not browser input.
- **PRD RULE:** Top 10 rows plus own entry. **ENGINEERING DECISION:** dense rank 1,1,2 and deterministic UUID order for equal values. Tied podiums use a list without distinct pedestal heights.
- **PRD RULE:** activity uses immutable Drill + Tryout ledger events, account-based across every active class. **ENGINEERING DECISION:** include posted DEMO learning XP; no reward rewrite. Include zero-XP students. Leave/ban immediately filters current class board and ranks remaining visible members.
- **ENGINEERING DECISION:** intervals [Thursday 00:00 WIB, next Thursday 00:00 WIB) include Wednesday 23:59. Hourly/startup projection reconciles missed periods before freezing archives. Active class membership is required for class periods/archives; archived ranks retain their historical policy.

## Interfaces and activation

Server-only `PVP_MODE=disabled|demo|official` defaults disabled. Resolve published `PVP_PRD_V06`, never test fixtures. New rooms in both modes use reviewed READY Drill content and a generated frozen per-room package as specified in [the random bank decision](PVP_RANDOM_DRILL_BANK.md). Availability and create share bank eligibility and scheduler readiness. Add active-room recovery, leaderboard period listing/optional periodId, staleness/mode/rank provenance; regenerate REST/WebSocket contracts.

## Delivery

Forward migrations, upgrade/replay, PostgreSQL/Redis integration, connected two-browser engine E2E, UI regression, contracts, lint/typecheck/build are required. Staging acceptance additionally needs real identities and match → projection → leaderboard evidence with SHA and no credentials. Local fixtures are not staging acceptance. Deploy via designated migration runner before API/worker/web; DEMO seed is separate and opt-in. One PvP API instance. Disable new rooms before mode changes; preserve history. Curriculum, PGK and IRT remain separate dependencies.

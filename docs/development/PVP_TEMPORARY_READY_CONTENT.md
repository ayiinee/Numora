# PvP temporary READY Drill content — 7 October 2026

**ENGINEERING DECISION — explicit owner instruction:** temporarily use available content for PvP and document what the owner must change later. This exception supersedes difficulty matching in [the random Drill bank specification](PVP_RANDOM_DRILL_BANK.md) only while explicitly enabled. It does not approve academic difficulty or general content publication.

## Current problem and behavior

Development has 60 READY single-choice Drill families marked `OWNER_ACCEPTED_UNCALIBRATED`, plus 36 MCMA and 24 Category families from the [Chapter 3 acceptance](DRILL_CHAPTER3_OWNER_EXCEPTION.md). None has EASY/MEDIUM/HARD metadata; strict PvP eligibility returns zero families per difficulty.

Server-only `PVP_CONTENT_MODE=temporary-owner-accepted` selects READY single-choice Drill versions with that exact marker. Existing READY hierarchy, review/CONTENT_VALID, valid answer/explanation, supported-media, latest-version and ten-distinct-family checks still apply. DRAFT, Tryout and PGK remain excluded. This setting does not publish, reclassify or overwrite content.

All three choices use the same temporary pool. Mudah/Sedang/Sulit select server timers of 30/45/60 seconds, not calibrated question difficulty. Availability exposes an optional `contentNotice` near those choices. Both players, retries and reconnects use the saved ten-question version/order snapshot.

Temporary content requires `PVP_MODE=demo`, preserving the existing DEMO result/leaderboard dimension. Published scoring policy, ten-question count, server scoring, reconnect, authorization and idempotency remain unchanged. Strict eligibility is the default.

## Activation

PvP also normalizes the existing imported PG storage shape `{ options: [...] }` for eligibility, snapshots and answer scoring. Legacy option arrays remain supported. The shared single-choice validator still rejects invalid options/keys and non-text content. This compatibility fix does not rewrite stored versions and remains useful after temporary mode is removed.

```dotenv
PVP_MODE=demo
PVP_CONTENT_MODE=temporary-owner-accepted
PVP_NEW_MATCHES_ENABLED=true
```

Restart the API after verifying no outstanding rooms: existing recovery cancels unfinished rooms on restart. Keep the leaderboard worker running; it projects both result dimensions. Browser refresh refetches availability. These are server settings with no NEXT_PUBLIC flags or browser activation controls.

## What the owner must change later

1. Supply reviewed READY single-choice Drill content with approved EASY/MEDIUM/HARD metadata and at least ten valid distinct families per intended difficulty. Create new immutable versions for revisions; preserve historical versions and rooms.
2. Set `PVP_NEW_MATCHES_ENABLED=false`, let rooms finish and verify no WAITING/READY/RUNNING rooms remain.
3. Set `PVP_CONTENT_MODE=strict` (or remove it). Set `PVP_MODE=official` once the strict bank is ready, then restart the API. The worker needs no content-mode setting.
4. Check `/api/v1/pvp/availability` reports intended difficulties available without `contentNotice`. Verify two-player create/join/ready/answer/reconnect/results and the matching leaderboard projection.
5. Re-enable new rooms. Keep temporary DEMO results separate from official records.

**OPEN / dependency:** academic calibration and broader PGK/media support remain future work. This exception supplies neither calibration nor a PGK rubric. Remove the temporary branch and notice after the owner confirms the strict rollout; until then it remains opt-in.

## QA

Verify default strict exclusion, DEMO-only activation, nine/ten-family boundaries, DRAFT/TRYOUT/PGK/unreviewed/malformed/media exclusions, shared pool with three timers, immutable pins, duplicate-create recovery and no answer-key leakage. Record Development counts without credentials or student PII.

## Verification and local rollout

**ENGINEERING UPDATE — 7 October 2026:** local `.env` now explicitly uses DEMO and the temporary content mode; the API and web development services were restarted after confirming zero outstanding rooms. The current configured Development bank supplies 60 eligible families for each timer choice. No content rows or existing results were modified.

API policy/bank tests pass: 20 tests on isolated PostgreSQL, including imported option wrappers, nine/ten-family boundaries, exclusion rules, three timers, pinned questions, duplicate create and scoring after both answers. Web PvP tests pass: 11 tests. API/web typecheck/build, changed-source lint, contract validation/type freshness and diff checks pass. Web production build uses the existing low-memory setting.

Authenticated availability and WebSocket connection pass using an existing Supabase QA identity. Browser checks at 320, 768 and 1440 px show the temporary notice and enabled Create button, without horizontal overflow. Evidence is ignored under `.tmp/pvp-temporary-evidence/`; auth tokens remain in memory. This smoke check created no Development rooms or rewards. Two-player operations were exercised in the isolated engine tests; this is not two-Google-identity staging sign-off.

**ENGINEERING DECISION - owner approved, 7 October 2026:** new PvP rooms randomly draw ten distinct READY Drill question families across all chapters at the difficulty selected in PvP. Admin review or existing CONTENT_VALID evidence, valid difficulty/content and READY hierarchy replace separate PvP-package approval for both DEMO and official modes. No additional question marker/UI choice or automatic content publication is introduced. Per-room immutable packages preserve retry/reconnect and history. [Source, compatibility and QA](../development/PVP_RANDOM_DRILL_BANK.md).

# Realtime PvP Architecture

**ENGINEERING DECISION — owner approved 6 October 2026:** the active PRD v0.6 implementation is described in [JOB-16/17](../development/PVP_LEADERBOARDS_JOB16_17.md) and its [rollout](../operations/PVP_LEADERBOARDS_ROLLOUT.md). Server policy resolves published PVP_PRD_V06 v1; default activation is disabled, initial QA is labelled DEMO. PostgreSQL `pvp_active_rooms` enforces one current room per student, participant `left_at` preserves guest history, and terminal transitions release claims transactionally. Redis is disposable scheduling/cache infrastructure. DEMO, official and legacy result dimensions remain separate. Older proposed state/event labels below are historical; generated OpenAPI/WebSocket contracts describe the implemented interfaces.

## Product baseline

PRD v0.5 baseline requires:

- 1v1 realtime PvP via WebSocket;
- room share by code/link/QR;
- participation across Mandiri and School Students, including across classes;
- optional classmate invite for School Students; Mandiri can create/share a room but cannot send classmate notification invites;
- Easy/Medium/Hard categories (names temporary);
- 10 questions;
- both players receive the same questions/order;
- answers lock after submit;
- next question after both answers or timeout;
- server-authoritative time, answer validity, and score;
- reconnect window 20 seconds;
- failure to reconnect causes forfeit;
- forfeit does not update leaderboard record;
- PvP XP does not contribute to class leaderboard.
- global PvP leaderboard includes both Student affiliations.

## Container responsibilities

```text
Player A ─┐
          ├─ WSS ─> NestJS PvP Gateway / Match Engine
Player B ─┘                 │
                            ├── Redis: active room/match ephemeral state
                            └── PostgreSQL: durable state, answers, versions, result/outbox
```

## Recommended match state machine

```text
CREATED
  ↓
WAITING_PLAYER
  ↓
READY_CHECK
  ↓
QUESTION_ACTIVE
  ↓
QUESTION_RESOLVED
  ├── next question → QUESTION_ACTIVE
  └── final question → COMPLETED

Alternative terminal states:
FORFEITED
CANCELLED_SYSTEM
EXPIRED (room/invite; exact policy OPEN-07)
```

## Client → server events (contract draft)

- `pvp:room:create`
- `pvp:room:join`
- validate both players as Students; Class membership is not required to create/join a valid room;
- `pvp:invite:create`
- `pvp:invite:accept`
- `pvp:invite:decline`
- `pvp:player:ready`
- `pvp:answer:submit`
- `pvp:reconnect`
- `pvp:leave`

Exact payloads belong in a machine-readable contract later.

## Server → client events (contract draft)

- `pvp:room:state`
- `pvp:invite:received`
- `pvp:match:started`
- `pvp:question:started`
- `pvp:answer:acknowledged`
- `pvp:question:resolved`
- `pvp:opponent:disconnected`
- `pvp:match:completed`
- `pvp:match:forfeited`
- `pvp:match:cancelled`
- standardized error event/acknowledgement

## Server time authority

Client submits answer identity only. Client-provided elapsed time/score is not trusted.

Server determines:

- question start/deadline;
- whether answer arrived before deadline;
- remaining time;
- score formula;
- state transition.

## Baseline scoring

For a correct answer:

```text
100 + floor(50 × remainingTime / questionDuration)
```

Wrong/blank: 0.

Question durations:

- Easy: 30s
- Medium: 45s
- Hard: 60s

## Reconnect

- Detect disconnect and start server-side 20s reconnect window.
- Question timer continues.
- Reconnecting player receives current authoritative match state.
- Locked answers remain locked.
- Player does not replay a previous question.
- No return in 20s → forfeit.

## Durability

**ENGINEERING DECISION:** PostgreSQL persists active state, answers, pinned content/scoring versions, final results and atomic outbox. Redis holds cache and BullMQ deadline jobs; a database sweep repairs lost jobs. A service interruption cancels affected matches without records. API restart cancels outstanding matches before accepting new fixture-policy matches. Completed history survives Redis restart.

System-wide failure should produce a cancelled/no-win-loss result according to PRD rather than falsely awarding a normal match result.

## Scaling path

Initial single API instance can use Socket.IO locally. If multiple API instances are introduced, use a compatible Redis adapter and ensure room ownership/state remains consistent.

Do not add horizontal WebSocket complexity before load tests justify it.

## OPEN-07 — resolved behavior, Curriculum dependency retained

**ENGINEERING DECISION — owner approved 6 October 2026:** room/invite expiry is 600 seconds; both current players must be active, connected and Ready. Waiting guest exit releases the slot and resets Ready; host exit cancels. The earlier expired reconnect deadline forfeits; equal deadlines with both offline cancel. The approved specification above supersedes earlier OPEN wording. Official academic content/difficulty approval remains a Curriculum delivery dependency.
## WebSocket contract

**ENGINEERING DECISION:** Socket.IO namespace `/pvp`; event names and envelopes follow [Student Area Contract](../api/STUDENT_AREA_CONTRACT.md) and `packages/contracts/websocket/pvp-events.schema.json`. Commands use `eventVersion: "1"`, UUID `requestId`, and validated payloads. Handshake accepts Bearer auth; every command revalidates Student authorization.

Client events: `room:create`, `room:join`, `player:ready`, `answer:submit`, `match:reconnect`, `room:leave`, `room:cancel`, `invitation:send`, `invitation:respond`.

Server state/transition events: `room:state`, `match:started`, `question:started`, `answer:acknowledged`, `question:resolved`, `player:disconnected`, `match:completed`, `match:forfeited`, `match:cancelled`, `invitation:received`. Callback envelopes use `command:acknowledged`; failures also emit `room:error`.

**Historical OPEN-07 (superseded 6 October 2026):** runtime now resolves the published versioned policy through server-only `PVP_MODE`; default remains disabled. Test policy injection stays restricted to tests. Official availability additionally requires manifest-bound Curriculum approval. See JOB-16/17 above.

## Server time authority

Client submits answer identity only. Client-provided elapsed time/score is not trusted.

Server determines:

- question start/deadline;
- whether answer arrived before deadline;
- remaining time;
- score formula;
- state transition.

## Baseline scoring

For a correct answer:

```text
100 + floor(50 × remainingTime / questionDuration)
```

Wrong/blank: 0.

Question durations:

- Easy: 30s
- Medium: 45s
- Hard: 60s

## Reconnect

- Detect disconnect and start server-side 20s reconnect window.
- Question timer continues.
- Reconnecting player receives current authoritative match state.
- Locked answers remain locked.
- Player does not replay a previous question.
- No return in 20s → forfeit.

## Durability

Redis holds transient active state; PostgreSQL persists final audit/result context. A Redis restart may cancel active matches if recovery is not yet implemented, but must not delete completed historical matches.

System-wide failure should produce a cancelled/no-win-loss result according to PRD rather than falsely awarding a normal match result.

## Scaling path

Initial single API instance can use Socket.IO locally. If multiple API instances are introduced, use a compatible Redis adapter and ensure room ownership/state remains consistent.

Do not add horizontal WebSocket complexity before load tests justify it.

## OPEN-07 — resolved behavior, Curriculum dependency retained

**ENGINEERING DECISION — owner approved 6 October 2026:** room/invite expiry is 600 seconds; both current players must be active, connected and Ready. Waiting guest exit releases the slot and resets Ready; host exit cancels. The earlier expired reconnect deadline forfeits; equal deadlines with both offline cancel. The approved specification above supersedes earlier OPEN wording. Official academic content/difficulty approval remains a Curriculum delivery dependency.

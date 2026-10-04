# Phase 5 — PvP and Leaderboards

**ENGINEERING DECISION — 4 October 2026:** the owner approved continuing from Phase 4. This phase implements the screenshot-based PvP lobby, waiting, live battle, outcome and difficulty/class ranking presentation. [The approved baseline](UI_REDESIGN_BASELINE_2026-10-03.md) remains the visual plan; [Student Area Contract](../api/STUDENT_AREA_CONTRACT.md) and [PvP architecture](../architecture/REALTIME_PVP.md) determine behavior. This is an audit of supplied PNG references, not a completed full-file Figma inspection. Phase 6 has not started.

## 1. Files changed

Earlier uncommitted Phases 0–4 remain intact. Phase 5 touches:

| Files                                                                                      | Change                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/pvp/student-pvp.tsx`                                                | Existing REST queries/socket hook, request IDs, ACK/retry, server timers and handlers retained; new lobby and match composition, share/copy controls, QR failure fallback, leave confirmation |
| New `apps/web/src/features/pvp/pvp-presentation.tsx`                                       | Pure header, hero, difficulty choices, join form, rules, player cards, waiting, scoreboard/battle and outcome presentation                                                                    |
| `apps/web/src/features/core-learning/leaderboards.tsx`                                     | Difficulty heroes, server podium/rank rows/own position, class scope, hourly/weekly context, pending/empty/error states                                                                       |
| `leaderboard-podium.tsx`; `question-choices.tsx`                                           | Backward-compatible podium label/points-on-pedestal variant and selected-answer hint; reuse existing renderer, preserve answer IDs while rendering compact option letters                     |
| `apps/web/src/app/student/pvp/page.tsx`, `pvp/[matchId]/page.tsx`, `leaderboards/page.tsx` | Remove duplicated shell wrappers; feature compositions own one shell and contextual/focus header                                                                                              |
| `apps/web/src/app/numora.css`; `packages/ui/src/tokens.css`                                | Scoped mobile/desktop composition, cards, selected states, difficulty variants; shared translucent header and green hero tokens                                                               |
| `student-pvp.test.tsx`; `redesign.test.tsx`                                                | ACK uncertainty/lock, readiness, timer expiry, cancellation/forfeit, QR error and authoritative ranking assertions                                                                            |
| New `apps/web/e2e/pvp.spec.ts`; `playwright.config.ts`                                     | Test-only local Socket.IO fixture plus REST/session interception; eleven views across nine widths; suite timeout extended for added flows                                                     |
| This report, design README, baseline ledger, design-system note                            | Approval, verification, deviations and evidence                                                                                                                                               |

No backend, generated contract, schema/migration, scoring, outbox/worker, authorization or production availability setting changed. No database write/seed was performed in Phase 5. The previously authorized Drill DEMO seed remains unchanged; no synthetic PvP results or ranking records were inserted into Supabase.

## 2. Screens implemented

| Screen/state                          | Route and treatment                                                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create lobby                          | `/student/pvp`; Student identity/progress from existing dashboard, purple hero, global leaderboard preview, Buat/Gabung tabs, three difficulty cards and explicit create CTA        |
| Join lobby/shared room link           | Same route/tab; labeled twelve-character code, native validation, uppercase/trim existing payload; shared `?room=` opens Gabung without auto-joining                                |
| Waiting/ready                         | `/student/pvp/[matchId]`; code/copy, real QR/link, two player slots, readiness, owner-only classmates invitation, independent peer failure and Mandiri sharing                      |
| Live selected/locked                  | Same route; contextual header/forfeit, server points and countdown, actual question, existing choice renderer, explicit lock, round position and server lock notice                 |
| Reconnect/expired question            | Same route; actual reconnect deadline countdown, retry existing command identity, disabled expired/locked/uncertain answers; no local scoring/advance                               |
| Completed/draw/loss/forfeit/cancelled | Same route; outcome from snapshot, actual points, record eligibility, difficulty leaderboard and lobby links                                                                        |
| Easy/medium/hard global ranking       | `/student/leaderboards`; green/purple/warm hero variants, correct selected difficulty, podium, remaining server entries, own rank including outside top twenty, period/update/retry |
| Class ranking                         | Same route/scope; class API authorization and XP unit remain separate; pending policy/empty/access-denied states preserved                                                          |

**Responsive:** mobile uses 16 px gutters, 20 px cards, 64 px contextual header, focused match navigation and existing five-item Student bottom nav on lobby/ranking. Tablet retains controlled reading width and existing bottom navigation. Desktop lobby/waiting/result/ranking use main and context columns with the existing sidebar where appropriate; live battle uses a focused reading column plus lock/round/reconnect panel. Existing 700/960 breakpoints and 980 px focused container remain in use.

## 3. Visual normalization and deviations

Reference UI crops are inferred from exported PNGs: create `(10,1,400,1343)`, join `(10,1,400,909)`, waiting `(5,1,395,1396)`, battle `(5,1,395,1148)`, outcome `(5,1,395,1313)`, easy `(15,1,405,1504)`, medium `(15,1,405,1231)`, hard `(15,1,405,1645)`. Width is 390 px, without resizing. Figma frame metadata remains unverified. Paired images/overlays diagnose composition; they do not establish pixel-identical fidelity or a universal pixel-diff threshold.

- **Lobby identity:** real affiliation/Drill progress replaces unsupported account level, currency, XP and online counts. The status-chip row uses actual school name when available and approved 1v1/ten-question/all-Student access facts, rather than invented online/streak counts. No class is required for Mandiri create/share. The original hero illustration is unavailable; a shared gamepad icon occupies its visual slot. Repository `pvp-character.png` was inspected and is an icon export, not a verified matching illustration.
- **Create/join:** both references are states of one lobby. All three difficulties are shown; the missing create CTA is explicit. Code is twelve alphanumeric characters per existing validation, rather than the reference's incompatible six-digit code. The QR entry label remains, with truthful guidance to open a shared QR via the device camera; no in-app camera/gallery scanner is fabricated.
- **Waiting:** header correctly names the waiting stage. Real generated QR is denser than the decorative example. QR errors replace loading with code/link fallback. Ready remains explicit and server-driven; no five-second local auto-start, bot or “public class” restriction is introduced. Sharing uses the device share sheet or clipboard, not automatic WhatsApp messaging. The longer actual code changes wrapping/card height.
- **Battle:** preserve contextual header, round bar, scoreboard/timer, question, stacked choices, locked lavender state and round strip. Selected text says “Belum dikirim”; only a server-acknowledged snapshot says “Terkunci”. Unsupported dominance/streak, opponent answer duration, target six wins, correct/incorrect round history and question report endpoint are omitted. Previous round numbers indicate order only, not correctness. The explicit lock button remains to preserve the working flow.
- **Outcome:** server points are labeled PTS; they are not silently converted into XP. No fabricated speed breakdown, recap, explanation endpoint, rematch or retry handler. Forfeit/cancellation displays ineligibility without awarding records.
- **Ranking:** easy/medium/hard preserve distinct hero/compact-list character while sharing podium/rank components. Active difficulty follows selection/query parameters instead of always highlighting Mudah. Class/global scope controls remain visible. Actual points/name/rank replace WR, streak, speed, IRT, school/league labels, “real-time matchmaking” and top-100 claims. Server points sit on the colored podium pedestals as in the ranking references; the lobby/Home podium keeps its original layout. No client tie ordering/rank calculation is introduced. Mobile own-rank/podium/period ordering follows each difficulty reference where the available data permits it.
- **Shared controls:** approved Plus Jakarta Sans/tokens, 44 px minimum targets and visible focus are preserved. Avatar initials replace unavailable other-player images; no synthetic profile photo is presented as server data. Native dialog replaces `window.confirm` for leaving/forfeit, retaining the same `room:leave` command.
- **Capture height:** browser evidence uses a 900 px viewport and full-page captures. Fixed bottom nav remains at the viewport edge within long captures; exported reference heights differ. Card count, missing DTO sections and real content also change document height. No blank canvas or screenshot page is used to imitate export dimensions.

## 4. Functional safety

**PRD RULE:** ten identical questions, server time/score/transitions, 30/45/60 second baseline, first accepted answer lock, twenty-second reconnect, Mandiri/School participation, class-only invitation scope and separation of PvP records from class XP remain intact.

**OPEN:** production `PVP_POLICY_OPEN` and class/PvP ranking policy gates remain. Visual implementation does not activate matches on real accounts or resolve OPEN-07/OPEN-11.

**ENGINEERING DECISION — existing behavior retained:**

- Socket transport, envelopes, request ID persistence across lost ACK/token renewal, stale socket/match filtering, command guard/retry and invitation invalidation are unchanged; source comparison verified the hook against HEAD.
- Existing query keys/endpoints remain `pvp-availability`, `pvp-invitations`, `pvp-classmates`, `pvp-match`, `student-dashboard`, and `student-leaderboard`. Availability controls connection and interactive capabilities; the browser does not override the server gate.
- Ready/create/join/invitation/answer/leave handlers send existing payloads only. No elapsed time, score, win condition or client grading is sent. Uncertain commands disable conflicting controls while explicit retry reuses the previous request ID.
- Answer selection resets from the actual question/selectedOptionId snapshot. Expired visual timers disable controls and await server transition; they do not trigger a local next round or outcome.
- Only room creator sees classmate invite controls; Mandiri can share a link without joining a class. Peer/invitation errors do not erase match state.
- Closed results use `status`, `endReason`, player result/points and `recordEligible`. Ranking uses server entries/ownEntry/unit/period; pending policies hide provisional rows/own ranks.
- Native confirmation supports keyboard, Escape/cancel, focus restore and pending state. Escape sends no leave command; confirmed forfeit sends one existing command.
- QR generation clears stale images on room changes; failed generation retains actual code/link. Share/copy errors produce explicit recovery text.
- Student role/session/cache isolation, earlier Drill/Tryout/history, and Teacher/Admin flows remain under regression coverage.

Browser fixtures are **TEST ONLY**: local transport emits synthetic snapshots and REST/session are intercepted. They are outside application runtime. They do not prove live NestJS domain transitions, two-player server synchronization, Google OAuth, persistence, authorization or shared cloud availability. No fixture policy bypass was added to the app/API.

## 5. Verification

Node 24 and pnpm 12.6.0 are used through the required toolchain.

| Check                             | Result                                         |
| --------------------------------- | ---------------------------------------------- |
| Frontend unit suite               | **15 files / 107 tests passed**                |
| Repository lint                   | **Passed**                                     |
| Web/shared UI typecheck           | **Passed**                                     |
| Focused PvP browser               | **9 viewport flows passed**                    |
| Full browser regression           | **73 tests passed** before final visual polish |
| Production web build              | **Passed**                                     |
| Formatting/local links/whitespace | **Passed**                                     |

Latest 390 px geometry: lobby hero `(16,161.5,358,164.875)` with 20 px radius; contextual match header `(0,0,390,64)`; scoreboard `(16,178.14,358,149.39)` and question card `(16,343.53,358,206.44)`, both 20 px radius. These measurements support gutter/header/card checks; differences caused by retained controls and unavailable data remain documented above.

Eleven views at **320, 360, 390, 393, 430, 768, 1024, 1280 and 1440 px** produce **99 captures** with matching geometry JSON/no horizontal body overflow. Coverage includes join normalization, readiness without local start, selected-versus-locked/one answer, reconnect lock, forfeit dialog Escape/focus, eligible outcome, confirmed ineligible forfeit, correct active difficulty, podium and own rank. Existing full regression retains Mandiri/class/Teacher/Admin/auth/assessment flows. Backend integration was not rerun because its code/contracts are unchanged; real connected release testing remains separate.

## 6. Remaining issues and next gate

Production PvP/ranking policies remain OPEN; camera/gallery QR scanning, bot, round recap/review/rematch and unsupported statistics need approved functionality/contracts. Original hero/avatar assets and full Figma metadata remain unavailable. No test fixture result was seeded into Supabase to imply real activity or policy approval.

Phase 5 requires owner review before **Phase 6 — Profile/Settings/Feedback**. No commit, push, PR, deployment or database write was performed.

## 7. Screenshot evidence

Local ignored artifacts use synthetic identities and are not automatically available in other checkouts. All listed views also have the seven additional viewport widths and geometry JSON.

| View              | Mobile 390                                                   | Desktop 1440                                                  |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Create lobby      | [PNG](../../.tmp/redesign-phase5/lobby-create-390.png)       | [PNG](../../.tmp/redesign-phase5/lobby-create-1440.png)       |
| Join lobby        | [PNG](../../.tmp/redesign-phase5/lobby-join-390.png)         | [PNG](../../.tmp/redesign-phase5/lobby-join-1440.png)         |
| Waiting           | [PNG](../../.tmp/redesign-phase5/waiting-390.png)            | [PNG](../../.tmp/redesign-phase5/waiting-1440.png)            |
| Selected battle   | [PNG](../../.tmp/redesign-phase5/battle-selected-390.png)    | [PNG](../../.tmp/redesign-phase5/battle-selected-1440.png)    |
| Locked battle     | [PNG](../../.tmp/redesign-phase5/battle-locked-390.png)      | [PNG](../../.tmp/redesign-phase5/battle-locked-1440.png)      |
| Reconnect battle  | [PNG](../../.tmp/redesign-phase5/battle-reconnect-390.png)   | [PNG](../../.tmp/redesign-phase5/battle-reconnect-1440.png)   |
| Completed outcome | [PNG](../../.tmp/redesign-phase5/outcome-390.png)            | [PNG](../../.tmp/redesign-phase5/outcome-1440.png)            |
| Forfeit outcome   | [PNG](../../.tmp/redesign-phase5/outcome-forfeit-390.png)    | [PNG](../../.tmp/redesign-phase5/outcome-forfeit-1440.png)    |
| Easy ranking      | [PNG](../../.tmp/redesign-phase5/leaderboard-easy-390.png)   | [PNG](../../.tmp/redesign-phase5/leaderboard-easy-1440.png)   |
| Medium ranking    | [PNG](../../.tmp/redesign-phase5/leaderboard-medium-390.png) | [PNG](../../.tmp/redesign-phase5/leaderboard-medium-1440.png) |
| Hard ranking      | [PNG](../../.tmp/redesign-phase5/leaderboard-hard-390.png)   | [PNG](../../.tmp/redesign-phase5/leaderboard-hard-1440.png)   |

Reference comparisons: [create](../../.tmp/redesign-phase5/lobby-create-comparison-390.png), [join](../../.tmp/redesign-phase5/lobby-join-comparison-390.png), [waiting](../../.tmp/redesign-phase5/waiting-comparison-390.png), [battle](../../.tmp/redesign-phase5/battle-locked-comparison-390.png), [outcome](../../.tmp/redesign-phase5/outcome-comparison-390.png), [easy](../../.tmp/redesign-phase5/leaderboard-easy-comparison-390.png), [medium](../../.tmp/redesign-phase5/leaderboard-medium-comparison-390.png), [hard](../../.tmp/redesign-phase5/leaderboard-hard-comparison-390.png). Each has a matching overlay. [Aggregated geometry](../../.tmp/redesign-phase5/visual-checks.json) records all ninety-nine captures.

# Phase 4 — Tryout, Assessment and History

**ENGINEERING DECISION — 4 October 2026:** the owner approved continuing from Phase 3. This phase aligns current-package Tryout catalog/detail, assessment presentation, submission/waiting/released results and progress/history with the supplied screenshot language. Phase 5 has not started. [The approved baseline](UI_REDESIGN_BASELINE_2026-10-03.md) remains the visual plan; [TryOut v1.1 / latest reconciliation](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md) determines behavior. Full-file Figma access and original component metadata remain unverified.

## 1. Files changed

Earlier uncommitted Phases 0–3 remain intact. Phase 4 touches:

| Files                                                                              | Change                                                                                                                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/features/core-learning/tryout.tsx`                                   | Existing API/query/controller retained; catalog/detail, historical Tryout tab, guarded start, focused attempt and result composition |
| New `tryout-presentation.tsx`                                                      | Pure hero/package/detail/rules/tutorial, submission/waiting and released result components                                           |
| New `assessment-queries.ts`; `assessment-history.tsx`                              | Share existing history query key/cursor behavior; responsive progress/context plus activity list                                     |
| `assessment-session.tsx`                                                           | Tryout opts into Phase 3 presentation; server-based countdown, manual dialog, automatic-finalization status/recovery                 |
| `assessment-presentation.tsx`                                                      | Backward-compatible contextual exit link and dialog title                                                                            |
| `drill-review.tsx`                                                                 | Reuse AnswerMatrix for reviewed Tryout questions without inventing missing option text; Drill review remains intact                  |
| `apps/web/src/app/numora.css`; `packages/ui/src/tokens.css`                        | Scoped responsive Tryout/history styles and measured neutral surface tokens                                                          |
| `assessment-session.test.tsx`, `redesign.test.tsx`, `apps/web/e2e/student.spec.ts` | Deadline/modal, duplicate start/retry, filtered cursor history, real-data state boundaries and visual evidence                       |
| This report, design README, baseline ledger, design-system note                    | Approval/status, verification and deviations                                                                                         |

No backend/API client/generated DTO, scoring policy, database schema/migration, IRT publication, auth/gate or PvP protocol changed. No database write was performed in Phase 4; the explicitly authorized Phase 3 DEMO seed remains available.

## 2. Screens implemented

| Screen/state                                                     | Route and visual treatment                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog — loading/error/unavailable/open/resume/waiting/released | `/student/tryout`; purple hero, rounded neutral catalog surface, package card and actual state-driven actions                                          |
| Tryout Saya history                                              | Same route/tab; cursor-backed Tryout attempts from existing assessment history; ready links and waiting cards                                          |
| Package detail + tutorial/rules                                  | Same route/presentation state; purple contextual back header, overlapping summary, status, actual duration/count, guidance cards, rules and sticky CTA |
| Active PG attempt/manual confirmation                            | `/student/tryout/[attemptId]`; focused white header/countdown, question controls, local ragu, navigator and accessible native dialog                   |
| Submitted/waiting IRT                                            | Attempt/result routes; submitted status and locked processing steps, refresh/recovery without partial score or explanations                            |
| Released simulation result/review                                | `/student/tryout/[attemptId]/result`; actual server score/count, summary/context and reusable matrix with selected explanation                         |
| Progress/assessment history                                      | `/student/assessment`; progress card, historical context, zero scores, ready/pending states and preserved cursor pagination                            |

Mobile retains 16 px gutters, 20 px cards, the screenshot's hero/overlap/stat/CTA hierarchy and focused assessment navigation. Tablet stacks detail content/rules and preserves the reading column. Desktop detail uses two columns; assessment keeps the existing 680 px reading column plus navigator; results and history use context plus main content. Existing 700/960 breakpoints and width limits remain in use.

## 3. Visual normalization and deviations

Reference comparison uses the inferred 390 px application area of PNG exports. Crop estimates: catalog `(38,39,428,1123)` and detail `(38,13,428,1031)`, excluding exterior export margins and decorative system chrome where applicable. These are analysis estimates; not verified Figma frame dimensions. Paired images/top-aligned overlays are diagnostic; no pixel-identical claim is made.

- **Catalog:** preserve purple hero, left illustration slot, title/copy, tabs and white package cards. The original illustration is unavailable; a shared clipboard icon occupies the slot without drawing a fake score chart. No currency, bundle promotion, premium card, upcoming package, calendar or special-code form is fabricated.
- **Tabs:** duplicated “Akan Datang” is normalized to **Berlangsung / Tryout Saya**. The second tab is actual attempt history, not a complete past-package catalog. It filters loaded records and exposes further cursor pages; empty copy distinguishes a loaded page with no Tryout from exhausted history.
- **Detail:** numeric count/duration and release date come from the package API. Screenshot “40 soal” and class-only free label are superseded by actual data and free access for every Student. No invented batch end, subtest composition, per-subtest timer or tab-switch auto-submit rule is introduced. Three real tutorial steps use the screenshot's stacked-card language.
- **Colors:** frequent PNG background values are `#f8f7fc` (catalog) and `#f3f6fa` (detail); canonical neutral tokens are added, scoped to these screens. Primary/pill controls retain approved purple/shared semantics. At 390 px, the hero is 274.5 px high; primary cards use x=16 px, width=358 px and radius=20 px; the detail summary starts at y=108 px. The screenshot's blue active catalog tab is normalized to approved primary purple; controls keep a minimum 44 px touch target.
- **Session:** reuses Phase 3 choice/navigation/confirmation presentation and actual PG runtime contract. Countdown stays tied to serverTime/deadlineAt. No image, hint, topic or PGK data is invented. Unknown deadlines display unavailable timer state rather than a fake duration.
- **Waiting:** derived from closest result/modal surfaces. No partial score, key, XP or promised per-attempt release timestamp is shown. Processing completed does not imply publication.
- **Released result:** reuses matrix/review language, with server result only. Current Tryout review DTO lacks option text, so answer letters are displayed. No score normalization, IRT scale, mastery/unlock, time bonus or attempt restart is computed.
- **History:** derived from Student cards/activities. Original title, context, isDemo, score zero/null, result readiness and reward pending status remain visible. It does not turn pending records into ready links or infer unavailable metrics.

Touch targets, semantic controls, focus-visible, dialog focus/Escape and reduced motion remain available. Return from package detail restores focus to its catalog action; re-entering detail requires acknowledgement again. Different content and missing contract sections change screen height; layout follows real content instead of imitating blank export space.

## 4. Functional safety

**PRD RULE:** Tryout is free for Mandiri and School, one attempt/user/package, countdown without pause, manual confirmation, zero-time automatic finalization without confirmation, and result/explanation only after released IRT. Official three-format runtime remains a contract gap; actual count/duration comes from valid backend data.

**ENGINEERING DECISION — existing behavior preserved:**

- Query keys remain `current-tryout`, `tryout-attempt`, `tryout-result`, `student-progress`, `assessment-history`; the shared history hook retains the existing endpoint/cursor/cache.
- Start keeps the server package ID and navigates to the returned attempt. A ref prevents duplicate requests while pending/navigation completes; failure resets the guard for explicit retry. Acknowledgement is associated with the current package, preventing accidental carryover across package IDs.
- Save, ACK mismatch/offline handling, clear answers and unsaved route/unload warning remain existing handlers. Ragu is presentation-only; no payload or scoring change.
- The existing deadline hook/finalizer still owns the browser submit request. At zero, any open manual dialog closes and automatic submission runs without asking. Pending manual submit and timer share the same finalizing guard. Expired choices remain locked; failure provides finalization recovery and existing server-state recheck.
- Submission invalidates the same dashboard/current/history queries and navigates to the existing result route. Lost ACK recovery retains submitted state.
- Pending IRT polls/refetches using the existing error code. All other errors keep DataState's retry/session-expired/forbidden behavior. Release is not simulated in runtime.
- Progress/history keep independent failure recovery, previous pages after pagination error, nextCursor and zero-vs-null distinctions. Teacher/Admin and earlier Drill flows are smoke/regression tested because shared components changed.

The 35-question browser fixture and released-result data are **TEST ONLY**, not cloud package publication or academic approval. Phase 3 Supabase DEMO content is unchanged; Phase 4 does not seed or publish Tryout under unresolved product policies.

## 5. Verification

Node 24 / pnpm 12.6.0 are used through the repository's expected toolchain.

| Check                                  | Result                                                        |
| -------------------------------------- | ------------------------------------------------------------- |
| Frontend unit suite                    | **15 files / 101 tests passed**                               |
| Repository lint                        | Passed, zero warnings                                         |
| Web / shared UI typecheck              | Passed                                                        |
| Full browser regression                | **64 tests passed**, including nine new Tryout viewport flows |
| Final detail/focus evidence            | **9 viewport flows passed; 72 screenshots, no body overflow** |
| Production build                       | Passed                                                        |
| Formatting, local links and whitespace | Passed                                                        |

Visual evidence spans **320, 360, 390, 393, 430, 768, 1024, 1280 and 1440 px** for eight views. Each capture asserts no horizontal body overflow and records card/hero bounds. Tests verify rules acknowledgement/start, no POST before manual confirmation, one submit, waiting score/key absence, explicit release, selected explanation, filtered history, and pending link suppression. Deadline tests additionally cover reload, 35-question navigator, zero-time auto-submit and lost finalization acknowledgement.

Browser identities/auth/API are synthetic fixtures. This evidence does not prove external Google OAuth, connected Tryout publication/IRT, or a complete real-server assessment lifecycle. No integration test is pointed at the shared Supabase project.

## 6. Remaining issues and next gate

Full past/unattempted/upcoming package catalog, batch end/subtest metadata, calendar, private-code entry and runtime PGK need approved API data/contracts. Original illustration and complete Figma metadata remain unavailable. IRT scale/duration/XP and other OPEN policies are not resolved through UI work.

Phase 4 is ready for owner review. **Phase 5 — PvP / Leaderboard has not started.** No commit, push, PR, deployment or database write was performed in this phase.

## 7. Screenshot evidence

Local ignored artifacts use synthetic identities. Other checkouts will not automatically contain these files. Each prefix also covers the seven remaining widths and has matching geometry JSON.

| Screen                 | Mobile 390                                                   | Desktop 1440                                                  |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Catalog                | [PNG](../../.tmp/redesign-phase4/catalog-390.png)            | [PNG](../../.tmp/redesign-phase4/catalog-1440.png)            |
| Package detail         | [PNG](../../.tmp/redesign-phase4/detail-390.png)             | [PNG](../../.tmp/redesign-phase4/detail-1440.png)             |
| Tryout history         | [PNG](../../.tmp/redesign-phase4/tryout-history-390.png)     | [PNG](../../.tmp/redesign-phase4/tryout-history-1440.png)     |
| Attempt                | [PNG](../../.tmp/redesign-phase4/attempt-390.png)            | [PNG](../../.tmp/redesign-phase4/attempt-1440.png)            |
| Submit dialog          | [PNG](../../.tmp/redesign-phase4/submit-dialog-390.png)      | [PNG](../../.tmp/redesign-phase4/submit-dialog-1440.png)      |
| Waiting IRT            | [PNG](../../.tmp/redesign-phase4/waiting-390.png)            | [PNG](../../.tmp/redesign-phase4/waiting-1440.png)            |
| Released result/review | [PNG](../../.tmp/redesign-phase4/result-390.png)             | [PNG](../../.tmp/redesign-phase4/result-1440.png)             |
| Assessment/history     | [PNG](../../.tmp/redesign-phase4/assessment-history-390.png) | [PNG](../../.tmp/redesign-phase4/assessment-history-1440.png) |

Original comparison: [catalog pair](../../.tmp/redesign-phase4/catalog-comparison-390.png), [catalog overlay](../../.tmp/redesign-phase4/catalog-overlay-390.png), [detail pair](../../.tmp/redesign-phase4/detail-comparison-390.png), [detail overlay](../../.tmp/redesign-phase4/detail-overlay-390.png). [Aggregated geometry evidence](../../.tmp/redesign-phase4/visual-checks.json) records all eight views at nine widths.

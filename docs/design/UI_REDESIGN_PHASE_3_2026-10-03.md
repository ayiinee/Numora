# Phase 3 — Learning redesign

**ENGINEERING DECISION — 3 October 2026:** the owner approved continuing after Phase 2 and explicitly authorized example question/answer seeding in Supabase. Phase 3 implements catalog/chapter/subchapter, level path, Drill PG, confirmation, result/review/report and existing PGK renderer styling. Phase 4 has not started. The approved visual target remains the supplied screenshots, with [the baseline](UI_REDESIGN_BASELINE_2026-10-03.md) and [latest Core Learning PRD](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md) determining visual and product boundaries respectively.

## 1. Files changed

The working tree also contains Phases 0–2. The following list isolates Phase 3 ownership; no earlier changes were discarded.

| Files                                                                                                                                                       | Purpose                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/core-learning/catalog.tsx`, new `level-path.tsx`                                                                                     | Catalog/chapter hierarchy, Student identity header integration, server-driven decorative level path, guarded start/resume/retry                     |
| `assessment-session.tsx`, new `assessment-presentation.tsx`                                                                                                 | Opt-in Drill presentation, contextual white header, question card, local ragu, navigator, accessible submit dialog; existing orchestration retained |
| `drill.tsx`, new `drill-review.tsx`                                                                                                                         | Count-up timer presentation; mastery summary, answer matrix, selected review, server-only reward/unlock data, retry/continue                        |
| `question-choices.tsx`                                                                                                                                      | PG/MCMA/category renderer states, selected treatment and semantic controls                                                                          |
| `support.tsx`                                                                                                                                               | Backward-compatible modal report presentation, existing report mutation and video behavior                                                          |
| `use-unsaved-warning.ts`, new `use-unsaved-warning.test.tsx`                                                                                                | Same-document navigator does not trigger route-exit confirmation; route/unload protection retained                                                  |
| `assessment-session.test.tsx`, `redesign.test.tsx`, `apps/web/e2e/student.spec.ts`                                                                          | Dialog/ACK/retry/flags, level state assertions, route regression and nine-width visual evidence                                                     |
| `dashboard-presentation.tsx`, `ui.tsx`, `components/shell/student-layout.tsx`                                                                               | Small backward-compatible presentation slots and feedback link target                                                                               |
| `apps/web/src/app/numora.css`, `packages/ui/src/dialog.tsx`, `packages/ui/src/icon.tsx`                                                                     | Scoped Learning styles, optional dialog icon/class and reusable play icon                                                                           |
| `packages/database/src/redesign-seed.ts`, `packages/database/seeds/redesign-learning.sql`, `packages/database/seeds/README.md`, package/root `package.json` | Explicitly authorized, guarded additive DEMO content seed and repeatable command                                                                    |
| This report, design README and baseline phase ledger                                                                                                        | Phase status, evidence, deviations and seeding provenance                                                                                           |

No API, generated wire type, schema, migration, scoring policy, authorization or PvP protocol was modified.

## 2. Screens implemented

| Screen                            | Route / implementation                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Bab catalog / chapter subchapters | `/student/learn`, `/student/learn/[chapterId]`; derived Student cards and hierarchy                                                     |
| Adventure level path              | `/student/learn/[chapterId]/[subchapterId]`; locked/current/completed nodes, focus card, mobile CTA and desktop context panel           |
| Drill PG session                  | `/student/drill/[attemptId]`; focused assessment header, count-up, selected options, local ragu, scrollable navigator and previous/next |
| Submit confirmation               | State within Drill; answered/empty/ragu summary, pending/error/retry and keyboard focus restoration                                     |
| Drill result / explanation        | `/student/drill/[attemptId]/result`; server mastery, score/pending rewards, answer matrix, selected explanation and report dialog       |
| PGK MCMA / category controls      | Existing shared renderer restyled; not connected to a fabricated attempt contract or advertised as working runtime screens              |

Mobile uses 16 px gutters, 20 px cards, purple/lavender/ivory tokens, fixed assessment actions and five-item navigation on catalog/path. Assessment/result use a focused shell. Desktop limits assessment to a 680 px reading column with a 240 px navigator; results use a summary/context column and review column. Level access comes from server states; the connecting curve is decorative.

## 3. Visual comparison and deviations

Reference PNG exports include external margins; original Figma frame dimensions remain unverified. Comparison uses an inferred 390 px application area without resizing either UI. Paired images and top-aligned overlays are linked below. Overlays are diagnostic evidence, not a claim of pixel equivalence.

| Reference / implementation | Observed normalization or deviation                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level map                  | Same identity/announcement → summary → utility actions → descending path → active CTA hierarchy. Explicit status, latest/best values and retry controls increase some caption/path heights; no fake chest, XP or account level. Progress measures completed levels, not invented accuracy.                                                                                |
| Drill                      | Same white header, metadata, question/option card and bottom question controls. Header progress follows current question position. Hint, difficulty/HOTS badge, topic metadata and active-question report are omitted where runtime DTO lacks their data/context. Mathematical content keeps the existing KaTeX renderer, so glyphs/wrapping differ from screenshot text. |
| Confirmation               | Same centered white dialog, lavender icon/stat surface and purple CTA. Adds an accessible close control and honest pending/error states. Ragu is independent of answered/empty; an answered question can also be marked ragu. The summary does not imply mutually exclusive totals.                                                                                       |
| Result                     | Uses server `mastered`/unlock rather than screenshot's contradictory “90/tuntas/mendekati tuntas”. Stars/XP remain pending when unavailable. No invented elapsed-time bonus or retention promise. Recommended videos remain failed-result/server-content only, so the example passing result has fewer sections.                                                          |
| Navigation / controls      | Normalized labels and active route from the approved baseline. Navigator touch controls are 44 px instead of screenshot's smaller cells; visible focus is retained. The compact “Semua Soal” link has a 44 px hit area.                                                                                                                                                   |
| Assets and typography      | Plus Jakarta Sans and shared icons retained. No screenshot cropped into runtime UI, fabricated portraits, hints, image diagrams or video thumbnails. Initials are used where actual avatars are unavailable.                                                                                                                                                              |

At 390 px, measured question card bounds are `x=16`, width `358`, radius `20`; level summary and review cards share the same gutter/width/radius. Different content length, missing sections and additional accessible controls affect height and vertical rhythm. Original reference crop estimates are: map `(16,1,406,1841)`, Drill `(16,6,406,934)`, result `(16,6,406,1894)`, modal `(22,6,412,1074)`; coordinates are analysis estimates, not verified Figma metadata. Full-page captures preserve fixed elements at the capture viewport and may show content continuing below navigation; runtime viewport scrolling is checked separately.

## 4. Functionality preserved and data seeded

- Existing query keys, loading/error/forbidden handling, catalog order and API start/resume remain in their controllers. Repeated start clicks are guarded; completed levels remain retryable and null scores remain distinct from zero.
- Drill save/ACK validation, unsaved warning, clear answer, finalization guard, server submit/result and historical review remain intact. The modal blocks duplicate submit and presents retry after failure. Local ragu never changes answer/scoring payloads.
- Drill remains ten questions with an unlimited count-up; no pause/deadline was introduced. Unlock/mastery stays server-authoritative at the approved 80 threshold.
- Tryout does not opt into the new Drill branch; existing countdown/automatic finalization and legacy confirmation are retained until Phase 4.
- Review keys/explanations come only from the result API. Reports use the existing request/idempotency behavior. Videos remain conditional on failed mastery and actual recommendations.
- Mandiri access, account isolation, Teacher ownership and Admin operations are covered by existing browser regression. No product rule was changed for screenshot fidelity.

**Supabase seed applied:** the plugin could not access the configured NUMORA project, so application used the repository's configured server PostgreSQL connection after verifying its project identity. The additive seed ran repeatedly with identical counts: **1 chapter, 1 subchapter, 1 competency, 5 levels, 50 question families, 100 question variants/versions, 10 DEMO packages, 100 package items**. All 100 mathematical keys, four unique options and explanations were checked. Existing scoring policy is reused; users, classes, attempts/progress, historical versions and schema are untouched. Fresh students naturally start at Level 1; visual active/completed states use separate test fixtures. See [seed instructions](../../packages/database/seeds/README.md) and [verification artifact](../../.tmp/redesign-phase3/seed-verification.json).

**OPEN:** this content has not been reviewed by Curriculum. It is explicitly DEMO, question versions remain DRAFT, and it is not official TKA content. No fake PGK/media/Hint DTO, Tryout content, scoring formula or retention policy was introduced.

## 5. Test results

Toolchain: Node 24.14.1 and pnpm 12.6.0 through `npx`; global pnpm is not changed.

| Check                                | Result                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Repository lint                      | Passed, zero warnings                                                                                                    |
| Web / shared UI / database typecheck | Passed                                                                                                                   |
| Frontend Vitest                      | **15 files / 97 tests passed**                                                                                           |
| Database unit tests                  | **3 files / 5 tests passed**; **3 files / 15 integration tests skipped** because no dedicated test database was supplied |
| Full browser regression              | **55 tests passed**                                                                                                      |
| Focused route/visual/retry follow-up | **19 tests passed** after sticky actions/layout changes                                                                  |
| Final visual alignment               | **9 tests passed** after compact metadata/position-progress refinement; all screenshots refreshed                        |
| Production Next.js build             | Passed again after final refinement; all existing routes generated                                                       |
| Connected DEMO seed                  | Idempotent repeated application and 100 key verification passed                                                          |
| Formatting / whitespace              | Passed: targeted Prettier check, local report links and git diff --check                                                 |

Browser checks cover 320, 360, 390, 393, 430, 768, 1024, 1280 and 1440 px. They verify locked-node semantics, saved-answer ACK boundaries, local flags, no submit before confirmation, Escape/focus restoration, server mastery/retry, and no passing-result videos. The 54 screen geometry artifacts show no horizontal body overflow. Full regression includes Student, Mandiri Tryout, School Join Class, Teacher authorization and existing Admin workflows.

Browser auth/data are synthetic. Connected seeding proves persisted demo content and keys; it does not prove Google OAuth or a full real-server assessment lifecycle. No destructive integration tests were run against the configured Supabase database.

## 6. Remaining issues and next gate

Original frame metadata/assets remain unavailable. Runtime PGK, image questions and hints need an approved generated contract; OPEN rewards/retention are not resolved by this phase. DEMO content needs academic review before use as official material. Cloud schema upgrade readiness and connected OAuth/API QA remain separate checks.

Phase 3 is ready for owner review. **Phase 4 — Tryout / Assessment / History has not started.** No commit, push, PR or deployment was performed.

## 7. Screenshot evidence

Ignored local artifacts use synthetic identities and are not available in another checkout automatically. Each row has mobile and desktop evidence; matching JSON records geometry at all nine widths.

| Screen              | Mobile 390                                              | Desktop 1440                                             | Reference comparison                                                                                                                     |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog             | [PNG](../../.tmp/redesign-phase3/catalog-390.png)       | [PNG](../../.tmp/redesign-phase3/catalog-1440.png)       | Derived screen                                                                                                                           |
| Chapter/subchapters | [PNG](../../.tmp/redesign-phase3/chapter-390.png)       | [PNG](../../.tmp/redesign-phase3/chapter-1440.png)       | Derived screen                                                                                                                           |
| Level map           | [PNG](../../.tmp/redesign-phase3/level-map-390.png)     | [PNG](../../.tmp/redesign-phase3/level-map-1440.png)     | [Pair](../../.tmp/redesign-phase3/level-map-comparison-390.png), [overlay](../../.tmp/redesign-phase3/level-map-overlay-390.png)         |
| Drill PG            | [PNG](../../.tmp/redesign-phase3/drill-390.png)         | [PNG](../../.tmp/redesign-phase3/drill-1440.png)         | [Pair](../../.tmp/redesign-phase3/drill-comparison-390.png), [overlay](../../.tmp/redesign-phase3/drill-overlay-390.png)                 |
| Submit dialog       | [PNG](../../.tmp/redesign-phase3/submit-dialog-390.png) | [PNG](../../.tmp/redesign-phase3/submit-dialog-1440.png) | [Pair](../../.tmp/redesign-phase3/submit-dialog-comparison-390.png), [overlay](../../.tmp/redesign-phase3/submit-dialog-overlay-390.png) |
| Result/review       | [PNG](../../.tmp/redesign-phase3/result-390.png)        | [PNG](../../.tmp/redesign-phase3/result-1440.png)        | [Pair](../../.tmp/redesign-phase3/result-comparison-390.png), [overlay](../../.tmp/redesign-phase3/result-overlay-390.png)               |

The same file prefixes cover 320/360/393/430/768/1024/1280; screenshots were inspected against original reference area and documented differences rather than a single pixel-diff percentage.

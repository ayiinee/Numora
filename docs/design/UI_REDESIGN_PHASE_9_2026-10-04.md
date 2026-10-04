# UI redesign — Phase 9: Admin

**ENGINEERING DECISION — 4 October 2026:** the owner approved continuing from Phase 8 to Phase 9. School/token management and all existing workbench panels now use the approved Student visual language. None of the supplied 21 screenshots covers Admin; this is a derived design, not a claim of matching an unavailable Admin Figma frame. Phase 10 remains a separate review gate.

## 1. Files changed

- [Admin presentation](../../apps/web/src/features/admin/admin-presentation.tsx): pure frame/header, actual-data stat composition, loading/recovery cards and native form/disabled fieldset. API/query/auth ownership stays in existing screens.
- [Schools](../../apps/web/src/features/admin/schools.tsx): shared inputs, school rows, selection, detail/context card and token list; dedicated list/token retry and API-denied states. Pending mutations disable forms/selection; code case and input survive failed creation; newly created schools populate the name form from the successful action.
- [Workbench](../../apps/web/src/features/admin/content.tsx): all nine panels retain fields, validation, handlers, ordering and pagination. Shared form presentation, actual dashboard counts, selected navigation and action variants; denied mutations hide cached forms.
- [Composition CSS](../../apps/web/src/app/numora.css): scoped Admin styles using existing tokens; mobile one-column cards/local navigator scrolling; desktop school/context and editor/list columns at existing breakpoints; bounded pagination and text reflow.
- [School unit regression](../../apps/web/src/features/admin/schools.test.tsx), [workbench unit regression](../../apps/web/src/features/admin/content.spec.tsx) and [Admin browser evidence](../../apps/web/e2e/admin.spec.ts).
- [Design README](README.md), [baseline ledger](UI_REDESIGN_BASELINE_2026-10-03.md), [design-system addendum](NUMORA_UI_DESIGN_SYSTEM.md) and this report.

No API client, generated wire type, backend, database/schema/seed, scoring, outbox/worker, auth provider, new asset/dependency, commit/push/PR or deployment change. Previous uncommitted phase work and additive DEMO seeds remain intact.

## 2. Screens implemented

| Route / panel               | Presentation and existing capabilities                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/admin` → `/admin/schools` | School creation/list/selection, name/status changes, token issue/reissue/revoke, one-time token value, used/revoked/expired states |
| `/admin/content` — Materi   | Chapter/Subchapter/Competency/Level creation, parent selection, rename, READY/archive                                              |
| Soal                        | PG editor, four options/key/explanation, new revision/variant, review/publish/archive, immutable version identifiers               |
| Verifikasi & riwayat        | API-provided review metadata and read-only audit history                                                                           |
| Video                       | Metadata creation, HTTPS link/edit, READY/archive and existing subchapter mapping                                                  |
| Draf Tryout                 | Versioned draft creation/edit, READY selection and pinned IDs retained outside the current question page                           |
| Paket Drill                 | Draft editor, package item context, validated publish/archive, existing server rejection                                           |
| Laporan                     | Question/video filter, destination context, required follow-up/status submission, stored follow-up                                 |
| IRT                         | Batch lifecycle and separate result-release status; response count and server-masked unavailable parameters                        |
| Audit                       | Read-only action/entity/actor/date records and pagination                                                                          |

Across pages: pending/auth/loading, empty list, mutation failure with retained input, data retry, API access rejection/session expiry, selected/disabled states, keyboard navigation and responsive wrapping. `/admin/preview` and QA routes retain their existing gating and navigation scope.

## 3. Visual deviations and normalization

**ENGINEERING DECISION:** uncovered Admin layouts derive from approved Student patterns: purple contextual header, ivory page, white cards, lavender controls/status surfaces, canonical typography/radii and shared icons. Mobile workbench navigation scrolls inside its own region; desktop wraps it and adds columns. At 390 px header/list/form bounds use the 16 px page gutter. The mobile-only decorative header badge is hidden to preserve heading width.

No numeric Admin fixture becomes runtime data. Stat counts come from existing response data. Internal version/entity identifiers remain visible where needed for content operations. Native select controls, confirmation dialogs and rename/video prompts retain their platform presentation and existing semantics; no matching Admin dialog reference was supplied. Review/publication/archive confirmation messages and historical safeguards remain intact. Dates for school token expiry explicitly use Asia/Jakarta; workbench timestamp formatting retains its existing behavior.

## 4. Functionality preserved

- Existing Admin role/session gates and NestJS authorization; API 401/403 clears presentation access, never grants a browser bypass. Existing account-key remount prevents cross-account cache display.
- School code case/validation, server school IDs/status, single-use token operations and original action eligibility. Token plaintext is shown only from issuance response in memory; changing school/revocation clears that value. No extra copy/log/persistence of real tokens.
- Existing workbench load/query/offset API, mutation signatures, native FormData field names, validation, confirmation and immutable revision handlers.
- Ready/version constraints, pinned Tryout selection outside a loaded page, server-validation of Drill package publication, archive/history handling, report pagination/filter/follow-up.
- IRT batch status remains distinct from released results; zero responses and null parameters stay explicit, not fabricated zeros or client recomputation.
- No browser product-data query to Supabase, product parameter editor, permission change, score/progress/IRT formula or seed modification.

## 5. Test results

| Check                                  | Result                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Repository ESLint, zero warnings       | Passed; added development smoke also passed targeted ESLint                                                                       |
| Web TypeScript / Next route generation | Passed                                                                                                                            |
| Frontend Vitest                        | 19 files / 136 tests passed with `--pool=threads --maxWorkers=1 --testTimeout=15000`                                              |
| Admin browser regression               | 14 distinct tests passed: 13-test suite, final visual/report rerun (10 tests), separate development preview/QA gate smoke         |
| Existing browser regression            | 10 passed: school/token and PR40 package/report/IRT lifecycle at 390/1440, Teacher monitoring at 390/1440, four cross-role guards |
| Production web build                   | Passed; 21 static pages generated                                                                                                 |
| Visual evidence                        | 118 screenshots + 118 geometry records; all nine target widths; zero page overflow; three extra diagnostic contact sheets         |
| Formatting / local links / whitespace  | Passed                                                                                                                            |

Initial browser checks exposed label-selector ambiguity and an actual 320 px grid overflow. The selectors now use semantic combobox names, and grid tracks use `minmax(0, 1fr)` with bounded pagination. Header Badge inline display required an explicit mobile override; report status now uses the shared Badge with spacing. Fixture reissues receive distinct IDs. Corrected assertions distinguish inherited fieldset disabling, report status from native option text, and signed-out protected content from an automatic redirect. Runtime is not changed to satisfy an invented redirect expectation.

The default frontend run had 135 passing tests and one existing PvP test exceeding its 5-second harness limit. A retry with process workers had two worker-start timeouts (119 tests passed). The final single-thread-worker run passed all 136 tests with no unhandled errors. Only invocation settings changed; repository test configuration, product timers and PvP logic remain intact.

Widths: **320, 360, 390, 393, 430, 768, 1024, 1280, 1440**. Header bounds are x=16/width=288 at 320 and x=16/width=358 at 390, radius=24; desktop 1440 uses x=268/width=1136. Keyboard menu opening/Escape/focus restoration, selected panel state, pending forms, failure/retry, immutable/pinned content, zero/null IRT distinctions, access rejection and logout are exercised. All nine mobile and desktop panels were inspected through full captures and diagnostic contact sheets. Development preview remains a local simulation; QA login is 404 for the synthetic project. Production preview gating remains unchanged in its route code.

Browser uses typed, explicitly synthetic intercepted SDK/API data and exercises real frontend components/AuthProvider. It proves frontend behavior with those responses, not live server authorization, database token race constraints, real Google OAuth, production package publication or IRT correctness. No external database writes occur.

## 6. Remaining issues

**OPEN:** Admin Figma frames/assets/prototype remain unavailable. Product/academic OPEN decisions remain unresolved; redesign does not answer them. Real connected Admin API/persistence verification and owner/peer review remain release gates. Native browser confirmations/prompts are the recorded visual exception. Phase 9 is ready for owner review. Phase 10 full responsive/accessibility/browser polish has not started.

## 7. Screenshots

Evidence uses synthetic data and is stored under ignored `.tmp/redesign-phase9`; there is no real teacher verification token or student PII. One-time token screenshots contain an explicitly fictional test value.

| Screen                   | Mobile 390 px                                              | Desktop 1440 px                                              |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------ |
| School list              | [Mobile](../../.tmp/redesign-phase9/schools-390.png)       | [Desktop](../../.tmp/redesign-phase9/schools-1440.png)       |
| Selected school / tokens | [Mobile](../../.tmp/redesign-phase9/school-tokens-390.png) | [Desktop](../../.tmp/redesign-phase9/school-tokens-1440.png) |
| Materi                   | [Mobile](../../.tmp/redesign-phase9/curriculum-390.png)    | [Desktop](../../.tmp/redesign-phase9/curriculum-1440.png)    |
| Soal                     | [Mobile](../../.tmp/redesign-phase9/questions-390.png)     | [Desktop](../../.tmp/redesign-phase9/questions-1440.png)     |
| Verifikasi & riwayat     | [Mobile](../../.tmp/redesign-phase9/verification-390.png)  | [Desktop](../../.tmp/redesign-phase9/verification-1440.png)  |
| Video                    | [Mobile](../../.tmp/redesign-phase9/videos-390.png)        | [Desktop](../../.tmp/redesign-phase9/videos-1440.png)        |
| Draf Tryout              | [Mobile](../../.tmp/redesign-phase9/tryout-390.png)        | [Desktop](../../.tmp/redesign-phase9/tryout-1440.png)        |
| Paket Drill              | [Mobile](../../.tmp/redesign-phase9/drill-390.png)         | [Desktop](../../.tmp/redesign-phase9/drill-1440.png)         |
| Laporan                  | [Mobile](../../.tmp/redesign-phase9/reports-390.png)       | [Desktop](../../.tmp/redesign-phase9/reports-1440.png)       |
| IRT                      | [Mobile](../../.tmp/redesign-phase9/irt-390.png)           | [Desktop](../../.tmp/redesign-phase9/irt-1440.png)           |
| Audit                    | [Mobile](../../.tmp/redesign-phase9/audit-390.png)         | [Desktop](../../.tmp/redesign-phase9/audit-1440.png)         |

Additional 390 px captures cover school/token failures, one-time issuance, no schools, session expiry, workbench loading/error/access rejection and all nine empty panels. Geometry records accompany each capture.

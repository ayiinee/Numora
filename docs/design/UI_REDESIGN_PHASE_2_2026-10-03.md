# Phase 2 — Student shell and Home

**ENGINEERING DECISION — 3 October 2026:** the owner approved proceeding from the foundation to Phase 2, with the closest possible screenshot fidelity. This implements Phase 2 only against the [approved baseline](UI_REDESIGN_BASELINE_2026-10-03.md). Phase 3 has not started. Earlier Phase 0/1 changes remain in the same uncommitted working tree on `feat/ui-updatev3`.

The visual source is **Beranda Siswa Numora (Pahamify Style)**. Original Figma frame metadata and full-file access remain unverified. The latest Core Learning PRD and valid backend responses determine behavior.

## 1. Files changed in this phase

| File                                                                       | Change                                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/core-learning/dashboard-new.tsx`                    | Home composition around existing dashboard/catalog/current-Tryout queries and independent failures.   |
| `apps/web/src/features/core-learning/dashboard-presentation.tsx`           | Identity header, Tryout hero/skeleton, feature grid, activity and active-attempt resume presentation. |
| `apps/web/src/features/core-learning/home-class-podium.tsx`                | Class/feature gates, pending policy, loading, error/retry, empty and self-rank states.                |
| `apps/web/src/features/core-learning/leaderboard-podium.tsx`               | Reusable presentation of server entries and unit; created for Home. Phase 5 routes are unchanged.     |
| `apps/web/src/features/core-learning/feedback-overview.tsx`                | Restyle existing summary with initials, read status, date and escaped body.                           |
| `apps/web/src/components/shell/app-shell.tsx`                              | Optional mobile header/composition class; desktop chrome and existing navigation remain.              |
| `apps/web/src/app/numora.css`                                              | Home mobile/tablet/desktop composition, cards, podium, feedback and interaction states.               |
| `packages/ui/src/tokens.css`                                               | Central Tryout gradient and feature mint surface.                                                     |
| `packages/ui/src/icon.tsx`                                                 | Extend existing primitive with bell, rocket, trophy, megaphone and chat.                              |
| `apps/web/src/features/core-learning/redesign.test.tsx`                    | Home safety/recovery tests and updated composition assertions.                                        |
| `apps/web/e2e/student.spec.ts`                                             | Nine-viewport fixtures/geometry/screenshots, recovery states and precise profile selectors.           |
| `docs/design/README.md`, `UI_REDESIGN_BASELINE_2026-10-03.md`, this report | Phase status, evidence, deviations and review gate.                                                   |

No backend, database, API client, generated contract, scoring, assessment lifecycle, PvP protocol, authorization or dependency version was changed. Comparison images/scripts are local ignored evidence under `.tmp/redesign-phase2`, not application assets.

## 2. Screens implemented

`/student` follows the reference order: identity/progress/announcement header → Tryout hero → four features → activity → class podium → teacher feedback → five-item bottom navigation.

- School Home supports populated, fewer-than-three, empty, pending-policy, loading and failed podium states. Self rank outside the podium remains visible.
- Mandiri keeps Drill/Tryout and optional Join Class. Its leaderboard link opens global ranking rather than defaulting to class scope.
- Tryout supports unavailable/open/in-progress/waiting-IRT/result-ready and independent loading/error/retry. Configuration comes from the API.
- Activity preserves zero/null scores, pending release, demo labeling and pending rewards. Only released Drill/Tryout results are linked.
- Feedback preserves loading/empty/error/retry and unread/read states. It remains a preview; the full inbox belongs to Phase 6.

Mobile omits the extra statistics panel to preserve composition. Progress/history remains accessible through **Lihat Semua**, ranking through **Lihat Leaderboard**; best Drill score and completed-level progress appear in the header. Tablet/desktop retain contextual statistics and class name. Desktop expands into main content plus a 280–340 px context panel using existing breakpoints/sidebar.

## 3. Visual comparison and deviations

The visible UI is inferred as 390 px inside the 410 × 1381 PNG. Comparison uses crop `(10, 1, 400, 1375)`, excluding outer margins. This is an image-based estimate, not verified frame metadata. Fixtures match reference content shape without supplying fabricated live values.

| Region      | Approximate reference top / height | Implemented top / height, 390 px |
| ----------- | ---------------------------------- | -------------------------------- |
| Header      | 0 / 143                            | 0 / 143                          |
| Tryout hero | 154 / 179                          | 155 / 180                        |
| Features    | 348 / 152                          | 351 / 154.8                      |
| Activity    | 515 / 183                          | 521.8 / 191.0                    |
| Podium      | 729 / 339                          | 736.8 / 342.4                    |
| Feedback    | 1082 / 180                         | 1095.1 / 189.4                   |

All five cards use **16 px gutter / 358 px width**. Main card radius is 20 px; hero 24 px. Comparison checks bounds, spacing, order, wrapping, typography, colors, icons, navigation and vertical rhythm. No pixel-diff percentage is used as proof of fidelity.

Intentional deviations:

- Gem, account XP/level and XP progression are unavailable. Header uses actual best Drill score and completed/available levels.
- Ranking DTOs lack portraits, completed chapters and stars. Podium uses initials, server rank and points/unit. Production XP policy stays pending; the populated screenshot is explicitly a synthetic fixture.
- Pretest lacks a complete destination and is disabled. PvP reflects its feature flag and retains the availability screen. No fake live/premium/promo state is introduced.
- Tryout count/duration follow the API: comparison uses 35 questions rather than the screenshot's 40. No invented remaining-time countdown or one-item carousel is displayed.
- Reward stars/XP stay pending. Home does not calculate mastery or next-level targets; resume uses the server active-attempt ID.
- Feedback lacks teacher photo/subject/attempt references. It uses initials, name, timestamp, body and read state. The bell scrolls to this preview.
- Controls preserve accessible touch regions. The compact announcement has an expanded 44 px hit region. Bottom navigation uses the approved 64 px baseline plus border/safe area.
- Gold announcement text uses the strong text token: the gold-brown pair measured only 3.89:1. A purple scrim improves white-text readability over peach. Shared vector glyphs normalize stroke treatment rather than imitate unavailable assets.

## 4. Functionality preserved

| Boundary               | Preservation                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth/session           | Existing StudentAccess, provider, identity refresh, role guards and account isolation. Signed-out views do not fetch Student learning data.                                                      |
| Dashboard/catalog      | Existing API methods and `student-dashboard` / `chapters` keys. Catalog empty/error states and full Materi destination remain.                                                                   |
| Tryout                 | Existing `current-tryout` query and route/controller retain eligibility, one attempt, countdown and IRT release. Home never starts an attempt. Mandiri gains no class prerequisite.              |
| Drill/results          | Server attempt ID determines resume. No start/submit mutation or score/unlock/reward computation is added. Waiting results remain unlinked.                                                      |
| Ranking                | Existing endpoint/key `student-leaderboard/class/easy`. Fetch only with class and feature. Pending policy hides provisional entries and self rank; units, ties and ordering are server supplied. |
| Feedback               | Existing summary GET, query key and 60-second staleness. Rendering never invokes read mutations. Bodies are escaped.                                                                             |
| Navigation/affiliation | Existing Profile, Join Class, learning, Tryout, PvP, ranking and history destinations. Optional Join Class and persisted School affiliation pass regression.                                     |
| Teacher/Admin          | No role-specific feature recomposed. Existing ownership, verification, tokens and content/package/report/IRT operations pass browser smoke.                                                      |

## 5. Verification results

Toolchain: Node 24.14.1; pinned pnpm 12.6.0 through `npx`; working Playwright headless Chromium. No global package-manager change.

| Check                               | Result                                                                |
| ----------------------------------- | --------------------------------------------------------------------- |
| Repository lint, zero warnings      | Passed                                                                |
| Web and shared UI typecheck         | Passed                                                                |
| Frontend Vitest                     | **14 files / 93 tests passed**                                        |
| Full regression plus Home viewports | **45 browser tests passed**                                           |
| Focused fixtures/recovery follow-up | **12 tests passed**, including additional Home loading/error recovery |
| Final Home geometry/state evidence  | **10 tests passed**: nine widths plus loading/error/policy recovery   |
| Final mobile/1024 control polish    | Focused browser checks and production build passed                    |
| Production Next.js build            | Passed; existing routes generated successfully                        |
| Whitespace/document formatting      | Passed                                                                |

Coverage includes Student navigation/Drill save/reload/submit/result/retry, offline recovery, Mandiri Tryout/start/resume/IRT waiting, Join Class/affiliation, history pagination/zero values, Teacher verification/profile/owned-class authorization and Admin operations. Initially ambiguous profile selectors were narrowed to the intended account link; Join Class then passed.

New tests verify policy gates, absent participants, self rank outside top three, actual rank/unit, zero score, withheld-result links, independent Tryout failure/retry, no Home start mutation and read-only feedback. Screenshots cover **320 / 360 / 390 / 393 / 430 / 768 / 1024 / 1280 / 1440 px** without horizontal body overflow. Focus, disabled semantics and existing reduced-motion treatment remain available.

Browser auth/data are synthetic. Real external Google OAuth, live server PvP and a full Figma-file audit are not claimed.

## 6. Remaining issues and next gate

Original portraits/icons and full Figma metadata remain unavailable. OPEN product policies remain unresolved and are not activated by fixtures. Pixel-identical asset/copy/statistics reproduction is limited by these gaps; mobile composition is reviewed against the PNG with the deviations above.

Phase 2 is ready for owner review. **Phase 3 — Learning** starts after review, following the owner's one-phase-at-a-time instruction. No commit, push, PR or deployment was performed.

## 7. Screenshot evidence

Local ignored evidence uses synthetic identities. These files may not exist in another checkout.

| Evidence                                   | File                                                                                                                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference comparison, 390                  | [Paired image](../../.tmp/redesign-phase2/home-comparison-390.png), [overlay](../../.tmp/redesign-phase2/home-overlay-390.png)                                                                                                         |
| School Home, 390                           | [Mobile](../../.tmp/redesign-phase2/home-reference-390.png)                                                                                                                                                                            |
| Desktop                                    | [1440](../../.tmp/redesign-phase2/home-reference-1440.png), [1280](../../.tmp/redesign-phase2/home-reference-1280.png), [1024](../../.tmp/redesign-phase2/home-reference-1024.png)                                                     |
| Tablet                                     | [768](../../.tmp/redesign-phase2/home-reference-768.png)                                                                                                                                                                               |
| Other mobile widths                        | [320](../../.tmp/redesign-phase2/home-reference-320.png), [360](../../.tmp/redesign-phase2/home-reference-360.png), [393](../../.tmp/redesign-phase2/home-reference-393.png), [430](../../.tmp/redesign-phase2/home-reference-430.png) |
| Mandiri / loading / error + policy pending | [Mandiri](../../.tmp/redesign-phase2/home-mandiri-390.png), [loading](../../.tmp/redesign-phase2/home-loading-390.png), [error/pending](../../.tmp/redesign-phase2/home-error-pending-390.png)                                         |
| Bounds/overflow                            | [Nine-viewport JSON](../../.tmp/redesign-phase2/home-visual-checks.json)                                                                                                                                                               |

# NUMORA redesign — Phase 1 foundation

Date: 3 October 2026, Asia/Jakarta. Baseline: `d29c352`. Authorization: owner's “lanjut” after the Phase 0 report. Scope: Phase 1 only; Phase 2 waits for owner review. No commit, push, PR, deployment, backend, contract, or database changes.

## Changes and file inventory

| Files                                                                                                                                          | Change                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/tokens.css`                                                                                                                   | Approved primary/strong/selected/secondary surfaces, white cards, text strong, Jakarta font stack, card radius 20, header/nav/control dimensions. Existing palette aliases retained.                                                                                                               |
| `apps/web/src/app/layout.tsx`, `fonts/PlusJakartaSansVariable.ttf`, `fonts/PlusJakartaSans-OFL.txt`                                            | Self-hosted variable font, weight 200–800. Variable on `html` so root tokens resolve the actual Next font. KaTeX remains unchanged.                                                                                                                                                                |
| `packages/ui/src/button.tsx`, `card.tsx`, `input.tsx`, `progress.tsx`                                                                          | Lavender secondary, outlined danger variant, minimum 44 px small controls, light card borders/shadows, labelled form states, lavender progress tracks, keyboard activation for interactive cards. Existing Button form submission defaults preserved.                                              |
| `packages/ui/src/navigation.tsx`, `icon.tsx`                                                                                                   | BottomNav uses real anchors or application link adapter, most-specific route matching, explicit active override, badges and active icons. TopBar variants: default, identity, context, assessment. Added reusable graduation/gamepad vectors using existing icon stroke.                           |
| `packages/ui/src/dialog.tsx`, `tabs.tsx`, `index.ts`                                                                                           | Controlled semantic native dialog; browser background inertness, focus wrap/restore, Escape and pending dismissal guard. Controlled tabs with associated panels, roving focus, arrow/Home/End navigation and disabled-tab skipping.                                                                |
| `apps/web/src/app/globals.css`                                                                                                                 | Shared control/nav/dialog/tab/state styling, focus and pressed/hover states. Existing reduced-motion treatment retained.                                                                                                                                                                           |
| `apps/web/src/app/numora.css`                                                                                                                  | Ivory app canvas, controlled desktop max width, mobile gutter 16, purple contextual chrome, shared bottom nav with safe-area space; existing 699/959/1199/1440 composition breakpoints retained.                                                                                                   |
| `apps/web/src/components/shell/app-shell.tsx`                                                                                                  | Reuses shared TopBar/BottomNav and Next Link. Five Student destinations in approved order; Progres/Peringkat remain desktop/content destinations; nested Drill maps to Materi. Assessment focus mode still omits primary navigation. Teacher/Admin menu supports Escape and restores toggle focus. |
| `apps/web/src/components/shell/foundation.test.tsx`, `features/core-learning/redesign.test.tsx`                                                | Meaningful foundation tests and updated nested-route assertion. jsdom modal stubs are test-only; they do not prove browser focus containment.                                                                                                                                                      |
| `apps/web/e2e/student.spec.ts`, `playwright.config.ts`                                                                                         | Nine viewport checks, approved navigation assertions and actual Jakarta font assertion. Development toolbar hidden only in dashboard evidence. Default Playwright Chromium headless replaces forced full-Chrome channel, which failed to spawn on this machine.                                    |
| `docs/design/README.md`, `NUMORA_UI_DESIGN_SYSTEM.md`, `UI_REDESIGN_BASELINE_2026-10-03.md`, `UI_REDESIGN_ASSETS_2026-10-03.json`, this report | Current phase, visual precedence, font provenance/hashes, verification and review gate. Phase 0 documents remain in the same uncommitted working tree.                                                                                                                                             |

Font provenance: [official Google Fonts asset](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf), [SIL OFL license](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/OFL.txt). No font provider request is required at runtime. Font/license hashes are in the asset manifest.

## Screens affected and deviations

This phase changes shared chrome and primitives across Student, Teacher, Admin and Auth. It does not recompose a complete dashboard, question session, profile, lobby, or monitoring screen. Dialog/Tabs are exported and verified in an isolated test fixture; their product-flow integrations remain in the relevant later phases.

Compared against supplied mobile screenshots: ivory canvas, purple header language, white/lavender surfaces, spacing scale, typography, radius, navigation order and icon scale. BottomNav has 24 px icons, 12 px labels, 64 px baseline plus safe area, purple active state, and no permanent active background block. Mobile main gutter is 16 px; at tablet/desktop the existing larger gutter applies. Shared primary actions remain at least 44 px.

Intentional remaining visual differences:

- Home still uses the prior section order, hero, greeting and progress composition. Its identity/XP header, Tryout hero, four-feature grid, activity/podium/feedback composition belong to Phase 2.
- Context headers currently retain existing NUMORA branding and page headings. Screen-specific back/title/save/timer composition is wired in later phases; no fake XP, account level, gem, notification or connectivity values were added.
- Original vector assets and frame metadata remain unavailable. Icons extend the current library; exact original shapes are not claimed. Geometry remains provisional under the approved screenshot baseline.
- Dialog is a generic foundation; the centered assessment illustration and detailed submission summary are Phase 3 composition. The isolated fixture demonstrates states and focus, not a completed assessment screen.
- Focus outlines, semantic labels and touch targets are retained where the screenshots omit them. Unsupported rewards, figures or features are not introduced.

## Functional boundaries preserved

AuthProvider, role/access gates, destination logic, query keys/ownership, API calls, cache isolation, assessment save/ACK/finalization, timers, server scoring/unlock, PvP socket protocol/availability, Join Class, monitoring and Admin mutations remain unchanged. No generated wire types or contracts were edited.

Student mobile destinations: Belajar `/student`; Materi `/student/learn`; Tryout `/student/tryout`; PvP `/student/pvp`; Profil `/student/profile`. Progres and Peringkat remain accessible through dashboard content and desktop navigation. Mandiri remains independent; class ranking retains its class gate. Browser fixtures never activate gated production PvP.

## Verification and evidence

Test toolchain: Node 24.14.1, pnpm 12.6.0 via per-command `npx` (global pnpm unchanged), Chromium headless 153.0.8010.12. Playwright browsers were installed in the local cache. Stale malformed `.next/dev/types` generated files were removed and regenerated; source configuration/route contracts were not changed to bypass type checking.

| Check                                  | Result                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Root lint                              | Passed, zero warnings                                                                                                    |
| `@tka/ui` and `@tka/web` typecheck     | Passed                                                                                                                   |
| Frontend unit/web suite                | 14 files / 85 tests passed                                                                                               |
| Full existing browser regression       | 36 tests passed, including all nine Student widths and Teacher/Admin 390/1440                                            |
| Final all-role chrome/screenshot smoke | 6 tests passed after final foreground/contrast corrections                                                               |
| Native dialog/tabs/control fixture     | All nine widths passed; focus, pending Escape, restore, keyboard panels, touch targets, reduced motion, zero page errors |
| Production build                       | Passed; all existing routes generated                                                                                    |
| Formatting / whitespace                | Changed files formatted; `git diff --check` passed                                                                       |

The final affected foundation/navigation web tests also passed: 2 files / 30 tests after contrast changes. One Admin unit test hit the existing 5-second timeout while unit/browser/build checks ran concurrently. The full unit suite passed when rerun without competing heavy checks; no timeout increase or test weakening was applied. Earlier environment failures (missing browser, full-Chrome spawn and malformed generated types) were resolved before final passing checks. These runs use mocked frontend boundaries; they do not replace backend/domain or connected production acceptance.

Contrast normalization preserves success fill `#2F8F6B` while using `#21684E` for small success text. Muted-light text becomes `#766681`. Against white, primary/strong/muted/muted-light/success-text ratios are approximately 7.08/10.20/6.33/5.27/6.66. Desktop header text stays dark on white; mobile brand-header text/actions stay white on purple.

Browser regression uses existing test-only auth/API fixtures. It verifies navigation, Drill save/resume/submit/result/retry, offline recovery, Mandiri Tryout/start/resume/IRT waiting, Join Class and persisted affiliation, history pagination/zero-vs-null, Teacher verification/profile/owned-class access and Admin school/token/content/report/package/IRT operations. Google login UI and signed-out/direct-route guards are covered; a real external OAuth transaction is not claimed. Live server PvP/domain E2E is outside a foundation CSS phase; existing frontend PvP tests preserve protocol behavior and availability.

The isolated browser fixture additionally verifies focus containment through repeated Tab, Escape during pending work, Escape dismissal and restored trigger focus, disabled-tab keyboard skipping, associated panel, 44 px controls, reduced motion, and no overflow at 320/360/390/393/430/768/1024/1280/1440. Its source and bundle are local ignored files under `apps/web/.tmp`; no preview/auth bypass route was added.

Screenshot evidence is local and ignored, using synthetic identities. Compare shared foundation/chrome at this stage; full-screen screenshot fidelity acceptance starts when the associated phase recomposes the screen.

| Evidence                                 | File                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Student chrome/mobile baseline, 390      | [Student mobile](../../.tmp/redesign-phase1/student-390.png)                                                                       |
| Student sidebar/desktop baseline, 1440   | [Student desktop](../../.tmp/redesign-phase1/student-1440.png)                                                                     |
| Standalone shared primitives, 390 / 1440 | [Mobile fixture](../../.tmp/redesign-phase1/foundation-390.png), [desktop fixture](../../.tmp/redesign-phase1/foundation-1440.png) |
| Native dialog, 390 / 1440                | [Mobile dialog](../../.tmp/redesign-phase1/dialog-390.png), [desktop dialog](../../.tmp/redesign-phase1/dialog-1440.png)           |
| Teacher shared chrome, 390 / 1440        | [Teacher mobile](../../.tmp/redesign-phase1/teacher-390.png), [Teacher desktop](../../.tmp/redesign-phase1/teacher-1440.png)       |
| Standalone browser checks                | [JSON evidence](../../.tmp/redesign-phase1/foundation-browser-checks.json)                                                         |

## Remaining issues and next gate

No full-file Figma verification or pixel-perfect screen completion is claimed. Original assets, missing runtime capabilities and product OPEN decisions retain their Phase 0 status. Screen-specific layouts, responsive polish and integration of Dialog/Tabs proceed in the approved later phases.

Next: owner review of Phase 1 evidence, then Phase 2 Student shell/dashboard only. Do not begin Phase 2 automatically, combine remaining phases in this diff, or commit/push/open a PR without subsequent instructions.

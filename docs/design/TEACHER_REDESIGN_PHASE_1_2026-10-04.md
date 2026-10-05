# Teacher redesign — Phase 1 foundation

**Historical batch report:** the owner subsequently authorized all remaining frontend phases without interim review. See the [complete report](TEACHER_REDESIGN_COMPLETE_2026-10-04.md) for current scope and verification. The review stop and unavailable navigation below describe the original Phase 1 snapshot.

**ENGINEERING DECISION — 4 October 2026:** the owner approved implementing only the Teacher foundation from the [audited Desktop/Mobile PNGs](TEACHER_REDESIGN_AUDIT_2026-10-04.md). This batch implements a scoped blue theme, identity/context header, desktop sidebar and four-item mobile bottom navigation. Existing Dashboard/Class/Student/Profile bodies remain for their later phases.

**Status:** foundation implemented and browser-verified. Full production build/typecheck is not green because an existing parallel Student notification E2E file has a Socket.IO typing error. Live cloud-seed integration and owner review remain separate gates. Phase 2 is not started.

## Files changed and components

| File                                                   | Change                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/shell/teacher-shell.tsx`      | Dedicated Teacher presentation; existing props preserved with optional backHref/actions; authenticated identity, gate-aware navigation and retryable existing logout hook |
| `apps/web/src/components/shell/teacher-header.tsx`     | Mobile identity and desktop context; actual profile link; unavailable notification icon without a fake count                                                              |
| `apps/web/src/components/shell/teacher-navigation.tsx` | Class/profile active states, nested class context, desktop/sidebar and mobile composition, semantic disabled controls                                                     |
| `apps/web/src/app/teacher.css`                         | Scoped token palette, responsive foundation, existing Teacher page/verification CSS moved from numora.css                                                                 |
| `apps/web/src/app/numora.css`                          | Only the existing Teacher block moved; surrounding Student/Auth/Admin/new notification styles preserved                                                                   |
| `apps/web/src/app/layout.tsx`                          | Imports the Teacher stylesheet after existing global styles; auth provider and locally bundled font unchanged                                                             |
| `apps/web/src/components/shell/teacher-shell.test.tsx` | Eight cases covering actual identity, disabled capabilities, nested active states, four non-ready auth states, unverified state and logout recovery                       |
| `apps/web/e2e/teacher.spec.ts`                         | 13-width screenshots; shell/disabled/keyboard checks; name/reduced-motion/logout and 959/960 transition coverage                                                          |
| Design docs and `screenshots/teacher-foundation/`      | Audit, token addendum, phase report and portable synthetic comparison/gallery                                                                                             |

Reused UI: Brand (local owl), Avatar, Badge, Button, IconButton, Icon and BottomNav. Existing page Card/Input/Select/ListRow/SectionHeader/Skeleton/EmptyState and DataState/Status remain in use. The shell export already exists; no barrel rewrite was needed. No new dependency, API, generated DTO, migration, schema, policy, seed, authentication provider, commit or deployment.

## Visual decisions and normalization

- Blue primary `#0048BA`, selected `#1E60E2`, background `#F9F9FF`, white surfaces and lavender inset fills match sampled PNG colors. Local Plus Jakarta Sans remains; PNG font identity is unverified. Geometry is **PROPOSED** pending Figma metadata.
- Mobile identity uses 16 px name text, 44 px avatars/actions and a minimum 80 px header. Long names wrap naturally, increasing height when needed. Mobile bottom navigation is exactly 64 px plus safe area.
- Below 960 px: Kelas / Monitoring / Feedback / Profil bottom navigation. At 960 px and above: desktop sidebar only. Sidebar is 240 px, increasing to the reference's 288 px at 1280. Desktop header is 64 px. At 700 px the gutter becomes 24; desktop uses 28–32; maximum content width is 1440.
- Kelas/Profil are functional. Detail Kelas becomes a link in an actual class context; otherwise it explains that a class must be selected. Monitoring/Feedback are disabled for Phase 1. Teacher notifications remains unavailable because the existing endpoint is Student-only.
- Replaced hamburger Teacher navigation with the referenced bottom navigation. Retained the actual branded owl, initial avatars, name/email and verified state. No mockup portraits, school names, semester, activity status, token validity, fake notification dots/counts, global search or live-sync promises.
- Existing page content changes color through scoped tokens but is not a final Dashboard/Profile redesign. Active cards retain their real API values; zero/null/latest/best/locked semantics remain unchanged.
- Reduced motion, visible focus, skip link, minimum control targets and exclusive responsive navigation are verified. Disabled surfaces are native disabled buttons, not clickable dead ends.

TeacherGate, identity/session provider, API clients/generated types/query keys, class creation/invalidation and student progress are unchanged. Sidebar logout calls the existing logout hook and redirects only on success. Byte-normalized SHA-256 checks confirmed that the CSS before and after the moved Teacher block was preserved; evidence is in ignored `.tmp/teacher-foundation/css-preservation.json`.

## Verification

| Check                                            | Result                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend Vitest                                  | **146 passed**, 21 files; includes 14 Teacher/shell cases                                                                                                                |
| Teacher Playwright                               | **20 passed**; all 13 widths plus error/loading/empty/denied/session/name/reduced-motion/logout/transition cases                                                         |
| Auth / role / Student / Admin browser regression | **37 passed** in the final dedicated run: Google/PKCE/onboarding, role routing, verification, latest/best/ownership, logout, Student routes and Admin school/token smoke |
| Repository lint                                  | **Passed** with `corepack pnpm lint`                                                                                                                                     |
| Changed-file lint                                | **Passed**                                                                                                                                                               |
| Web typecheck                                    | **Blocked externally**: `apps/web/e2e/materials-notifications.spec.ts:437`, Socket.IO ServerOptions rejects `cors`                                                       |
| Web production build                             | Turbopack compiled successfully; **build fails** at the same TypeScript error. No ignoreBuildErrors or exclusion was introduced                                          |

Used `corepack pnpm` 12.6.0, matching the repo pin without changing the global pnpm installation. The separate seed script initially produced an unused-import lint failure; the concurrent work removed it and the final repository lint passed.

An initial broad run encountered an unrelated existing Student home test at `apps/web/e2e/student.spec.ts:511`: it searches for the old `Lihat catatan guru` link. That run was stopped, and relevant shell/role/route regressions were run separately. The obsolete Student assertion was not rewritten by this batch. One new long-name test initially used an ambiguous visible/hidden header selector; it was corrected and the final complete Teacher suite passed.

Browser data are synthetic HTTP/auth fixtures confined to tests. They prove frontend behavior and rendering, not cloud database/Google OAuth integration. This batch did not run seeds or write business data to Supabase.

## Screenshots and visual comparison

All Teacher verification/classes/create-class/students/student-progress/profile captures and geometry are under ignored `.tmp/teacher-foundation/`, at 320/360/375/390/393/430/768/834/1024/1280/1366/1440/1920. Geometry reports show no horizontal overflow. A resize test also covers 959/960; only one navigation presentation is visible at a time.

Portable screenshots use fictional test identities. Full-page browser screenshots preserve a fixed bottom bar at its initial viewport position; this is browser capture behavior. The mobile comparison isolates the actual header and bottom navigation.

| Evidence                                   | Screenshot                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Mobile reference / implemented shell       | [Comparison](screenshots/teacher-foundation/mobile-shell-comparison.png)                                              |
| Desktop reference / implemented foundation | [Comparison](screenshots/teacher-foundation/desktop-shell-comparison.png)                                             |
| Classes at 390 / 1280                      | [Mobile](screenshots/teacher-foundation/classes-390.png) / [Desktop](screenshots/teacher-foundation/classes-1280.png) |
| Class students at 390                      | [Students](screenshots/teacher-foundation/students-390.png)                                                           |
| Student progress at 390                    | [Progress](screenshots/teacher-foundation/progress-390.png)                                                           |
| Profile at 390                             | [Profile](screenshots/teacher-foundation/profile-390.png)                                                             |
| Long identity at 320                       | [Wrapping](screenshots/teacher-foundation/long-identity-320.png)                                                      |

Comparison confirmed reference-width header height/palette, desktop sidebar/header geometry, mobile navigation destinations, and gutters. The identity data/logo/icons and availability indicators intentionally reflect current supported sources; the full page bodies are visibly different and remain later-phase work. This is not a claim of full-page pixel accuracy.

## Known gaps and next phase

Figma needs connector reauthentication for current metadata/assets. Teacher school/NISN/photo enrichment, notifications, batch Tryout projections, leaderboards, class settings mutations and advanced feedback capabilities are unavailable through current contracts. Product OPEN policies remain open.

Live development seed/API verification is pending completion of the other chat's seeding and a real authenticated QA session. Typecheck/build need the parallel Student notification test typing issue resolved. Owner review is required before starting **Phase 2 — Dashboard**; no later-phase UI or backend work is included here.

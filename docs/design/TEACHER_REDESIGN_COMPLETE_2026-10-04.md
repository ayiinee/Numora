# Teacher redesign — frontend phases 1–8

**ENGINEERING DECISION — 4 October 2026:** the owner authorized completing all Teacher frontend phases without interim review. This supersedes the review stop in the [Phase 1 report](TEACHER_REDESIGN_PHASE_1_2026-10-04.md). Backend development and seeding remain outside this batch. The [audit](TEACHER_REDESIGN_AUDIT_2026-10-04.md) records the six Desktop and eleven Mobile PNG references, data map, product normalization, and unavailable capabilities.

## Delivered screens and behavior

| Phase | Frontend delivery                                                                                                                                       | Sources and limits                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Scoped blue Teacher theme, identity header, desktop sidebar, mobile Kelas / Monitoring / Feedback / Profil navigation                                   | Existing auth and TeacherGate preserved; notifications have no count badge                                                                                                          |
| 2     | Dashboard, class search/cards, create class, class count, complete roster total, quick actions                                                          | Classes and active memberships from NestJS; incomplete totals display `—` with recovery, never a partial total                                                                      |
| 3     | Class detail, member search/sort, desktop table/mobile cards, invite screen/desktop dialog, QR/copy/PNG download, read-only settings                    | Actual class name/code/member count; QR contains the actual code, not an invented join URL; no settings save                                                                        |
| 4     | Class Monitoring Progres, last/best Drill values, ongoing/access state, dynamic chapter accordions, per-student detail and paginated assessment history | Complete owned-class student queries, at most six progress requests concurrently; zero/null remain distinct; Tryout batch/leaderboard tabs explain unavailability                   |
| 5     | Per-student text feedback composer, paginated history, read status/filter, success/retry                                                                | Generated DTOs and existing GET/POST feedback; 1,000 characters; stable UUID on identical delivery retry; recipient controls disabled during send; loaded counts explicitly labeled |
| 6     | Pusat Notifikasi entry and availability screen                                                                                                          | No Teacher notification endpoint; no inbox, read-all mutation, unread count, or Student endpoint use                                                                                |
| 7     | Profile identity, account/verification, actual classes, invite/settings shortcuts, Monitoring/Feedback access, logout                                   | No fictional school/NIP/photo/session/security settings or editable profile action                                                                                                  |
| 8     | Responsive polish, keyboard/focus/modal behavior, safe area, reduced motion, long names, recovery and ownership checks                                  | 13 viewports from 320 to 1920 px; Student/Admin presentation regression checked separately                                                                                          |

**PRD RULE / contract behavior:** Teacher authorization remains server-authoritative; students do not acquire multiple class memberships. Drill unlock/access comes from the API. A pending Tryout result never exposes a score in history. Feedback stays one direction and cannot be marked read by the Teacher. No formula for XP, stars, curriculum completion or remediation is introduced.

**PROPOSED:** dimensions, radii, type scale and spacing remain replaceable CSS tokens because current Figma metadata is unavailable. PNG page interiors are the visual reference; export frames/glow are excluded. Plus Jakarta Sans, local owl/logo proportions and real profile initials are retained.

## Code inventory

- `apps/web/src/app/teacher.css` and the shell/header/navigation form the isolated Teacher presentation system. Root layout imports the stylesheet; the former Teacher block was moved out of `numora.css` while preserving surrounding Student/Admin styles.
- `teacher-gate.tsx` extracts the existing gate/provider without changing its authorization/redirect behavior. `teacher-screens.tsx` keeps existing create-class/progress clients and query keys.
- `teacher-data.ts` owns roster completeness, class selection and bounded progress reads. `teacher-ui.tsx` provides shared metric, announcement and unavailable presentations.
- `teacher-class-tools.tsx`, `teacher-monitoring.tsx`, `teacher-feedback.tsx`, `teacher-feedback-api.ts`, `teacher-assessment-history.tsx` and `teacher-notifications.tsx` implement the corresponding screens.
- New routes are `/teacher/monitoring`, `/teacher/feedback`, `/teacher/notifications`, `/teacher/classes/[classId]/invite` and `/teacher/classes/[classId]/settings`. Existing routes stay intact; there is no Unlist route.
- `features/onboarding/teacher-profile.tsx` now includes actual classes and all supported mobile/desktop shortcuts.
- Existing `Button`, `Card`, `Badge`, `Input`, `Select`, `Textarea`, `Tabs`, `Avatar`, `BottomNav`, `Dialog`, skeleton and state components are reused. No new UI or QR dependency is installed.
- Teacher unit/E2E tests cover data completeness, zero/null, delivery idempotency, pagination, IRT visibility, actual QR code/copy/download, navigation, logout and responsive states.
- A supporting two-line change in `e2e/materials-notifications.spec.ts` names the existing transport options before constructing the server. It resolves excess-property checking caused by the cross-package Socket.IO declaration import; the invitation transport browser test verifies its runtime behavior.

## Validation and visual evidence

| Final frontend check                              | Result                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Repository lint                                   | PASS, zero warnings                                                                 |
| Web typecheck                                     | PASS with repository-pinned toolchain                                               |
| Frontend Vitest                                   | PASS, 153 tests / 23 files; includes 21 Teacher cases                               |
| Selected Playwright regression                    | PASS, 73 tests together: 23 Teacher, 20 Auth, 14 Admin, 16 Student/role/shell cases |
| Supporting notification invitation transport test | PASS separately after the options declaration fix                                   |
| Teacher responsive geometry                       | PASS, 182 reports at 13 widths, zero horizontal overflow                            |
| Web production build                              | PASS, including all new Teacher routes                                              |
| Formatting / diff whitespace                      | PASS for delivery files                                                             |

Commands use `corepack pnpm` (repository-pinned 12.6.0). The production build ran sequentially with `NUMORA_LOW_MEMORY=true` and `NODE_OPTIONS=--max-old-space-size=768`; an earlier simultaneous browser/build run exhausted host memory. Two new tests initially needed an exact class-picker selector and a separate run after resource contention; the final combined regression passed. Browser fixtures are synthetic HTTP/auth fixtures confined to tests. Connected data verification is reported separately below.

All captures/geometry are in ignored `.tmp/teacher-redesign/`. The [portable gallery](screenshots/teacher-redesign/README.md) contains the 390/1280 pairs and reference comparisons. Full-page screenshots position the fixed bottom bar at the initial viewport; this is capture behavior. The browser tests check actual navigation visibility and horizontal overflow at each viewport.

Visual comparison checks palette, page gutter, header/sidebar geometry, navigation/selected state, rounded surfaces, identity proportions, responsive content hierarchy and long-label wrapping. Supported data replace mockup numbers. Omitted fictional statistics/activity/remediation/credentials and unavailable screens necessarily change page height; no full-page pixel identity is claimed.

## Remaining gaps

**MISSING_BACKEND:** Teacher batch Tryout monitoring, class leaderboard/XP projections, Teacher notification/read-all, school/profile enrichment, class settings mutations, profile updates, notification preferences, audio/attachments, global feedback summary and activity feed.

**OPEN:** final XP/stars policies, academic completion/remediation and other product policies identified in the audit. These remain backend/product work.

The separate seeding/connected-QA work has now supplied the verification linked below. No seed, database migration, authorization, scoring or REST endpoint is added by this redesign. The user can review the completed frontend together; missing backend capabilities are not represented as functional completion.

## Connected development QA follow-up

**ENGINEERING VERIFICATION — 4 October 2026:** the real authenticated Teacher development session is now verified. The [connected QA report](TEACHER_CONNECTED_QA_2026-10-04.md) records five passing live Auth/NestJS/PostgreSQL browser tests, 143 viewport checks, unchanged business rows, and passing repository lint/typecheck/build plus 153 frontend unit tests. The [real-data gallery](screenshots/teacher-connected/README.md) contains 22 captures. This follow-up supersedes the earlier pending connected-QA statement above. Google OAuth itself remains untested; missing backend capabilities and OPEN rules remain gaps.

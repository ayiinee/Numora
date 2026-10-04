# UI redesign — Phase 7: Teacher

**ENGINEERING DECISION — 4 October 2026:** the owner approved continuing from Phase 6 to Phase 7. This phase aligns existing Teacher verification, classes/create, students, progress and profile with the approved Student visual language. Teacher has no screen in the 21 supplied references; this is a derived design, not a verified Teacher Figma match. Auth/onboarding Phase 8 and Admin Phase 9 are separate.

## 1. Files changed

- [TeacherShell](../../apps/web/src/components/shell/teacher-shell.tsx): scoped Teacher composition; shared AppShell still owns navigation, profile and active routes. Header uses the authenticated profile once.
- [Teacher screens](../../apps/web/src/features/monitoring/teacher-screens.tsx) and [presentation](../../apps/web/src/features/monitoring/teacher-presentation.tsx): class welcome/list/create, search/sort, student rows, monitored level cards and verification frame. Presentation uses generated DTOs and shared Avatar, Card, Badge, ListRow, Input, Select and Icon.
- [Verification](../../apps/web/src/features/onboarding/screens.tsx): only Teacher verification is recomposed; other auth/onboarding screens keep their existing implementation.
- [Teacher Profile](../../apps/web/src/features/onboarding/teacher-profile.tsx): identity, account, verified status, class entry and retryable logout.
- [Composition CSS](../../apps/web/src/app/numora.css): scoped Teacher styles using existing tokens and 700/960/1200 breakpoints; other roles retain their styles.
- [Teacher unit regression](../../apps/web/src/features/monitoring/teacher-screens.test.tsx), [Teacher browser regression](../../apps/web/e2e/teacher.spec.ts), [existing browser regression](../../apps/web/e2e/student.spec.ts): behavioral and visual verification. Existing verification assertions use the combobox's accessible name, preserving token-case and pending-identity checks.
- [Design README](README.md), [baseline phase ledger](UI_REDESIGN_BASELINE_2026-10-03.md), [design-system addendum](NUMORA_UI_DESIGN_SYSTEM.md) and this report.

No new dependency, asset, database write, migration, API, generated contract, domain rule, commit, push, PR or deployment.

## 2. Screens implemented

| Route                                             | Composition                                                                                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/teacher/verification-required`                  | Branded purple header; purpose/context card; school/token form; pending, no-school, load/verification error, disabled identity and expired-session states |
| `/teacher`                                        | Verified identity card; expandable create form; owned-class cards and actual server join codes; loading/empty/error/success                               |
| `/teacher/classes/[classId]`                      | Class context/back; search and name sorting; semantic student links; empty/search-empty and denied states                                                 |
| `/teacher/classes/[classId]/students/[studentId]` | Student identity; latest score; read-only level access/in-progress and latest/best scores; empty/forbidden/session-expired states                         |
| `/teacher/profile`                                | Purple identity card; real name/email/verification; class link; logout with pending/error/retry                                                           |

## 3. Visual decisions and deviations

- Reuse Plus Jakarta Sans, ivory background, purple header/identity, white 20 px cards, lavender nested surfaces, 24 px identity/context radius and 14 px controls. Mobile gutters are 16 px; primary actions and visible form/navigation controls keep minimum 44 px targets.
- Mobile stacks the content; 768 px uses class/level grids, search/sort columns and profile/verification columns. At 960 px the existing sidebar appears; class creation becomes a 280 px context panel. At 1200 px class/level density increases. Container width stays controlled by AppShell; forms do not stretch across the desktop.
- Teacher composition prioritizes monitoring readability, without Student currency, XP, stars, reward animations or invented class statistics. No QR, export, editing or feedback-sending controls are added without an existing screen workflow.
- Teacher identity and Student rows use initials as in the prior implementation. Monitoring DTOs do not provide photos, Student email or a Teacher school name; none is invented. Existing local owl asset is reused.
- Latest and best are independent server values. `0` is rendered; `null` is `—` with a legend. No client-derived mastery/completion badge or score/progress mutation is introduced.
- Verification is derived from the same purple/white form pattern; no unavailable Teacher frame, original geometry or full-file Figma review is claimed. Screenshot comparison against the supplied Student patterns verifies visual consistency, not Teacher pixel identity.

## 4. Functionality preserved

**PRD RULE:** Teacher authentication is Google; school verification uses a single-use token valid for 3×24 hours. Teacher sees only their owned Classes/Students; monitoring is read-only. NestJS remains authoritative for all permissions and progress.

**ENGINEERING DECISION:** preserve the existing API client, account-keyed TeacherGate/LearningProvider, redirects, query keys and mutation handlers.

- `getSchools`, `verifyTeacher`, identity `refresh` and existing short/legacy token validation remain. Token case and trimmed payload remain unchanged. Busy controls prevent repeated submissions; no navigation into Teacher classes occurs before the refreshed identity permits it.
- `getTeacherClasses` / `['teacher-classes']` and `createTeacherClass(token, name.trim())` remain; successful creation invalidates the same query and shows the exact server join code. Failure retains form input; 401 adds a login destination.
- `getClassStudents` / `['class-students', classId]` keep the same IDs and local name search/sort; sorting uses a filtered copy, not mutation of server items.
- `getTeacherStudentProgress` / `['student-progress', classId, studentId]` keep response ordering, score zero/null and latest/best/access/in-progress values. 403 and 401 render existing DataState and reveal no level cards.
- Profile keeps AuthProvider logout and the `/` destination; a failure remains on Profile with retry. No shell-wide Teacher logout or role/verification bypass is added.
- Verification disabled-account feedback and 401 recovery are presentation states; neither authorizes an account or changes backend rules.

## 5. Verification

| Check                                               | Result                                                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Frontend unit suite                                 | **17 files / 124 tests passed**, including six new Teacher behavioral regressions                                    |
| Repository lint                                     | **Passed, zero warnings**                                                                                            |
| Web / shared UI typecheck                           | **Passed**                                                                                                           |
| Web production build                                | **Passed**, all Teacher routes included, 21 static pages generated                                                   |
| Focused initial Teacher browser suite               | **12 passed** before adding two additional state flows                                                               |
| Final browser regression                            | **98 distinct flows verified**: 50 passed in the initial full run; the remaining 48 passed in the final targeted run |
| Teacher visual evidence                             | **66 PNG captures + 66 geometry records**, all nine widths; zero horizontal overflow                                 |
| Formatting / local documentation links / whitespace | **Passed**                                                                                                           |

The initial full browser run stopped on one legacy Teacher Profile text selector that matched both the new identity badge and account verification row. The assertion now targets the exact account status while retaining logout and signed-out-route checks. The remaining 48 flows, including that corrected flow and all 14 Teacher flows, passed the final run. The first 50 were not repeated because runtime code did not change after their passing run. This is not a claim that all 98 passed in one invocation.

Teacher flows cover case-preserved short/legacy token submission and pending identity refresh, create retry/server code, zero versus null and independent latest/best, local search/sort, owned/foreign-resource states, explicit 401 login destinations, empty schools/classes/students/levels, disabled identity, loading without fabricated cards, keyboard disclosure/navigation and guarded logout. Existing Student/Drill/Tryout/history/feedback/PvP and Admin regressions remain verified. Browser page-error assertions passed.

At 390 px: header width/height 390×64; identity/class/form cards use x=16 and width=358; identity radius 24 px and normal card radius 20 px. At 1440 px the sidebar is 232 px, page content remains controlled and creation is a context panel. Mobile/desktop screenshots were inspected for typography wrapping, card bounds, hierarchy, icon alignment and spacing against the approved Student visual language.

Browser fixtures are synthetic and exercise the real frontend AuthProvider and REST clients through intercepted responses. They do not prove Google/provider integration, real database token consumption/races or deployed NestJS authorization.

## 6. Remaining issues and next gate

**OPEN:** full Teacher Figma frames and original assets remain unavailable. Exact Teacher fidelity requires that handoff. Existing product OPEN items remain unresolved. Real service integration and peer/owner review remain release gates.

Phase 8 Auth/callback/onboarding is not started. Review this phase's mobile and desktop evidence before continuing.

## 7. Screenshots

Synthetic captures and geometry are under ignored `.tmp/redesign-phase7`; no student PII, credentials or real verification tokens are used.

| Screen       | Mobile 390 px                                             | Desktop 1440 px                                             |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| Verification | [Mobile](../../.tmp/redesign-phase7/verification-390.png) | [Desktop](../../.tmp/redesign-phase7/verification-1440.png) |
| Classes      | [Mobile](../../.tmp/redesign-phase7/classes-390.png)      | [Desktop](../../.tmp/redesign-phase7/classes-1440.png)      |
| Create Class | [Mobile](../../.tmp/redesign-phase7/create-class-390.png) | [Desktop](../../.tmp/redesign-phase7/create-class-1440.png) |
| Students     | [Mobile](../../.tmp/redesign-phase7/students-390.png)     | [Desktop](../../.tmp/redesign-phase7/students-1440.png)     |
| Progress     | [Mobile](../../.tmp/redesign-phase7/progress-390.png)     | [Desktop](../../.tmp/redesign-phase7/progress-1440.png)     |
| Profile      | [Mobile](../../.tmp/redesign-phase7/profile-390.png)      | [Desktop](../../.tmp/redesign-phase7/profile-1440.png)      |

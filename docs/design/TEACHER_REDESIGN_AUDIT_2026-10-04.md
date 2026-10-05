# Teacher redesign audit — 4 October 2026

**ENGINEERING DECISION:** the owner first approved the Teacher Phase 1 foundation and subsequently authorized all frontend phases without interim review. Development seeding is handled separately. This visual reference supersedes the earlier Student-derived Teacher target without changing Student/Admin presentation or product policies. The [complete report](TEACHER_REDESIGN_COMPLETE_2026-10-04.md) records the implemented screens and current checks.

**Visual sources:** `Teacher Dekstop.zip` (6 PNGs) and `Teacher Mobile.zip` (11 PNGs), supplied from the owner's Downloads directory. Figma file `LaHB1HQdyVumYcaAEB3TXd` requires connector reauthentication; its current metadata and assets could not be verified. PNGs are the authorized visual references, not implementation backgrounds/assets.

**PROPOSED:** typography/geometry normalization below remains replaceable when Figma metadata becomes available. Most mobile exports are 430 px wide with a 390 px page surrounded by export glow; others are 406/422 px. Desktop exports are 1296 px with a 1280 px page. Compare the page interior, excluding export decoration.

## Screen and responsive map

| Feature / supplied pair                        | Main components                                                                                 | Current data requirements / normalization                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dashboard desktop / Beranda mobile             | Identity, announcement, metrics, classes, recent activity, desktop context column               | Real profile/classes; counts derived only from complete API responses. No invented activity/academic aggregate |
| Class Detail desktop / Detail & Anggota mobile | Class summary/code, tabs, search, student table/cards, invite/settings                          | Owned-class members and student progress; no fake NISN, roster count or capacity                               |
| Monitoring desktop / Monitoring Progres mobile | Class context, Progres/Tryout/Leaderboard tabs, level/progress sections, intervention, students | Existing per-student Drill progress; curriculum mastery/remedial semantics remain OPEN                         |
| Monitoring desktop / Batch Tryout mobile       | Batch selection, submission stats, distribution, results, pending students                      | Teacher batch projection unavailable. Respect backend IRT release; no preliminary scores                       |
| Monitoring desktop / Leaderboard XP mobile     | Period, podium, rank rows, activity/intervention                                                | Teacher ranking unavailable; current public class ranks are policy-pending                                     |
| Feedback desktop / Feedback mobile             | Composer and history in two columns / stacked sections                                          | Per-student feedback text and readAt supported; category/audio/attachment/draft/response are not               |
| Notifications desktop / Notifications mobile   | Filters, dated cards, read controls, contextual panels                                          | Existing endpoint is Student-only. Normalize incorrect mobile title to Pusat Notifikasi                        |
| Profile desktop / Profile mobile               | Identity, account/verification, grouped capabilities, classes, logout                           | Actual name/email/verification; no school/credential validity/photo/2FA/session data invented                  |
| Class Settings mobile / derived desktop panel  | Class information, grouped settings                                                             | No Teacher settings mutation; future controls unavailable                                                      |
| Invite Student mobile / derived desktop dialog | Class summary, actual code, generated QR, instructions                                          | QR may encode actual code. No nonexistent join URL or in-app scanner promise                                   |
| Unlist version mobile                          | Collapsed monitoring sections                                                                   | Alternate/draft pattern only, no separate route                                                                |

Every data page retains pending, empty, success, error/retry and applicable forbidden/not-found/disabled states. Shared queries remain independent of responsive presentation.

## Canonical Teacher foundation

| Token / behavior                    | Value / source                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Primary / selected                  | `#0048BA` / `#1E60E2`, sampled PNG fills                                                                               |
| Background / raised surface / inset | `#F9F9FF` / white / `#F1F3FF`, sampled                                                                                 |
| Accent surface                      | `#E0E8FF`, sampled                                                                                                     |
| Strong / secondary / muted text     | `#0D1B33` / `#434654` / `#72747F`, sampled                                                                             |
| Typeface                            | Existing locally licensed Plus Jakarta Sans; PNG typeface identity unverified                                          |
| PROPOSED type                       | Body 14/22; caption 12/16; card 16/24; mobile heading 20/28; desktop heading 32/40                                     |
| PROPOSED spacing                    | 4/8/12/16/20/24/32; mobile gutter 16, tablet 24, desktop 28–32                                                         |
| PROPOSED radius                     | Card 16, button/input 12, dialog 20, badge pill                                                                        |
| PROPOSED structure                  | Mobile header minimum 80, bottom nav 64 + safe area; desktop header 64; sidebar 240 then 288 at 1280; content max 1440 |
| Accessibility                       | Targets at least 44, natural name wrapping, visible focus, semantic controls, reduced motion                           |
| Status                              | Info/warning/success/danger/neutral according to meaning, not viewport                                                 |

Tokens are scoped to `.teacher-redesign-shell` and `.teacher-verification-shell` in `apps/web/src/app/teacher.css`. The existing owl remains the actual logo; mockup portraits and generic math logos are not extracted/recreated. Active accounts use authentic display names and initial avatars.

## Data connection and gaps

All paths below have `/api/v1` prefix. Supabase browser access stays limited to authentication; NestJS enforces domain authorization.

| UI                                                                  | API/query                                                | Status                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| Name/email/account/verified state                                   | GET identity/me / useAuth                                | SUPPORTED                                        |
| Class names, join codes, creation                                   | GET/POST classes / existing clients/query keys           | SUPPORTED                                        |
| Class count                                                         | Full classes.items.length                                | DERIVED                                          |
| Roster and class count                                              | GET classes/{id}/students / full items                   | SUPPORTED / DERIVED                              |
| Total students                                                      | All owned-class roster responses, after all succeed      | DERIVED, later phase                             |
| Latest/best/access/in-progress                                      | GET classes/{id}/students/{studentId}/progress           | SUPPORTED; preserve zero/null                    |
| Feedback text/read/sent history                                     | GET/POST classes/{id}/students/{studentId}/feedback      | SUPPORTED; paginated per student                 |
| Assessment history                                                  | GET classes/{id}/students/{studentId}/assessment-results | SUPPORTED with existing release/ownership checks |
| Copy / QR / QR PNG                                                  | Actual class.joinCode / existing qrcode library          | DERIVED, Phase 3                                 |
| School, NISN/NIP, semester/photo                                    | Not returned in current Teacher DTOs                     | MISSING_BACKEND; do not infer                    |
| Class-wide Tryout metrics/distribution                              | No current Teacher batch projection                      | MISSING_BACKEND                                  |
| Teacher class ranking                                               | Student-only/policy-pending leaderboard API              | MISSING_BACKEND / PRODUCT_DECISION_REQUIRED      |
| Teacher notifications/read-all                                      | Student-only notification API                            | MISSING_BACKEND                                  |
| Class settings/profile edits/preferences                            | No matching Teacher mutation                             | MISSING_BACKEND                                  |
| Global feedback summary/activity feed                               | No complete matching Teacher aggregate API               | MISSING_BACKEND                                  |
| Final XP/stars/mastery/remedial/takeover/ban/capacity/ranking scope | Product OPEN dependencies                                | PRODUCT_DECISION_REQUIRED                        |

The audited Teacher runtime already uses real API classes/rosters/scores; it does not contain mock student arrays or sample aggregate values. Mockup numbers are not production defaults. Failure is not zero, and a partial page of results is not a global count.

## Product conflicts to normalize

**PRD RULE:** Student has at most one class; Drill unlock requires 80%; feedback remains one-way; Tryout score visibility follows released IRT results. Latest Drill/Tryout feature PRDs supersede conflicting v0.5 feature wording.

**OPEN:** XP/star formulas, curriculum mastery/remedial definition, takeover/transfer/archive/ban semantics, official capacity and ranking scope are not resolved by these PNGs.

Remove mockup claims about five classes per student, PRD v0.6, 65/75 thresholds, fixed unapproved question count/duration, perpetual join-code promises, annual credential expiry, plaintext credential reveal, Firebase, automatic live sync, chat/reactions and unsupported export/WhatsApp/2FA/session controls. Counts/percentages must follow actual data; no 32/34 conflict, 26/34=78 error or submission distribution exceeding submitted count is copied.

## Phase boundary and risks

Phase 1 changes only Teacher shell/theme/navigation and retains existing page bodies, API/auth/query contracts and mutations. Kelas/Profil work; Monitoring/Feedback stay disabled until their real pages are added. Notifications has no count/dot or live behavior. Existing Student progress remains accessible through Class Detail.

Phases 2–8: Dashboard; Class Detail/invite/read-only settings; supported monitoring; per-student feedback; honest notification availability; supported profile; responsive/accessibility polish. Each requires separate owner approval after the preceding report. Frontend-only scope cannot fulfill missing backend capabilities.

Protect concurrent changes by checking the working diff before edits, moving only the existing Teacher CSS block and preserving its surroundings. Test TeacherGate/auth/ownership regression, nested navigation, logout recovery, disabled destinations, name wrapping, sidebar/bottom-nav exclusivity and role-scoped tokens. Browser fixtures are verification data only; live seed integration is a separate QA gate.

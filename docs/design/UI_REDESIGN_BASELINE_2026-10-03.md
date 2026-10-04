# NUMORA screenshot redesign — approved implementation baseline

Date: 3 October 2026, Asia/Jakarta. Repository baseline: `d29c352d6acbc86b92b20edccd298d9f9f5a7159`.

**ENGINEERING DECISION — approved by the project owner in this Codex conversation on 3 October 2026:** implement the screenshot-based redesign one phase at a time. This document records the approved plan, not completion of the frontend redesign. Phase 0 changed documentation only; Phase 1 now implements the shared foundation. See [Phase 1 report](UI_REDESIGN_PHASE_1_2026-10-03.md). Review each phase report before beginning the next phase.

## 1. Authority, evidence, and approved decisions

Read [product context](../product/PRODUCT_CONTEXT.md), [OPEN decisions](../product/OPEN_DECISIONS.md), [PRD mapping](../product/PRD_MAPPING.md), [Sprint 2 goal](../development/SPRINT_2_GOAL.md), [project structure](../development/PROJECT_STRUCTURE.md), the [design-system baseline](NUMORA_UI_DESIGN_SYSTEM.md), and [UI workflow](NUMORA_UI_SKILL.md). Relevant contracts include [Core Learning](../api/CORE_LEARNING_FRONTEND_CONTRACT.md), [Student area/PvP](../api/STUDENT_AREA_CONTRACT.md), [Teacher monitoring](../api/TEACHER_MONITORING.md), and [feedback operations](../api/FERDI_FEEDBACK_OPERATIONS.md).

Apply latest PRD to behavior, approved visual references to presentation, valid API behavior to data/authorization, the shared design system to unspecified styling, and existing frontend to functional preservation. [Drill v1.2 / TryOut v1.1 reconciliation](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md) supersedes conflicting v0.5 Core Learning summaries. An implementation gap does not override the PRD and is not silently repaired through visual work.

### Evidence boundary

- Audit covers **21 supplied Student mobile screenshots** and the repository. `Feedback Guru.png` is a Student inbox, not a Teacher monitoring screen.
- Figma source: [UIUX NUMORA](https://www.figma.com/design/LaHB1HQdyVumYcaAEB3TXd/UIUX-NUMORA?node-id=0-1). During the initial audit, the connector required reauthentication and the browser could not access the file. Full-page/frame/component inventory and prototype interaction remain **unverified**.
- PNG canvases are 400–466 px wide and include exterior margins. The visible UI is approximately 390 px wide; **390 px is the comparison baseline**, not a verified original Figma frame size. Exact crop bounds remain to be measured per screen.
- Typography sizes, spacing, radius, and gradient geometry are screenshot-derived implementation estimates. Solid color samples are observations from the PNGs, not extracted Figma variables.
- Current checkout was clean at `2dc6bf6` during the original audit. Phase 0 fast-forwarded the clean branch `feat/ui-updatev3` to remote main `d29c352`; upstream changes affect QA smoke tooling/docs and the root test script, not frontend components or contracts.
- The [asset manifest](UI_REDESIGN_ASSETS_2026-10-03.json) records filenames, dimensions, byte sizes, and SHA-256 fingerprints. Screenshot binaries remain external user attachments, not application assets or committed evidence.

### Approved direction

**ENGINEERING DECISION:** use Plus Jakarta Sans, locally bundled through `next/font/local` with its license; preserve KaTeX math rendering. Phase 0 does not replace the current Inter font.

**ENGINEERING DECISION:** Student bottom navigation is `Belajar` → `/student`, `Materi` → `/student/learn`, `Tryout` → `/student/tryout`, `PvP` → `/student/pvp`, and `Profil` → `/student/profile`. Progres and leaderboard remain reachable from page content and desktop navigation. Nested Drill routes belong to Materi. During active assessment/live battle, use focus navigation instead of the primary bottom nav.

**ENGINEERING DECISION:** Auth, Teacher, Admin, and other screens without supplied screenshots use designs derived from the Student visual language, adapted to the role's task. Do not claim exact Figma fidelity for these screens.

**ENGINEERING DECISION:** add a complete Student feedback inbox using existing list/read APIs in Phase 6b. Do not add backend fields or invent feedback-to-attempt associations.

**OPEN:** final product identity OPEN-06, academic policies, missing original assets, and full-file Figma verification are not resolved by approving this implementation direction.

### Product guardrails

| Classification       | Behavior to preserve                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD RULE             | Student/Teacher Google login; Teacher verification token valid 3×24 hours and single-use; at most one active class per Student                                                                                |
| PRD RULE             | Mandiri can Drill and PvP; joining a class is optional; class leaderboard requires a class                                                                                                                    |
| PRD RULE             | Drill: 10 questions, count-up without pause/deadline, ≥80 unlock, retry failed/completed levels, separate history and highest valid best score; unlock is not retracted                                       |
| OPEN                 | Drill XP formula, star thresholds, retention, exit/session policy, variant fallback, and Pretest placement/eligibility reconciliation                                                                         |
| PRD RULE             | TryOut free for Mandiri and School Students; target official package 35 questions with PG/PGK MCMA/Category; one attempt per package; countdown and auto-submit; result/explanation only after server release |
| OPEN                 | TryOut duration, composition/rubric/scale, past-package eligibility, batch end and low-response/release failure policy                                                                                        |
| PRD RULE             | PvP timing, validity, scoring, transitions, and 20-second reconnect follow server state; PvP points do not contribute to class XP                                                                             |
| ENGINEERING DECISION | Production PvP remains gated by existing availability/policy; test fixtures do not enable it for real accounts                                                                                                |
| PRD RULE             | Class leaderboard uses Drill + TryOut XP; global PvP uses valid best points by difficulty; hourly projection, Wednesday 23:59 WIB archive/reset                                                               |
| ENGINEERING DECISION | NestJS authorizes product data; browser Supabase use remains auth-only; shared/generated API types remain authoritative                                                                                       |

## 2. Screen inventory and consistency audit

### Student screenshot inventory

All rows are Student/mobile. Header, navigation, and component geometry use Section 3 unless a screen-specific pattern below requires a variant. Shared missing states are listed after the table.

| ID / supplied filename                                    | Purpose and visual hierarchy                                                                                                          | Reuse                                                                               | Finding → normalization                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 — Beranda Siswa Numora (Pahamify Style).png           | Purple identity/progress/announcement header; Tryout hero; four features; activity; class podium; teacher note; bottom nav            | Header, hero, FeatureGrid, ActivityRow, podium, FeedbackCard                        | Gem/account level not in DTO; Mandiri/unavailable/empty absent → actual identity and state-specific slots; no decorative product statistics                     |
| S02 — Peta Petualangan Level Drill.png                    | Identity header; breadcrumb; subchapter summary; utility buttons; vertical path; active-level card/sticky CTA; completed/locked nodes | ProgressBar, LevelNode, LevelCard, Button                                           | Overlapping 80% text, duplicate start CTA, unsupported chest/rewards → readable labels and common start handler; no fictitious XP                               |
| S03 — Sesi Latihan Drill Matematika.png                   | White exit/save/timer header; progress; metadata; question/hint; options; doubt/report; question navigator; previous/next             | AssessmentHeader, MathText, QuestionChoices, QuestionNavigator, toolbar             | Check can imply correct; API has no hint → distinct selected state and no answer/hint leak                                                                      |
| S04 — Sesi Latihan - Soal Bergambar (Geometri).png        | Assessment pattern with diagram/media and hint                                                                                        | QuestionCard, media slot, MathText, QuestionChoices                                 | Doubt checkbox mislabeled as topic; media DTO missing → canonical doubt label; diagram content remains a functional gap                                         |
| S05 — Sesi Latihan - PGK MCMA (Multi Jawaban).png         | Multi-answer instruction; checkbox options; lavender selection; navigator                                                             | Existing QuestionChoices MCMA                                                       | Question 4 / active 3 mismatch; generic minimum-two instruction → index from state and instructions from actual content                                         |
| S06 — Salah).png                                          | PGK category stem; statement rows; Benar/Salah selections; navigator                                                                  | Existing QuestionChoices Category                                                   | Category selections look like graded answers → selected is distinct from correctness; no pre-submit grading                                                     |
| S07 — Konfirmasi Kumpul Jawaban Latihan (Modal).png       | Blurred backdrop; dialog; completion summary; submit/back                                                                             | Dialog, stat tiles, Button                                                          | Missing loading/error/unsaved/focus behavior → accessible confirmation preserving finalization guards                                                           |
| S08 — Hasil Latihan Level & Pembahasan.png                | Score/mastery/stars; XP breakdown; answer matrix; selected review; videos; retry/continue                                             | ResultSummary, ProgressBar, AnswerMatrix, ReviewCard, RecommendedVideos, ReportForm | 90/tuntas but nearing-mastery copy; formula/90-day retention OPEN; videos on pass → mastery from API, pending rewards, no retention promise, failed-only videos |
| S09 — Katalog Tryout TKA Numora (Pahamify Style).png      | Purple hero; tabs; package cards; calendar; special-package code                                                                      | Hero, Tabs, TryoutCard, Input                                                       | Duplicate upcoming tab, premium/tickets, unsupported catalogue → current-package states only; no payment/calendar/code feature                                  |
| S10 — Detail Paket Tryout TKA Numora (Pahamify Style).png | Back/header; package/status; time/count; IRT information; subtests; rules; start                                                      | PageHeader, Card, StatCard, disclosure, sticky CTA                                  | 40 questions/80 min/subtests/tab-switch penalty unsupported → server package values; no invented exam enforcement                                               |
| S11 — Buat & Gabung Duel PvP.png                          | Identity/chips/hero; leaderboard/podium; create/join; difficulty; rules                                                               | Hero, Tabs, DifficultyCard, podium                                                  | Hard choice/start missing; class-like podium; +120 XP claim → all difficulties and explicit CTA; actual global PvP points                                       |
| S12 — PvP.png                                             | Join tab of lobby; code/QR entry; rules                                                                                               | LobbyHeader, JoinRoomForm, disclosure                                               | Belajar incorrectly active; six-digit copy conflicts with current validation → active PvP and existing room-code constraints                                    |
| S13 — Ruang Tunggu Duel PvP (Waiting Room).png            | Waiting/difficulty; room code/QR/share; two players; classmates; ready/cancel                                                         | RoomCodeCard, PlayerCard, StudentRow, Button                                        | Wrong title, bot, class-public assumption, five-second auto-start → server readiness; Mandiri share permitted; bot excluded                                     |
| S14 — Scan QR.png                                         | Dark camera stage; scanning guide; detected-room sheet; join/rescan/gallery                                                           | Scanner stage, result sheet                                                         | No scanner implementation; missing permissions/invalid/unsupported states → separate functional gap, no fake scan UI                                            |
| S15 — Live PvP Battle Room (Duel 1v1) - v2.png            | Round/difficulty/forfeit; players/points/timer; question; locked choice; timeline                                                     | MatchHeader, Scoreboard, QuestionChoices, Status                                    | Wrong result title; dominance/streak/opponent timing/round history unavailable; six-win target unsupported → personalized snapshot fields only                  |
| S16 — Hasil Akhir Duel PvP & Leaderboard.png              | Outcome; player scores; bonus/recap; rematch/review/lobby                                                                             | OutcomeCard, Scoreboard, Button                                                     | XP versus points and missing breakdown/rematch/review → actual outcome/points; lobby action; unsupported recap omitted                                          |
| S17 — Leaderboard PvP Duel - Tingkat Mudah.png            | Difficulty tabs; green hero; own rank; podium; rank rows; bottom nav                                                                  | DifficultyTabs, podium, RankRow, OwnRankCard                                        | WR/speed/streak absent; fewer-than-three/self-empty missing → rank/name/points from server                                                                      |
| S18 — Leaderboard PvP Duel - Tingkat Sedang.png           | Purple hero; podium; own-rank CTA; challenger rows                                                                                    | Same ranking primitives                                                             | Mudah active; Top 10/additional records unsupported → active Sedang and top 20 contract                                                                         |
| S19 — Leaderboard PvP Duel - Tingkat Sulit.png            | Warm hero; period/reset card; podium; own rank; compact rows                                                                          | Hero variant, period card, RankRow                                                  | Mudah active; real-time matchmaking/top 100/league/IRT records unsupported → active Sulit; hourly top 20                                                        |
| S20 — Profil Siswa Numora.png                             | Purple header/identity; statistics; Tryout status; settings; logout                                                                   | Avatar, Card, StatCard, ListRow, Input, Button                                      | Currency/account level/accuracy/certificate/edit avatar/help absent → actual identity/progress and working destinations; Mandiri join/error states              |
| S21 — Feedback Guru.png                                   | Header; filter chips; note cards; read badges; actions                                                                                | FeedbackCard, Tabs, Badge, Button                                                   | PvP title and invented question/level/XP associations → Catatan Guru; body/name/time/read-state only                                                            |

### Common missing states and normalization ledger

**ENGINEERING DECISION:** preserve screen composition, but complete missing states using the nearest screenshot's visual language and existing functional guarantees. Do not substitute unrelated legacy layouts.

| Issue / affected screens                                    | Approved normalization                                                                                       | Reason                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Button height/radius/spacing drift across screens           | Shared size/variant tokens; pill only where the composition calls for it                                     | Same action remains recognizable                   |
| Card/input/title/icon drift across screens                  | Shared radii, spacing/type hierarchy, icon dimensions/stroke; feature wrappers reuse primitives              | Prevent duplicated component styles                |
| Bottom-nav labels and active states S01/S02/S11/S12/S17–S21 | Approved five destinations; active from route; no unconditional PROMO badge                                  | Preserve navigation and truthful state             |
| Wrong contextual headers S13/S15/S21                        | Ruang Tunggu / Duel Berlangsung / Catatan Guru; Hasil Duel only after completion                             | Indicate current task                              |
| Difficulty selection S18/S19                                | Active difficulty follows query/state                                                                        | Avoid selected/data mismatch                       |
| Selected/locked/correct ambiguity S03–S06/S15               | Separate selection from server acknowledgement/lock and post-submit correctness                              | Prevent answer-key inference and false save claims |
| Missing interactive states on all screens                   | Default, hover, focus-visible, active/pressed, disabled, loading, success, error                             | Complete keyboard/touch/async behavior             |
| Missing data states on all applicable screens               | Loading, empty, network/server error, forbidden, session expired, unavailable; preserve retry/back/login     | Respect auth/data boundaries                       |
| Missing lifecycle variants S02–S10/S13–S19                  | Locked, in-progress, completed; saved/unsaved; IRT waiting/released; reconnect/forfeit/cancel; policyPending | Backend remains authority                          |
| Duplicate start CTA S02                                     | Same level, callback, and pending state; no second attempt request                                           | Preserve start idempotency                         |
| Large blank regions in PNGs                                 | Content-driven page height and sticky controls with reserved space                                           | Screenshot export height is not layout policy      |
| Small controls/pale text across screens                     | ≥44 px touch area, readable contrast, non-color status cues                                                  | Accessibility survives fidelity work               |
| Class podium versus PvP S01/S11/S17–S19                     | Shared podium visual; separate scope/unit/query and policy gates                                             | Avoid mixing academic activity and PvP records     |
| Unsupported metrics/rewards/actions across screens          | Omit unsupported claims; show pending only when appropriate to the actual policy/data                        | No fictitious business values or dead CTA          |

Keep distinct difficulty hero/podium compositions where the references differ intentionally; normalize their primitives, not all layouts into one generic screen. S11 and S12 are the create and join states of one lobby.

## 3. Canonical visual tokens and responsive behavior

**ENGINEERING DECISION:** the owner approved the following canonical implementation direction. Estimated dimensions remain replaceable after exact Figma verification; approval is not evidence of measured Figma metadata.

| Element                    | Target / evidence                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Primary / strong selected  | `#722CCE` / `#5900B1`; observed in PNGs                                                                                          |
| Main page / raised surface | Ivory `#F6EFCD` / white `#FFFFFF`; observed                                                                                      |
| Lavender roles             | `#F7E9FF` chip, `#FBF0FF` secondary surface, `#F4E2FF` selected surface; observed, with semantic aliases                         |
| Text                       | `#2F213D` main, `#231531` strong, `#675B72` muted; observed; contrast verified during implementation                             |
| Status/accent              | Success `#2F8F6B`; peach `#FA9A71`; gold `#F8D080`; danger/warning baseline with contrast checks                                 |
| Font                       | Plus Jakarta Sans locally bundled; KaTeX unchanged; font choice confirmed by owner, not inferred from PNG                        |
| Type sizes                 | Hero 28–32, page/section 20–22, card 16–18, body 14, question 16–18, caption 12 px; estimates                                    |
| Type weight/leading        | 400/500/600/700/800; body 1.5–1.65, heading 1.25–1.35; estimates                                                                 |
| Spacing                    | 4 px grid; mobile gutter 16; card padding 16–20; section gap 16–24; compact gap 8–12; estimates                                  |
| Radius                     | Controls 12–14, main card 20, hero/dialog 24, pill full; estimates                                                               |
| Buttons/inputs             | Minimum 44 px hit area; primary purple, secondary lavender, ghost/lightweight, outlined danger where needed; labeled inputs      |
| Cards                      | White/semantic surface; light shadow/border; nested rows do not all get shadows                                                  |
| Header variants            | Purple identity, purple contextual, white assessment with save/timer/progress                                                    |
| Bottom navigation          | Five columns, baseline 64 px plus safe area; icon ~24, label 12; active purple; estimates                                        |
| Badge/progress             | Compact readable badge with non-color cue; lavender track; value/label from data; 80 marker only for appropriate mastery context |
| Icon/states                | Existing Icon at canonical 20/24 px, consistent stroke; Skeleton/EmptyState/DataState/Status reused                              |

Canonical values belong in `packages/ui/src/tokens.css`; global primitive styles in `apps/web/src/app/globals.css`; composition in `apps/web/src/app/numora.css` and feature styles. Do not repeat HEX values or common geometry in feature components. Extend existing variants without a parallel design library.

### Responsive composition

- **Mobile ≤699 px:** one column in screenshot section order; full-width header; guttered cards; sticky CTA/navigation with content and safe-area space. Question navigator may scroll inside its component, never the whole body. Level order/access comes from the server; path decoration is not authorization.
- **Tablet 700–959 px:** existing composition breakpoint; dashboard main/context if space permits; 2–3 catalog columns; level map remains controlled width with a context panel. Assessment keeps a readable single column; side navigator only when it fits. Student bottom nav remains; Teacher/Admin retain mobile navigation.
- **Desktop ≥960 px:** existing sidebar 210/232 px; container around 1180; form around 480; assessment reading column around 680; context panel around 280–320 px. Dashboard, profile, lobby, waiting, and leaderboard use main/context composition; Teacher/Admin increase list/table density. Existing 1200/1440 density adjustments remain. Do not add a second breakpoint system; existing shared token padding breakpoints are not a new composition system.
- **Verification widths:** 320, 360, 390 reference, 393, 430, 768, 1024, 1280, 1440. No body overflow, hidden controls, or text shrinkage to force screenshot height.

### Asset rules

Use the [manifest](UI_REDESIGN_ASSETS_2026-10-03.json). Ten PNG assets exist under `apps/web/public/figma`; only the owl currently has source callsites in Login and Home. Their presence does not establish exact matches to the new screenshot slots.

Before reuse, inspect artwork, slot/layer position, aspect ratio, and rendered geometry. Preserve original artwork; do not redraw available originals, use a whole screenshot as a page, or crop decorative content out of screenshots. Missing illustrations/icons are reported deviations; obtain original assets when available. Dynamic avatars use authorized data or initials; reference portraits do not become product fixtures. No asset download, image change, or font replacement happens in Phase 0.

## 4. Screenshot-to-code mapping

Routes are existing unless explicitly marked planned/missing. Feature names below resolve under `apps/web/src/features/`; shared shell under `apps/web/src/components/shell/`; primitives under `packages/ui/src/`. Status describes the planned action, not completion.

| Reference                                | Route                                               | Feature / shared components                                                          | Status                | Action                                                                    |
| ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------- |
| S01 Home                                 | `/student`                                          | core-learning/dashboard.tsx re-exports NewStudentDashboard; Card/Badge/SectionHeader | RECOMPOSE             | Hero → features → activity → podium → feedback; preserve queries          |
| Derived chapter catalog                  | `/student/learn`                                    | CatalogScreen, ChapterCard/Input                                                     | RECOMPOSE             | Student card/list language, actual catalog/search                         |
| Derived subchapter list                  | `/student/learn/[chapterId]`                        | ChapterScreen, Badge/list composition                                                | RECOMPOSE             | Keep chapter hierarchy/order and back link                                |
| S02 levels                               | `/student/learn/[chapterId]/[subchapterId]`         | SubchapterScreen, Card/ProgressBar/Button                                            | REFACTOR PRESENTATION | Mobile level path; preserve start and all statuses                        |
| S03 PG Drill                             | `/student/drill/[attemptId]`                        | DrillScreen, AssessmentSession/MathText                                              | REFACTOR PRESENTATION | Separate header/question/navigator/toolbar from save/submit orchestration |
| S04 image question                       | Same Drill route; no active media DTO               | AssessmentSession/media slot                                                         | FUNCTIONAL GAP        | No diagram attached without actual content contract                       |
| S05/S06 PGK                              | No runtime answer wiring                            | Existing QuestionChoices                                                             | FUNCTIONAL GAP        | Restyle existing renderer; contract integration separate                  |
| S07 submit modal                         | Drill/TryOut session state                          | AssessmentSession currently window.confirm                                           | REFACTOR PRESENTATION | Accessible dialog, same finalization guards                               |
| S08 result                               | `/student/drill/[attemptId]/result`                 | ResultScreen/ResultSummary/RecommendedVideos/ReportForm                              | RECOMPOSE             | Summary/matrix/review/retry/continue; API-driven video/state              |
| S09 catalog                              | `/student/tryout`                                   | TryoutScreen/CurrentTryout                                                           | RECOMPOSE             | Current-package capability; no payment/upcoming fiction                   |
| S10 detail                               | Existing state inside `/student/tryout`             | CurrentTryout detail/rules                                                           | RECOMPOSE             | Detail screen state on same route; rules acceptance preserved             |
| Derived TryOut attempt                   | `/student/tryout/[attemptId]`                       | TryoutAttemptScreen/AssessmentSession                                                | REFACTOR PRESENTATION | Assessment visual with existing countdown                                 |
| Derived TryOut waiting/result            | `/student/tryout/[attemptId]/result`                | TryoutResultScreen                                                                   | RESTYLE               | Submitted/pending/released and failures distinct                          |
| Derived progress/history                 | `/student/assessment`                               | AssessmentScreen/ActivityRow/ProgressSummary                                         | RECOMPOSE             | Actual progress and cursor pagination                                     |
| S11/S12 lobby                            | `/student/pvp`                                      | PvpScreen/usePvpSocket                                                               | RECOMPOSE             | Create/join tabs; existing code validation and availability               |
| S13 waiting                              | `/student/pvp/[matchId]`                            | PvpMatchScreen WAITING/READY                                                         | REFACTOR PRESENTATION | Readiness, share/QR, classmates, leave preserved                          |
| S15 live                                 | Same match route                                    | PvpMatchScreen RUNNING                                                               | REFACTOR PRESENTATION | Scoreboard/question/lock from personalized server snapshot                |
| S16 outcome                              | Same match route                                    | PvpMatchScreen FINISHED/CANCELLED                                                    | RECOMPOSE             | Actual result/points; no unsupported recap/rematch                        |
| S14 scanner                              | No route or scanner                                 | QR generation exists, scanning does not                                              | FUNCTIONAL GAP        | Separate capability; code/link join remains                               |
| S17/S18/S19 ranking                      | `/student/leaderboards`                             | LeaderboardsScreen difficulty state                                                  | RECOMPOSE             | Hero variants, podium, own rank, rows; preserve contract                  |
| S01 class podium / derived class ranking | `/student/leaderboards?tab=class`, Home composition | LeaderboardsScreen                                                                   | RECOMPOSE             | Class authorization and policyPending preserved                           |
| S20 profile/settings                     | `/student/profile`                                  | ProfileScreen/Input/Button/ListRow                                                   | RECOMPOSE             | Actual identity; optional Join Class; logout                              |
| S21 inbox                                | `/student/feedback`; linked Home preview            | FeedbackOverview + existing list/read DTOs                                           | MISSING UI            | Implemented Phase 6b; existing list/read contract                         |
| Derived Auth                             | `/`, `/auth/callback`, `/onboarding`                | onboarding/screens, AuthProvider                                                     | RESTYLE               | Google/session/destination preserved                                      |
| Derived verification                     | `/teacher/verification-required`                    | TeacherVerificationScreen                                                            | RESTYLE               | School/select/token/status, case preserved                                |
| Derived class/create                     | `/teacher`                                          | TeacherDashboardScreen/TeacherShell                                                  | RECOMPOSE             | Existing creation form and class cards                                    |
| Derived students                         | `/teacher/classes/[classId]`                        | ClassStudentsScreen                                                                  | RESTYLE               | Existing student rows/search                                              |
| Derived progress                         | `/teacher/classes/[classId]/students/[studentId]`   | StudentProgressScreen                                                                | RECOMPOSE             | Owned-class latest/best/status, read-only                                 |
| Derived Teacher account                  | `/teacher/profile`                                  | TeacherProfileScreen                                                                 | RESTYLE               | Shared account patterns                                                   |
| Derived school/token operations          | `/admin`, `/admin/schools`                          | AdminSchoolsScreen/AppShell                                                          | RESTYLE               | Preserve redirect and all operations                                      |
| Derived workbench                        | `/admin/content`                                    | AdminContentScreen                                                                   | RESTYLE               | All current panels/actions, not just initial tab                          |
| Internal preview/QA                      | `/admin/preview`, `/qa/login`                       | Existing gated pages                                                                 | KEEP                  | Maintain gating and smoke after shared changes                            |
| Pretest/standalone settings              | No complete Pretest route; settings in Profile      | No complete runtime flow                                                             | FUNCTIONAL GAP        | Do not introduce feature or destination from decorative reference         |
| Bot/certificates/premium/top 100         | Not available                                       | No matching capability                                                               | OUT OF SCOPE          | No new feature or fake CTA                                                |

Legacy `/demo/student`, `/demo/pvp`, and `/demo/leaderboards` routes were removed and must remain 404. Historical Figma node IDs in earlier documentation are not newly verified frames.

### New frontend interface and state policy

**ENGINEERING DECISION:** only the planned inbox adds a production route (`/student/feedback`). Other referenced lifecycle screens remain presentation states of existing routes. Extend shell/header/nav props backward-compatibly; presentational components receive data/callbacks while current feature controllers retain query/mutation ownership. Do not rewrite API clients, auth, protocol, or domain services for presentation.

For Phase 6b, reuse generated FeedbackListDto/FeedbackSummaryDto/ReadFeedbackDto. GET list with offset/limit, keep nextOffset pagination, and POST read only after an explicit action. Preview never marks read. Invalidate/update inbox and summary after server acknowledgement; keep read failure retryable, preserve first readAt from server, and discard account data on identity change.

Inbox tabs: all loaded notes and unread among loaded notes, with global unread badge from summary. No fictitious total-count badge. Keep Load More available while nextOffset exists, including when the loaded unread subset is empty; explain that only loaded notes were filtered. Do not show global-empty copy until pagination is exhausted. No Drill/TryOut filters or Soal/Level/+XP links: existing DTO has no structured association. Do not parse note body to infer one.

Assessment doubt markers are presentation-only during the mounted session, without score or answer-payload effects and without claiming cross-refresh persistence. Manual confirmation uses existing save/finalization protection; TryOut deadline auto-submit bypasses confirmation. An exit dialog does not create an abandon mutation or change unresolved session consequences.

## 5. Functional risk and component plan

### Functional safety and regression

All endpoint paths retain `/api/v1`. API/DB/contracts/scoring/authorization/PvP protocol/worker/outbox changes are outside this redesign.

| Area           | Preserve                                                                                                       | Risk and regression                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Shell/Auth     | AuthProvider, StudentAccess/TeacherGate, destination, identity/register/Google/logout, per-account QueryClient | Cross-role direct URLs, signed-out loading, account switch/late response, logout, nested active route                              |
| Home           | learningApi.dashboard/catalog/currentTryout, feedback summary, existing query keys                             | Mandiri/School, score 0 vs null, active Drill, pending/unavailable package, independent card errors                                |
| Catalog/levels | catalog/chapter/subchapter/start                                                                               | Server order/dynamic level count, locked rejection, resume, completed retry, duplicate start                                       |
| Drill session  | attempt/saveAnswer/submit/result, ACK check, unsaved warning                                                   | Offline/failed save/retry, clear, refresh/resume, ACK mismatch, no false Saved, duplicate finalization, count-up                   |
| Result/support | mastered/unlockedLevelId from server, videos/reports, historical result                                        | 80 threshold at backend, stars/XP pending, expired explanation, zero score, failed-only ≤3 videos, retryable report                |
| TryOut         | current/start/attempt/save/submit/result, deadline hook/polling                                                | Free Mandiri start/resume, one attempt, countdown reload, manual/auto race, lost ACK recovery, pending vs released result          |
| PvP            | availability/matches/classmates/invitations; socket commands/requestId/ACK                                     | No production bypass; readiness, selected vs locked, uncertain ACK retry, server timer, reconnect 20 s, forfeit/cancel             |
| Ranking        | student-leaderboard query key; class/PvP difficulty endpoints                                                  | Class-required, policyPending hides provisional rows, points/XP separation, <3 players, own rank outside top 20, server order/ties |
| Profile        | joinClass, identity refresh/query invalidation, logout                                                         | Invalid code leaves affiliation unchanged, one-class restriction, success survives reauth, optional Mandiri join, logout failure   |
| Inbox          | Existing list/summary/read endpoints                                                                           | Pagination and empty-loaded subset, explicit read/duplicate retry, summary invalidation, account isolation                         |
| Teacher        | getTeacherClasses/createTeacherClass/getClassStudents/getTeacherStudentProgress                                | Class creation/join code, score 0, latest vs best, forbidden foreign class/student, read-only progress                             |
| Admin          | School/token APIs and loadAdminWorkbench/mutations                                                             | Existing content/package/report/IRT panels, token lifecycle/case, unauthorized route, historical version preservation              |

### Canonical component map

| Action                  | Components                                                                       | Implementation direction                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| KEEP                    | AuthProvider/gates/API clients/generated types/MathText/timer/finalization hooks | Functional authority and data boundaries preserved                                                  |
| EXTEND                  | Button/IconButton                                                                | Lavender secondary, outlined danger where needed, token sizes and full interaction/async states     |
| EXTEND                  | Card/Badge/StatusBadge/Input/Textarea/Select                                     | Semantic variants, canonical geometry/label/error treatment                                         |
| EXTEND                  | ProgressBar/ProgressRing/StatCard/Skeleton/EmptyState                            | Shared layout/state, no business calculations                                                       |
| EXTEND                  | Avatar/ListRow/SectionHeader/PageHeader/GreetingHeader/FeatureGrid               | Recompose available primitives                                                                      |
| REFACTOR                | AppShell/StudentLayout/TeacherShell/TopBar                                       | Identity/context/assessment variants; role navigation/focus behavior                                |
| REFACTOR                | BottomNav                                                                        | Link-render slot keeps Next Link in app; href/current/badge work; migrate duplicate AppShell markup |
| REFACTOR                | AssessmentSession/QuestionChoices                                                | Extract presentation while preserving save/ACK/finalization; PGK runtime remains contract-dependent |
| REFACTOR                | DataState/Status/ReportForm                                                      | Shared status/dialog language and existing handlers                                                 |
| CREATE                  | Dialog                                                                           | Semantic dialog, focus trap/restore, Escape and pending/error behavior                              |
| CREATE                  | Tabs/SegmentedControl                                                            | One shared selection primitive rather than feature copies                                           |
| CREATE near learning    | LevelPath/QuestionNavigator/AssessmentToolbar/AnswerMatrix                       | Feature composition, not new domain rules                                                           |
| CREATE near ranking/PvP | LeaderboardPodium/RankRow/DifficultyCard/PlayerCard/Scoreboard                   | Scope-correct data through shared primitives                                                        |
| CREATE near feedback    | FeedbackInbox/FeedbackCard                                                       | Existing contracts; reusable Home preview                                                           |
| REMOVE after migration  | Duplicate button/card/nav styles                                                 | Remove only after callsites migrate and regression passes                                           |

At Phase 0, shared BottomNav rendered buttons without routing/active wiring; AppShell had working links. Phase 1 replaces this incomplete primitive with real anchors and a Next Link adapter. Consolidation must preserve these links rather than switch to the incomplete primitive. Current QuestionChoices supports local PGK presentation but is not connected to API answer DTOs. Panel/PrimaryButton wrappers may remain while used; no massive cleanup or duplicate UI library.

## 6. Phases, verification, and progress ledger

### Approved sequence

| Phase | Deliverable                                                                                                                            | Status                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 0     | Persist this audit, mapping, token direction, gaps, asset manifest, decisions, and phase gates; documentation only                     | Completed; approved to proceed to Phase 1        |
| 1     | Local Plus Jakarta Sans + license; tokens/primitives/states/Dialog/Tabs; shell/header/navigation; all-role smoke                       | Completed; approved to proceed to Phase 2        |
| 2     | Student identity header/Home: actual TryOut hero, features, activity, podium states, feedback preview                                  | Completed; approved to proceed to Phase 3        |
| 3     | 3a catalog/subchapter; 3b level path; 3c PG Drill/navigator/confirm; 3d result/review/video/report; isolated existing PGK presentation | Completed; approved to proceed to Phase 4        |
| 4     | Current TryOut catalog/detail/rules, attempt/countdown, submission/waiting/released, progress/history                                  | Completed; approved to proceed to Phase 5        |
| 5     | 5a lobby; 5b waiting; 5c live; 5d outcome; 5e difficulty/class ranking; preserve production gate                                       | Completed; approved to proceed to Phase 6        |
| 6     | 6a Profile/Join Class/logout; 6b complete feedback inbox/list/read/pagination                                                          | Completed; approved to proceed to Phase 7        |
| 7     | Derived Teacher verification, class/create, students, progress, profile                                                                | Completed; approved to proceed to Phase 8        |
| 8     | Derived Auth/callback/onboarding alignment; existing session/destination behavior                                                      | Completed; approved to proceed to Phase 9        |
| 9     | Derived Admin school/token and all existing workbench panels                                                                           | Completed; approved to proceed to Phase 10       |
| 10    | Full viewport/accessibility/browser regression, screenshot evidence and final deviations                                               | Completed verification; ready for team PR review |

Do not reorder or start another phase until reporting the completed phase and receiving the owner's review. If contracts evolve upstream, refresh mapping before the affected phase; record functional gaps separately, never expand backend scope through a CSS task.

### Visual verification for each implemented screen

1. Use test-only data matching reference content length, item count, selected/locked/lifecycle state. Production uses actual backend values, never reference statistics.
2. Compare at 390 px against the UI region of the supplied PNG; record crop bounds and exclude export margins/system status-bar decoration.
3. Capture browser screenshot; use overlay/diff and inspect geometry, wrapping, typography, spacing, color, radius, icon, header/navigation, vertical rhythm, and every asset slot.
4. Fix in-scope mismatches before the next screen; report deviations caused by PRD, missing data/asset, accessibility, or screenshot uncertainty. A pixel-diff percentage alone is not fidelity acceptance.
5. Verify all listed widths; after each phase provide at least mobile 390 and desktop 1440 evidence for changed screens, plus checks at the other widths.
6. Use synthetic identities; no credential-bearing trace, screenshots, storage states, or student PII. Connected E2E evidence restrictions remain in force.

### Functional checks and acceptance

For runtime phases use the repository's required Node 24/pnpm 12 toolchain. Run lint, typecheck, relevant unit/web tests, affected browser/E2E and production build; record failures/limitations rather than declaring completion from build alone. Do not generate contracts or migrate schema as part of visual checks. Reuse existing tests and add meaningful coverage only for changed behavior, such as accessible dialogs/nav or the new inbox.

- Student: login → Home → learning → Drill → stored result → Profile → logout.
- Mandiri: Drill and policy-gated PvP/global ranking remain available; TryOut free; no forced Join Class.
- School: join and identity/cache refresh → Drill → TryOut state → class ranking.
- Teacher: login → verify → create/list class → owned students/progress → Profile → logout.
- Admin: school/token and all existing workbench operations/route guards.
- Session/async: offline save, stale response, retry, duplicate submit, refresh, account switch, 0 vs null, IRT pending/released, no provisional rewards.
- Accessibility: semantic links/buttons, keyboard, visible focus, input labels, dialog focus restoration, ≥44 px touch targets, readable contrast, reduced motion/text reflow, no page overflow.

Existing e2e/student.spec.ts covers 320/360/390/768/1440 and role/assessment workflows; add 393/430/1024/1280 coverage as the relevant screens are migrated. Connected E2E is separate evidence for real API/persistence; intercepted browser tests do not prove Google OAuth or real-server authorization.

### Phase 0 report and test provenance

Files authored: this baseline, the asset manifest, and the design README index. No frontend screen, font, token, API, migration, or behavior is implemented by Phase 0. Therefore new implementation screenshots and runtime visual deviations are not applicable; retain the original references in the manifest for subsequent comparison.

The original audit at `2dc6bf6` ran local Vitest: **13 files / 80 tests passed**. This is historical baseline evidence, not a new run at `d29c352` and not evidence that redesigned screens passed. Global pnpm 11.19.0 did not satisfy the repository's pnpm 12 requirement; no install was changed. Phase 0 validation is documentation formatting, links, manifest completeness/hashes/dimensions, and diff scope. Runtime lint/typecheck/build/browser tests are not rerun for documentation-only edits.

| Phase 0 check                                            | Result                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Prettier check of the three authored documentation files | Passed                                                                                                                   |
| Local Markdown links in this baseline and README         | 22 links resolve                                                                                                         |
| Screenshot inventory                                     | 21 unique screen rows and filenames; each matches a supplied file                                                        |
| Manifest fingerprints and byte sizes                     | 33 entries verified: 21 screenshots, 10 repository PNGs, 2 existing font/license files                                   |
| Manifest image dimensions                                | All 31 PNG dimensions verified                                                                                           |
| Git whitespace/scope                                     | git diff --check passed; only the three design documentation files are modified/untracked after upstream synchronization |

### Remaining gaps and review checklist

- Full-file Figma pages/components/prototype and original frame dimensions remain unverified; no complete Figma-audit claim.
- Original static assets/exact icon matches are not supplied; manifest distinguishes existing files from verified matches.
- PGK runtime/media payload, full past/upcoming TryOut catalog, Pretest, QR camera/gallery scanner, bot, PvP recap/rematch/review, certificate/premium/top-100 data remain gaps or out of scope.
- Production PvP, leaderboard reward policies, and the academic/session OPEN items remain open; no fixture activation or policy changes.
- The phase report must list: files changed, screens implemented, visual deviations, functionality preserved, test results, remaining issues, and mobile/desktop screenshots where applicable.
- Phase 5 PvP/Leaderboard is implemented after owner approval to continue from Phase 4; see the [Phase 5 report](UI_REDESIGN_PHASE_5_2026-10-04.md). The owner also explicitly authorized additive Supabase DEMO question/answer seeding, without schema or policy changes. Phase 6 Profile/Settings/Feedback is implemented after owner approval; see the [Phase 6 report](UI_REDESIGN_PHASE_6_2026-10-04.md). The owner approved continuing from Phase 6 to Phase 7 Teacher; see the [Phase 7 report](UI_REDESIGN_PHASE_7_2026-10-04.md). The owner approved continuing from Phase 7 to Phase 8 Auth/callback/onboarding; see the [Phase 8 report](UI_REDESIGN_PHASE_8_2026-10-04.md). The owner approved continuing from Phase 8 to Phase 9 Admin; see the [Phase 9 report](UI_REDESIGN_PHASE_9_2026-10-04.md). The owner subsequently authorized final verification and add/commit/PR publication of all phases; see the [Phase 10 handoff](UI_REDESIGN_PHASE_10_2026-10-04.md) and [portable gallery](screenshots/redesign/README.md). This does not authorize automatic merge/deployment or product-policy changes.

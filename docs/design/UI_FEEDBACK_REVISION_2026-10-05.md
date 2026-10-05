# UI feedback revision — 5 October 2026

Review source: the owner-supplied 26-page [feedback UI UX.pdf](<D:/D;Download/feedback UI UX.pdf>), including image annotations, and the subsequently approved implementation plan.

## Approved decisions

**ENGINEERING DECISION — approved by the project owner, 5 October 2026:** apply the reviewed 26-page `feedback UI UX.pdf` to the existing frontend/API capabilities. Student keeps Drill progress, three Home shortcuts (Latihan Soal / Tryout / PvP), and the existing notification inbox. Remove only the unavailable Pretest shortcut, not the product requirement. Preserve the three PvP arena themes and leaderboard link. Teacher navigation contains only Kelas and Profil; monitoring and feedback require a selected class/student. Hide read receipts from Teacher presentation; keep Student unread/read behavior and durable records.

**PRD RULE:** Drill unlock remains server-owned at 80, scores/history remain versioned, class XP and best PvP points remain separate, and Teachers may access only their owned Classes. The revision does not activate pending XP/star/PvP policies.

**OPEN / deferred:** Teacher rename, leave/takeover, new Tryout sharing/banner, intervention algorithms and unsupported notification capabilities. Preserve stored class names verbatim. No database, generated-contract or endpoint changes are part of this revision.

## PDF reconciliation

| PDF pages | Revision / existing compliant behavior                                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Feedback dari Guru; affiliation in identity text; explicitly labelled Drill-level progress. Diamond/account XP levels already absent.                                                                      |
| 2         | Remove Pretest shortcut; Latihan Soal; keep Simulasi TKA and rank/XP-only class podium.                                                                                                                    |
| 3–4, 7    | Consistent navigation, assessment context and disclosure arrows; remove subchapter threshold and score/rank shortcuts; enlarge actual result stars. Keep score-80 guidance on individual levels.           |
| 4         | Star requirement, speed formula and DRL-05 already absent; no clickable-looking reward total or invented rewards.                                                                                          |
| 5–10      | Keep QR room URLs and leaderboard button; label code joining accurately; tidy PvP layout. Online/streak badges, camera scanner and PvP explanations already absent.                                        |
| 11        | Keep arena colors, standardize leaderboard section order and responsive geometry.                                                                                                                          |
| 12–16     | Compact Teacher identity; explicitly owned-Class student count; remove global monitoring/feedback shortcuts. Preserve stored class names. Fabricated class tags and completion percentages already absent. |
| 17–19     | Class roster and invite; individual progress/history/feedback; remove redundant settings/monitoring actions and cohort academic summaries.                                                                 |
| 20–21     | Remove Teacher notifications and read-receipt presentation. No school/global Teacher leaderboard. Student inbox remains.                                                                                   |
| 22–23     | Remove redundant read-only settings UI; old settings URLs redirect to Class. No curriculum/requirement toggles or backup takeover key. Rename/takeover deferred.                                           |
| 24–26     | Contextual text-only feedback, no read metrics, reactions, automatic interventions or video attachments. Credential-expiry UI already absent; school verification remains unchanged.                       |

## Route compatibility

- `/teacher/monitoring?classId=…` redirects to that Class; no class ID redirects to `/teacher`.
- `/teacher/classes/[classId]/settings` redirects to that Class.
- `/teacher/feedback` requires both class and student IDs; missing context redirects to `/teacher`. Authorization and recipient validation precede the composer.
- `/teacher/notifications` is removed (404). Student notification routes remain available.
- Class invite pages and desktop invite dialog remain functional.

## Verification

- Web component/regression suite: **23 files, 153 tests passed** (`corepack pnpm --filter @tka/web test --maxWorkers=1 --testTimeout=20000`). One worker and a longer per-test limit accommodate a busy Windows host; assertions are unchanged.
- Root lint and typecheck: passed, including all 12 Turbo typecheck tasks.
- Final root build: all 9 tasks passed (8 cached, web rebuilt). A separate production build with isolated fake API/auth configuration was used for the broader E2E run (`.next-e2e`, webpack, one build worker).
- Browser/E2E: **153 distinct cases verified** across appropriate environments: 129 production cases, all 23 final Teacher cases in development, and the one development-only Admin-preview case. The broad production run initially had two failures: the correctly unavailable development preview, and an obsolete Teacher welcome-heading assertion. Both were validated again in development; the Teacher assertion now checks the compact header and Kelas saya. The final 23-case Teacher rerun also verifies equal metric-card geometry.
- Fresh visual review at **320, 390, 768, 1280 and 1440 px**: Home, Student feedback, actual/pending stars, subchapter progress, PvP/arena ordering, Teacher classes, roster, student progress/history and feedback. Stored long class names wrap; zero scores remain zero; no horizontal overflow was observed in the captured screens. Keyboard/focus, dialog trapping/restore, reduced motion, breakpoint navigation, pagination, delivery retry, 401/403/404 and loading/empty states passed the existing browser checks.
- Targeted Prettier checks and `git diff --check`: passed.

The [fresh gallery](screenshots/ui-feedback-revision/README.md) contains **60 screenshots and 8 contact sheets**; [verification.json](screenshots/ui-feedback-revision/verification.json) records the unique browser-case rollup. Full-page screenshots retain fixed navigation at its viewport position; the gallery explains this capture behavior.

Browser checks use synthetic HTTP/WebSocket responses and auth sessions. They verify presentation, recipient/context routing, retry/idempotency behavior, ownership-denied UI and responsive interaction. They do not claim connected backend/database authorization QA or academic approval. Existing backend/API contracts and database changes in the workspace predate this revision and are preserved.

## Acceptance checklist

- [x] Student labels, text affiliation, three Home shortcuts and Drill-only progress.
- [x] Subchapter summary/shortcuts simplified; individual level-80 guidance retained.
- [x] Actual stars enlarged; absent rewards remain pending; scores/XP are ordinary information.
- [x] Code-only PvP join label; existing QR URLs and leaderboard link retained; all arena themes share section order.
- [x] Teacher navigation Kelas / Profil; compact contextual headers; owned-Class count and roster only.
- [x] Individual progress/latest/best scores and history precede contextual feedback; no recipient reselection or Teacher read receipts.
- [x] Old monitoring/settings redirect; missing feedback context returns to Classes; Teacher notifications removed; invite remains.
- [x] No API/DTO/migration/stored-data change or OPEN-policy resolution in this revision; preexisting local changes preserved.

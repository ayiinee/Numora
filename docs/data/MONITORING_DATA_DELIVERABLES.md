# Monitoring data deliverables

**Status:** Data-team handoff artifact. The JSON is synthetic presentation/test input, not a database seed or product contract. Query notes describe server-side data access; the browser must use the API rather than query PostgreSQL directly.

## 1. Demo fixture

Fixture: [monitoring.json](monitoring/monitoring.json)

The fixture covers the monitoring states needed for a walkthrough:

| Demo student | Expected monitoring case | Data interpretation |
|---|---|---|
| DEMO Siswa 1 | 80% completed | Level 2 has a progress/access record, consistent with the approved Drill unlock baseline. This is not an academic “Tuntas” classification. |
| DEMO Siswa 2 | Latest 60, best 70 | Two completed attempts; Level 2 remains without a progress record. |
| DEMO Siswa 3 | No attempt | `latestDrillScore` is `null`; the first READY Level is open by baseline. |
| DEMO Siswa 4 | In progress | An `IN_PROGRESS` attempt exists; no completed score is reported. |

All fixture users, schools, classes, attempts, feedback, and timestamps are synthetic DEMO data. No Auth credentials or real student PII are included. The JSON remains presentation input with its own synthetic IDs; the localhost seed independently inserts and verifies two equivalent feedback rows. Report examples remain illustrative, not persisted rows.

## 2. Dashboard query inventory

These are **server-side query requirements** aligned with the current Monitoring API and schema, not permission for frontend direct database access. Parameters such as `:teacher_id`, `:class_id`, and `:student_id` must come from authenticated/validated request context.

| ID | Purpose / grain | Sources and required conditions | Returned data / notes |
|---|---|---|---|
| Q1 | Teacher class list; one row per active owned class | `classes` JOIN active `teacher_school_memberships` on teacher and school JOIN active `schools`; filter `classes.teacher_user_id = :teacher_id`, `archived_at IS NULL`, membership `ended_at IS NULL`, school `status = 'ACTIVE'` | Class `id`, `name`, `join_code`; teacher role and verification are checked before query. |
| Q2 | Class roster; one row per active student membership | `class_memberships` JOIN `users`; filter `class_id = :class_id`, membership `left_at IS NULL`, `users.role = 'STUDENT'`. First authorize that class is not archived, belongs to `:teacher_id`, and its school membership is active. | Student `id`, `display_name` only; do not return email. |
| Q3 | Student monitoring detail; one row per ready level | `levels` JOIN `subchapters` JOIN `chapters`; require all three `status = 'READY'`; order by chapter/subchapter `display_order`, then `levels.level_number`. | Level and hierarchy IDs/labels/order. The canonical schema has no `published_at` or level `sort_order`; READY is the current API filter, not a claim that taxonomy is final. |
| Q4 | Student progress; at most one row per student and level | `level_progress`; filter `student_id = :student_id`; join in memory/API by `level_id` to Q3 results. | `latest_score`, `best_score`, `unlocked_at`, `completed_at`. `completion_attempt_id` and `unlocking_attempt_id` record lineage; there is no `latest_attempt_id` column. `0` is a score; `NULL` means no score. The API treats Level 1 as open by baseline and later levels as open only when `unlocked_at` is set. |
| Q5 | Active Drill state; zero or more active attempts per student | `assessment_attempts`; filter `student_id = :student_id`, `assessment_type = 'DRILL'`, and `status = 'IN_PROGRESS'`; collect `level_id_at_start`. | Per-level `inProgress`. A partial unique index allows at most one active Drill attempt per student/level. |
| Q6 | Overall latest graded Drill score; zero or one row per student | `assessment_attempts`; filter `student_id = :student_id`, `assessment_type = 'DRILL'`, and `status = 'GRADED'`; order by `finished_at DESC, id DESC`; limit 1. | Top-level `latestDrillScore` from `score_0_100`; this is across levels, unlike Q4 per-level scores. Return `NULL` if there is no graded attempt. |
| Q7 | Feedback notes and read state; one row per note | `feedback`; Teacher send/list is scoped by `teacher_id`, `class_id_at_send`, and active student membership; Student inbox is scoped by authenticated `student_id`. Mark-read updates only the recipient's row. | `id`, `body`, `sent_at`, `read_at`; schema enforces trimmed body length 1–1,000 and read time not before sent time. The API is under `/api/v1/classes/{classId}/students/{studentId}/feedback` and `/api/v1/students/me/feedback`. Browser uses API only. |
| Q8 | Student content reports and Admin review; persistence/API implemented | `question_reports` references `attempt_answers`; join through `attempt_items` to recover the pinned `question_version_id`. `video_reports` references `video_subchapter_mappings`. Student endpoints validate ownership/access; Admin list/update is under `/api/v1/admin/reports`. | A question report is not directly keyed by mutable `question_id`/`attempt_id`; preserve the answer → attempt item → question version lineage. Report category/status/follow-up are stored. This is not a Teacher Monitoring panel. |

The implemented student detail currently reads Q2 authorization/roster, Q3 READY levels, Q4 progress, Q5 active attempts, and Q6 latest graded score. The response contract is documented in [TEACHER_MONITORING.md](../api/TEACHER_MONITORING.md); implementation is in [monitoring.service.ts](../../apps/api/src/modules/monitoring/monitoring.service.ts).

### Data consistency checks

- Canonical Drill results live in `assessment_attempts` (`assessment_type = 'DRILL'`, `status = 'GRADED'`); their pinned package/items/answers live in `assessment_packages`, `package_items`, `attempt_items`, and `attempt_answers`.
- `level_progress.latest_score` is updated when a Drill is graded; `best_score` is the maximum final score. The schema has no `latest_attempt_id`; completion and unlock lineage use `completion_attempt_id` and `unlocking_attempt_id` where applicable.
- Drill v1.2 leaves star thresholds TBC (DRL-OPEN-03). The Monitoring fixture leaves `stars`/`best_stars` null and does not infer stars from score. The current canonical Drill scoring service still contains legacy star thresholds; align that Core Learning behavior in its owning workstream before presenting runtime stars as current PRD behavior.
- Monitoring demo seed creates two feedback rows for Teacher A/Class A: one unread and one read. Both use `class_id_at_send`, and every row must satisfy teacher ownership plus active Student membership in that Class at send time.
- A `feedback_read` event represents only the first unread→read transition; it is idempotent on retries. Analytics payload contains the feedback ID and class-at-send reference, never the note body or student contact data.
- `latestScore` is the latest completed score for that level; `bestScore` is the maximum final score for that level. The API’s top-level latest score is selected separately across all levels.
- `score = 0` is valid and must not be converted to “no attempt”; only `NULL` means no recorded score.
- The demo 80% example may have the next READY Level progress row. Do not infer broader completion semantics from it: OPEN-01 remains unresolved.
- The local Monitoring seed inserts two feedback records (one unread, one read). Teacher/Student feedback APIs are implemented, but the separately owned Teacher UI/browser integration is not part of this data deliverable. Student question/video report persistence and API routes exist; their static fixture examples remain illustrative, not insert-ready records.

## 3. Authorization scenario matrix

Current API status expectations follow [TEACHER_MONITORING.md](../api/TEACHER_MONITORING.md) and the server-side model in [AUTHORIZATION.md](../api/AUTHORIZATION.md). A12 covers implemented Teacher feedback behavior; A13 covers Student/Admin report APIs, not Teacher Monitoring.

| ID | Requester / condition | Action | Expected outcome |
|---|---|---|---|
| A1 | Authenticated, active, verified Teacher; owns active Class and same active school membership | List classes, roster, or active roster student detail | Allow; return only owned Class and active student membership data. |
| A2 | Missing, invalid, or expired bearer session | Any Teacher monitoring endpoint | `401`; no student data. |
| A3 | Authenticated Student or Admin uses Teacher-only monitoring route | Any Teacher monitoring endpoint | `403` (role not eligible under current monitoring contract). |
| A4 | Teacher profile is not verified, or has no active school membership | List classes or access a Class | `403`; no Class/student data. |
| A5 | Verified Teacher requests a Class owned by another Teacher | List roster or student detail by that Class ID | `403`; do not reveal roster or student progress. |
| A6 | Teacher requests an archived Class | Roster or student detail | `404`; archived Classes are excluded. |
| A7 | Teacher requests a nonexistent Class | Roster or student detail | `404`. |
| A8 | Teacher owns the Class, but requested student has no active membership in that Class | Student detail | `404` `STUDENT_NOT_FOUND`; do not disclose whether that student belongs elsewhere. |
| A9 | Class belongs to the Teacher, but the school is inactive or the Teacher-school membership has ended | Roster or student detail | `403`; the membership/school check must still apply. |
| A10 | Malformed class/student path identifier | Student detail | `400` at UUID validation boundary; do not execute data lookup. |
| A11 | Valid owner requests an active student | Roster/detail payload privacy check | Allow minimum identity/progress fields; no student email or unrelated profile data. Class-list response may include that Teacher’s class join code per current API contract. |
| A12 | Verified Teacher sends/list feedback for an active Student in an owned active Class | Send or read Teacher feedback state | Allow. Reject cross-Class/Teacher access; enforce 1–1,000 non-whitespace characters; Student cannot send or read another Student's notes. Optional UUID `clientRequestId` makes send retry idempotent; key reuse with different payload is `409`. Student mark-read is recipient-only and idempotent. |
| A13 | Authenticated Student reports an accessible question/video | `POST /api/v1/students/me/question-reports` or `video-reports`; Admin reviews via `/api/v1/admin/reports` | Allow only when attempt/item/answer or recommended video mapping belongs to the authenticated Student; retries use the client request ID. Stored question reports point to `attempt_answers`, then `attempt_items` and pinned question version. This is Student/Admin support, not Teacher Monitoring. |

No proposed rows remain in this matrix. A13 reflects the existing Student/Admin report routes. Feedback tests cover cross-Class denial, minimum/maximum input, recipient-only access, read state, and idempotent read events. This artifact does not change application authorization or define new status codes.

## 4. Current limitations and decisions to confirm

- Feedback table/API and local unread/read fixtures now exist. Feedback remains outside the first school trial; the Teacher UI and browser integration are owned separately. Question/video report tables and Student/Admin API routes are separate from Teacher Monitoring.
- OPEN-01 leaves final curriculum taxonomy and the meaning of “Tuntas” unresolved. Do not derive or display that status from the demo scores.
- Current Monitoring API returns level access, active-attempt state, and scores. Class-wide aggregates and stars require separate approved requirements/contracts. Feedback uses separate endpoints; existing Student/Admin report APIs are not part of this Monitoring response.
- Confirm the fixture’s canonical school/class demo codes with the other teams before sharing it as a cross-team contract.
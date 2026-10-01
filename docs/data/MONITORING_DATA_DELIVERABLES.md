# Monitoring data deliverables

**Status:** Data-team handoff artifact. The JSON is synthetic presentation/test input, not a database seed or product contract. Query notes describe server-side data access; the browser must use the API rather than query PostgreSQL directly.

## 1. Demo fixture

Fixture: [monitoring.json](monitoring/monitoring.json)

The fixture covers the monitoring states needed for a walkthrough:

| Demo student | Expected monitoring case | Data interpretation |
|---|---|---|
| DEMO Siswa 1 | 80% completed | Level 2 has a progress/access record, consistent with the approved Drill unlock baseline. This is not an academic “Tuntas” classification. |
| DEMO Siswa 2 | Latest 60, best 70 | Two completed attempts; Level 2 remains without a progress record. |
| DEMO Siswa 3 | No attempt | `latestDrillScore` is `null`; the first published Level is open by baseline. |
| DEMO Siswa 4 | In progress | An `IN_PROGRESS` attempt exists; no completed score is reported. |

All fixture users, schools, classes, attempts, and timestamps are synthetic DEMO data. No Auth credentials or real student PII are included. Feedback and report examples are explicitly marked `PROPOSED_NOT_IN_CURRENT_SCHEMA`; they demonstrate desired traceability only and must not be treated as database rows.

## 2. Dashboard query inventory

These are **server-side query requirements** aligned with the current Monitoring API and schema, not permission for frontend direct database access. Parameters such as `:teacher_id`, `:class_id`, and `:student_id` must come from authenticated/validated request context.

| ID | Purpose / grain | Sources and required conditions | Returned data / notes |
|---|---|---|---|
| Q1 | Teacher class list; one row per active owned class | `classes` JOIN active `teacher_school_memberships` on teacher and school JOIN active `schools`; filter `classes.teacher_user_id = :teacher_id`, `archived_at IS NULL`, membership `ended_at IS NULL`, school `status = 'ACTIVE'` | Class `id`, `name`, `join_code`; teacher role and verification are checked before query. |
| Q2 | Class roster; one row per active student membership | `class_memberships` JOIN `users`; filter `class_id = :class_id`, membership `left_at IS NULL`, `users.role = 'STUDENT'`. First authorize that class is not archived, belongs to `:teacher_id`, and its school membership is active. | Student `id`, `display_name` only; do not return email. |
| Q3 | Student monitoring detail; one row per published level | `levels` JOIN `subchapters` JOIN `chapters`; require all three `published_at IS NOT NULL`; order by chapter, subchapter, level `sort_order`. | Level and hierarchy IDs/labels/order. This is the published catalog, not a claim that taxonomy is final. |
| Q4 | Student progress; at most one row per student and level | `level_progress`; filter `student_id = :student_id`; join in memory/API by `level_id` to Q3 results. | `latest_score`, `best_score`, `latest_attempt_id`, unlock/completion timestamps. `0` is a score; `NULL` means no score. A progress row on a later level is the current endpoint’s unlock signal. |
| Q5 | Active Drill state; zero or more active attempts per student | `drill_attempts`; filter `student_id = :student_id` and `status = 'IN_PROGRESS'`; collect distinct `level_id`. | Per-level `inProgress`. Database constraint allows at most one active attempt per student/level. |
| Q6 | Overall latest completed Drill score; zero or one row per student | `drill_attempts`; filter `student_id = :student_id` and `status = 'COMPLETED'`; order by `completed_at DESC, id DESC`; limit 1. | Top-level `latestDrillScore`; this is across levels, unlike Q4 per-level scores. Return `NULL` if there is no completed attempt. |
| Q7 | Feedback panel, **future/proposed** | Requires an approved feedback table and API contract; proposed relationships: sender Teacher, recipient Student, Class, creation/read timestamps. Scope to authenticated Teacher’s own active Class and Student. | Message/read state. Product baseline caps message length at 1,000 characters; do not query this from PostgreSQL until schema/API exist. |
| Q8 | Content report trace, **future/proposed** | Requires approved question/video report schema. A question report should retain reporter, `question_id`, immutable `question_version_id`, `question_variant_id`, and relevant `attempt_id` where available. A video report needs approved video/content IDs. | Admin review data; no current report query exists. Preserve the exact content-version reference; do not resolve only to the mutable/current question. |

The implemented student detail currently reads Q2 authorization/roster, Q3 published levels, Q4 progress, Q5 active attempts, and Q6 latest completed score. The response contract is documented in [TEACHER_MONITORING.md](../api/TEACHER_MONITORING.md); implementation is in [monitoring.service.ts](../../apps/api/src/modules/monitoring/monitoring.service.ts).

### Data consistency checks

- For each completed attempt, its `student_id` and `level_id` must match the corresponding `level_progress` relationship; `latest_attempt_id` must identify the attempt represented by `latest_score`.
- `latestScore` is the latest completed score for that level; `bestScore` is the maximum final score for that level. The API’s top-level latest score is selected separately across all levels.
- `score = 0` is valid and must not be converted to “no attempt”; only `NULL` means no recorded score.
- The demo 80% example may have the next published Level progress row. Do not infer broader completion semantics from it: OPEN-01 remains unresolved.
- Feedback/report query rows are deliberately absent from the current-schema query set; the fixture’s proposed examples are not evidence of persistence.

## 3. Authorization scenario matrix

Current API status expectations follow [TEACHER_MONITORING.md](../api/TEACHER_MONITORING.md) and the server-side model in [AUTHORIZATION.md](../api/AUTHORIZATION.md). Feedback/report scenarios below are proposed acceptance inputs until those modules/contracts are approved.

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
| A12* | Proposed feedback flow: verified Teacher addresses student in own active Class | Send feedback | Allow only if product/API contract is approved; reject cross-class recipient. Message maximum 1,000 characters is product baseline. |
| A13* | Proposed report flow: Student reports a question/video they can access | Create report | Require authenticated reporter and stable content/version references; exact eligibility and duplicate/report-status policy need product/API approval. |

`*` Proposed scenarios, not implemented behavior. Existing integration coverage already exercises teacher ownership and outsider denial; extend test coverage when additional API behaviors are approved. This artifact does not change application authorization or define new status codes.

## 4. Current limitations and decisions to confirm

- `feedback`, question reports, and video reports do not currently have database tables or feature endpoints. Their fixture entries and Q7/Q8 are proposals for traceability discussion, not schema-ready rows.
- OPEN-01 leaves final curriculum taxonomy and the meaning of “Tuntas” unresolved. Do not derive or display that status from the demo scores.
- Current Monitoring API returns level access, active-attempt state, and scores. Class-wide aggregates, stars, feedback panels, and reports require separate approved requirements/contracts.
- Confirm the fixture’s canonical school/class demo codes with the other teams before sharing it as a cross-team contract.
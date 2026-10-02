# Analytics Event Contract

## Purpose

Product events provide a stable interface from Software to Data/Analytics. Database tables are implementation details; Data workflows should prefer documented event/dataset contracts rather than inferring semantics from arbitrary schema.

## Event envelope

Recommended versioned envelope:

```json
{
  "eventId": "uuid",
  "eventName": "drill_completed",
  "eventVersion": 1,
  "occurredAt": "2026-09-28T10:00:00Z",
  "actorId": "uuid-or-null",
  "actorRole": "STUDENT",
  "entityType": "assessmentAttempt",
  "entityId": "uuid",
  "correlationId": "uuid",
  "payload": {}
}
```

## PRD event vocabulary

Baseline vocabulary from PRD v0.5 (retained for cross-feature consumers):

- `account_registered`
- `class_joined`
- `user_type_changed`
- `assessment_started`
- `assessment_completed`
- `level_unlocked`
- `star_earned`
- `explanation_viewed`
- `feedback_sent`
- `feedback_read`
- `question_reported`
- `pvp_disconnected`
- `school_created`
- `token_generated`
- `teacher_verified`
- `class_created`
- `pretest_started`
- `drill_started`
- `drill_completed`
- `tryout_started`
- `tryout_completed`
- `pvp_started`
- `pvp_completed`
- `video_reported`
- `leaderboard_archived`
- `irt_calculated`
- `pvp_cancelled`

Exact payload schemas must be agreed with Data + PO (DRL-OPEN-08). The latest feature vocabulary below supersedes conflicting event meanings; legacy names are not automatic aliases.

**ENGINEERING IMPLEMENTATION for Teacher feedback (payload review pending):** `feedback_sent` and `feedback_read` use `entityType: "feedback"`, `entityId: feedback.id`, and payload `{ "classIdAtSend": "<uuid>" }`. The note body, student/teacher names, emails, and Auth identifiers are deliberately excluded. Both outbox rows are committed atomically with the feedback insert/read transition; repeated sends with the same `clientRequestId` and payload, or repeated reads, do not create duplicate events.

## Versioning rules

- `eventName` meaning must remain stable.
- Additive optional fields do not necessarily require a new major event version.
- Semantic reinterpretation/removal requires a new `eventVersion`.
- Consumers should tolerate unknown additive fields.

## Privacy

Do not put raw auth tokens, passwords, teacher verification tokens, unnecessary email, or full sensitive response content into generic analytics events.

Use stable internal IDs and documented joins/datasets when detail is required.

## Delivery

Domain transaction writes an outbox event. Worker processes/publishes it asynchronously.

Handlers must tolerate duplicate delivery; `eventId` is globally unique.

## Core Learning feature vocabulary — 2 October 2026

Sources: [Drill v1.2 §11/14](../product/sources/PRD_01_Drill_Latihan_Soal.docx.md) and [TryOut v1.1 §12](../product/sources/PRD_02_Core_Learning_TryOut.docx.md). Event names/triggers below are feature requirements. Exact camelCase payloads/envelope mapping remain Data/Software contract work; source snake_case names do not override API JSON naming conventions.

| Feature        | Event                      | Trigger / source context                                                                           |
| -------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| Drill          | `drill_started`            | Attempt starts                                                                                     |
| Drill / TryOut | `question_answered`        | Answer selected/changed under event policy; TryOut recommends package/attempt/question/format/time |
| Drill          | `drill_submitted`          | Successful final submission                                                                        |
| Drill          | `drill_completed`          | Final result created; distinct from request to submit                                              |
| Drill          | `level_unlocked`           | New level becomes open                                                                             |
| Drill          | `level_retry`              | Retry starts a new attempt on the same level                                                       |
| Drill / TryOut | `explanation_viewed`       | Explanation opened only after applicable release gate                                              |
| Drill          | `video_clicked`            | Opens recommendation; source requires video/subchapter/level/attempt/time                          |
| Drill          | `video_reported`           | Report submitted; video/category/subchapter/level/attempt/time                                     |
| Drill          | `question_reported`        | Report submitted; question/category/subchapter/level/attempt/time                                  |
| Pretest        | `pretest_started`          | Pretest starts                                                                                     |
| Pretest        | `pretest_skipped`          | Student selects Skip                                                                               |
| Pretest        | `pretest_completed`        | Pretest completes                                                                                  |
| TryOut         | `tryout_opened`            | Menu opened; P0                                                                                    |
| TryOut         | `tryout_detail_viewed`     | Package detail opened; package/period recommended; P0                                              |
| TryOut         | `tryout_started`           | Valid attempt created and timer starts; P0                                                         |
| TryOut         | `tryout_submitted`         | Manual confirmed or automatic final submit; submission type/count recommended; P0                  |
| TryOut         | `tryout_processing_viewed` | Waiting/processing status opened; P1                                                               |
| TryOut         | `result_viewed`            | Released result opened; package/attempt/score recommended; P0                                      |
| TryOut         | `tryout_abandoned`         | Leaves active attempt without submit, if supported; P1                                             |

TryOut `explanation_viewed` is P1; Drill source recommends user/session, bab/subbab/level, attempt, timestamp and relevant object identifiers. The exact required schema/deduplication policy is OPEN, not a reason to omit required events or invent event aliases.

**PROPOSED:** namespace shared `question_answered`/`explanation_viewed` through an assessment-type field in the versioned envelope. Data must approve the mapping. `tryout_completed` from v0.5 must not silently mean submission success, IRT completion and result release simultaneously. Processing must not include unreleased scores in events accessible to the Student. Domain finalization/outbox delivery remains idempotent.

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

## Ferdi producer implementation — PROPOSED mapping, 2 October

SUPPORT_ANALYTICS_ENABLED=false is the server default; enable only after Data approves payload/trigger/version mapping. Never NEXT_PUBLIC. With the gate off, feedback/report persistence works; POST `/api/v1/students/me/learning-interactions` returns `{state:"policyPending"}` after Student authentication and records nothing. No shared environment was enabled here.

When enabled, the endpoint takes required clientRequestId UUID, one of four interaction names, and only relevant context. Actor comes from identity, never body. Ownership, available explanation, published/released package and actual recommendation are verified server-side. Concurrent identical UUIDs record one outbox row; changed actor/event/entity/context returns 409. Tracking errors do not block navigation/video/learning. Browser view dedup is per mounted context, not invented global-session policy.

| Event | Trigger | Proposed server-derived context |
| --- | --- | --- |
| tryout_opened | TryOut page mounted | Student entity, no score/raw answer/PII |
| tryout_detail_viewed | Detail/rules opened | Published/released package ID/version |
| explanation_viewed | Available Drill explanation rendered | Owned graded attempt, packageId/assessmentType/levelId/subchapterId; TryOut waits for release contract |
| video_clicked | Recommendation link opened | Owned failed Drill recommendation, attempt/package/level/subchapter/mapping; video metadata resolved through mapping |
| level_retry | Canonical retry creation commits | Server derives previous GRADED attempt, package/level/subchapter/chapter. Event and new attempt/items commit together; start resuming an active attempt emits nothing. Not accepted from browser interaction endpoint |
| question_reported | Report insert commits | Report entity, attemptItemId/attemptId/questionVersionId/levelId/chapterId/subchapterId/category |
| video_reported | Report insert commits | Report entity, immutable attempt/level/subchapter/video/mapping/category |
| feedback_sent | New feedback commits | Feedback entity, classId/studentId; no body/name/email |
| feedback_read | First readAt commits | Feedback entity/classId; repeat reads emit nothing |

Report/feedback/retry outbox is inserted in the same DB transaction as mutation; accepted retries emit nothing twice. Canonical retry producer is a narrow addition requiring Aini review; no scoring/eligibility/variant policy changes. Existing Aini worker owns delivery, without a new queue/dual-write. Stored envelope follows analytics_outbox (eventVersion text "1", actorUserId/entityType/entityId/correlationId/payload). Conversion to Data's external envelope and exact required fields needs review. No silent aliasing of Aini domain events.

Tests cover off-gate authentication/no rows, enabled TEST ONLY actor ownership, concurrent replay/conflict, feedback first-read dedup, and report rollback when outbox fails followed by same-ID retry. Domain answer/submit/completion/XP producers and TryOut processing/result analytics depend on Aini finalization/release contracts. Data approval, activation, transport/delivery and release acceptance remain separate gates.

## Aini domain/worker - PROPOSED mapping, 3 October 2026

`DOMAIN_ANALYTICS_ENABLED=false` is the server default. A [proposed v1 schema](../../packages/contracts/events/domain-learning-event.proposed.schema.json) covers canonical drill_started, PG question_answered, drill_submitted, tryout_submitted and actual level_unlocked transitions. API and PostgreSQL recovery share the transactional producer; actor/context/version/time are server-derived. Legacy events retain their meaning separately from weighted release.

Consecutive identical saves emit nothing; selection/change/clear emits one revision, initial empty emits nothing. This dedup and deadline-cause mapping is PROPOSED for Data review (DRL-OPEN-08). New payloads exclude answers, keys, explanations, scores and profile fields. Nullable analytics_events.correlationId migration 0013 preserves future delivery correlation without rewriting old events. Aggregate status reveals backlog/failure/cooldown age. See [inventory/runbook](../development/JOB20_ANALYTICS_INVENTORY.md) for triggers, owners and remaining hooks. Shared activation, external mapping and independent QA remain pending.

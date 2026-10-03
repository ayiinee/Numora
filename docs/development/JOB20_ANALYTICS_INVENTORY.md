# JOB-20 analytics inventory and operations

Date: 3 October 2026. Aini domain/worker scope follows JOB-09. **ENGINEERING DECISION:** reuse the existing PostgreSQL outbox and event-ID deduplicating consumer (ADR-007). **OPEN:** payload/trigger/dedup mapping needs Data approval (DRL-OPEN-08). **PROPOSED:** the reviewable v1 mapping remains disabled by `DOMAIN_ANALYTICS_ENABLED=false`.

## Producer inventory

| Vocabulary | Current producer / status | Remaining owner or dependency |
| --- | --- | --- |
| account_registered, class_joined, user_type_changed | Gap in identity/class services; no parallel auth implementation | Farel handoff + Data |
| drill_started | Canonical start transaction, proposed default off; resume emits nothing | Data activation approval |
| question_answered (Drill/TryOut) | Shared validated PG save transaction, proposed default off | Data revision semantics; PGK waits JOB-07 rubric |
| drill_submitted | Canonical finalization transaction, proposed default off | Data activation approval |
| drill_completed | Existing legacy final-result event retained, additive correlation/time | Data legacy/external mapping |
| level_unlocked | Actual locked-to-open progress transition, proposed default off | Data activation approval |
| level_retry | Existing support-gated canonical retry producer; not duplicated | SUPPORT_ANALYTICS_ENABLED + Data |
| explanation_viewed | Existing support endpoint verifies owned released Drill result | Ferdi: released TryOut explanation hook |
| video_clicked, question_reported, video_reported | Existing ownership/recommendation-validated support producers | Ferdi + Data activation |
| feedback_sent, feedback_read | Existing feedback transaction/first-read dedup | Existing owner + Data activation |
| pretest_started, pretest_skipped, pretest_completed | Lifecycle absent; no fabricated events | JOB-13 + eligibility/placement owners |
| tryout_opened, tryout_detail_viewed | Existing support-gated view hooks | Ferdi + Data activation |
| tryout_started | Existing valid-attempt transaction, additive correlation/time | Data legacy/external mapping |
| tryout_submitted | JOB-09 shared manual/deadline finalizer, proposed default off | Data activation approval |
| tryout_completed | Legacy PG finalization preserved; not aliased to IRT release | JOB-10 / Data release vocabulary |
| tryout_processing_viewed, result_viewed, TryOut explanation_viewed | View hooks pending; use final release/ownership contract | Ferdi + JOB-07/10 + Data |
| tryout_abandoned | Optional behavior absent | Product/Ferdi + Data |
| star_earned / reward contribution | Not fabricated while policy/output is OPEN | JOB-11 + Product/Data |

No auth/join/monitoring files changed. This inventory records handoffs, not their acceptance.

## Proposed domain mapping

The shared producer runs after authorization, option validation, attempt locking and applicable deadline checks. Business mutation/outbox commit or roll back together. The flag is server-only, identical in API/recovery processes, and never NEXT_PUBLIC. Existing legacy events remain separate and active. Shared activation requires Data approval.

Payload contains server-derived attemptId, assessmentType, packageId/packageVersion, scoringPolicyVersionId, nullable chapterId/levelId/classIdAtStart, startedAt/deadlineAt and event-specific metadata. Question revisions contain instance/version IDs, SINGLE_CHOICE and selected/cleared state. No option, raw answer, key, explanation, score or personal profile data. Submissions contain counts; deadline means expiry was already reached, including a manual request arriving after expiry. This cause mapping is PROPOSED, not an IRT completion alias. PGK waits for its approved rubric.

Consecutive identical saves succeed without rewriting savedAt or emitting another revision. A selection/change/clear emits one event; initial empty emits none. A genuine change back is a new revision. No global/session dedup policy is claimed. Start/final submission reuse durable constraints/locks/status; unlock emits only when progress becomes open. GET requests do not imply view events.

The [proposed schema](../../packages/contracts/events/domain-learning-event.proposed.schema.json) is separate from the general envelope. External normalization maps actorUserId to actorId and eventVersion text to integer; external actorRole/transport remain Data work. Package/scoring/question IDs pin historical versions; the class snapshot does not follow later affiliation. Migration `0013_chemical_wallflower.sql` adds nullable analytics_events.correlationId; existing delivered rows remain intact, future deliveries copy outbox correlation, and replay never rewrites a delivered event.

## Operations

Worker aggregate status logs at most once per minute. PostgreSQL-only status (explicitly supply DATABASE_URL through the process environment; no automatic .env loading):

```sh
pnpm --filter @tka/worker outbox:status
```

Output: pending (all undelivered), failed (undelivered with failure), retryReady (new or failed at least five minutes ago), coolingDown, oldestPendingSeconds and oldestFailedSeconds. PostgreSQL supplies counts/time; no student payload is exported. The command needs no Redis. No public endpoint, SLO, alert threshold or retention policy was invented.

If backlog ages while the worker is stopped, restore its dependency and restart. Consumer failures roll back projection/acknowledgement, preserve event ID and retry after the existing five-minute cooldown. Fix underlying producer/schema failures through reviewed changes. Do not delete events, mark processed manually or change IDs to clear backlog. Test-only forced replay in an isolated database is not a cleanup procedure.

**Verification:** PostgreSQL tests cover flag-off persistence, resume, duplicate/concurrent saves/submits, unlock transition, pinned context/privacy, producer rollback, acknowledgement rollback/cooldown/parallel retry/replay and correlation. Full PR CI also runs contracts, migrations/upgrades, lint/typecheck/build/OpenAPI, browser and connected chain. Data approval, other-owner hooks, external transport, policy-dependent features and independent QA remain open. Aini's implemented engineering scope is ready for review; JOB-20 overall remains partial.

# Admin IRT operations, publication readers and aggregate analytics

**PRD RULE:** v0.6 requires weekly Tryout result/explanation publication together within 72 hours, immutable historical results and server authority. Admin cannot edit scientific/product formulas.

**ENGINEERING DECISION:** the user-approved M0-M6 plan uses existing v3 orchestration and existing durable finalization models. `/admin/irt` and `/admin/analytics` use independent loaders with identity-keyed cleanup, explicit errors, retries, empty/denied states and server-selected approvals. No browser business-data query bypasses NestJS.

## API and role boundary

| API                                                    | Permission            | Behavior                                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/v1/admin/analytics`                          | Assigned active Admin | Structure, student activity and release aggregates; Operations adds operational verification metrics, Content adds content/moderation and IRT failures, Super gets both. No individual identities or responses. |
| GET `/api/v1/admin/irt/options`                        | Content/Super         | Non-revoked approvals of sealed IRT_MODEL/QUALITY_GATE versions with matching digest and TRYOUT/context scope. No editable configuration payload.                                                               |
| GET `/api/v1/admin/irt/batch-health`                   | Content/Super         | Server pagination, cutoff/finalization blockers, participant counts, 72-hour overdue, published mode/version/time.                                                                                              |
| POST/GET `/api/v1/admin/irt/requests` and detail/retry | Content/Super         | Existing orchestration contract; prepare/retry preserve actor-bound idempotency and generation. Detail includes immutable configuration pins.                                                                   |
| POST `/api/v1/admin/irt/requests/:id/adopt`            | Content/Super         | Existing locked/idempotent artifact adoption; checks current execution, provenance, dataset, scientific evidence and policy pins. Audits the verified actor. No participant release.                            |

Every endpoint rechecks the database assignment/status. Operations cannot prepare/adopt/read IRT details. Analytics errors retain valid zeroes and return `value:null` plus `unavailableReason` for unreadable sources. Counts are cumulative durable records, not a new BI pipeline or inference about absent data.

The [complete permission matrix](ADMIN_PERMISSION_MATRIX.md) records the read-only Content school/class/credential projection and the separation of student aggregates from operational individuals. Operations receives batch publication/SLA counts but no IRT request failure diagnostics.

## Durable batch and input boundary

Worker recovery advances PLANNED/OPEN batches under row locks, emits an outbox event in the transaction, and closes only after cutoff with no unfinished Regular attempts. Concurrent runs emit a single event. Failed academic policy/grading leaves the batch blocked rather than pretending all attempts finished.

New response snapshots pin `job10-operational-v2`. The effective end of collection is the earliest actual finish, attempt deadline and package close. Actual grading/finalization timestamps remain unchanged. `sourceFinalizedAt` is preserved in exposure facts; completedAt and prior-exposure cutoff use the collection end. Grading by a late recovery worker does not exclude a timely response; saved answers after cutoff and invalid/unscored responses remain excluded. Historical frozen v1 snapshots are never rewritten. Data still owns scientific inclusion/quality decisions.

## Publication and historical readers

The API and notification release discovery share the same predicate. Production package availability uses `tryout_result_finalizations.published_at`, and participant result/history use the corresponding `tryout_attempt_results` row. They copy the persisted mapped score and final mode/version; raw attempt score and compute SUCCEEDED cannot unlock production keys or values. UNSCORABLE remains null and is rendered unavailable, never zero. Signed explanation media follows the same release gate. Explicit `is_demo` fixtures alone retain the legacy item-coverage release reader.

The existing 0016 finalization guards already require a closed batch, release policy, complete participant/common-item coverage, adopted artifact for IRT and exact copied respondent score/theta/error/mapping. Published finalizations and child rows are immutable and publication emits its own outbox event. M6 reuses these models/guards; no schema addition or compute-namespace mutation is needed for its readers.

History exposes persisted ledger XP and per-attempt stars separately from result release. Ongoing attempts remain pending; legacy missing ledger/star facts are explicitly legacy, never guessed or backfilled; real zero values remain visible. Academic scores remain hidden until their publication gate passes.

## OPEN: producer contract and acceptance

The executable v3 calibration contract currently contains `items` only. It does not provide the approved respondent payload required by the finalization guard. The supplied external scoring document is still partially unapproved. There is consequently no enabled production participant-publication writer or force release endpoint. The portal reports `RESPONDENT_CONTRACT_NOT_APPROVED` until the producer contract and approved mapping/release policy are integrated in a subsequent explicitly versioned change. A successful execution/adoption is not a publication.

**PROPOSED handoff mapping for Data review, not an approved compute contract:** respondentId/attemptId must match the frozen pseudonymous source; per-attempt canonical score, theta, standardError and mappingApprovalId map to the existing participant result table; source output/execution, input/snapshot digest, quality/adoption evidence, common included/excluded items, policy/version/precision and complete batch coverage must be pinned. Data must specify the executable repository/build, contract version, quality decisions, mapping resolution and valid fallback mode/label. Main may copy validated output and publish transactionally, but may not calculate substitute science. No sample numeric mapping or automatic fallback is activated here.

Actual SMTP, private R2/CORS, approved Curriculum payloads, scoped Cloud sandbox and independent QA are separate acceptance gates. Local Auth/provider/compute/storage fixtures demonstrate engineering behavior only.

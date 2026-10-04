# JOB-10 foundation: TryOut compute v3

**ENGINEERING UPDATE — 4 October 2026:** the development Supabase sandbox has
received migrations through `0022`, including dispatch and Data API ACL
lockdown. [Operation evidence](../data/SUPABASE_MIGRATION_2026-10-04.md) records
backup/restore and Cloud checks. This does not activate v3 or provision the
separate runtime LOGINs/compute consumer.

**ENGINEERING DECISION — approved by Aini, 3 October 2026:** extend PR #51 with Admin prepare/status/manual retry, frozen input, generation-fenced Redis notification and atomic adoption of evidence/item parameters. This is the foundation of JOB-10, not complete student IRT scoring or acceptance of a scientific model.

## Ownership and activation

Numora owns migrations, snapshot construction, request/dispatch authorization, orchestration and canonical adoption. Shafwan's separate repository owns the BullMQ compute consumer and scientific evidence. Main uses a non-owner LOGIN granted only `numora_main_runtime`; compute uses another LOGIN granted only `numora_irt_runtime`. Neither runtime gets DDL, ownership or BYPASSRLS. Migrations run separately with the migration owner. Browser access remains through NestJS.

`IRT_V3_ENABLED=false` is the default in API and worker. Setting false stops new prepare/retry, notification and adoption; status/history remain readable. No deployment or cloud migration is part of this change. Activation requires matching DB migrations, compute helper/contract compatibility, dedicated development Redis, identical `BULLMQ_PREFIX`, approved fixtures/configuration and runtime credentials provisioned by the operator. Do not grant both groups to a single LOGIN.

Configure a secret `IRT_PSEUDONYM_KEY` of at least 32 bytes and an explicit `IRT_PSEUDONYM_KEY_VERSION`. The snapshot pins the version; retry never re-pseudonymizes it. Changing the key/version affects new snapshots only. Never put this secret, credentials or raw responses in Redis, logs or evidence reports.

## Admin API

All routes require an active Admin and use `/api/v1/admin/irt`. Both POSTs require an `Idempotency-Key` (1–160 printable non-space ASCII characters). Reusing a key with a different operation/body returns 409. Keys are hashed in persistence; dispatch records contain the Admin actor, operation fingerprint, generation and timestamp. Successful duplicate POSTs return the current safe status of the original request without creating work.

| Route | Operation |
|---|---|
| `POST /requests` | Body `{ contextId, configurationPins: [{ approvalId, digest }] }`; creates snapshot, request, generation 1 and outbox transactionally |
| `GET /requests?limit=20&offset=0` | Existing Admin pagination; only managed TryOut requests |
| `GET /requests/:id` | Request/execution states, snapshot counts/digests, deadline/overdue and artifact summaries |
| `POST /requests/:id/retry` | No body; authorize next generation against the same immutable input |

Prepare requires an existing TRYOUT context with CLOSED batch, elapsed persisted cutoff, REGULAR frozen package, SEALED pinned rubrics, non-null release policy/digest and scoped, non-revoked approvals. Exactly one IRT_MODEL and one QUALITY_GATE approval must be pinned; approved additional technical pins remain evidence. The endpoint does not create/approve policies or close batches. Academic definitions still come from owners. Legacy packages without these prerequisites require a separately approved version, not silent rewriting.

Snapshots include every item from REGULAR submitted/graded attempts finished by cutoff. Missing answers stay null, are OMITTED and operationally excluded as UNSCORED; no missing score becomes zero. Canonical scoring/category/state is copied, not recalculated. Responses graded/saved after cutoff or marked INVALID/NOT_PRESENTED are excluded with reasons. Actual delivery/exposure facts are recorded; empty evidence does not claim an item was read. Compute seals an INCLUDE/EXCLUDE manifest accounting for every row and cannot include operationally excluded rows. Empty datasets and incomplete rubric evidence fail without leaving a snapshot/request/outbox.

Common errors: `IRT_V3_DISABLED` (503), `IRT_PSEUDONYM_NOT_CONFIGURED` (503), `IRT_IDEMPOTENCY_KEY_REQUIRED` (400), `IRT_IDEMPOTENCY_CONFLICT` (409), `IRT_DEPENDENCY_NOT_APPROVED`/`IRT_DATASET_EMPTY` (409), `IRT_REQUEST_NOT_FOUND` (404). DB state conflicts return `IRT_REQUEST_CONFLICT` (409). Responses use problem JSON.

## Redis handoff and manual retry

Queue: `irt-compute`; job name: `analysis-requested`; job ID: `irt-{requestId}-{dispatchGeneration}`. Payload is validated against `packages/contracts/compute/notification-v3.schema.json`:

```json
{ "contractVersion": 3, "requestId": "UUID", "inputDigest": "sha256", "dispatchGeneration": 1 }
```

The shorthand above documents fields; UUID/hash placeholders are not valid test payloads. Worker scans PostgreSQL every five seconds, sends pending generations and re-notifies unclaimed generations after 60 seconds. Failed notification has a five-minute cooldown. `outbox_deliveries` consumer `irt_compute` is independent of analytics `processedAt`. Redis loss is recovered from PostgreSQL; failed or completed queue jobs are removed, while durable execution history remains.

Compute validates notification and reads pseudonymous `irt_input_*_v3` views. Verify request input digest, then call `claimComputeExecution(compute, requestId, principalId, leaseSeconds, dispatchGeneration)`. Missing/stale generation or already-used authorization returns null. A dispatch authorizes exactly one execution. Heartbeat and artifact writes require a live lease; late completion is rejected. Persist a complete SEALED dataset, one CALIBRATE_TRYOUT artifact at sequence 1, then finish the execution. Computation has no automatic retry; BullMQ `attempts=1`.

Main request state becomes RUNNING on claim. Failed/expired execution becomes FAILED. Admin can retry failed/expired work, including SUCCEEDED execution whose adoption failed validation; retry while live, before any claim, or after COMPLETED/CANCELLED is rejected. Expired workers retain immutable history. Retry increments generation and resets transport cooldown; it never changes snapshot, input digest, approvals, cutoff or dueAt. A new academic policy/input requires a new request, not retry.

Quota exhaustion stops the worker through the existing quota handling. Restore quota or the dedicated instance, then restart explicitly; pending input remains in PostgreSQL. Normal failures use bounded logs with fixed codes and counts.

## Adoption and remaining OPEN work

The main worker reconciles current SUCCEEDED executions. It verifies version/kind/digest, SEALED manifest and pinned QUALITY_GATE, item/rubric coverage and model family, finite numeric structure, duplicate/foreign items and GPCM steps. Payload schema is `calibration-payload-v3.schema.json`, with semantic validation in `@tka/irt-orchestration`. Missing results must be represented as non-calibrated item evidence with null parameters; they cannot be silently omitted. Database numeric precision applies to copied parameters, while the original payload/digest is preserved exactly.

Acceptance, canonical batch/item/step insertion and audit are atomic and idempotent. Invalid adoption rolls back all canonical writes, records a fixed failure code and permits explicit retry. Scientific INSUFFICIENT/CALIBRATION_FAILED evidence is preserved; successful execution is not scientific approval. The old Admin compatibility display still hides parameters below its baseline sample gate; this does not prevent evidence storage or introduce a universal Student release rule.

`resultReleasedAt` remains null. No attempt score, XP, parameter activation, respondent result or finalization is written. Student scores, keys and explanations stay behind the existing release gate. Released/historical scores are untouched.

**OPEN:** batch end/deadline relationship, numerical PGK rubric, scientific thresholds/configuration, cohort/reference and scale mapping, per-student output, fallback/correction and publication policy. Daily Drill/Admin analysis, statistical engine, respondent scoring/publication and XP belong to later work. Test fixtures do not approve these policies.

## Verification

Run PostgreSQL and Redis on localhost with NODE_ENV=test and TEST_DATABASE_URL/TEST_REDIS_URL. Integration creates its own migrated database plus restricted main/compute LOGINS and removes them after the suite. Never target shared cloud services.

`pnpm --filter @tka/api exec vitest run src/modules/irt/irt-requests.integration.spec.ts` verifies Admin authorization, concurrent prepare, frozen unanswered input, scoped approvals/roles, manual lease-fenced retry, atomic adoption, GPCM/insufficient evidence and real Redis queue recovery. Both services are required for the connected scenario; skipped tests are not acceptance evidence.

`pnpm test:irt-chain` requires a committed clean SHA and both local services, builds production API/worker/workspaces, runs all eleven scenarios and writes `.tmp/job10-evidence/connected.json`. Coverage includes incomplete manifests/provenance/duplicate items, failed scientific evidence, injected partial-write rollback and an actual refused Redis connection. Consumer/auth are TEST ONLY; HTTP/domain/database/Redis paths are real. CI uploads the evidence together with its job result. Lint/typecheck/build, existing integration regressions, schema compatibility and OpenAPI/generated types freshness remain gates. Data engine acceptance, Curriculum, real Google/trial and independent QA are separate.

# Observability

## Goals

PRD requires storage/scoring/match failures to be traceable. Observability must allow a user-visible failure to be followed across API, database/worker, and PvP processing.

**ENGINEERING DECISION — 13 November 2026:** upload preview validation and
draft save emit the debug event `content_upload_transaction` with operation,
outcome, connection acquisition/BEGIN time and transaction time. The event
contains no IDs or content. See [field definitions and local verification](../development/CONTENT_UPLOAD_TRANSACTIONS_2026-11-13.md).

## Logging

Use structured JSON logs (Pino recommended).

Common fields:

```json
{
  "level": "info",
  "requestId": "uuid",
  "userId": "uuid-or-null",
  "module": "assessments",
  "operation": "submitDrillAttempt",
  "durationMs": 84
}
```

Do not log secrets/credentials or unnecessary PII.

## Correlation

Generate/propagate `requestId`/`correlationId` through:

- frontend error/support context where safe;
- REST request;
- domain log;
- outbox event;
- worker log.

## Error monitoring

Sentry or equivalent may be used for Frontend/Backend error tracking with PII scrubbing and environment separation.

## Metrics and tracing

OpenTelemetry backend instrumentation is recommended for:

- request duration/error rate;
- DB latency;
- queue processing/retry;
- assessment submit latency;
- active WebSocket/PvP metrics;
- worker/job success/failure;
- leaderboard/IRT scheduled job duration.

## Alerts before real-user release

At minimum alert/notice on:

- API unavailable;
- high server error rate;
- database connection exhaustion/failure;
- queue backlog/failures;
- scheduled leaderboard archive failure;
- daily IRT job failure;
- repeated PvP system cancellation rate.

Exact thresholds should be tuned from staging/load baselines.

## Core Learning release/timer observability

**PRD RULE — [TryOut v1.1](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md):** released result within 3×24h after batch end, no partial score during delay, immutable released score. **PROPOSED engineering metrics:** batch-end-to-release latency, overdue unreleased batches, auto-submit backlog/failure, manual/auto-finalization conflicts, duplicate XP/outbox prevention, save failures and recovery. Alert thresholds before the 3×24h limit require owner/operations agreement; no invented alert threshold is a PRD rule. Keep pseudonymous identifiers and omit answer keys/tokens/PII from logs.

## IRT Tryout operational reader

`GET /api/v1/admin/irt/batch-health` reports durable batch state and operational
signals without respondent identity or raw answers. Each row includes request and
execution state, delivery blocker, respondent result counts by mode, execution age,
publication state, and preparation/publication blockers. The response also reports
the server-selected intake, delivery, reconciler, release, and publication flags.

Use this reader with systemd and journal checks when investigating a batch. A
`FAILED` or `EXPIRED` execution is a technical signal. `INSUFFICIENT`,
`NOT_COMPARABLE`, and `UNSCORABLE` are scientific or data outcomes and must retain
their stored reason codes.

## IRT rollback sequence

1. Stop new IRT intake and disable the delivery reconciler.
2. Stop release and publication flags.
3. Stop the compute worker gracefully and confirm no running execution remains.
4. Keep snapshots, requests, dispatches, artifacts, adoption receipts, and audit rows.
5. Route new batches through the approved fallback policy and keep active attempts on
   their pinned package version.
6. Restore only matching migration-compatible application and runtime versions.
7. Re-run disposable replay, stale execution, revoked approval, artifact tampering,
   and reader-gate checks before re-enabling flags in order.

Do not delete IRT evidence, rewrite attempts or answers, recalculate XP/mastery, or
run a down migration as part of rollback.

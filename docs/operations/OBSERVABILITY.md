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

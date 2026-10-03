# TryOut deadline recovery - JOB-09

**ENGINEERING DECISION - 3 October 2026:** PostgreSQL is the durable source of overdue attempts. Redis contains no required finalization state. Apply migration `0012_square_gargoyle.sql` through the normal migration runner before deployment; it adds only a partial overdue-attempt index. Build the database and assessment-engine workspaces before starting API/worker.

## Execution

`pnpm dev` runs Web/API. `pnpm dev:worker` or `pnpm dev:full` runs scheduled recovery every five seconds alongside outbox/leaderboard jobs, after worker dependency preflight. If Redis quota prevents worker startup, an operator can run the PostgreSQL-only recovery process separately with an explicitly supplied `DATABASE_URL`:

```sh
pnpm --filter @tka/worker tryout:recover
pnpm --filter @tka/worker tryout:recover --once
```

The command does not load `.env` automatically. Use a dedicated development/test target; shared deployment credentials belong in the process environment. Never paste credentials into logs or docs. Do not run the test CLI against staging/production by accident. An operator may run both recovery processes: row locks and status checks protect a single finalization. SIGINT/SIGTERM stops the loop and waits for its current batch before closing PostgreSQL.

## Recovery and diagnostics

Each cycle handles at most 100 attempts, in deadline/UUID order. SKIP LOCKED avoids waiting on another finalizer. A pagination cursor advances past failures/locks and wraps at the end, so poison rows do not starve later attempts. The cursor is operational process state; restarting always rediscovers durable attempts. Timestamp cursor text retains PostgreSQL precision. No attempt, raw response or release state is deleted on failure.

The aggregate log includes scanned, finalized, failed, skipped, backlog and oldestOverdueSeconds; no student/answer/error payload is logged. Idle standalone status is limited to once per minute; repeated failure/backlog logs are bounded in the integrated worker. `--once` handles one bounded batch and exits nonzero on failure; backlog may require more batches. Inspect backlog age and failure count; investigate invalid pinned content/scoring or database availability, correct the underlying cause through reviewed changes, then rerun. Do not edit raw answers or bypass release gates to clear backlog.

**OPEN:** five-second polling is an engineering interval, not an approved product deadline or SLA. Official duration, relation to package close, batch end and release semantics remain owner decisions. This implementation preserves current PG-only grading behind the existing IRT release gate. Curriculum review, real Google trial and independent QA remain release requirements.

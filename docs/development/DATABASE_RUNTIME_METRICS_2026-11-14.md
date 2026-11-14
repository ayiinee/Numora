# Database/runtime observability

**ENGINEERING DECISION** — optional instrumentation supplements the before/after fixtures without changing assessment, authorization or polling policy.

Set `NUMORA_OBSERVABILITY_ENABLED=true` on each API/worker process and restart. Configure a server-only random `METRICS_TOKEN` of at least 32 characters on the API. Scrape `GET /api/v1/internal/metrics` with `Authorization: Bearer <token>`. It is excluded from product OpenAPI, returns 404 when disabled/unconfigured, rejects other callers and sends `Cache-Control: no-store`. No Auth service call is needed for monitoring. Do not place the token in frontend variables or URL parameters.

## Measurements and limits

- `numora_db_query_seconds`: count, sum, maximum and histogram of consumed application queries through the shared postgres-js client, including raw SQL and Drizzle, transaction callbacks and savepoints. Duration includes queueing/transfer; driver-internal BEGIN/COMMIT are not separate application-query counts. Streaming/cursor APIs are outside this measurement. Lazy query construction does not execute queries.
- `numora_db_result_rows`: returned rows. `numora_db_sampled_json_bytes` samples 1% of logical JSON result sizes, without retaining/logging values. Samples beyond a traversal/string budget or unsupported values are skipped and counted. This is **not protocol/TLS bytes, compressed bytes or Supabase billing**. Use the existing TCP/TLS comparison fixtures and Supabase Usage for those checks.
- `numora_db_transaction_seconds`: complete transaction/savepoint wall time. `numora_db_transaction_start_seconds` includes pool wait and BEGIN response. `numora_db_acquire_seconds` measures explicit reserve calls. A 15-second API probe measures actual acquisition on the configured pool, releasing timed-out reservations when they eventually arrive. This is sampled pool pressure, not exact queue wait for every query. Pool maximum and current application queries in flight are separate gauges.
- Read-only `pg_stat_activity`/`pg_locks` aggregates report current lock wait age from `waitstart`, lock waits/blocked sessions and visible/redacted sessions for this project/prefix. No SQL text, bindings, PIDs or names are exposed. Runtime roles can see redacted peer sessions: zero visible waits does not prove absence of contention. `numora_db_probe_available=0` marks failures. This does not grant monitoring privileges or change RLS.
- Shared curriculum and PvP counters report cache hits/misses/coalescing/refreshes/Redis errors. Auth reports actual `getUser` invocations/duration and request reuse; no token/user labels. Worker polls report duration/error counts; overlap/backlog and PvP active matches support idle/load comparisons.

All metric names/labels are bounded. Query parameters, URLs, passwords, tokens, student IDs and SQL text are never metric labels or retained samples. Instrumentation is disabled by default and applies when the shared database client is first created.

## Reporting instances and polling

Each enabled process publishes an ephemeral Redis heartbeat every 15 seconds, expiring after 45 seconds. Worker metric records are compressed; API heartbeats contain no relayed API metric body. This adds one Redis write per enabled process per heartbeat and one read-only DB probe per API every 15 seconds, plus bounded reads when scraped. A random process UUID distinguishes instances; the namespace hashes the project identity and `BULLMQ_PREFIX` (direct/session-pooler routes and different runtime roles reconcile). API/worker must use the same project and prefix to appear together. Redis is not durable truth; its restart clears reporting until heartbeats resume.

`numora_reporting_instances{service="api|worker"}` counts **instrumented reporting processes**, not every deployment. Uninstrumented processes and outages cannot be inferred from connection counts. Registry availability/completeness are explicit; scans/record sizes are bounded. Worker metrics are relayed through the API. Scrape one registry-exporting API per project/prefix for these relayed metrics, or deduplicate by process UUID; do not sum duplicate registry views across API scrape targets. Heartbeat lag/expiry means counts are approximate within that window.

Approved worker five-second polling and the PvP one-second durable sweep remain unchanged. Existing idle fixtures measure their byte contribution; compare rate × reporting instances and useful work after rollout before changing an interval. Notification policy and deadline/reconnect/recovery acceptance remain release requirements.

## Validation/release

Local PostgreSQL tests cover lazy execution, parameterization, raw/value chains, transaction/savepoint rollback, repeated awaits, pool exhaustion/acquisition, errors, late reservation release and probe recovery. HTTP tests cover disabled/unauthorized/authorized requests. Real Redis tests cover cross-service records, namespace isolation, corruption, TTL and stop; stalled heartbeat shutdown is bounded. Existing Auth and worker outage suites run alongside them.

No migration is required. Flags/tokens and representative production measurements require an operator rollout; implementation tests do not claim production instance counts or billed savings. Compare equal activity/time windows, especially when local Development and another deployment share one Supabase project. Keep workload, request counts, enabled features and instance counts with each measurement.


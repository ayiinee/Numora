# Shared curriculum cache

**ENGINEERING DECISION** — share READY chapter/subchapter/level metadata across catalog and materials reads. Authorization, progress, active attempts, recent activity and scores remain live per-user queries. Nothing from the cache grants access to an assessment.

Every request reads the existing transactional `pvp_content_revision` ledger. Its statement triggers already cover question/review/difficulty and curriculum hierarchy changes, including direct SQL and TRUNCATE. Reusing it needs no migration and intentionally over-invalidates on question changes. A changed revision during loading prevents publication under the old key. Rollbacks retain the old revision. A 60-second TTL is a fallback; it does not replace revision checking.

One process-local metadata entry is capped at 512 KiB; Redis shares it between processes with a project/prefix/revision/schema key and checksum. Concurrent misses coalesce, caller results are cloned, and Redis connection/commands have a 250 ms bound without offline queues. Missing/unavailable Redis falls back to PostgreSQL. Revision lookup failures bypass cache. Shared cache event counters include hits, misses, coalescing, refreshes and Redis errors, ready for the protected runtime metrics exporter.

## Local evidence

Nine integration tests pass using dedicated non-owner PostgreSQL and real Redis 7.4. They cover decimal/zero progress across students, authorization, hidden hierarchy, cloned results, coalescing, cross-instance Redis reuse, corrupted Redis/outage fallback, committed changes and rollback. The warm subchapter read transfers 899 protocol bytes; materials 22,849 bytes on a 209-level fixture. Cold loading transfers the shared hierarchy once and can cost more than a narrow one-off subchapter query. Warm measurement explicitly primes metadata before counting; it is not a cold-start claim or Supabase billed egress.

A controlled pair of concurrent content transactions observes an actual PostgreSQL Lock wait on revision invalidation (93 ms including deliberate hold and test scheduling). This demonstrates serialization, not a production contention rate. Keep the ledger lock algorithm unchanged pending real traffic evidence. Batch import reduces trigger invocations from 603 to 6 for 201 new questions (three content layers, chunks of 200), while preserving atomic invalidation.

No required env/schema change. Existing `REDIS_URL` and `BULLMQ_PREFIX` enable cross-process reuse; without them only bounded in-process reuse applies. Production cache hit rates and revision waits require the instrumented release and representative traffic.


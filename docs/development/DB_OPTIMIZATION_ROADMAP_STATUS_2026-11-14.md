# Database optimization roadmap status

**ENGINEERING DECISION** — implementation tracking for the original ten priorities. “Implemented” means code and focused verification are present in the listed PRs; it does not mean merged, reviewed by a human, deployed, or verified against production billing.

| Priority                         | Implementation                                                                                                                                                                     | PRs                          | Release/operational follow-up                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1. Baseline measurement          | Query count/result rows, sampled logical JSON size, transaction/acquisition histograms, pool/lock probes and cache events; comparative protocol/TLS fixtures                       | 176, 177, 179, 182, 184, 189 | Enable protected metrics and compare equal workload windows; JSON sizes are not billed bytes              |
| 2. Upload transaction boundaries | Curriculum reads use tx; external storage/parsing outside transaction, revision rechecked under lock                                                                               | 175                          | Review/merge/deploy                                                                                       |
| 3. Narrow payloads               | Upload list/returning, Pretest COUNT, scoped progress/materials, narrow runtime reads                                                                                              | 176, 177, 184                | Review/merge/deploy                                                                                       |
| 4. Tryout/monitoring batching    | Grouped package/attempt metadata; targeted membership checks                                                                                                                       | 179                          | Review/merge/deploy                                                                                       |
| 5. Drill/import writes           | One graded-answer bulk upsert, FK-layer import chunks, unchanged content skipped, atomic rollback/XP/outbox preserved                                                              | 176, 185                     | Review/merge/deploy                                                                                       |
| 6. IRT/Generator lists           | Group detail/access/summary reads for list pages                                                                                                                                   | 182                          | Review/merge/deploy                                                                                       |
| 7. Leaderboard projection        | SQL numeric aggregation/dense ranking, changed-row upsert, stale-only deletion, immutable archive                                                                                  | 186                          | Review/merge/deploy                                                                                       |
| 8. Cache                         | Shared curriculum separated from user progress, revision/TTL invalidation, miss coalescing, bounded outage fallback, PvP/curriculum counters; revision contention measured locally | 187, 189                     | Measure production hit rate and revision contention before changing ledger locking                        |
| 9. PvP snapshots                 | Narrow fields plus shared locked reads for personalized broadcast views; reuse scheduling snapshots; preserve delivery/privacy/fallback                                            | 184, 188                     | Review/merge/deploy and representative room measurements                                                  |
| 10. Auth/worker polling          | Request-only Auth dedup including photo upload, measured idle queries, poll telemetry and expiring reporting-instance registry                                                     | 183, 184, 189                | Enable all intended instances; compare idle/load contribution; retain approved intervals pending evidence |

## New local before/after evidence

| Fixture                                     |                                Before |                                                          After |
| ------------------------------------------- | ------------------------------------: | -------------------------------------------------------------: |
| Grade ten Drill answers                     |                  10 upsert statements |                                                              1 |
| Import 201 new questions (five FK layers)   |               1,005 insert statements |                                                             10 |
| Reimport: one revision, 200 unchanged       |             Existing per-row behavior |                      2 version/provenance inserts; 200 skipped |
| Leaderboard repeat, 30 students/150 matches | 31,472 protocol bytes, 240 row writes |                                   1,746 bytes, zero row writes |
| Two personalized PvP views                  |   6,229 protocol bytes, 18 statements |                                      3,263 bytes, 9 statements |
| Warm subchapter, 209-level shared hierarchy | Earlier scoped query baseline in #177 | 899 protocol bytes; cold hierarchy loading reported separately |

These are isolated localhost measurements, not production SLOs or guaranteed billing reductions. Existing read-only Supabase TLS measurements in the earlier PR reports remain separate evidence. No new cloud write benchmark, migration or deployment was performed for this completion batch.

## Merge order

Independent PRs targeting main: 175, 176, 177, 179, 182, 183, 184, 185, 186. Parent dependencies: 177 before 187; 184 before 188; 183 before 189. After a parent merges, retarget its child to main and rerun checks. Do not merge unrelated functional PRs 178/180/181 as part of this optimization batch without their own review.

The final integration rehearsal merges the optimization heads locally, verifies the combined code, and leaves main and deployments untouched. See the validation record added after that run.

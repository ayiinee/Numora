# Leaderboard projection measurement

**ENGINEERING DECISION** — preserve the approved ranking, eligibility and archive rules; move aggregation and ranking to PostgreSQL in the existing advisory-locked transaction.

Class and global activity sum immutable Drill/Tryout XP using PostgreSQL numeric arithmetic. PvP retains separate mode/difficulty rankings, best-match eligibility and the existing millisecond timestamp/UUID tie choice. Upserts change only different rows; deletions remove only rows no longer eligible. Period refresh timestamps still advance. Archived periods remain immutable.

## Isolated localhost comparison

PostgreSQL 16, 30 students, decimal XP/ties/zero XP, 150 completed PvP matches. The same integration fixture and warmed connection proxy measured server-to-client protocol bytes. This is not Supabase billed egress or a production SLO.

| Measurement | Previous implementation | SQL projection |
| --- | ---: | ---: |
| Initial projection response bytes | 31,418 | 1,697 |
| Unchanged repeat response bytes | 31,472 | 1,746 |
| Repeat projection row writes | 240 | 0 |
| Initial duration, one sample | 329 ms | 73 ms |
| Repeat duration, one sample | 236 ms | 56 ms |

The baseline fails the zero-rewrite budget as expected. Tests also cover changed XP, removed memberships, inactive accounts, dense ties, separate PvP modes, non-owner runtime permissions, transactional rollback when a later projection fails, weekly archive and archive immutability. Canonical class/PvP projection suites pass alongside the new integration test. Worker typecheck, lint and build pass.

No schema or environment change is required. Merge/deploy and production measurements remain separate release steps.

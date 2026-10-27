# QA delivery — 28 October 2026

**ENGINEERING EVIDENCE.** This delivery includes the three-role scenario workflow,
Windows onboarding, SIS-001 pilot and immutable run history, worker batch/result
projection optimizations, P0 dependency repairs, and the PvP recovery follow-up
from PR #102. No academic OPEN decision, shared database deployment or production
acceptance is introduced.

## Current evidence

The latest complete full run is `d537c6dc-e502-4058-a431-511b849ac44c`, tested on
clean source `820a76bfc279feb50e2a2826f23c4f9d8488d9cd`, parent
`5a091494-b077-4a09-95aa-8f06ac18ea21`.
Its [rollout report](../../qa/scenarios/siswa/SIS-001/reports/d537c6dc-e502-4058-a431-511b849ac44c/ROLLOUT_REPORT.md)
and [machine summary](../../qa/scenarios/siswa/SIS-001/reports/d537c6dc-e502-4058-a431-511b849ac44c/ROLLOUT_SUMMARY.json)
record the executed version. Subsequent report commits require their own CI;
they do not relabel historical results as head-commit acceptance.

- Full remains **FAIL**: load reconciliation and dependency audit remain open.
- Volume **PASS**: all 111,000 source events delivered, zero pending or identity/content
  mismatch. The 100k stage drained in 51.871 seconds under the original 120-second
  limit; the prior run's 29.002 seconds remains visible as a separate local sample.
- Load reported 3,573 accepted client completions against 3,603 newly graded
  attempts at its reconciliation snapshot. Every graded load attempt had one
  ledger and completion event, but the unmatched identities cannot be accepted.
  The generator reported 249 interrupted iterations at graceful stop. Read-only
  follow-up found 3,618 graded attempts in the load package, demonstrating late
  commits after the snapshot. Interrupted client counters are a plausible cause,
  not a proven attribution. Preserve the original FAIL. Next diagnostic must
  correlate exact client receipt IDs to commits without extending any timeout,
  stage, graceful-stop setting or load budget.
- Audit full decreased from 31 to 19 advisories: **0 critical, 4 high, 12 moderate,
  3 low**. Production audit contains 8: **0 critical, 2 high, 4 moderate, 2 low**.
  Remaining packages/advisories are in the report; no suppression was added.
- Available API regression: **244 PASS, 0 FAIL, 1 NOT_RUN** (original academic
  workbook unavailable). Database 61, worker 25, web 273, assessment 21, IRT 14,
  workflow 40, shared fixture guards 3 passed. The initial notification setup
  timeout and earlier failed attempts remain recorded separately.
- Two-browser PvP with real PostgreSQL/Redis passed all three difficulties,
  reload/reconnect, durable results, leaderboard rank and source XP. Authentication
  is explicitly synthetic. Manual keyboard, real Google login and deployment
  acceptance remain separate and unfinished.

## PR #102 and migration boundaries

The recovery fix and focused migration rehearsal were pushed to PR #102 as
`9bdc9e93b99da67c004aa5c317499bc0d58191e3`. The combined QA branch also contains
the equivalent source changes plus dependency/fixture improvements. PostgreSQL
keeps its time constraint; cancellation/outbox/invitation timestamps preserve
durable chronology including microseconds.

The pinned PR #92 Admin SQL and PR #102 runtime SQL are archived unchanged. Six
local rehearsals verify the proposed 50-entry combined journal, preserving old
hashes/history and restoring the decimal guard last. The active journal remains
0000–0040. Review/merge coordination with Ferdi's Admin work is still required;
no message was sent and his approval is not asserted. See the
[implementation boundary](../development/QA_RUNTIME_REMEDIATION_2026-10-27.md).

## Shared monitoring

The user supplied [Main Spreadsheet](https://docs.google.com/spreadsheets/d/1YW-7ikBhBhptl_d600O8TTiZ6bdtqz0PpnJ8I2syPDs/edit).
The initially selected campus account could read but received 403 on writes.
After the user explicitly selected an alternate account, the update succeeded.
`QA_Person_A_20261028` sits immediately before the historical Person C tab.
`Ringkasan!M1:Z20` now derives its counts from the fifteen current SIS-001 case
rows: **12 PASS, 2 FAIL, 1 NOT_RUN (80%)**. Supplemental regressions and history
are separate rows and do not inflate that denominator. The full verdict remains FAIL.
`QA!J2:J6` links to the results and dashboard. Native readback verified the
formulas and zero cell errors; 139 existing nonempty dashboard cells and 116
Person C cells in the inspected ranges retained their original values/formulas.
The original Checklist describes a different engineering backlog and was not edited.
Native browser preview was unavailable because the computer-use runtime could
not initialize; visual verification is therefore limited to native cell/layout
metadata, not a screenshot. Publication details are recorded separately beside
the immutable run result in `SPREADSHEET_PUBLICATION.json`.

The old configured Drive folder returned NOT_FOUND for both selected accounts.
The user then supplied the accessible Big Data parent folder. The confirmed
destination is now `Big Data/Numora QA/siswa`; the root and four role folder IDs
are stored in `qa/config.json`. The sanitized native Google Doc was read back
and its parent verified. The destination inherits the parent's existing
`anyone/writer` access; no permissions were changed, and restricted team-account
access is **not verified**. The initial 403/404 outcomes remain in publication
history. Repository reports remain the canonical test evidence.

## CI follow-up

Initial PR #109 and #102 CI passed lint, typecheck and package tests, then failed
the connected release-chain assertion comparing PostgreSQL decimal string
`"80.000000"` to integer `80`. The fixture type and numeric comparison are
corrected; expected base XP 80 and policy version 2 are unchanged. Local retest
on clean `2fc382f370571ee98d39b98152b372dd4e9939ca` passed the Drill/monitoring
chain and token/HTTP authorization checks, then timed out at the anonymous URL
guard (2 PASS, 1 FAIL, 3 NOT_RUN). An earlier API readiness timeout is retained.
Neither partial run establishes release-chain acceptance; Linux PR CI must
verify the final head. JOB-06 also explicitly pins its disabled PvP fixture so
local developer activation cannot alter that boundary; real PvP evidence is
owned by the separate JOB-16 harness.

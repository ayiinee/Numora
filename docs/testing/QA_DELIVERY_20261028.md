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

The selected publication account is
`muhammad.farel.2405356@students.um.ac.id`. The user supplied Main Spreadsheet
`1YW-7ikBhBhptl_d600O8TTiZ6bdtqz0PpnJ8I2syPDs`. Existing Person C evidence is
historical and must remain intact. Person A covers student learning; add its
current results in an adjacent dedicated tab and connect a separate QA panel in
the blank area of Ringkasan. The original Checklist formulas describe a different
engineering backlog and must not be overwritten with testing pass counts.

The configured team Drive folder returns NOT_FOUND for this selected account;
folder publication is **PENDING_FOLDER_ACCESS**, not successful publication.
Do not create a replacement team folder, switch accounts silently or expose public
access. The spreadsheet remains the authorized shared monitoring destination;
repository reports remain the canonical test evidence.

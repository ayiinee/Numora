# QA delivery — 28 October 2026

## Current closure evidence

**ENGINEERING EVIDENCE.** Full **838c1952-e8f9-4681-8396-ea74365157a1**, parent
d537c6dc, tested clean source **b33954b0678551bdea78e4bb40c9f7eb8568e9c1**.
[Closure report](../../qa/scenarios/siswa/SIS-001/reports/838c1952-e8f9-4681-8396-ea74365157a1/CLOSURE_REPORT.md)
and [machine summary](../../qa/scenarios/siswa/SIS-001/reports/838c1952-e8f9-4681-8396-ea74365157a1/CLOSURE_SUMMARY.json)
are the current entry points. Report-only head and tested application SHA remain distinct.

- **Full FAIL:13 PASS /1 FAIL /0 BLOCKED /1 NOT_RUN** of15 cases,844.782s after
  build against3600s. Load fails; human keyboard/usability remains NOT_RUN.
- Quality, rewards, components, persistence, connected, automated accessibility,
  variety, recovery, velocity, volume and dependencies PASS. Volume111000 delivered,
  zero backlog/content mismatch;100k drain34.885s/120s. Velocity3900/3900,0 mismatch.
- Load snapshot2389 accepted vs2459 graded; READ ONLY follow-up2508 graded,
  including49 late commits,0 broken durable effects and0 submitted nonfinal.
  The119 acknowledgment gap is2 HTTP500 and117 responses not observed. PostgreSQL
  logged3 OOM errors during full. This establishes an acknowledgment gap and local
  resource correlation, not confirmed loss or per-request root-cause attribution.
- Submit-only p95 is2578.22ms load and8140.42ms stress, from1891/500 recorded
  samples. Missing/interrupted responses are not assigned latency estimates.
  VU/stage, HTTP15s, gracefulStop10s, drain120s and full60min remain unchanged.
- Database61, assessment21, IRT14, API245, worker25, web273, workflow49 and fixture
  guards3 PASS. Lint/typecheck/build/contracts/freshness pass. Original workbook
  inputs now participate in parser9/9 PASS; academic approval is separate.
- Eight Admin failures were stale interactions/selectors/fixtures against the
  latest upload/release decisions. Focused Admin16/16 PASS; authorization, draft,
  overflow and exact publication assertions remain. Connected Windows6/6 passes
  without extending timeout; old anonymous/startup failures remain historical.
- Audit now **0 full /0 production advisories**, staged without suppression or
  force-fix. CI passed on PR109 b33954b and focused PR102 b8734c6; report-head CI
  remains separate. Existing owner review requires owner re-review.

The [new native report](https://docs.google.com/document/d/17lmSWzGYNi2ajl7WDoBA1pMVZqWiXyE6j5maU7PHwQw)
is verified in Big Data/Numora QA/siswa.
[Person A/dashboard](https://docs.google.com/spreadsheets/d/1YW-7ikBhBhptl_d600O8TTiZ6bdtqz0PpnJ8I2syPDs/edit#gid=202610280&range=A50:N78)
appends this run at49–78; formulas count only15 cases55–69 (13/1/0/1, rounded87%).
History and inspected Person C/original dashboard values/formulas remain unchanged.
Native cell/formula/validation readback and read-only XLSX rendering verify the
changed views. Native browser rendering is unavailable; XLSX is a surrogate.
Reconnect restored the alternate account; inherited sharing permissions are unchanged.

Next local action: investigate resource/OOM and commit-without-response using
exact attempt identities and safe SQLSTATE/response correlation. Do not weaken
gates or rerun unchanged work until green. Alternative human work uses
[MANUAL_CHECKLIST.md](../../qa/scenarios/siswa/SIS-001/MANUAL_CHECKLIST.md).
Real OAuth, staging/accounts, academic approval and migration integration remain
separate in [ACCEPTANCE_READINESS.md](../../qa/scenarios/siswa/SIS-001/ACCEPTANCE_READINESS.md).
APP-ADMIN-01 copy candidate is prepared for developer review, not applied.
No merge/deployment or cloud Development substitution occurred.

## Historical delivery snapshot — before closure

The sections below preserve the earlier delivery state. Statements such as
“latest” and open dependency/workbook counts describe that historical snapshot;
use the closure evidence above for current status. Original run files are unchanged.

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

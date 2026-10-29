# Browser CI follow-up — 28 Oktober 2026 WIB

**ENGINEERING EVIDENCE.** Report-only head5f2bfd92 ran
[CI40582718056](https://github.com/ayiinee/Numora/actions/runs/40582718056).
Workflow/contracts/lint/typecheck, package tests, IRT and real connected chain
passed. Browser E2E timed out at the unchanged global900s limit with183 PASS,
11 NOT_RUN and no failed test assertion. Build/OpenAPI freshness were skipped
on that job and cannot be counted as passing for that head. The earlier complete
CI success on application sourceb33954b remains separate evidence.

This is a suite scheduling/budget finding, not recurrence of the eight Admin
assertion failures: their cases completed before the timeout. The last started
case was Teacher responsive1920px; the remaining cases were not accepted.

## Scheduling repair

The existing browser catalog is divided into two GitHub-hosted jobs by
Playwright's test-level sharding. Each host still uses the configured one worker,
with identical fixtures, assertions, per-test90s, expect20s, global900s and job25min
limits. Each runner owns its local3300/3301 processes; the two runners do not
share browser state, fixture sockets or application server. The PvP before/after
hooks remain intact. No product code, load configuration or timeout is changed.

File-level default sharding selected171/23; inspection rejected that imbalance.
Using --fully-parallel for both discovery and execution selects97/97, still with
one worker per host. Local --list discovery compares all194 stable test IDs to
the exact disjoint union. The verifier rejects zero tests, missing/duplicate IDs,
skipped cases, retries, interrupted results and global errors. It requires every
expected ID to have exactly one passed result. These guards have focused unit
regressions. The source's actual CI execution remains the acceptance evidence.

The core job keeps database/Redis tests, connected chain, build and freshness.
The required check name **quality** is retained as an always-run aggregate:
it fails unless core and the entire browser matrix succeed. fail-fast=false
allows the independent shard's evidence to finish after another fails. Only
sanitized ID/count/status summaries are uploaded; raw browser traces are not
published by this change.

References: [Playwright sharding](https://playwright.dev/docs/test-sharding) and
[GitHub required checks / failed dependencies](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).
Do not promote a partition listing, a source-old pass or a skipped job to acceptance.
Full SIS-001838c1952 remains FAIL on b33954b; CI repair is a separate follow-up.

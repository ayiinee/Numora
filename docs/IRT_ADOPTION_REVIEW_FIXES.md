# IRT adoption review fixes - PR #147

**ENGINEERING IMPLEMENTATION - local synthetic verification, 10 November 2026.**
CI on the old head did not prove canonical artifact adoption. The reported review blockers were valid.

| Blocker | Fix |
| --- | --- |
| Canonical artifact rejected | Use the shared `irt-calibration-v1` validator and nested `outcome`; derive assigned/delivered arms from frozen input. Copy item parameters, GPCM steps, quality and eligible count from their real contract fields. |
| Legacy database references | Forward migrations bind research requests, executions and snapshots to `irt_calibration_requests_v1` / `calibration_jobs_v1`, preserve the legacy snapshot column, and make legacy-aware item guards understand v1. |
| Successful receipt overwritten by failure | Remove the out-of-transaction failure upsert. Revalidate current execution/digest/authorization before replay; a rejection cannot replace an ADOPTED receipt. |
| Mutable receipt/evidence | Migrations 0063-0064 pin the sealed artifact and frozen identities, reject incomplete commits, seal exact coverage, and reject later receipt/child/batch/item changes, including clearing source bindings. |
| Staging view lock | Reuse verified frozen input instead of requesting a row lock on the read-only view. |

Migrations 0059-0062 are carried unchanged from the dependent #149 so #147 can adopt on its own without splitting
already committed migrations or creating divergent migration histories. Some additive release DDL is therefore present;
publication endpoints/behavior remain in #149. No old migration was edited, no trigger disabled, and no shared DB migrated.
Both adoption and staging require `NUMORA_IRT_RESEARCH_ENABLED=true`; default remains off.

## Reproduce

Build `packages/database` and `packages/irt-orchestration`, install the existing AI test dependencies, then from Main root:

```powershell
$env:NUMORA_AI_SERVICE_PATH='<clean AI checkout>'
python scripts/test-irt-adoption-review.py
$env:IRT_RESEARCH_UPGRADE_TEST='true'
python scripts/test-irt-adoption-review.py
```

The harness owns a loopback PostgreSQL cluster and removes it afterward. Fixture access creates only synthetic sources;
adoption/staging use the restricted Main runtime role. A tiny real HTTP/worker artifact is scientifically INSUFFICIENT,
which remains a valid successful compute artifact; the test never invents fitted parameters.

Evidence: 24 orchestration unit tests pass. Fresh install and upgrade with nonempty historical attempt/score/XP pass.
The exact sealed real-R two-arm checkpoint (2,000 participants; SHA-256
`9bfb3e57d1186ad27bfb07c39a5a69fbe95ab9016352770f6d61d7d237ef8729`) was independently restored to an owned
cluster; PostgreSQL input commitments were reverified. All 2,000 results, item quality/counts and GPCM steps were
accepted on the #147 branch, including parallel replay, staging, immutable evidence and rejected partial/wrong-identity
adoption. This is checkpoint-resume evidence, not a new R fit or target-host capacity test.

The regression test also exercises revoked approval before adoption, revocation after successful adoption, conflict/failure
upserts, direct updates/deletes, partial transaction commit, and source-binding removal. Invalid changes roll back without
changing the successful receipt, attempts, historical scores or XP. Exact identity is checked once at sealing, avoiding a
copy of the entire batch for every child row.

Required CI must pass on the new head; old green checks and the earlier release report do not attest later changes.
See the PR checks for the final SHA. #149 must receive these same fixes before integration. Production approval and
activation remain outside this change. No AI estimator/runtime/contract change is needed.

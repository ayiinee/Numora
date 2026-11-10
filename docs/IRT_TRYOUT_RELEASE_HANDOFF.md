# IRT Tryout research release handoff

**ENGINEERING IMPLEMENTATION — owner-approved local research scope, 10 November 2026.**
This is not production authorization. New release/publication code refuses databases outside
`irt_research_test_*`, even when flags are enabled. Shared databases and real participants are excluded.

## Dependencies and pins

- Main PR #149 depends on #147; do not merge automatically.
- Baseline: [IRT_RELEASE_BASELINE_V1.json](IRT_RELEASE_BASELINE_V1.json).
- Scientific payload: `irt-calibration-v1`; transport: `irt-calibration-service-v1`.
- AI runtime/image pins: `research/irt-linux-image-v2.json` in the AI repository.
- Research policy: `research/irt/policy-v1.json`; unreconciled anchor experiments are excluded.
- Release fixture: `RESEARCH_RELEASE_POLICY_V1` in `release-decisions-v1.ts`.
  Minimum 24 academically valid observations, half-up two decimals, PG/MCMA/Category weights 2/3/3.
  Normalize authoritative awarded/max points before applying each weight once.
  These fixture values are not approved production policy.

## Startup and verification

Use the isolated startup and image verification instructions in `research/irt/README.md` and `docs/IRT_RUNTIME_HANDOFF_V2.md` in the AI repo.
Keep R concurrency 1, timeout 900 seconds, heartbeat 15 seconds, lease 60 seconds, maximum three authorized executions.
R receives no database credentials and runs without network access.

Build Main database and orchestration packages before running these harnesses. Commands from Main root:

```powershell
$env:NUMORA_AI_SERVICE_PATH='<clean AI checkout>'
python scripts/run-irt-acceptance-check.py --name release --timeout 240 -- python scripts/test-irt-release-local.py
$env:IRT_RESEARCH_UPGRADE_TEST='true'
python scripts/run-irt-acceptance-check.py --name upgrade --timeout 240 -- python scripts/test-irt-release-local.py
python scripts/run-irt-acceptance-check.py --name linux --timeout 2700 -- python "$env:NUMORA_AI_SERVICE_PATH/tools/verify_irt_linux.py" --main-repo . --delivery --main-release-check --output .tmp/irt-release-acceptance/linux
```

The local harness owns its database lifecycle. Fixture-superuser access only creates synthetic sources/policies;
adoption, finalization and reader assertions use the restricted Main runtime role.
The Linux harness owns uniquely named containers/volume and removes only its own resources.
Do not point either harness at shared infrastructure. Do not commit raw runtime logs.

## Request through publication

1. Freeze authoritative delivery/grades using the existing canonical adapter. Validate exact batch coverage,
   immutable question/package/rubric versions, five identical anchors, scope and approvals.
2. Dispatch the ID/digest/generation notification through the Main outbox. AI acknowledges asynchronously at
   `POST /api/v1/irt/compute/execute`; query `GET /api/v1/irt/compute/requests/{requestId}` with digest/generation pins.
3. Verify the sealed artifact with the shared validator. Main reads `outcome`, derives delivery identities from frozen input,
   rechecks digest/current execution/approval/cancellation, and adopts idempotently.
4. Existing admin endpoint: `POST /api/v1/admin/irt/research/requests/{id}/adopt`.
   Existing receipt staging endpoint remains available and does not publish.
5. Prepare release: `POST /api/v1/admin/irt/research/batches/{batchId}/finalizations`
   with `{ "requestId": "<uuid>", "approvalId": "<release-policy-approval-uuid>" }`.
   Pin the same live `IRT_FALLBACK` policy approval in `tryout_batches.release_policy.approvalId`.
6. Publish explicitly: `POST /api/v1/admin/irt/research/finalizations/{id}/publish`.
   Both routes require existing Content Admin capability and validated UUIDs.

Opt-in flags: `NUMORA_IRT_RESEARCH_ENABLED`, `NUMORA_IRT_RELEASE_ENABLED`, and
`NUMORA_IRT_PUBLICATION_ENABLED` must equal `true`. All default off.

IRT is selected only for an entire calibrated delivered arm whose participants with valid observations are all scored.
Otherwise the whole arm uses approved fallback. Zero denominator stays `UNSCORABLE`/null.
Nonzero coverage below 24 holds publication. IRT gate failure alone does not exclude an item from fallback.
Technical failure may use fallback without inventing an artifact or successful adoption receipt; retryable failures
remain pending while retry opportunity exists before the 72-hour deadline.

Publication is one database transaction. Results and explanation readers use the same publication gate;
all frozen attempts must be accounted for. Published results are immutable, replay cannot duplicate publication,
and late artifacts cannot replace released results. Historical attempts/answers/XP remain untouched.

## Monitoring and incident ownership

Track pending outbox deliveries, accepted/running jobs, heartbeat age, lease expiry, timeout codes,
execution count, rejected adoption/release requests, exact coverage, per-arm mode/reason,
and closed unpublished batches approaching `result_due_at` (72 hours after close).
Use request/execution/generation IDs for correlation; never log identity mappings, raw responses or credentials.
Do not automatically turn an anomaly into DRIFT or manufacture missing measurements.

Production host: **TBD**. Delivery owner: **TBD**. Policy approver: **TBD**.
Operator/on-call and incident escalation: **TBD**. Production monitoring destination: **TBD**.

## Local rollback drill

1. Disable new-job acceptance using existing AI research flag and disable Main publication/release flags.
2. Stop the daemon gracefully. Wait for active work or cancel it through authorized cancellation;
   expired/stale generation cannot be adopted or published.
3. Verify existing artifacts, receipts and published results are still readable and unchanged.
4. Roll back application only to a version compatible with forward migrations 0059-0062.
   Do not delete tables, receipts, artifacts or historical records; do not reverse migrations to erase evidence.

## Activation decisions

**Local integration readiness:** determined by the final acceptance report on its exact code/input/image pins.
CI alone is insufficient. Skipped or unrun cases remain explicit.

**Production activation: NO-GO.** Required: approved product fallback/exclusion/scoring policy and approvals,
authoritative delivery handoff, scientific acceptance including unresolved linking limitations,
target-host capacity evidence, private configuration and named operator. This PR contains no deployment.
Comparison and self-adjustment remain out of scope.

## Evidence and checkpoint resume

See [IRT_RELEASE_ACCEPTANCE_V1.json](IRT_RELEASE_ACCEPTANCE_V1.json) for exact evidence pins and unresolved checks.
The real two-arm run sealed 2,000 SCORED participants. Its immutable synthetic database was restored to a fresh owned
native PostgreSQL cluster, its PostgreSQL input commitments rechecked, and all 2,000 results published as IRT.
This resumed integration evidence is not an uninterrupted Docker capacity benchmark.

The first large run exposed two implementation defects: the legacy GPCM step guard (fixed by migration 0062),
and a reader selecting the entire batch policy snapshot for every result. Selecting only the scalar reason code
removed quadratic transfer/allocation; the adopter also reads the frozen input body only once.
Integrity checks hash complete rows and aggregate ordered fixed-size hashes to bound verification memory.

For a retained synthetic checkpoint under `.tmp/irt-release-acceptance/<case>` only:

```powershell
python scripts/run-irt-acceptance-check.py --name checkpoint-resume --timeout 240 -- python scripts/test-irt-release-restore.py .tmp/irt-release-acceptance/<case>
```

Keep `synthetic-sealed.dump` and `synthetic-roles.sql` private and untracked. The restore harness accepts only this
local evidence directory, creates a new owned cluster, verifies input commitments, and uses restricted application roles.
Never restore a real participant dump through this harness. Resume only when source, policy, input and runtime pins match.

Docker host during this run had one CPU and approximately 1.8 GiB RAM. The three-arm run encountered Docker API
failure/timeouts; do not interpret absent evidence as scientific insufficiency or a passed fallback case.
A stable host and completed real three-arm verification remain required before declaring local integration ready.

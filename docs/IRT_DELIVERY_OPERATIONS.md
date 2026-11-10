# Delivery binding and isolated IRT operations

ENGINEERING DECISION: research/synthetic only. Main baseline `ece946c` includes merged #151; this branch targets `main`. Existing scientific contract/model, legacy routing, historical scores and XP remain unchanged. No production migration or activation.

## Main setup

1. Apply forward migrations through `0066_irt_delivery_binding_v1` only to an owned `irt_research_test_*` database. Fresh install and upgrade with nonempty history are covered by the disposable harness. Never rename a production database to bypass this guard.
2. Before batch start, create approved existing context/arm set/revisions and package memberships. School/Mandiri delegation still chooses the package; there is no randomization. Missing mappings/approvals are blockers, not synthesized defaults.
3. Set server-side `NUMORA_IRT_DELIVERY_RUNTIME_PROFILE` to the absolute immutable runtime JSON file. Binding must equal that file. Configure private `NUMORA_IRT_PSEUDONYM_SECRET` (at least 32 bytes) and `NUMORA_IRT_PSEUDONYM_KEY_VERSION`. Keep secrets outside Git.
4. Enable `NUMORA_IRT_RESEARCH_ENABLED` and `NUMORA_IRT_DELIVERY_ENABLED` only in the isolated test. All new flags default off.
5. Content Admin calls `POST /api/v1/admin/irt/research/batches/{batchId}/delivery-binding`. Body: `expectedRevision` (0 initially), `contextId`, `armSetId`, `batchRevision`, `configuration`. Configuration contains `contextRevision`, five identical `anchors`, `packages` (scientific package fields plus `revisionId` and `manifestDigest`), the five existing `resources`, exact `runtime`, and `releaseApprovalId`. Release policy must have valid `RESEARCH_ONLY` approval. Save is revision-checked and audited; changes after start fail.
6. `GET /api/v1/admin/irt/research/batches/{batchId}/delivery-readiness` returns actual structural/source blockers and workflow state. `scientificGate=NOT_EVALUATED`; it never asserts model/linking acceptance. Admin batch detail uses this readiness instead of the former unconditional multi-package blocker.

## Lifecycle

The application start transaction creates arm assignment **before** the attempt, preserving first-valid evidence; inserting `tryout_student_assignments` pins the delivered revision in that transaction. Resume uses the same attempt/pin. Parallel starts remain unique per student/batch. Legacy batches have no binding and keep their existing path. No historical pin backfill.

After cutoff and final grading, run the opt-in Main daemon:

```text
NUMORA_IRT_DELIVERY_RECONCILER_ENABLED=true
NUMORA_IRT_COMPUTE_URL=http://127.0.0.1:18080
NUMORA_IRT_RESEARCH_TOKEN=<private matching AI token>
node scripts/run-irt-delivery-reconciler.mjs
```

Set variables in the process environment/private operator configuration, not in source files. Daemon polls every 30 seconds without relying on Redis. Closing the eligible batch, canonical freeze, initial generation and progress marker share one transaction/lock. Outbox retry preserves request/input/policy/runtime/generation. Reconciler does not authorize a new execution generation.

Research SQL uses a native PostgreSQL pool (maximum two connections), separate from Drizzle's modified JSON/date codecs. This also applies to research adoption, staging, release preparation and explicit publication endpoints. The pool closes on module shutdown.

For terminal compute, reconciler invokes the existing adopter and prepares release only when coverage/policy permit. Enable `NUMORA_IRT_RELEASE_ENABLED` separately. Publication still requires explicit existing endpoint and `NUMORA_IRT_PUBLICATION_ENABLED`; no daemon publishes. Retryable technical failure, scientific insufficiency and fallback remain distinct. Existing immutable receipt/result guards and authoritative snapshot coverage remain in force.

## Reproduce checks

Use the clean AI checkout via `NUMORA_AI_SERVICE_PATH`, `NUMORA_REPO_PATH` pointing to Main, and `NUMORA_IRT_TEST_RUNTIME_PROFILE` pointing to candidate Windows v5 for native Windows checks. Set `IRT_DELIVERY_APP_TEST=true`, `IRT_DELIVERY_PIPELINE_TEST=true`, and optionally `IRT_RESEARCH_UPGRADE_TEST=true`, then run:

```text
python scripts/run-irt-acceptance-check.py --name application-delivery --timeout 240 -- python scripts/test-irt-binding-local.py
```

The harness owns its PostgreSQL cluster under ignored workspace `.tmp`, uses real HTTP start/parallel resume and existing grading, durable outbox over a loopback Uvicorn API, worker/R, immutable artifact, automatic adoption/preparation, explicit publication and participant readers. Identity provider alone is substituted with synthetic users. Tiny-cohort insufficiency/fallback is expected; this is not parameter-recovery evidence. Fixture recipes remain under `packages/testing/fixtures/irt-delivery-v1`; truth is separate from the scientific payload.

The cumulative 180-minute ledger remains `.tmp/irt-release-acceptance/ledger.json`. Earlier failures remain recorded. Full-size candidate-image cases and fault/browser checks must be reported by actual status, not inferred from older image evidence.

## Host and production gates

AI operational checkpoint `65ef225`; handoff commit `40af641`; profile `irt-research-linux-producer-v2`, image manifest v3. Producer image `sha256:2df35c95696055a584cbc07525dc5db97d1a10129de3b356a6aa2bbbb75ff679`; unchanged R image `sha256:80e667703c19b364a1b8770342a97350f817ab85e1a2092b2f68958b38253036`. See AI `deploy/irt-research.compose.yaml` and `docs/IRT_VPS_OPERATIONS.md`.

Read-only VPS probe: **BLOCKED_CAPACITY**, 2 CPU / 1,615 MiB available versus 3.25 CPU / 4,352 MiB required including host reserve. No remote R or deployment. Proposed 4 vCPU / 8 GiB upgrade requires a new capacity measurement; it is not performed automatically.

Production remains blocked pending accepted Main deployment, authoritative delivery approval, production scientific/policy approval, target capacity/private connectivity and named operator/alert owner (**TBD**). Synthetic functional success does not remove these gates. One-dimensional mixed-material validity and anchor/linking limitations still apply.

Rollback: stop new Main reconciliation/intake and publication, stop worker with grace/fencing, retain all artifacts/receipts/published results and use a migration-compatible application version. Never drop research/history tables or recalculate XP.

## Acceptance checkpoint ? 10 November 2026

Main implementation checkpoint `bea298b`, integrated with `ece946c`; PR [#152](https://github.com/ayiinee/Numora/pull/152) targets `main`. Machine-readable evidence: `IRT_DELIVERY_OPERATIONS_ACCEPTANCE_V1.json`. Earlier release acceptance remains historical evidence for its own pins.

Verified: fresh/upgrade disposable migrations with nonempty history; binding rejection cases; real application HTTP parallel start/resume and final grading; one canonical snapshot/dispatch under concurrent/restarted reconciliation; real outbox HTTP, native R, adoption, explicit publication, locked/unlocked readers, cross-participant denial, revoked approval rejection, and unchanged attempt/answer/XP/history content. Small cohorts correctly produce insufficiency and Main fallback rather than fabricated IRT scores.

The new pinned Linux image separately passed a four-respondent HTTP/worker/R artifact/replay smoke test and runner fault checks. AI suite: 84 tests, 21 skipped. Docker Compose configuration validated; performance at its exact CPU limits and active-daemon signal handling remain NOT_RUN. The Linux smoke harness used higher API/worker CPU limits than Compose, so it supplies no Compose throughput claim.

Full-size native Windows verification FAILED during canonical PostgreSQL freeze (`53200`, memory allocation), before R. Two-arm 2,000-respondent computation and subsequent three-arm 2,100-respondent case are NOT_RUN on this candidate. About 1.1 GiB physical RAM remained when inspected. No scientific outcome is inferred from this infrastructure failure. Retry only after capacity is available, using existing AI `tools/verify_irt_linux.py --delivery --main-release-check` and its pinned manifest; preserve the cumulative ledger.

Decisions: small synthetic end-to-end integration VERIFIED; complete acceptance NOT_COMPLETE; host BLOCKED_CAPACITY; production NOT_READY. Remaining work includes full-size candidate verification, exact Compose operation/performance, active worker signal acceptance, final CI on the submitted SHA, and production approvals/operators. No deployment or shared migration occurred.

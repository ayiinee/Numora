# IRT production preparation

Status: candidate code, not production activation. Main PR targets `main`; scientific contract and estimator unchanged. Existing research mode stays disposable-only. All production intake/reconciliation/release/publication flags default off.

## Baseline and migration

Main VPS checkout was verified at `4b913576` after #152, with all four Main services active. Delivery binding is canonical migration **0066**, following `0065_drill_ab_distribution_lock`. Production authorization is additive migration **0067**. Do not replay the older branch's 0065 binding migration or rewrite deployed hashes. Inspect the actual migration journal read-only; a checkout/file is not proof of migration. If the synthetic database has unrecognized history, create a new owned disposable database using the canonical loader. Do not repair production history by guessing.

No production migration or configuration change is performed by this implementation. The operator applies accepted migrations only after backup/restore and change review. Rollback uses migration-compatible application code; never deletes data or runs a down migration.

## Authorization and policy

`irt_production_authorizations_v1` is operator-owned with no runtime write grants. Each enrollment binds database OID/name, context/batch, restricted Main/compute logins, enabled service principal, exact runtime/resources, release approval, scientific acceptance digest and expiry. Absence, expiry, mismatch or revocation blocks execution. Revocation is `UPDATE ... SET revoked_at=clock_timestamp()` by the operator; no application endpoint can enroll itself. Runtime mode and database pins are additional gates, not approval substitutes.

Approve model, quality, eligibility, scoring, score mapping and release policies through the existing approval process with purpose `PRODUCTION` and the exact context. Candidate scientific policy lives in AI `research/irt/policy-production-candidate-v1.json`; productionApproved remains false because release authorization is external. It changes scope/version only, not research formulas/thresholds. Release candidate retains minimum 24 valid items, PG/MCMA/category weights 2/3/3, HALF_UP_2 and FALLBACK_WHOLE_ARM. None becomes approved automatically. No fallback value is computed by AI.

Use `scripts/enroll-irt-production.py` with a private manifest and `IRT_OPERATOR_DATABASE_URL` (TLS verify-full). Default is a read-only dry-run; `--apply` inserts one operator enrollment and never creates logins or policy approvals. An existing enrollment is not overwritten. Scientific acceptance JSON must explicitly state `decision=APPROVED_FOR_PRODUCTION`, contextId and PostgreSQL `pinsDigest` for `{context,batch,runtime,resources,releaseApprovalId}`. Missing approver/scientific acceptance remains BLOCKED. Never fabricate it to start a worker.

Private enrollment manifest fields: contextId, batchId, mainLogin, computeLogin, servicePrincipalId, runtimeProfile (relative JSON path), resources (relative JSON path), releaseApprovalId, scientificAcceptance (relative JSON path), approvedByUserId and expiresAt (timezone required). The named approver must be an active Content Admin. Operator and alert owner remain **TBD** until assigned.

## Private configuration and service layout

Main stays under systemd; AI uses dedicated Compose. Do not replace `/etc/numora/production.env` or use its owner/migration/service_role credential for IRT. Provision distinct LOGIN roles without superuser, CREATEDB, CREATEROLE, BYPASSRLS or object/schema ownership. Grant `numora_main_runtime` only to the IRT Main login and `numora_irt_runtime` only to compute. Supply random passwords through the operator's secret channel, not SQL committed to Git. Compute must fail PII/canonical writes and cannot enroll itself. Its production request/job/artifact visibility is scoped to registered login and principal.

Main private environment, chmod 600:

```text
NUMORA_IRT_MODE=PRODUCTION
NUMORA_IRT_PRODUCTION_ENABLED=false
NUMORA_IRT_RESEARCH_ENABLED=false
NUMORA_IRT_DATABASE_URL=<restricted Main IRT URL with sslmode=verify-full>
NUMORA_IRT_PRODUCTION_DATABASE=<exact database name>
NUMORA_IRT_DELIVERY_RUNTIME_PROFILE=<absolute approved immutable production profile JSON>
NUMORA_IRT_PSEUDONYM_SECRET=<random secret at least 32 bytes>
NUMORA_IRT_PSEUDONYM_KEY_VERSION=<operator version>
NUMORA_IRT_COMPUTE_URL=http://127.0.0.1:18081
NUMORA_IRT_TOKEN=<private random token shared with AI>
NUMORA_IRT_DELIVERY_ENABLED=false
NUMORA_IRT_DELIVERY_RECONCILER_ENABLED=false
NUMORA_IRT_RELEASE_ENABLED=false
NUMORA_IRT_PUBLICATION_ENABLED=false
```

AI private environment uses COMPUTE_DATABASE_URL (compute login, TLS verify-full), COMPUTE_SERVICE_PRINCIPAL_ID and NUMORA_IRT_TOKEN. Production Compose fixes server mode PRODUCTION and uses linux-production-v1. Research API/PostgreSQL keep 18080/55432; prepared production API uses loopback **18081**, avoiding research collisions. No AI public domain/Caddy change. API has no Docker socket. Worker/R retain limits and network isolation. Validate Compose with `config --quiet`, never dump expanded secrets. Initialize work/health volumes to UID/GID 10001 and mode 0700 before first start. No production PostgreSQL service is created by the production Compose file.

Install `deploy/numora-irt-reconciler.service` only after the reviewed Main build is deployed. It is disabled by default and runs the existing daemon every 30 seconds; it does not publish. Runtime secrets are shared only with the process that needs them. Rotations occur after deployment as requested, before real participant activation. Never copy credentials from chat into deployment scripts.

## API, delivery and rollout gates

Production Content Admin endpoints under `/api/v1/admin/irt`: POST `batches/{batchId}/delivery-binding`, GET `batches/{batchId}/delivery-readiness`, POST `batches/{batchId}/finalizations`, POST `calibration-requests/{requestId}/adopt`, POST `finalizations/{id}/publish`. DTOs and validation match existing research APIs. Server mode must match namespace; research routes remain compatible in research mode. Requests cannot select the mode or grant approval. No new scientific payload fields.

Before opening a bound batch, verify context/revision, full package manifest/order, five identical anchor question versions, original reference package, rubric, authoritative delivery and six approved resources. Existing delivery start/resume/parallel-pin logic remains unchanged. Frozen roster is complete; only closed batches with final grading dispatch. Readiness is not scientific acceptance. Reconciliation/adoption may prepare a finalization, but publication is always explicit.

Enable intake/delivery/reconciler only after the separate full-size VPS acceptance and scientific review. Enable release and publication separately after coverage and policy checks; publication remains operator-triggered. Monitor request age, backlog, lease/heartbeat, timeout/retry, artifact rejection, fallback and the 72-hour deadline. No automatic retry generation or publication.

Rollback: disable reconciliation, new intake and publication; gracefully stop worker and confirm R cleanup; retain artifacts, receipts and published results. Restore only matching, migration-compatible runtime/application versions. Do not recalculate XP or historical scores.

## Evidence and outstanding gates

The cumulative verification budget is 180 minutes, tracked in `.tmp/irt-release-acceptance/ledger.json`; never reset it. Current preparation does not claim full-size or production readiness. Required checks must pass on final PR head. Full two-/three-arm VPS acceptance, exact Compose resource performance, active worker signal acceptance, production policy/scientific approval, secret rotation and named operators remain activation gates. Failed/not-run checks stay explicit.

Read-only VPS inspection found delivery bindings present and production authorization absent. Runtime access to `drizzle.__drizzle_migrations` returned PostgreSQL `42501`; migration history verification remains an operator blocker. No production migration, enrollment or participant job was executed.

Local evidence: disposable authorization/fencing and application-to-R-to-reader regression passed, including history/XP content integrity. Candidate Linux four-participant pipeline passed (ACK 0.047 s, compute 2.719 s), with actual scientific outcome `INSUFFICIENT`, not scientific acceptance. AI commit `27cc419`; producer image `sha256:88a37a5442ec5dc55332af830053666f50fc3cef2393c505698ce39cd008969a`; R image `sha256:80e667703c19b364a1b8770342a97350f817ab85e1a2092b2f68958b38253036`. Final PR checks are authoritative for CI.

## PR #157 review correction: API delivery versus private IRT login

Forward migration **0068_irt_delivery_authorization_boundary** separates the student-start guard from private compute visibility. The ordinary API transaction retains its existing Main runtime privileges; it is not added to operator enrollment and does not receive the IRT credential. The delivery trigger checks and locks the live, database/context/runtime/resource-bound enrollment through a narrowly granted SECURITY DEFINER assertion. Snapshot, dispatch, compute, adoption and release retain the existing enrolled-login guards. Compute cannot execute the delivery-only assertion.

Disposable regression `IRT_PRODUCTION_AUTHORIZATION_TEST=true python scripts/test-irt-binding-local.py` uses three distinct restricted logins: API, private IRT Main, and compute. It covers real HTTP parallel start/resume, exact delivery pins, API exclusion from the IRT projection/private assertion, runtime mismatch, revoked enrollment rollback, and existing compute/PII/canonical boundaries. Set `NUMORA_AI_SERVICE_PATH` to the clean pinned AI checkout and `NUMORA_IRT_TEST_RUNTIME_PROFILE` to its matching profile. No R or shared database is used. The separate review-fix budget is 1,200 seconds; generator retains its independent 2,700-second allocation. CI at the new head is authoritative.

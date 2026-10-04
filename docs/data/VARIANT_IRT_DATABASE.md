# Variant and IRT persistence

**ENGINEERING UPDATE — JOB-10 foundation:** a main-owned immutable dispatch table now authorizes one execution per manual retry generation. `compute_executions.dispatch_id` is nullable for preserved PR #51 history, and canonical batches have a unique source artifact. New `irt_input_dispatches_v3` exposes only dispatch ID/request/generation to compute. [Admin/Redis handoff and runbook](../development/IRT_V3_RUNBOOK.md) implements CALIBRATE_TRYOUT snapshots and atomic evidence/parameter adoption, default off. No respondent score, activation or publication is enabled. Existing migrations are unchanged; 0018 appends schema/guards and preserves legacy v1/v2 and unmanaged PR #51 helper behavior.

**ENGINEERING DECISION — 3 October 2026:** implement the database plan requested by
Shafwan. [ADR-011](../adr/ADR-011-separated-irt-compute.md) records ownership and migration
boundaries. The source PDF is `docs/rancangan fitur soal variant dan irt.pdf`.

## Ownership and states

`public` owns canonical content, rubrics, packages, attempts, exposure, cohorts/assignments,
snapshots, requests, approvals, adopted results, baseline/reference activation and Tryout
finalization. `irt_compute` owns templates/configurations, generation provenance/candidates,
execution leases, selection manifests, immutable artifacts, validation and adjustment evidence.

Execution success is independent from scientific sufficiency. Content validation, measurement,
Compare and distribution are distinct states. Legacy READY is content approval, not empirical
equivalence. Legacy IRT results are not automatically activated. New PG uses 2PL without
guessing; PGK stores ordinal categories/GPCM steps separately from weighted product points.

## Assessment and trial invariants

`questions.id` identifies a family. Lineage pins the original version. Content/rubrics and
package/attempt snapshots are preserved after use. REGULAR attempts retain existing behavior.
ORIGINAL_PILOT/VARIANT_AB reuse canonical attempts with separate assignments and no product
grade, progress, stars or XP. Pilot precedes A/B; A/B requires valid baseline/references and
approved policies. Main executes cohorts/arms; compute proposes requirements and scientific
inclusion within operational eligibility. Replacement candidates require new trials/evidence.

Exposure records all server-issued item/explanation payloads across modules, conservatively,
without claiming the student read them. Reservation prioritizes learning: access remains
allowed; prior conflicting exposure invalidates eligibility with an audit trail. Checks use
timestamps before trial delivery, not indiscriminately all later exposure.

## Frozen inputs and handoff

Contract version 3 is additive to v1/v2. Requests pin context, snapshot or wave/package,
configuration approvals, digest and deadline. Snapshots copy response facts, scoring,
delivery and eligibility. Frozen rows cannot change; corrections create replacement input.
Compute sees pseudonymous respondents, not profiles. Immutable selection manifests identify
exact input rows and scientific reasons. Retries use identical input; only a completed current
execution with matching provenance is adopted. Completion does not automatically publish.

Generation artifacts use `payload.candidateIds` to identify the sealed candidate rows
that main may import. Import checks the actual candidate content, pinned rubric, lineage
and digest. Candidate creation requires a live execution lease; no candidate may be
appended after an execution has completed and been accepted.
Imported variants cannot enter regular Drill delivery until main records a READY
distribution decision backed by passing Compare evidence in that level's context.

## Tryout

**PRD RULE — TryOut v1.1:** publication is due within 72 hours of batch close; published
scores are immutable. A batch uses one package and one mode/contributing item set.
Compute returns theta/uncertainty/mapped score; main owns rank, percentile, fallback and XP.
Precision/ties follow an approved policy.

**PROPOSED:** FALLBACK/UNSCORABLE follow the PDF; existing release behavior is retained until
failure/release policy approval. Invalid items do not contribute. Corrections are versioned
derived results. Late IRT cannot replace published results. No cross-batch equating, global
Drill theta profile, second generation wave or Tryout A/B is activated.

## OPEN and rollout

Rubrics, quality thresholds/tolerances, cohort/reference design, adjustment bounds, package
evaluation, mappings/ties, cutoff/correction/fallback and retention remain OPEN. Configurations
start DRAFT. PDF examples are not production defaults. Preserve historical migrations/fork
hashes. Rehearse on isolated local databases; a designated operator applies reviewed shared
migrations. Implementation tests do not use cloud credentials.

## Service accounts

Migration roles `numora_main_runtime`/`numora_irt_runtime` are NOLOGIN group roles. The
operator grants exactly one to each separate non-owner login, without superuser, owner,
CREATE or BYPASSRLS. Existing deployment credentials remain until the operator changes them.
Compute reads `irt_input_*_v3` views, never public tables directly. Service runtime does not
write public requests/canonical content. Main runtime cannot mutate compute artifacts.

## Implementation and migration procedure

Migrations `0014`–`0017` extend the existing `0000`–`0013` history. Main migrations
`0012_square_gargoyle` and `0013_chemical_wallflower` are preserved unchanged. `0014` moves the
three generation tables with their IDs intact; compatibility views remain read-only.
`0015` adds structural tables/columns and `0016`/`0017` add integrity rules, role
grants, input views and pinned baseline/reference fields. Existing historical migration
files are unchanged. Drizzle generation currently reports no structural drift.

The implementation includes persistence and exported database handoff helpers. It does
not implement the statistical engine, the scheduling/cohort orchestration application,
or the new Tryout publication reader. Existing v1/v2 API integrations keep their legacy
release gate until that application migration is implemented with approved policies.
The new finalization tables are ready for that integration; inserting a completed
compute execution does not publish a student result.

Run migration with a designated migration account, using `DATABASE_MIGRATION_URL`.
That account needs permission to create schemas, functions and NOLOGIN runtime group
roles and to grant their privileges. Run from the repository root:

```powershell
pnpm db:migrate
pnpm --filter @tka/database build
pnpm db:check
```

Provision two distinct, non-owner LOGIN accounts separately. Grant
`numora_main_runtime` to the API/worker account and `numora_irt_runtime` to the compute
account. Configure the corresponding `DATABASE_URL` in each deployment. These accounts
must not inherit privileged deployment/migration roles. Keep migrations in this repo;
the separate service consumes contract v3 and never runs its own schema migration.
Credential provisioning and applying these migrations to shared/cloud databases have
not been performed by this implementation.

Legacy single-choice rubric backfill is explicitly DRAFT; it preserves existing binary
grading and cannot approve a trial rubric. Legacy parameters are not activated.
Historical exposures are marked `LEGACY_UNVERIFIED`; only actual server-issued future
payloads use the issuance kinds. Existing generation lineage is backfilled only when
the recorded original and candidate already belong to the same family. Unresolved
legacy lineage requires review rather than fabricated relationships.

Regression coverage uses isolated local PostgreSQL databases and separate runtime
login accounts. It covers migration replay/history preservation, namespace permissions,
ordinal versus weighted scoring, frozen response evidence, learning-first reservations,
request idempotency/outbox, scientific inclusion, lease fencing, approved parameter
copying and immutable batch finalization. Academic sample thresholds and other OPEN
policies are represented only by explicitly labeled TEST fixtures.

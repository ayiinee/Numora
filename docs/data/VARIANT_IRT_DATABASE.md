# Variant and IRT persistence

**ENGINEERING DECISION — owner-approved target, 8 November 2026:** read the [v2 context and reconciliation](../AI_IRT_V2_CONTEXT.md) first. Day-one regular A/B replaces the separate original pilot and reward-free experiments; two active Drill arms replace the one-pool target. Tryout becomes multi-package with per-arm fallback within 72 hours and no score ranking. Existing schema/guard descriptions below are an implementation baseline, not evidence that v2 is implemented. Existing migrations must remain immutable; change guards through reviewed forward migrations, not bypasses.

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
The existing ORIGINAL_PILOT/VARIANT_AB foundation uses separate assignments without product
grade, progress, stars or XP and requires an original baseline before A/B. These are legacy
implementation constraints, superseded as target policy by v2 regular, rewarded A/B without
a separate original pilot. Main still owns operational assignment; compute owns scientific
selection within eligibility. Concurrent original/anchor quality and comparison gates remain
required. Replacement candidates require new versions, content review and fresh evidence.

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
Existing guards prevent imported variants entering regular Drill until a READY distribution
decision backed by passing Compare evidence in that level's context. V2 instead permits
content-approved provisional distribution before empirical PASS; implementing that transition
requires new policy/state/guard handling. Do not weaken current guards as a documentation fix.

## Tryout

**ENGINEERING DECISION — v2 target approved 8 November 2026:** publication remains due
within 72 hours of batch close; published scores are immutable. A batch may contain an
original and several variant packages. Each student receives one package/batch; fallback
is per package/arm. Main owns validation and publication of score/explanation, without
Tryout score rank or percentile; XP/activity leaderboards remain. The current one-package,
one-mode/contributing-set finalization structure needs a forward implementation change.

Fallback direction is approved: 100 × awarded product points / maximum product points,
using approved PG/PGK rubrics and PG=2, MCMA=3, Category=3 weights. Exact invalid-item,
zero-denominator, precision and release contracts remain OPEN, as does theta-to-score mapping.
Late IRT cannot replace published results. Cross-batch equating, Indicator/Chapter models
and Tryout multi-arm distribution are not activated by this documentation update.

## OPEN and rollout

Rubric details, quality thresholds/tolerances, cohort/reference design, adjustment bounds,
package evaluation, theta mappings, cutoff/correction, fallback implementation details and
retention remain OPEN. Fallback scope/formula are approved as described above. Configurations
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

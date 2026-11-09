# Tryout IRT research runtime

**ENGINEERING DECISION — owner-approved implementation scope, 9 November 2026.**
Research-only, synthetic local execution. This is not production approval,
canonical student-result adoption, publication, product fallback, comparison
PASS/DRIFT, or evidence that one-dimensional Tryout measurement is appropriate.

Paths under `research/` and `numora_service/` refer to Numora-ai-service; paths
under `packages/` and `scripts/` for the main worker refer to Numora.

## Scientific pins

`policy-v1.json` pins the research profile. `r-sources.lock.json` and `.tsv`
contain the complete non-base/non-recommended R source dependency closure with
SHA-256. R 4.5.2 and its base/recommended packages are frozen by the base image
digest in `Dockerfile.irt-research`; mirt is exactly 1.48. Builds verify source
hashes and installed DESCRIPTION versions. Lock regeneration is an explicit
maintainer operation, not startup behavior. Pin the resulting image ID in each
frozen request; a mutable tag is never an execution pin.

PG uses 2PL with D=1. PGK uses GPCM with absolute step difficulties; one question
is one psychometric unit. Distinct question versions are distinct columns.
Structural missing values are not zeros. Common anchor versions are constrained;
unadministered focal copies are constrained for identification, without merging
different focal question versions. Original-group mean/variance is 0/1.

EM uses 61 quadrature nodes, 1,000 cycles, tolerance 1e-4, deterministic seed and
one numerical thread. Full covariance supports the delta conversion from mirt
cumulative intercepts to absolute difficulties. Parameter names alone do not
establish compatibility: probability parity is checked at 17 theta points.
Unavailable fit/dependence evidence remains NOT_EVALUATED and blocks the gate.

Participant EAP uses a common N(0,1) prior. Reported standardError is posterior
SD conditional on fitted item parameters. Score is expected points on the same
frozen reference mask divided by maximum reference points, times 100, rounded
half-up to two decimals. All reference parameters must pass gates. No percentile,
min/max rescaling, forced perfect score, or invented fallback is used.

## Build and scientific checks

From AI root:

```powershell
docker build --platform linux/amd64 -f Dockerfile.irt-research -t numora-irt-research:local .
$env:IRT_RESEARCH_TEST_IMAGE = docker image inspect numora-irt-research:local --format '{{.Id}}'
python -B -m unittest tests.service.test_irt_r_oracle -v
python tools/run_irt_research.py --image $env:IRT_RESEARCH_TEST_IMAGE --output .scratch/irt-one.json
python tools/benchmark_irt_research.py --image $env:IRT_RESEARCH_TEST_IMAGE --output .scratch/irt-benchmark
```

The benchmark requires 30 completed replications, 1,000 people per arm, and
reports recovery, interval coverage, gate failures and elapsed times. A failed
target does not authorize lowering thresholds. Synthetic data are generated in
Python independently of mirt sampling functions. Reports contain synthetic IDs
only and remain ignored until a reviewed aggregate report is committed.

## Local transport

Main owns migration `0054_irt_calibration_research.sql` and all DDL/grants/RLS.
The additive request/dispatch/inbox/artifact pipeline deliberately leaves legacy
analysis requests, respondent-adoption guard and canonical results untouched.
Frozen input writes are rejected outside database names `irt_research_test_%`.
Use a disposable loopback PostgreSQL cluster, never shared Development.

From main root, `python scripts/test-irt-research-local.py` creates and destroys
its own cluster and database, applies the canonical migration stream, and runs
real restricted-role tests. Set `IRT_RESEARCH_TEST_IMAGE` to a built image ID to
include the full synthetic R case. Without it, that case is explicitly skipped;
an infrastructure-only pass is not integrated scientific acceptance.

HTTP process: `python -m uvicorn numora_service.irt.api:create_app --factory`.
Daemon: `python -m numora_service.irt.daemon`.
Both need `NUMORA_IRT_RESEARCH_ENABLED=true`, independent
`NUMORA_IRT_RESEARCH_TOKEN` (32+ characters), `COMPUTE_DATABASE_URL`, and
`COMPUTE_SERVICE_PRINCIPAL_ID` as required by the existing service settings.
Do not pass database credentials into R. Generator enablement/token are separate.

Main transport: `node scripts/irt-research-worker.mjs` (or `--once`), with
`IRT_RESEARCH_MAIN_DATABASE_URL`, `NUMORA_IRT_RESEARCH_URL` and the same research
token/flag. The worker requires loopback disposable database/HTTP addresses;
there is no shared DATABASE_URL fallback. Durable outbox state survives restart.

The container runs without network, as an unprivileged user, read-only root,
private temporary bind directory, 2 GiB RAM and a two-CPU quota ceiling. The host
may provide less capacity. No production SLO follows from local measurements.
Heartbeat is maintained during both R fitting and Python participant estimation.
Cancellation, lease loss and stale dispatch stop execution; generation retries
are authorized by main, capped at three, and preserve frozen inputs.

## Digest and artifact boundary

Recipe `PG_JSONB_IRT_RESEARCH_V1` hashes PostgreSQL jsonb text via existing
`irt_compute.payload_digest` over `{recipe,body,resources,runtime}`. `body`
excludes `inputDigest`; resources include full immutable definitions and refs;
runtime includes the immutable image pin. The database computes this commitment.
Neither JavaScript JSON.stringify nor Python json.dumps defines digest bytes.

Compute seals payload plus diagnostics plus runtime in one transaction, fenced
to the current live execution/generation. Main revalidates contract, digest,
input, approval and dispatch read-only. The result remains an artifact. Original
account IDs and HMAC secrets stay in main; AI receives pseudonymous respondents.

## Operational boundaries and rollback

All flags default off. Stop the main transport and AI daemon, then disable the
research flag to stop new work. Record cancellation through main for a live
request. Preserve immutable research evidence; do not drop tables, edit historical
migrations, disable triggers, or modify student attempts/XP to roll back.

Before any production use: approve scientific model and policies, inspect
empirical dimensionality and anchor adequacy, complete capacity/security review,
and separately implement approved canonical adoption/publication. Five anchors
and leave-one-anchor-out sensitivity do not prove absence of DIF or construct
equivalence. Research fixture approvals never authorize shared content.


## Measured research evidence (9 November 2026)

See `research/irt/acceptance-report-v1.json` in AI and the identical
`docs/IRT_RESEARCH_ACCEPTANCE_V1.json` in main for metrics, report digests and
remaining checks. All 30 replications on the same R image converged and passed
the declared numerical recovery targets: difficulty bias 0.0031, difficulty RMSE
0.0958, log-discrimination RMSE 0.1007, step RMSE 0.0839, theta RMSE 0.3794.
Difficulty/step 95% coverage was 0.9471; conditional theta coverage was 0.9452.

Four reports exercised the complete producer; 26 are numerical-recovery-only
experiments. `--recovery-only` runs the same model and synthetic design without
wire validation and never produces a contract artifact. Recovery EAP includes
all identifiable simulated attempts. Participant gate counts therefore apply
only to the four producer reports (8,000 participants). Separate item-arm fit,
item-version precision and anchor diagnostics cover all thirty replications.

The research sensitivity gate held at least one anchor in 20/30 no-DIF synthetic
replications. All 1,650 item-version precision checks and all 1,800 adjusted-Q3
checks passed; 2/1,800 S-X2 Holm checks held. Recovery acceptance does not establish
production policy suitability. The anchor hold rate requires academic review;
thresholds were not changed, and held linking is not automatic DRIFT.

The final expanded-runtime-manifest upgrade/HTTP/daemon/R/artifact run passed
15/15 tests in 301.738 seconds, including ACK <10 seconds, per-arm anchor support,
identity-read denial and artifact tampering/immutability. Exact historical
attempt/score/XP rows were preserved. The legacy upgrade suite additionally
passed 9/9 after its expected nullable delivery-pin default was made explicit.
Python service regression passed 58 tests with 29 explicit environment-dependent
skips; real-R and PostgreSQL tests were also run separately. All 14 tests in the
main orchestration package and all 114 scientific conformance vectors passed.

Real-R probability/EAP integration and container fault tests passed 5/5. Pure
2PL, pure GPCM and mixed three-arm engine cases converged at 500 respondents per
arm; probability conversion errors were at most 4.45e-16. The declared 30-run
recovery targets apply only to the two-arm mixed design at 1,000 per arm.

The nondegenerate +1.3-DIF fixture fitted successfully and held linking (released
anchor difficulty shift about 1.73); local dependence reached adjusted Q3 0.78.
Unidentified/no-common-observation and one-cycle injections failed inside mirt;
no valid parameters or guessed SE were accepted. These raw-engine failures are
not canonical participant result artifacts. The constant-category first DIF
fixture was replaced and is not counted as evidence of DIF detection.

The full producer partial-arm case scored 500 reference participants while
keeping the other arm's 500 eligible participants recorded and zero fitted.
An empty anchor category produced scientific SUCCEEDED + INSUFFICIENT without
invoking R or renumbering categories. Prior exposure/crossover/retry contract
rules and legitimate wrong/omitted answers retain their existing semantics.

Local research acceptance is complete. The initial handoff's inherited CI
blockers were reconciled on 9 November 2026: final Admin landing assertions,
nullable historical clock/delivery defaults, generator toolbar wrapping, and
forward migration ordering. Preserve canonical main's Drill clock 0051, followed
by assessment arms 0052, generator stock/media 0053 and research calibration 0054.
Required CI checks passed on the repaired #125/#126/#127/#130 stack and on
#132 at `a1fb519`; the PR checks tab is authoritative for subsequent commits.
PR #132 remains draft for review, not because those inherited failures persist.
No PR was merged automatically and no shared database was migrated.

The supplemental Windows full-suite run passed all non-API packages and 337 API
tests, skipped one API case, and timed out one notification broadcast test at its
unchanged five-second limit against 338 accumulated synthetic Students. Its full
nine-test suite passed against a freshly migrated isolated database with four
fixture Students. This is not a claim that the full Windows run was green.
Official CI passed with the pinned Node 24.22.1 runtime; local Node was 24.15.0.
The reconciled research upgrade harness also passed 14 active transport/guard
tests, with one pinned-R-image case skipped in this reconciliation run, while
preserving historical attempts, scores and nonempty XP. Scientific model/image
pins and the earlier research benchmark are unchanged; CI success is not
production approval.

The initial Docker/WSL outage was recovered with explicit owner permission;
unrelated Tulungrejo app/database containers returned healthy. The same image,
model, data seeds and thresholds were retained after recovery.

### Tested runtime binding

`research/irt-runtime-profile-v3.json` pins the immutable Linux amd64 R image,
scientific Python source hashes (SHA256 after LF normalization), tested Python
version/platform and installed dependency versions. The Python research lock is
`research/irt-python-research.lock`; it is independent of the existing generator
lock, whose versions differ from this tested host. The current Python host is
Windows; using Linux Python requires an explicitly validated new runtime profile.
The R process itself runs in Linux. `irt-system-packages.lock.txt` records the
built image inventory. The Dockerfile/source locks support rebuilding, but a
new image digest is never approved or installed into the profile automatically.

The AI checks exact profile/environment equality; main may additionally pin
`pseudonymKeyVersion`. Build with `docker build --platform linux/amd64 -f
Dockerfile.irt-research -t numora-irt-research:reference-v1 .` on a fresh machine.
Do not overwrite the versioned tag on the current test host; interrupted
benchmarks require the existing digest. A different rebuild digest needs explicit
profile regeneration and verification. Install the Python research lock into a
separate Python 3.11.3 environment for this recorded profile.

HTTP ACK authenticates notification/digest/generation/resource/runtime metadata
and persists the inbox. Full scientific matrix validation occurs at daemon claim
before fitting. A dedicated 15-second monitor renews the lease during both JSON
validation and estimation; polling only during R would leave a validation gap.

Run standalone experiments sequentially on constrained development machines.
A service's database concurrency guard does not serialize standalone CLI tools.
Resume the benchmark using its existing output directory and exact image digest;
completed replications are checked against the image pin. Run
`tools/check_irt_stress.py` after recovery for pending failure-injection cases;
its one-cycle policy is a deliberate test mutation, never an approved profile.


## Sanitized contract examples

The existing payload contract remains authoritative: in AI, use
`contracts/irt-calibration-v1/examples/tryout-input.json`, `tryout-result.json`,
`tryout-insufficient.json`, `tryout-unscorable.json`, `tryout-timeout.json` and
`tryout-not-comparable.json`. Main mirrors the directory under
`packages/contracts/irt-calibration-v1`. These are synthetic contract examples,
not registered policy approvals or computed student results. Transport uses
`irt-calibration-service-v1/examples/accepted.json` and the shared digest vector.
Do not send a payload directly in the notification endpoint: freeze/authorize
through main and send only notification v3 IDs/digest/generation.


Reproduce additional checks in AI with the pinned image digest:

```text
python tools/check_irt_stress.py --image <digest> --output .scratch/irt-stress.json
python tools/check_irt_partial.py --image <digest> --output .scratch/irt-partial.json
python tools/run_irt_research.py --image <digest> --per-arm 500 --arms 3 --output .scratch/irt-three.json --recovery-only
```

S-X2 Holm correction is applied within each arm; release-test Holm correction
covers the five anchors. The fixed policy/source hashes preserve that scope.
Any academic change to scope, model or threshold requires a new policy version
with a stated reason, not retrospective tuning of this benchmark.


## Tryout participant outcomes and failure evidence ? 9 November 2026

**ENGINEERING IMPLEMENTATION ? research only.** The service-AI follow-up is
independent of admin package configuration. It consumes the existing frozen
`irt-calibration-v1` input; no admin lifecycle, student routing, canonical
results, publication, fallback scores or historical XP changes are introduced.

The positive multi-arm regression uses fixed synthetic seed `20261119`, 1,000
participants per arm, the unchanged research-v1 policy and pinned mirt image.
This seed is a known positive case from the original benchmark, deliberately
selected to verify the success path; it is not a gate acceptance-rate estimate.
The HTTP/inbox/daemon/R/artifact test now requires 2,000 `SCORED` outcomes,
exact respondent?attempt?package?batch matching, finite posterior uncertainty,
reference-score checks, and replay to the same immutable artifact. Six outputs
are compared to a finer 1,201-point posterior grid; existing R-oracle tests
separately compare against independent numerical integration.

AI's `research/irt/anchor-gate-audit-v1.json` rechecks all 30 baseline report
hashes, image pins, seeds, synthetic truth and the unchanged policy hash. Twenty
replications are held (66.7%; Wilson 95% interval 48.8?80.8%). There are 17 anchor
step-difference holds and 18 log-slope holds, with no Holm-significance hold.
Multiple reasons may occur in one replication. The existing gate remains
conservative: nonsignificance does not prove equivalence. An unexplained,
missing, non-finite or wrong-identity anchor cannot pass the gate. Diagnostics
now identify which condition held each anchor; they do not declare PASS/DRIFT.

`tools/evaluate_irt_anchor_sensitivity.py` adds paired no-DIF/+1.3 difficulty-DIF
experiments at 500 and 2,000 respondents per arm, with immutable source/input
checkpoints. This small experiment illustrates sample-size and eligibility
effects, not a reliable detection-rate estimate or a new academic policy.
Threshold changes, released-effect uncertainty/equivalence analysis and safe
per-arm refitting require separate versioned research evidence. A joint fit
with unstable linking is never silently used to score the original arm.

Scientific failure tests distinguish nonconvergence, singular covariance,
unavailable fit diagnostics, local dependence and unstable linking, keeping
scores null when held. The transport fault matrix uses deterministic engine
doubles and is labeled as such; it supplements real-R tests rather than
claiming recovery evidence. Singular, asymmetric, indefinite and non-finite
covariance are rejected before delta-method parameter conversion.

Technical engine exceptions remain `FAILED + INTERNAL_ERROR` under the
unchanged contract, with no automatic retry. Diagnostics retain only an
allowlisted engine stage and scientific failure code, excluding raw R messages
and calls. Missing sample/failed scientific gates remain scientific outcomes;
timeout/dependency failures preserve their existing retry semantics. Revocation,
cancellation and stale execution still fence artifact acceptance.

Runtime profile v3 (`irt-research-windows-producer-linux-r-v3`) pins the new
Python sources, including gate/failure helpers; profiles v1/v2 and their prior
evidence remain historical. V3 additionally requires fit diagnostics for every
arm that actually observed each item; an anchor missing one arm's diagnostics
cannot pass using only the other arm's evidence. The R image and research-v1 thresholds
are unchanged. Linux Python validation remains outside this follow-up.

The original acceptance-v1 JSON predates the corrected CI and this outcome
work. Its numerical recovery evidence remains valid, but its old CI blocker
and aggregate acceptance status must not be used as a current readiness claim.
Use the supplementary outcome report delivered with this follow-up.


### Running this follow-up

From AI, run:

```text
python -B -m unittest tests.service.test_irt_math tests.service.test_irt_gates tests.service.test_irt_failures tests.service.test_irt_outcomes -v
python -B tools/audit_irt_anchor_gates.py --reports .scratch/irt-benchmark-reference-v1 --output .scratch/anchor-audit.json
python -B tools/evaluate_irt_anchor_sensitivity.py --image sha256:80e667703c19b364a1b8770342a97350f817ab85e1a2092b2f68958b38253036 --output .scratch/anchor-paired-new
```

The audit requires the original private local benchmark files; committed hashes
are checked and missing evidence is an error. Paired experiments use only
synthetic data and can run without a database. Use a fresh output directory
after changing any pinned source; mismatched checkpoints are rejected.

For HTTP/daemon/R/artifact validation, run main's
`scripts/test-irt-research-local.py` with `IRT_RESEARCH_TEST_IMAGE` set to the
same digest and `IRT_RESEARCH_UPGRADE_TEST=true`. The harness owns a disposable
loopback PostgreSQL instance and removes it afterward. No shared database URL
or dotenv fallback is used. Run expensive checks sequentially for meaningful
timing measurements; this follow-up is correctness evidence, not an SLO.

Rollback requires checking out the earlier AI source together with runtime
profile v1; do not pair current code with older source hashes. Research features stay
disabled by default. Existing frozen v1 jobs are not rebound silently to a newer profile;
finish them with their exact previous runtime or cancel and issue a newly
pinned request. This follow-up has no migration or deployment to roll back.


### Paired sensitivity results

The committed `research/irt/anchor-sensitivity-paired-v1.json` records these
small paired experiments (one seed, same unchanged policy/R image):

| Respondents per arm | No injected DIF | +1.3 anchor difficulty shift |
| --- | --- | --- |
| 500 | 1,000 NOT_COMPARABLE | 500 SCORED on reference-only fit; 500 INSUFFICIENT |
| 2,000 | 4,000 SCORED | 4,000 INSUFFICIENT; anchor sensitivity also held |

At 500 with DIF, the variant lacks eligible category coverage and is excluded
before joint fitting. Reference-only scoring is not evidence that linking
passed or that DIF was statistically detected. At 2,000 the joint fit converges,
but the injected-DIF dataset is held by scientific gates and no score is issued.
The experiment does not estimate detection sensitivity, specificity, or a safe
minimum sample size for real school data. More participants are not a promise
that every healthy batch passes.

These experiments preceded the final per-arm-diagnostic completeness guard.
Their exact producer hash is recorded in each case. The adjacent
`sensitivity-producer-source-v1.patch` reconstructs that experimental source
from the current producer for provenance review only; never apply it to the
service runtime. It omits the later failure-detail/completeness additions,
without changing the model, thresholds or fitting image. Final runtime
acceptance is recorded separately in the supplementary outcome report.


### Final frozen-source verification

The final runtime-v3 run passed all 17 HTTP/daemon/R/upgrade/fault tests
(464.494 seconds on the local host), including the 2,000-participant scored
case and all six scientific fault cases. Historical attempts, scores and a
nonempty XP ledger were exactly preserved. The independent latest fault
harness passed 2/2 tests; 31 math/policy/R-oracle/runner and 16 API/generator/
contract regressions also passed. These overlapping suites must not be summed
as independent experiments.

Versioned supplementary evidence is mirrored at AI
`research/irt/outcome-acceptance-v1.json` and main
`docs/IRT_OUTCOME_ACCEPTANCE_V1.json`. It separates final-runtime acceptance,
prior numerical recovery, paired sensitivity experiments and known limitations.
An intermediate run invalidated by live source changes is explicitly recorded
and superseded; it is not reported as passing. No production policy, Linux
producer capacity, canonical publication or admin package workflow is approved
by these results.


## Linux producer and handoff ? 10 November 2026

The explicit Linux producer profile is `research/irt-runtime-linux-v1.json`;
`research/irt-linux-image-v1.json` pins its tested image ID, profile digest,
Dockerfile and hash-locked Linux wheel dependencies. Windows defaults to the
separate `research/irt-runtime-windows-v4.json`. Profiles v1?v3 remain historical
sources of earlier evidence and are not silently rewritten. The R image and
research-v1 statistical policy remain unchanged.

`Dockerfile.irt-producer` pins CPython 3.11.3 amd64 and Docker CLI base digests.
The image deliberately excludes credentials and original question bank files.
The Linux profile is mounted read-only after image sealing, avoiding a circular
image/profile digest. A new build does not automatically update an approved
profile. `NUMORA_IRT_RUNTIME_PROFILE=linux-v1` and
`NUMORA_IRT_PRODUCER_IMAGE=<exact digest>` must match the frozen request.

Linux private work directories remain 0700; the R container runs under the
producer UID/GID. Named volumes share only the execution subdirectory with R,
which remains no-network/read-only/no-DB-credentials. The trusted supervisor
uses the host Docker socket; the HTTP API does not need that privilege. This
is a trusted-host research topology, not a general untrusted multi-tenant
sandbox or a deployment authorization.

Use `docs/IRT_AI_HANDOFF.md` as the current integration entry point and
`tools/verify_irt_linux.py` for disposable Linux HTTP/inbox/daemon/R/artifact
verification. `tools/check_irt_handoff.py` checks exact document/contract parity
and profile/source pins. The main copy is `docs/IRT_AI_HANDOFF.md`; all database
schema and canonical lifecycle ownership remains with main.

The earlier Docker interruption is not a passing capacity measurement. Docker
was recovered without changing global CPU/RAM settings; the test host remains
one CPU and about 1.8 GiB RAM. Local observations do not certify a two-CPU VPS,
peak memory bounds, or production SLO. New Linux evidence is recorded separately
in `research/irt/linux-acceptance-v1.json`, mirrored as main
`docs/IRT_LINUX_ACCEPTANCE_V1.json`.

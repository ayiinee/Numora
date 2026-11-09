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

Main owns migration `0053_irt_calibration_research.sql` and all DDL/grants/RLS.
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

The final pinned HTTP/daemon/R/artifact run passed 15/15 tests in 161.198 seconds,
including ACK <10 seconds, per-arm anchor support, identity-read denial and
artifact tampering/immutability. Upgrade testing preserved exact historical
attempt/score/XP rows. Python service regression passed 57 tests with 29 explicit
environment-dependent skips; dedicated real-R and database tests are reported
separately. Additional model/stress/partial-arm followups are still running;
the report records them as pending until actual evidence is available.

The initial Docker/WSL outage was recovered with explicit owner permission;
unrelated Tulungrejo app/database containers returned healthy. The same image,
model, data seeds and thresholds were retained after recovery.

### Tested runtime binding

`research/irt-runtime-profile-v1.json` pins the immutable Linux amd64 R image,
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

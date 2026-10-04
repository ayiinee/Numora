# IRT Integration

**ENGINEERING UPDATE — 3 October 2026:** the additive separated-service persistence
and contract v3 are documented in [Variant and IRT persistence](VARIANT_IRT_DATABASE.md).
The existing v1/v2 API release behavior below remains the transition path.

**ENGINEERING IMPLEMENTATION — 4 October 2026:** JOB-10 foundation adds Admin
prepare/status/manual retry for `CALIBRATE_TRYOUT`, frozen inputs, PostgreSQL dispatch
generations and BullMQ notifications. The v3 notification and calibration payload
schemas live in `packages/contracts/compute`; the exported types live in
`@tka/database`. Compute must pass the notification generation to
`claimComputeExecution`; one dispatch permits one execution. See the
[v3 handoff runbook](../development/IRT_V3_RUNBOOK.md) for the consumer contract,
role provisioning, recovery and adoption validation. `IRT_V3_ENABLED=false` remains
the default. Adoption stores evidence and parameters without activating them,
scoring respondents or releasing Student results. The legacy integration below
stays compatible; scientific engine and release-policy acceptance remain separate.

## Baseline item-analysis requirements and latest TryOut rules

PRD v0.5 states:

- IRT runs as a daily batch/cron process;
- uses cumulative Student responses rather than a weekly period;
- outputs difficulty, discrimination, guessing according to Data-team capability;
- is shown on Admin question detail;
- current baseline threshold: minimum 30 responses;
- below threshold displays “Data belum cukup”;
- IRT must not modify historical Student score/XP.
- weekly Tryout uses one shared package for all users in a period, and its result/explanation is released only after the related IRT batch; TryOut v1.1 makes ≤3×24h after batch/period end a FINAL requirement, with exact batch schedule/low-response/failure policy still OPEN-18.

Detailed model/input/scale parameters remain OPEN-12. Minimum 30 above is the v0.5 Admin item-analysis baseline; the latest TryOut PRD does not define a universal numeric Student release gate.

## Architectural principle

**ENGINEERING IMPLEMENTATION, 1 October 2026:** `IrtIntegrationService` provides canonical response snapshots, pseudonymous respondents, transactional output persistence, and idempotent completion/failure handling. The envelope still requires Data review; the model, scheduler, and release policy remain owned by Data/Qurotul and OPEN-12/18. See [FERDI_CONTENT_SUPPORT](../api/FERDI_CONTENT_SUPPORT.md). Migration `0004_flimsy_korg` adds nullable batch metadata; no automatic Tryout release or historical score/XP rewrite is performed.

IRT is asynchronous and must not run in the Student answer/submit critical request path.

```text
Assessment response data
       ↓
Daily eligible-item extraction
       ↓
IRT computation (Data/worker)
       ↓
Versioned IRT result
       ↓
Admin query/display
```

## Input contract

At minimum Data needs a documented item-response representation with:

- stable Student/respondent pseudonymous ID;
- question/version/item ID;
- response correctness or category representation appropriate to model;
- attempt timestamp;
- relevant assessment/content version metadata.

Exact model input must be finalized with Data.

## Output metadata

Persist:

- item/question-version ID;
- sample size;
- model/version;
- calculated timestamp;
- status;
- difficulty/discrimination/guessing fields supported by approved model.

## Reproducibility

Store model/version and enough metadata to explain which run produced an Admin-visible result. New IRT runs supersede display results but do not rewrite historical Student assessment facts.

## TryOut weighted result handoff — latest feature PRD

**PRD RULE — [TryOut v1.1 §7–9](../product/sources/PRD_02_Core_Learning_TryOut.docx.md):** 35 PG/PGK MCMA/Category items shared per batch, one attempt/user/package, IRT-weighted simulation score and explanation only after release. Score must use the Research/Curriculum-approved TKA scale (still TBC), become available ≤3×24h after batch end and remain immutable after release. XP is score-based with no time bonus; numeric conversion remains TBC.

**OPEN:** model, calibration, PGK rubrics/input, scale, batch end/schedule and low-response/failure policy. Existing PG-normalized fixture output is not the final result policy. The scheduler must distinguish Admin daily item analysis from TryOut batch closure/result release. Processing/retry retains raw submissions; no partial score/explanation may escape before release. Record result/model/policy versions and release timestamps; measure SLA from batch end, not individual submit. This updates context only, not the runtime integration envelope.

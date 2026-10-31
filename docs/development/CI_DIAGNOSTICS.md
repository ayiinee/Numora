# CI diagnostics and required quality gate

**ENGINEERING DECISION — Aini, 27 October 2026:** split CI diagnostics while retaining every existing gate and the required `quality` check. This work covers CI only. Frontend PvP/leaderboards, Development startup, product changes, Cloud migrations, deployment and other owners' feature defects remain separate.

**ENGINEERING DECISION — owner instruction, 30 October 2026:** reconcile PR #108 with current main and fix CI tooling until it can be merged. The reconciliation preserves main's complete two-shard browser partition, exact executed-case verification, QA harness validation, Node 24.22.1 pin and 1,500,000 ms suite limit. No product assertions, coverage guards, schema or repository rulesets are relaxed.

## Workflow and isolation

`validate` runs script checks, QA harness tests/manifest/TypeScript validation, contract validation/generated-type freshness, lint and typecheck. After it succeeds, four independent job groups run:

| Job              | Required work                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests`          | Migrate isolated PostgreSQL, force execution of workspace unit/integration tests, QA Admin provisioning, database upgrade and staging-bridge fixtures |
| `connected`      | JOB-10 IRT foundation, then JOB-06 release chain with its own database                                                                                |
| `browser-e2e`    | Entire fixture Playwright suite, including PvP, across two test-level shards; verify the full partition and exact executed identities in each shard   |
| `build-contract` | Production build, OpenAPI generation and tracked-contract freshness                                                                                   |

All jobs check out the same workflow SHA, verify it against `git rev-parse HEAD`, use Node 24.22.1 and the repository's pinned pnpm, and install with the frozen lockfile. Only pnpm dependencies are cached by setup-node; no workflow-level build or test-result cache is restored. `tests` uses `turbo run test --force --concurrency=1`, so cached task successes do not replace integration execution, and workspaces retain main's serial test execution. No Turbo remote-cache credentials are configured.

`tests` and `connected` each have separate PostgreSQL 16/Redis 7 service containers. Within `connected`, JOB-10 retains its disposable database/restricted-role fixtures; JOB-06 uses `numora_test_job06`. The clean-checkout/SHA guards remain enabled. No connected PvP suite is added by this increment.

`quality` depends explicitly on **all five** job groups and runs with `if: always()`. Its Node-only evaluator fails closed for failure, cancellation, skipped, invalid or missing results and a checkout SHA mismatch. GitHub's aggregate matrix result must succeed, including both browser shards; matrix fail-fast is disabled so one failure does not cancel its sibling's evidence. It needs no pnpm install or database. A failure in `browser-e2e` therefore cannot hide the independent build result. A failed `validate` prevents the four downstream groups and also fails `quality`.

The existing required check name stays `quality`; repository rulesets are not changed. Work jobs retain 25-minute limits; aggregation gets five minutes. Parallel runners repeat installation/build work and may consume more minutes even if wall-clock time improves. Measure the run before changing concurrency/timeouts. No automatic reruns, retries, test exclusion or `continue-on-error` is introduced.

## Reports and artifacts

Open **Actions → CI run → quality → Summary**. The report contains the actual checkout SHA (a PR merge SHA when GitHub tests a synthetic merge), run attempt, required-job results, per-job/per-step durations and links to logs/artifacts.

The aggregator reads only job/artifact metadata using a read-only `actions: read` token. It never downloads logs or artifacts. It writes the allowlisted projection to `.tmp/ci-diagnostics/quality.json`; raw API responses, token values and environment dumps are not exported. Metadata lookup is bounded and paginated. A lookup failure is reported as unavailable; it cannot change authoritative `needs` failures into success.

| Artifact prefix          | Contents                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `browser-1`, `browser-2` | Per-shard JUnit/HTML reports, fixture failure traces/screenshots, and main's sanitized browser partition/result JSON files |
| `connected-job10`        | Existing sanitized `.tmp/job10-evidence/connected.json` only                                                               |
| `connected-job06`        | Existing sanitized `.tmp/job06-evidence/connected.json` only                                                               |
| `quality`                | Sanitized aggregate JSON only                                                                                              |

Artifact names end with `<checkout-sha>-<run-attempt>` and expire after seven days. Upload steps use `if: always()`. Hard cancellation, runner loss, setup failure or a job-level timeout may still prevent upload; missing/expired evidence is explicitly reported, never inferred as a pass. Re-running only failed jobs can leave evidence from an earlier attempt; the summary intentionally lists the current attempt's artifacts only and marks unavailable ones.

Fixture browser tests use synthetic Auth/API/WebSocket data. CI keeps line/JSON output and adds JUnit/HTML; the workflow does not override those reporters. JSON feeds the existing exact-case verification and is not uploaded raw. Screenshot capture is failure-only and trace remains failure-only. Local runs keep the line reporter. Connected configs keep screenshots/video/traces off to avoid credential-bearing evidence. Do not run the fixture config against real-user services or upload `.env*`, storage state, `.qa-seed`, dumps, raw provider logs or entire `.tmp` folders. These reports establish engineering fixture results, not real Google/academic/release acceptance.

The quality summary links both matrix job logs and artifacts independently. Its browser durations are shown as shard 1 / shard 2 rather than a sum of parallel execution. Missing shard metadata/evidence stays unavailable. Optional metadata never overrides the authoritative aggregate matrix result.

## Reading failures and reproduction

1. Record checkout SHA, run/attempt, job, failing step/test, expected/actual and evidence URL before rerunning anything. Counts from an incomplete/timed-out suite do not establish full coverage.
2. Distinguish `failure` from `skipped` and `not_completed`; the latter two do not establish a pass. Steps later in the same failing job may still be skipped. Other independent jobs continue.
3. Compare against the [baseline ledger](CI_BASELINE_2026-10-27.md), using the same behavior/contract and noting any SHA change. Old PR evidence cannot prove a new integration SHA.
4. Classify as CI configuration, fixture/assertion, application or resource. Aini owns CI configuration. Feature owners receive fixture/application defects with a reproducible handoff; do not change expected results solely to make CI green.
5. For a suspected flaky test, retain the first failure, record a targeted rerun separately, and investigate timing/state. A passing rerun does not erase the initial failure.

Root-level checks without external services:

```powershell
node --test scripts/ci-quality.test.mjs
pnpm test:checks
pnpm contracts:validate
pnpm contracts:types:check
pnpm lint
pnpm typecheck
pnpm build
```

For fixture browser reproduction, install Chromium, then run from the root:

```powershell
pnpm --filter @tka/web exec playwright install chromium
pnpm --filter @tka/web test:e2e
# A targeted run is diagnostic only, not a substitute for the full required suite.
pnpm --filter @tka/web test:e2e e2e/admin.spec.ts
```

Set `CI=true` in the test process to reproduce the CI reporters. Reports are generated/ignored files. Run on a matching Node/pnpm and record Windows versus Linux differences; keep timeout/resource changes separate from assertion defects.

Integration reproduction follows [isolated local test services](GETTING_STARTED.md#dedicated-local-test-dependencies); never substitute shared Cloud URLs. Connected runners need a committed clean SHA and their documented dedicated services/databases: [JOB-10](IRT_V3_RUNBOOK.md#verification) and [JOB-06](../testing/JOB06_RELEASE_CHAIN.md). Developer service installation/startup is outside this CI increment.

## Handoff and completion

Use: `SHA/environment | job/test | expected vs actual | reproduction | evidence | category | DRI | status`.

Aini implements CI tooling. Tangguh is the requested tooling reviewer and Reyhan the independent evidence verifier; their review is pending until they actually complete it. Feature ownership follows the current [SE joblist](SE_JOBLIST_2026-10-19.md), not merely the PR author. This document does not send a review request or claim sign-off.

Diagnostics may be implemented while unrelated feature failures remain. Approval/merge still requires passing required checks, and full repository Definition of Done remains separate from targeted tooling validation. No bypass or merge is authorized by a diagnostic report.

# Development startup verification

**ENGINEERING DECISION — instruction from Aini:** document the observed web/API/worker startup and manual probe procedure, preserving its evidence limits. Ownership and completion criteria come from [Aini's Development responsibilities](SE_JOBLIST_2026-10-19.md#aini--tampilan-dan-backend-pvpleaderboard-be-runtime-dan-devops). The reusable procedure is in [Getting Started](GETTING_STARTED.md).

## Source and evidence

| Field                    | Recorded value                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application source SHA   | `86410d7edb1951244d5faac82972cfdc8db728a8`                                                                                                                                       |
| Operator                 | Aini                                                                                                                                                                             |
| Environment              | Local web/API/worker processes with the configured Supabase/Redis Development dependencies; not school-facing acceptance staging                                                 |
| OS/shell                 | Windows, PowerShell                                                                                                                                                              |
| Web/API observation date | 30 October 2026, WIB                                                                                                                                                             |
| Worker/probe evidence    | Terminal excerpts supplied by Aini in this session; full timestamps and per-process runtime versions were not included                                                           |
| Runtime baseline         | Node 24.22.1; pnpm 12.6.0                                                                                                                                                        |
| Working-tree limit       | Local environment configuration and later `.env.example` edits exist outside the committed SHA. This record identifies the source revision, not an immutable deployment artifact |

The agent verified portable Node 24.22.1 / bundled Undici 7.30.1 against the official SHA-256 and used it for web/API startup. On 31 October 2026, Aini initially supplied operator-terminal output showing Node 24.19.0 and pnpm 12.6.0. Node resolution selected `C:\nvm4w\nodejs\node.exe` before `C:\Program Files\nodejs\node.exe`; pnpm resolved through `C:\nvm4w\nodejs`. That selected Node was below the supported floor.

Aini then prepended the verified portable runtime directory to that PowerShell session's PATH and supplied Node 24.22.1 / pnpm 12.6.0 output. `where.exe node` listed the repository-local `.tmp/server-runtime/node24.22.1/node.exe` first, ahead of the two global candidates. This session-scoped PATH change does not alter an already running worker or other terminals. After receiving the instructions to stop the old worker, restart it under the supported runtime and enqueue a probe from a second terminal using the same runtime, Aini confirmed "sudah complete" on 31 October 2026. The supported-runtime rerun and restart are recorded as operator-reported PASS. No new timestamped or per-job completion receipt was supplied. Earlier observations remain tied to their original evidence. Private launcher paths, credentials and raw logs remain ignored.

## Observed results

`PASS` below applies only to the named observation. `NOT_VERIFIED` means the evidence required for that check was not supplied; it is not a product failure.

| Check                                           | Status       | Actual evidence and scope                                                                                                                                                                                           |
| ----------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development configuration check                 | PASS         | `Development environment configuration is consistent.` from startup/prepare output                                                                                                                                  |
| Supporting package builds                       | PASS         | Database, assessment-engine and irt-orchestration `tsc` steps completed before the schema check                                                                                                                     |
| Database schema connectivity                    | PASS         | `Database schema check passed: 114 expected tables and columns present; RLS enabled.` This count belongs to the recorded SHA                                                                                        |
| Web and Admin login page                        | PASS         | Agent observed HTTP 200 from `/` and `/admin/login` on local port 3000; this does not prove authenticated login                                                                                                     |
| API health                                      | PASS         | Agent observed HTTP 200 and `status=ok` from `/api/v1/health` on local port 3001                                                                                                                                    |
| Database health endpoint                        | PASS         | Agent observed HTTP 200, `status=ok`, `dependency=postgresql` from `/api/v1/health/database`                                                                                                                        |
| Worker startup / Redis readiness                | PASS         | Aini supplied `[worker] Redis connected; background processing enabled`                                                                                                                                             |
| Manual probe enqueue                            | PASS         | Aini supplied `Queued manual probe 1 under numora:dev:aini.` and then the equivalent output for job 2                                                                                                               |
| Manual probe processing                         | PASS         | Aini supplied two `[worker] bootstrap probe completed` messages, then another readiness/completion excerpt. The existing completion logger has no job ID; this records completion observations, not per-ID receipts |
| Explicit worker restart                         | PASS         | Operator confirmed completion on 31 October 2026 after explicit stop/restart/probe instructions. This is operator-reported evidence; no new timestamped per-job receipt was supplied                                |
| Operator terminal runtime pin                   | PASS         | Aini supplied Node 24.22.1 / pnpm 12.6.0 and portable Node first in PATH on 31 October 2026, then confirmed the requested worker/probe rerun complete                                                               |
| Another developer / fresh-checkout reproduction | NOT_VERIFIED | No independent setup reproduction was supplied                                                                                                                                                                      |

Queue state was not assumed from the producer output: after the first enqueue, a bounded read-only check found job 1 waiting. Aini subsequently supplied the worker completion messages. The earlier waiting state is retained as a normal intermediate observation, not rewritten as completed-at-enqueue.

## Sanitized worker excerpts

Initial startup and background status, supplied by Aini:

```text
[worker] Redis connected; background processing enabled
[outbox] status {
  pending: 0,
  failed: 0,
  retryReady: 0,
  oldestPendingSeconds: 0,
  oldestFailedSeconds: 0,
  coolingDown: 0
}
[leaderboard] class projection {
  entries: 104,
  pvpEntries: 0
}
[outbox] batch { processed: 1, failed: 0 }
```

The period identifier is omitted here. These are observed counts, not seeded expectations or proof of leaderboard/ranking business correctness. Zero PvP entries alone is not evidence of failure. Worker startup performed normal background processing against the configured Development resources.

Producer and subsequent consumer excerpts, supplied by Aini:

```text
Queued manual probe 1 under numora:dev:aini.
Queued manual probe 2 under numora:dev:aini.
[worker] Redis connected; background processing enabled
[worker] bootstrap probe completed
[worker] bootstrap probe completed
```

Later excerpt, followed by Aini's acknowledgement that the check was done:

```text
[worker] Redis connected; background processing enabled
[worker] bootstrap probe completed
```

This last excerpt confirms readiness/completion again. It does not independently establish whether it came from a new worker process.

Subsequent operator confirmation, 31 October 2026: after the runtime-selection output and explicit stop/restart/probe instructions, Aini reported "sudah complete". This closes the requested local rerun/restart check as operator-reported evidence; it is separate from the older excerpts above and from another teammate's reproduction.

## Startup findings and disposition

| Finding                                                                | Disposition                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global Node 24.19.0 was below the repository floor                     | Web/API used a checksum-verified portable 24.22.1 runtime. A reusable terminal-selection procedure is still needed for each teammate                                                                                                    |
| Local PvP settings combined `official` with `temporary-owner-accepted` | API rejected startup with `Temporary PvP content requires PVP_MODE=demo.` Local configuration was aligned to DEMO for the selected temporary pool, following the existing owner exception; subsequent API/database health checks passed |
| `pnpm env:check` passed before that PvP startup rejection              | **PROPOSED:** extend preflight coverage for the existing runtime/configuration rules and add synthetic tests. This documentation does not implement that change                                                                         |
| Repeated probe submission before checking consumption                  | Procedure now distinguishes enqueue output from worker completion and uses separate terminals                                                                                                                                           |

No application code, migration, content classification, scoring rule, historical result or XP formula was changed by this documentation task. The existing local `.env.example` edits are preserved and are not part of the recorded runtime evidence.

## Verification and deferred follow-up

**ENGINEERING DECISION — instruction from Aini, 31 October 2026:** publish the documentation through a commit/PR now and defer the remaining setup checks. Deferral does not convert unperformed checks into PASS or establish full setup/release acceptance. No application tests or CI gates are disabled by this decision.

- [x] Capture operator-terminal versions and executable selection: Node 24.19.0, pnpm 12.6.0, nvm4w selected first; Node is below the supported floor.
- [x] Correct the selected operator terminal to Node 24.22.1 / pnpm 12.6.0 and confirm that the portable Node is first in PATH.
- [x] Select the supported Node runtime in worker/probe terminals and repeat startup/probe verification; operator confirmed completion after the Node 24.22.1 / pnpm 12.6.0 selection and rerun instructions.
- [x] Worker stop/start and post-restart probe: operator confirmed completion after the explicit procedure on 31 October 2026; no new timestamped per-job receipt captured.

| Follow-up                                          | Status and disposition                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Another teammate / fresh-checkout reproduction     | DEFERRED by Aini for this documentation submission; no independent reproduction is claimed      |
| Complete service dependency handoff                | DEFERRED by Aini; retain the known results and unverified service boundaries in the table below |
| Independent documentation review before submission | DEFERRED by Aini; the PR is the review entry point, with no prior reviewer sign-off claimed     |

| Dependency                     | Evidence in this record                                       | Follow-up                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL / Supabase database | Schema and health connectivity passed                         | Retain the intended Development target and runtime permissions in the private handoff                                                      |
| Redis                          | Worker readiness and manual-probe completion observed         | Record the service owner/environment confirmation without endpoint credentials; prefix isolation alone does not prove a dedicated instance |
| Supabase Auth / Google OAuth   | Configuration consistency and unauthenticated login page only | Actual Google login/callback and cross-role acceptance remain separate                                                                     |
| R2 / SMTP                      | No live flow captured here                                    | Confirm owner/access/configuration when the scoped upload/invite/recovery flow is needed                                                   |
| Python generator / IRT         | Not exercised by the basic bootstrap probe                    | Follow the existing service runbooks and approved activation prerequisites when those flows are in scope                                   |

**OPEN — completion boundary:** this records the completed local startup/probe checks and owner-deferred follow-up. It does not close complete setup verification, outbox/leaderboard business correctness, SIS-001 load/manual acceptance, real-identity staging, academic approval or deployment. Farel/Reyhan acceptance and approved deployment target/SHA remain separate records.

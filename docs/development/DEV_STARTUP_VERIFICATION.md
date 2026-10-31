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

| Check                                           | Status   | Actual evidence and scope                                                                                                                                                                                           |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development configuration check                 | PASS     | `Development environment configuration is consistent.` from startup/prepare output                                                                                                                                  |
| Supporting package builds                       | PASS     | Database, assessment-engine and irt-orchestration `tsc` steps completed before the schema check                                                                                                                     |
| Database schema connectivity                    | PASS     | `Database schema check passed: 114 expected tables and columns present; RLS enabled.` This count belongs to the recorded SHA                                                                                        |
| Web and Admin login page                        | PASS     | Agent observed HTTP 200 from `/` and `/admin/login` on local port 3000; this does not prove authenticated login                                                                                                     |
| API health                                      | PASS     | Agent observed HTTP 200 and `status=ok` from `/api/v1/health` on local port 3001                                                                                                                                    |
| Database health endpoint                        | PASS     | Agent observed HTTP 200, `status=ok`, `dependency=postgresql` from `/api/v1/health/database`                                                                                                                        |
| Worker startup / Redis readiness                | PASS     | Aini supplied `[worker] Redis connected; background processing enabled`                                                                                                                                             |
| Manual probe enqueue                            | PASS     | Aini supplied `Queued manual probe 1 under numora:dev:aini.` and then the equivalent output for job 2                                                                                                               |
| Manual probe processing                         | PASS     | Aini supplied two `[worker] bootstrap probe completed` messages, then another readiness/completion excerpt. The existing completion logger has no job ID; this records completion observations, not per-ID receipts |
| Explicit worker restart                         | PASS     | Operator confirmed completion on 31 October 2026 after explicit stop/restart/probe instructions. This is operator-reported evidence; no new timestamped per-job receipt was supplied                                |
| Operator terminal runtime pin                   | PASS     | Aini supplied Node 24.22.1 / pnpm 12.6.0 and portable Node first in PATH on 31 October 2026, then confirmed the requested worker/probe rerun complete                                                               |
| Another developer / fresh-checkout reproduction | DEFERRED | Skipped by Aini for this documentation submission; no independent setup reproduction is claimed                                                                                                                     |

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

## Verification and service handoff

**ENGINEERING DECISION — clarification from Aini, 31 October 2026:** defer only another teammate's setup reproduction. Perform the service dependency audit and technical documentation review before assessing this documentation PR for main. Checks outside basic startup retain their actual inactive/unverified status; no application tests or CI gates are disabled.

- [x] Capture the initial operator terminal: Node 24.19.0, pnpm 12.6.0, with nvm4w selected first.
- [x] Correct the selected terminal to Node 24.22.1 / pnpm 12.6.0 and confirm the portable Node first in PATH.
- [x] Supported-runtime worker/probe rerun and stop/start: operator confirmed completion on 31 October 2026.
- [x] Perform a bounded read-only audit of basic service configuration, live health and retained probe completion records; see below.
- [x] Review the documented commands, configuration names, readiness messages, evidence distinctions and local links against repository source.

| Follow-up                                                | Status and disposition                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another teammate / fresh-checkout reproduction           | DEFERRED by Aini; this is the only skipped setup check in this submission                                                                                                                                                                 |
| Service dependency mapping and read-only readiness audit | PASS for the basic Development scope: all dependency categories, observed configuration, engineering handoff routes and activation limits are recorded below. Provider ownership/isolation confirmation remains an explicit external item |
| Technical documentation review                           | PASS for the agent's source/command/link review, subject to final-head CI. This is not independent human approval; no code-owner sign-off is invented                                                                                     |
| Provider ownership and Redis instance dedication         | Supabase operator: Reyhan, confirmed by Aini. Redis: Aini recalls a Development instance; metadata/namespace audit supports current Development use, while provider-account ownership/dedication and eviction policy remain OPEN          |

### Read-only audit — 31 October 2026

Audit started at 00:22:39 WIB (`2026-10-30T17:22:39.861Z`) under Node 24.22.1. The documentation checkout was `61fc42665ffd89a5305c05872e5c9571c77e6440`; application code is unchanged from the runtime source SHA recorded above. The private sanitized audit JSON stays ignored. No new queue job, account, email, upload, seed, migration or feature activation was created by this audit.

| Check                                    | Status                           | Evidence                                                                                                                                                                                                                                       |
| ---------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic configuration                      | PASS                             | Required values present; web/API Auth settings match; configured Auth project matches the documented Development project; PostgreSQL TLS/session port, Redis TLS and the developer prefix match the expected baseline. `pnpm env:check` passed |
| Live API and PostgreSQL health           | PASS                             | HTTP 200 and `status=ok` from both local API and database health endpoints                                                                                                                                                                     |
| Supabase Auth reachability/configuration | PASS                             | Auth health/settings both HTTP 200; public provider settings report Google enabled. This does not establish an interactive Google callback/login result                                                                                        |
| Redis connectivity and probe receipts    | PASS                             | Read-only PING returned PONG. Retained completed history contains manual-probe IDs 1, 2 and 3, each with a finish timestamp and no failure reason. This is later evidence, distinct from the earlier waiting observation                       |
| API watch-loop observation               | PASS within the observed session | The existing launcher log contains one initial compilation, one zero-error compile and one successful application start. No repeated startup compilation loop was observed in that log; this is not a performance benchmark                    |

A second bounded Redis audit started at 00:27:30 WIB (`2026-10-30T17:27:30.600Z`). The configured provider is Upstash over TLS and reports Redis 8.4.0. One complete SCAN iteration with `MATCH numora:*` found 16 matching keys, all under `numora:dev`; no `numora:test`, `numora:staging` or production namespace was observed. Key values, raw key names and endpoint credentials were not exported. This is a snapshot of the matching namespace, not proof about nonmatching keys, future usage or the provider's assigned environment. `maxmemory-policy` was unavailable through the data connection. Provider-console dedication/ownership and eviction policy therefore remain unverified; no provider settings were changed.

Aini identified Reyhan as the Supabase operator and described Redis as believed to be the Development instance. This is the recorded service handoff contact/confirmation, not a reviewer sign-off or provider-console audit.

### Dependency and handoff map

Engineering responsibility follows the [current joblist](SE_JOBLIST_2026-10-19.md). The engineering handoff route identifies who coordinates a dependency, not an assertion that a particular person owns the provider account. Configuration values and credentials are exchanged privately.

| Dependency                     | Current configuration / verified boundary                                                                                                                                                                     | Engineering handoff and next action                                                                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL / Supabase database | BASIC READY: Development target consistency, TLS/session port, schema and live health passed                                                                                                                  | Operator: Reyhan, confirmed by Aini. Aini coordinates environment access; Andi owns Identity/Schools/Classes and Tangguh/Nafi their respective domain requirements. Retain runtime credentials privately; migration credentials stay with the designated operator                                    |
| Redis                          | BASIC READY: Upstash/TLS, expected developer prefix, PONG and completed probes verified. All 16 observed `numora:*` keys are Development-prefixed; provider dedication/ownership and eviction policy are OPEN | Aini coordinates provider access and confirms separation from test/staging with the actual account operator. Prefixes and current key observations cannot establish future or provider-level isolation                                                                                               |
| Supabase Auth / Google OAuth   | Auth endpoints reachable and Google enabled; interactive login/callback remains NOT_RUN                                                                                                                       | Andi owns identity/auth integration; Aini coordinates environment access. Confirm redirect allowlists and real Google flow with the relevant acceptance owner before claiming that acceptance                                                                                                        |
| R2 media                       | INACTIVE: `R2_MEDIA_UPLOADS_ENABLED=false`, required storage settings absent. No bucket/upload request was made                                                                                               | Aini coordinates scoped bucket credentials/CORS; Tangguh owns media/import integration. Configure and verify the scoped R2 settings before enabling uploads. This does not block basic web/API/worker startup                                                                                        |
| Admin invitation / SMTP        | INACTIVE: invitation flag false; server credential and redirect setting present. Email delivery remains NOT_RUN                                                                                               | Aini coordinates Auth/SMTP configuration with Andi/Tangguh. Verify templates, redirect allowlists and authorized delivery before activation. Public Auth health is not SMTP-delivery evidence                                                                                                        |
| Python generator               | INACTIVE: generator flag false, URL configured, token absent. No generator request was made                                                                                                                   | Data/AI service owner supplies the Python service endpoint, shared server token and required compute principal/configuration; Aini coordinates access and Tangguh the Admin integration. Follow [generator activation](../content/GENERATOR_SERVICE_V1.md) and [local handoff](GENERATOR_HANDOFF.md) |
| IRT v3                         | INACTIVE: flag false, pseudonym key/version absent. No compute or release request was made                                                                                                                    | Data/AI owns scientific inputs/consumer; Aini owns orchestration with Nafi on assessment contracts. Follow the [IRT runbook](IRT_V3_RUNBOOK.md) when activating. Missing disabled-feature settings are not basic-startup failures                                                                    |
| Sentry / OTLP                  | INACTIVE placeholders: both settings absent; application source does not currently consume those names                                                                                                        | Aini coordinates any future observability integration. Adding values alone does not prove telemetry delivery                                                                                                                                                                                         |

### Technical review and merge boundary

The review checked the runtime pins against `package.json`/`.node-version`, startup commands against root scripts, probe queue/retention and readiness/completion messages against worker source, and feature flags against their consumers. Local documentation links/anchors and formatting are checked separately. The PR changes documentation only; it does not implement the proposed runtime/PvP preflight extension or alter local `.env.example` edits.

**OPEN — acceptance boundary:** the documentation can be assessed for merge using its accuracy and final-head CI while retaining the explicitly skipped teammate reproduction and the provider confirmation item. It does not establish full reusable-setup sign-off, independent human review, outbox/leaderboard business correctness, SIS-001 load/manual acceptance, interactive Google login, academic approval or deployment. Final CI/review evidence belongs to the PR rather than being copied from an older head.

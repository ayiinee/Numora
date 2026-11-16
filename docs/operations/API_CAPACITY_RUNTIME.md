# Optional single-host API capacity runtime

**PROPOSED deployment.** This implementation is opt-in. Production keeps its existing single API runtime until an operator adopts and verifies another deployment. [ADR-012](../adr/ADR-012-api-worker-capacity.md) records the boundary. This is not a 1,000-user capacity claim.

`NUMORA_API_HTTP_WORKERS=2` starts two independent HTTP worker isolates and one PvP owner under the API supervisor. Leave it unset or `0` for the existing runtime. Internal listeners bind only to `127.0.0.1`, on public port +2 through public port +2 + HTTP worker count. Reserve those ports. Socket.IO, `/api/v1/pvp` and API documentation route to the PvP owner. Other requests use the HTTP workers. Authentication and business authorization run in the receiving NestJS application on every request.

`DB_POOL_MAX` is the **total API connection budget**, divided across those workers. With a budget of 16 and two HTTP workers, the pools are 6 HTTP + 5 HTTP + 5 PvP. Worker/outbox, evidence and QA fixture connections are additional and must be counted against provider limits. `NUMORA_API_ROLE` is supervisor-managed internal configuration. Dashboard requests obtain transport readiness from the coordinator over bounded IPC, then evaluate fresh policy/content eligibility locally. The readiness channel carries no identity or authorization data; it fails closed on timeout or owner failure. The PvP owner always checks its own scheduler readiness for actual PvP commands.

There is exactly one gateway and one PvP scheduler. Presence, recovery, disconnect grace and deadlines remain in that isolate. Redis does not replace PostgreSQL. All isolates use the same code, database and Redis namespace. Worker failure withdraws the public listener and stops the remaining workers for process-manager restart. Shutdown requests application cleanup with a bounded termination fallback. Restart still requires existing reconnect/recovery acceptance tests.

## Isolated local verification

Use a clean candidate and dedicated localhost QA services:

```powershell
$env:QA_CAPACITY_DB_POOL_MAX = '16'
$env:QA_CAPACITY_HTTP_WORKERS = '2'
node scripts/qa/capacity/rehearse.mjs
```

The rehearsal builds the real application, creates its own database and Redis prefix, and records `httpWorkers` and `dbPoolMax` in `candidate.json`. The frontend calls the same API origin. Compare exact SHA, workload, pool budget, CPU/memory and topology. Auth fixtures are synthetic. The optional single-file HTTP evidence observer is unsupported in split rehearsals; combining them fails explicitly. The clean-SHA release-chain guard remains unchanged.

Before deployment acceptance, verify HTTP authorization, streaming bodies, WebSocket commands, recipient privacy, duplicate saves/submits/XP, pause/deadline races, shutdown/restart/reconnect, unavailable workers and dashboard availability through the public proxy. Then run the capacity ladder and staging load/spike/stress/soak from [CAPACITY_1000](../testing/CAPACITY_1000.md). Record memory and connection headroom. Do not infer Production capacity from local measurements or enable this configuration against Production as part of QA setup.

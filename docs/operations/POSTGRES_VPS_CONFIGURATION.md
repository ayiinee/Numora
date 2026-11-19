# Production PostgreSQL configuration — preparation PR 1

**ENGINEERING DECISION — owner direction, 15 November 2026:** keep Supabase PostgreSQL in Development and prepare PostgreSQL on the existing Biznet VPS for Production. See ADR-012. This document covers configuration/startup only. No schema/data migration, server install, role bootstrap or actual deployment is performed by these checks.

## Before deploying this release

Existing API/worker deployments with `NODE_ENV=production` must set an explicit profile and pinned target before upgrading. An old Production env without these fields fails startup deliberately. Development/test without a production profile is unchanged; never use `pnpm dev`, `dev:worker` or `dev:full` as a Production launcher to evade the guard.

While Production still uses Supabase, select `production-supabase` and pin its current direct/session endpoint, `postgres` database, project ref and dedicated non-owner Main login. This compatibility profile does not permit the administrative `postgres` login. If the existing deployment still uses an owner credential, restricted-login provisioning must precede deploying this release. Do not switch its URL to an empty VPS database simply because this configuration PR has merged.

Use `deploy/api-production.env.example` and `deploy/worker-production.env.example` as reviewable templates. Keep actual files outside the repository, owned/readable by the intended service user/operator only. Supply them using the existing process manager. Do not copy the Development `.env` or rotate durable teacher-token/pseudonym secrets as part of this change. A server `.env` does not automatically load into `node dist/main.js`. Production disables the API's Development dotenv file fallback; an attempted switch into Production via that fallback is rejected. Existing Development dotenv loading before the teacher-token check is preserved.

| Setting                                         | Meaning                                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV=production`                           | Production execution                                                                                                                      |
| `NUMORA_DEPLOYMENT_PROFILE=production-vps`      | Direct PostgreSQL VPS target                                                                                                              |
| `NUMORA_DEPLOYMENT_PROFILE=production-supabase` | Explicit managed Production compatibility profile; requires `SUPABASE_PROJECT_REF`, matching direct/session endpoint and restricted login |
| `DATABASE_EXPECTED_HOST/PORT/NAME/USER`         | Operator-reviewed target pins, compared to `DATABASE_URL` before any connection                                                           |
| `DATABASE_URL`                                  | Dedicated API/worker login, password URL-encoded, only `?sslmode=verify-full` query configuration                                         |
| `DB_POOL_MAX`                                   | Explicit positive integer per process; example 3 is not measured VPS capacity                                                             |
| `NODE_EXTRA_CA_CERTS`                           | Optional absolute path to private CA PEM; set before Node launches                                                                        |
| `BULLMQ_PREFIX`                                 | Separate `numora:prod:<deployment>` namespace, same target prefix for API/worker                                                          |
| `REDIS_URL`                                     | Authenticated `rediss://` URL; Redis relocation is outside this PR                                                                        |

The expected target values are operator assertions, not cryptographic proof of a Production environment. Review them against server inventory, not by blindly copying the same typo from the URL. Development/Production data do not synchronize automatically.

## TLS and private networking

Use a DNS hostname covered by the PostgreSQL certificate and trusted by Node. A hostname may resolve to loopback/private networking when API/DB share a VPS; public DB access is not required. IP-literal production targets are intentionally unsupported by this first profile. Do not turn off TLS or set `NODE_TLS_REJECT_UNAUTHORIZED=0`. The installed postgres-js `require` mode does not verify certificates; this profile requires `verify-full`. Arbitrary/duplicate URL query overrides and `PGOPTIONS` are rejected so they cannot change the pinned route, TLS or role.

Node's extra CA file is loaded at process start, not by setting the variable after the server is running. Certificate trust is verified by the actual Node driver, not just URL parsing. The VPS profile additionally requires `pg_stat_ssl` to report an encrypted direct PostgreSQL session. A VPS PgBouncer/proxy topology is outside this initial direct-connection contract and needs separate compatibility tests.

## Checks and startup

Build the immutable artifacts with the repository-pinned Node/pnpm versions. The database package build emits the standalone check command. With the intended API/worker env already loaded by an operator/process manager:

```sh
# Static target/config check only; no network connection.
pnpm --filter @tka/database env:check:production --service=api
pnpm --filter @tka/database env:check:production --service=worker

# Read-only database identity, privilege and TLS check.
pnpm --filter @tka/database env:check:production --service=api --database

# Production artifacts; environment must already be injected.
pnpm --filter @tka/api start
pnpm --filter @tka/worker start
```

Static validation requires the existing Supabase HTTPS Auth origin/publishable key, exact HTTPS CORS origins and stable teacher-token pepper on API. Worker does not require browser/Auth settings. Public secret variables, runtime migration credentials, synthetic content and demo/temporary PvP modes are rejected. Metrics enabled on API need the existing >=32-character server-only token. Normal feature flags are not enabled by this PR.

The API checks before opening its listener. Worker checks before connecting its consumer/polling infrastructure. Database validation uses a read-only transaction with a five-second statement timeout; initial connection establishment remains subject to the driver's connection timeout. Failures emit fixed sanitized diagnostics, not raw URL/provider error text.

The catalog check verifies actual database/session identity, Main membership, absence of Compute membership/admin/BYPASSRLS, inherited/direct domain/database ownership and CREATE capability. It is a necessary role boundary, not an exhaustive privilege/schema audit. Full grants, triggers, content, data checksums and history must still pass the restore/bootstrap work.

`DATABASE_MIGRATION_URL` belongs only to a separately provisioned migration runner. Startup never creates roles, modifies grants, migrates, seeds or rewrites business state. Do not use Supabase-specific `db:cloud:check`/historical bridge commands as VPS validators.

## Auth, IRT and content boundaries

Supabase Auth can stay on its existing Production project while Main connects to VPS. Keep `users.auth_user_id` mappings; this PR does not migrate to Firebase or link identities. If the web env is included on API, its Auth URL/key must match API Auth settings. Custom HTTPS Auth origins are accepted; ownership/provider correctness requires the normal OAuth smoke test.

If configured in the Main runtime, `NUMORA_IRT_DATABASE_URL` must target the same pinned host/port/database with verified TLS. IRT's own restricted credentials, runtime profiles, pseudonym secrets and release flags remain governed by its runbook. This check does not provision or fully validate the separate Compute service. Never enable an inactive IRT/generator/publication path merely to migrate the DB.

Production needs eligible reviewed content. Changing demo flags or review metadata to get past startup is not a migration solution. Development's existing named-project synthetic-content and Supabase matching rules remain intact.

## Evidence and remaining work

The configuration matrix covers split Auth/database, legacy anon/publishable keys, managed direct/session routing, target mismatches, public secrets, duplicate/override URL parameters, unsafe modes and role metadata. Disposable real PostgreSQL/TLS tests check trusted/untrusted certificates, actual elevated privileges/ownership/CREATE and rejection of plaintext sessions without changing fixture business data.

CI generates a short-lived test CA/key outside Git and enables TLS only on its disposable PostgreSQL service. Local optional integration inputs are `TEST_DATABASE_URL` (localhost admin fixture), `TEST_DATABASE_TLS_URL` (same localhost server, verify-full) and `TEST_DATABASE_TLS_CA_FILE`; without those, TLS integration is skipped and is not acceptance evidence. Never point these tests at a shared/cloud database.

Still required before cutover: VPS/source inventory, resource/connection budget, restricted-role/bootstrap provisioning, complete `public` + `irt_compute` + `drizzle` backup/restore, integrity/authorization and critical-flow QA, off-host backups, restore rehearsal and rollback. Current health endpoints are `/api/v1/health` and `/api/v1/health/database`; these do not prove restore/capacity readiness.

Preparation PR 2 supplies the [reviewable PostgreSQL/bootstrap files and connection-budget procedure](POSTGRES_VPS_BOOTSTRAP.md). Disposable tests do not establish that those operator steps have been performed on the VPS; source-major compatibility and inventory still gate installation/cutover.

## Local verification — 15 November 2026

Using Node 24.22.1 and a dedicated localhost PostgreSQL 16 fixture with a generated test CA: 56 database/config/content-guard tests, two real API subprocess startup tests, nine worker lifecycle/startup tests, and three existing Development/test guard checks pass. Required TLS cases run rather than skip, including trusted CA success, untrusted CA/hostname failure, direct/inherited excessive privileges, ownership/CREATE and plaintext rejection. Catalog identity checks pin `search_path=pg_catalog` and are tested against a conflicting role default. Fixture business rows remain unchanged. Tests do not contact Supabase Auth, a real Redis endpoint, the VPS or cloud data.

Changed TypeScript passes lint/typecheck; database/API/worker builds pass. The CI helper has a shell syntax check; its actual disposable-container TLS setup and full regression run are verified by the PR checks. These local checks are preparation evidence, not VPS deployment or migration acceptance.

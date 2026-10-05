# Environments

## Logical environments

The platform uses three logical environments:

- Development
- Staging
- Production

Even if Staging/Production are not provisioned in Sprint 2, configuration must not assume only one environment.

## Development

**ENGINEERING DECISION — 5 October 2026:** the unified Admin portal is `/admin`, with internal login at `/admin/login` using a provisioned Supabase Auth account and the NestJS identity endpoint. The development mock `/admin/preview` has been removed. Import JSON is under `/admin/content/imports`; real unscored question preview stays under `/admin/content/preview-sessions/:id`. Assignment/capability controls navigation; the outstanding full server permission matrix is recorded in [portal scope](ADMIN_PORTAL_2026-10-05.md). Cloud importer/media flags remain independent of this navigation change.

**ENGINEERING DECISION — QA fixtures, updated at Aini's request:** all three Admin credentials live in ignored `.qa-seed/admin-roles/accounts.json`; `.qa-seed/accounts.json` contains only Teacher/Student credentials. `pnpm qa:accounts` still verifies the original six identities using both vaults and preserves the six-actor `.qa-seed/actors.json`. Legacy credentials move automatically without password changes. The operator-only `pnpm qa:admins` provisions Super Admin/Operations profiles using an owner `DATABASE_MIGRATION_URL`. Both groups share a local provisioning lock. See [QA Admin setup](GETTING_STARTED.md#qa-admin-subroles); this does not implement the outstanding full server permission matrix.

Preferred local stack:

- Next.js local process
- NestJS local process
- Worker local process
- Supabase cloud development branch/project for PostgreSQL and Auth, isolated from staging user data
- Redis cloud TCP/TLS endpoint; if the instance is shared, use a unique BullMQ prefix per developer
- Development R2 bucket or local mock when necessary

The local processes use cloud dependencies; Docker is not required for development. Developer credentials must not grant staging schema migration or seed access. A development branch must not copy real-user staging data.

**ENGINEERING DECISION — requested by Aini, 2 October 2026:** `pnpm dev` runs web/API; `pnpm dev:worker` explicitly runs background processing and `pnpm dev:full` runs all three processes. Keep idle BullMQ consumers off during synchronous development. Worker Redis quota exhaustion is terminal until manually restarted; transient runtime logs are throttled. API verification/join rate limiting remains enforced.

Development Redis must be separate from test and Staging. Prefixes isolate keys, not instance-wide command quotas. Provision a dedicated cloud TCP/TLS endpoint through the operator; do not copy credentials into documentation. Local integration tests use ignored `.env.test.local`, based on `.env.test.example`, with dedicated localhost services and a `numora:test:` prefix. `pnpm test:local` validates isolation before running suites. These templates do not create services or allocate cloud quotas. See [process modes and test setup](GETTING_STARTED.md#development-process-modes--2-october-2026).

The student UI uses authenticated NestJS endpoints. Former standalone preview routes have been removed. Demo question content remains explicitly labeled from backend metadata; browser fixtures run only inside tests.

**ENGINEERING DECISION (2 October 2026):** API startup requires server-only `TEACHER_TOKEN_PEPPER`; do not expose it through `NEXT_PUBLIC_*`. Use an environment-specific random secret of at least 32 bytes, stable across API replicas and the 72-hour token lifetime. Preserve the same pepper for outstanding short tokens issued by #26. Redis TLS and the environment/developer prefix also serve atomic teacher-verification and class-join quotas; outage returns 503 before mutation. See [onboarding/UI integration](ONBOARDING_UI_INTEGRATION_2026-10-02.md).

## Staging

Purpose:

- integrated QA;
- first prototype trial with real school Students and Teachers, once the agreed permission/privacy checks are complete;
- OAuth callback verification;
- migration rehearsal;
- WebSocket integration;
- pre-release smoke/E2E/load tests.

Must use separate:

- database;
- OAuth client/config;
- R2 bucket/prefix;
- secrets;
- observability environment.

For the prototype trial, staging must be reachable by the school and support Google OAuth callbacks for real Student/Teacher accounts. Demo Level-1 content must be visibly identified as demo and reviewed by Curriculum before use. Teacher data access must stay within owned Classes. Staging uses its own Supabase credentials and BullMQ prefix; development must not share its database or Auth users with real-user staging. Staging domain and OAuth provisioning remain delivery dependencies until confirmed. `DEMO` seed identities do not prove the school-facing login flow.

The staging hosting provider and accountable setup owner will be decided **jointly by the team**; neither is chosen yet. The monthly budget for hosting and supporting services is also **unset**. Domain setup is tentatively expected from DevOps; Supabase/Google OAuth project setup is tentatively expected from the Database team. Confirm these owners before treating the work as assigned. Early frontend development and the first school trial may use a simple mock UI while UI/UX prepares designs, provided the connected flow and basic accessibility work.

## Production

Preferred target:

- VPS for Next.js/NestJS/Worker;
- Redis cloud, with separate credentials/prefix from development and staging;
- managed PostgreSQL + Supabase Auth preferred;
- Cloudflare DNS/CDN/R2.

Do not place all environment credentials in one shared `.env` across machines.

Application runtime uses `DATABASE_URL`; the designated migration runner uses `DATABASE_MIGRATION_URL` with direct PostgreSQL access. Keep the migration URL out of routine developer environments. `REDIS_URL` must be a BullMQ-compatible Redis TCP endpoint with TLS; the team should verify `noeviction` and connection limits.

## Secrets

Repository may contain `.env.example`, never real `.env` secrets.

Use GitHub Environment Secrets and/or server secret management for deployment.

## Domain/OAuth

A final domain is not required to start development, but it is required before stable staging/public OAuth callbacks and production routing are finalized.

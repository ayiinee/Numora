# Environments

## Logical environments

The platform uses three logical environments:

- Development
- Staging
- Production

Even if Staging/Production are not provisioned in Sprint 2, configuration must not assume only one environment.

## Development

Preferred local stack:

- Next.js local process
- NestJS local process
- Worker local process
- Supabase cloud development branch/project for PostgreSQL and Auth, isolated from staging user data
- Redis cloud TCP/TLS endpoint; if the instance is shared, use a unique BullMQ prefix per developer
- Development R2 bucket or local mock when necessary

The local processes use cloud dependencies; Docker is not required for development. Developer credentials must not grant staging schema migration or seed access. A development branch must not copy real-user staging data.

The `/demo/*` UI previews use fictional local fixtures and do not read Cloud product tables. They do not determine which Supabase project serves Development or Staging.

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

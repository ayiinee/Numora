# ADR-010 — VPS application layer + managed data services

- **Status:** Accepted
- **Date:** 28 September 2026
- **Updated:** 29 September 2026 — cloud Supabase/Redis for development; Redis cloud in the target topology
- **Owners:** Software Engineering; approval aligned with PO/PM where architecture affects project plan

## Context

Budget should be minimized, but real-user deployment should avoid making one VPS responsible for all application, database, and identity failure domains when possible.

## Decision

**ENGINEERING DECISION — owner, 15 November 2026:** [ADR-012](ADR-012-development-supabase-production-postgres.md) amends the Production database target: prepare PostgreSQL on the existing VPS while Development remains Supabase. This is a deployment direction, not evidence that the database was moved or the VPS is ready. Authentication remains a separate migration.

Deploy Next.js/NestJS/worker on VPS; use managed PostgreSQL + Supabase Auth and Redis cloud; use Cloudflare R2 for object storage. Development also uses cloud Supabase and Redis rather than local instances. Use an isolated development Supabase branch/project because staging contains real-user data. Docker is not required for development; the deployment artifact/container decision is separate.

## Consequences

Reduces DB/Auth/Redis operational burden while preserving low application-hosting cost. Cloud services add cost, network dependency, and the need for separate credentials and a BullMQ prefix per environment/developer.

## Alternatives considered

Single-VPS-everything was not preferred for real-user reliability; Kubernetes/microservices were rejected as over-complex.

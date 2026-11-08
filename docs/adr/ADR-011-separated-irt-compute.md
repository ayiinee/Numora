# ADR-011 — Shared PostgreSQL with a separate IRT compute namespace

- **Status:** Accepted for implementation at Shafwan's request on 3 October 2026; SoftEng review remains part of delivery.
- **Label:** ENGINEERING DECISION. This does not approve academic/product OPEN policies.

**Amendment — owner decision, 8 November 2026:** [v2 product/architecture context](../AI_IRT_V2_CONTEXT.md) supersedes conflicting pilot, distribution and Tryout policies from the original design source. This ADR's separate-service ownership, single migration stream, immutable versions/artifacts and permission boundaries remain in force. New A/B, multi-arm and three-context behavior needs reviewed forward contracts/migrations; no existing migration or scientific threshold is amended by this note.

## Decision

Numora owns the only Drizzle migration stream, including `public` and `irt_compute`.
The separate Shafwan repository owns computation, technical configurations, candidate
payloads and scientific evidence. Numora owns assessment lifecycle, raw scoring, exposure,
operational eligibility, frozen inputs, orchestration, adoption, activation and publication.

Runtime roles are non-owner roles without DDL or BYPASSRLS. Compute reads versioned
pseudonymous input views and writes its namespace. Main reads artifacts and writes
canonical tables; it cannot edit sealed evidence. Credentials are provisioned separately.

Reuse generation tables with `SET SCHEMA`, preserving IDs and history. New candidates
exist before import. `public.candidate_imports` owns their canonical mapping.

Requests and outbox events are transactional. Consumer delivery state is separate from
the existing analytics consumer. Leases fence retries; sealed artifacts remain immutable.

## Consequences

Independent deployments coordinate database compatibility through Numora migrations.
Shared PostgreSQL is an intentional infrastructure dependency. Browser data access is
not expanded. Academic/product OPEN policies still require versioned approvals.

See [implementation specification](../data/VARIANT_IRT_DATABASE.md).

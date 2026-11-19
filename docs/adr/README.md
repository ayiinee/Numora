# Architecture Decision Records

ADRs capture durable technical decisions. They do not override PRD product rules.

## Status values

- Proposed
- Accepted
- Superseded
- Deprecated

## Template

```markdown
# ADR-XXX — Title

- Status:
- Date:
- Owners:

## Context

## Decision

## Consequences

## Alternatives considered
```

## Initial ADR set

- ADR-001 Monorepo with pnpm + Turborepo
- ADR-002 REST API + WebSocket only for PvP realtime
- ADR-003 PostgreSQL as durable primary database
- ADR-004 Drizzle ORM + migration-first workflow
- ADR-005 Supabase Auth + Google OAuth identity architecture
- ADR-006 Redis + BullMQ for cache/ephemeral/async jobs
- ADR-007 Transactional outbox for reliable domain events
- ADR-008 Versioned question/history model
- ADR-009 Immutable XP ledger + derived leaderboards
- ADR-010 Production topology: VPS application + managed DB/Auth/Redis
- ADR-011 Shared PostgreSQL with separate IRT compute namespace
- ADR-012 Supabase Development and PostgreSQL VPS Production
- ADR-013 Encrypted off-host application archives (Proposed operator profile)

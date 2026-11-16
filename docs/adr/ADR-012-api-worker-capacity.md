# ADR-012 — Optional HTTP workers with one PvP owner

- **Status:** Proposed deployment; opt-in implementation for isolated QA
- **Date:** 16 November 2026

## Context

Local mixed-load runs saturate one API CPU core and fail latency gates at 500 students. PostgreSQL integrity checks pass. The owner requested capacity improvements without changing Production or its data.

## Decision

**ENGINEERING IMPLEMENTATION:** Keep the modular monolith and its current default single API runtime. An opt-in supervisor uses independent Node worker isolates for HTTP and exactly one PvP owner. A loopback proxy routes Socket.IO, PvP REST and API documentation to that owner; other HTTP requests use the HTTP workers. HTTP workers do not instantiate the PvP gateway or scheduler. Dashboard availability checks coordinator-owned transport readiness over IPC and evaluates current policy/content eligibility in the HTTP isolate. User authorization is never cached or sent through that IPC channel.

Share PostgreSQL and the existing Redis namespace. Divide one explicit DB connection budget across workers. Worker listeners bind only to loopback. Do not distribute socket presence, match recovery or deadline ownership across nodes. All workers use the same build and unchanged domain authorization, transactions and scoring. Worker failure stops the runtime for supervisor restart. Deployment remains opt-in pending capacity and operational acceptance; this ADR does not authorize a Production change.

## Consequences

HTTP can use additional CPU cores without introducing distributed PvP presence semantics. More isolates consume additional memory. One PvP owner remains a capacity limit. API host sizing, connection limits and representative load must be measured. This is not horizontal scaling across hosts or proof of 1,000-user readiness.

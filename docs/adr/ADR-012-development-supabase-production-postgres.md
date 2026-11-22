# ADR-012 — Supabase Development and PostgreSQL VPS Production

- **Status:** Accepted direction; implementation/release verification remains required.
- **Date:** 15 November 2026.
- **Label:** ENGINEERING DECISION — explicit owner request: Development continues using Supabase; prepare PostgreSQL Production on the existing Biznet Ubuntu 22 VPS (reported 8 vCPU, 8 GB RAM, 60 GB disk).

## Context

The owner wants business database traffic moved off managed Supabase in Production. API already runs on the VPS. Authentication provider migration is a separate consideration; moving database and identity simultaneously would complicate preserving account mappings. Hardware capacity and actual source state have not yet been measured.

## Decision

Retain the Development Supabase target and its current isolation checks. Support explicit `production-vps` and `production-supabase` startup profiles, with operator-pinned host/port/database/login, verified TLS and a read-only connection/role check before API listening or worker consumption. Existing Production deployments must set a reviewed profile before upgrading to this release; there is no implicit Production fallback.

Business data remains PostgreSQL through the same canonical Drizzle stream (`public`, `irt_compute`, `drizzle`). Runtime Main roles remain non-owner, without DDL/admin/BYPASSRLS or Compute membership. Migration credentials remain separate. Production cannot opt into synthetic content or demo PvP. Supabase Auth remains supported independently of the database endpoint; no Auth accounts or identifiers change in this implementation.

## Scope and consequences

**ENGINEERING DECISION — integration of existing main staging workflow, 20 November 2026:** retain main's dedicated capacity-staging topology under the explicit `staging-supabase` profile with `NODE_ENV=production`. It uses the same pinned endpoint, verified TLS, non-owner Main role and no-synthetic-content checks, while requiring a `numora:staging:` queue prefix and rejecting the known shared Development/Production projects. This preserves staging isolation without permitting a staging prefix in either Production profile. Staging capacity validation remains an additional operator check; local Development stays unchanged. Migration/evidence credentials remain outside API/worker env.

This amends ADR-010's managed Production database preference for the owner's VPS target. ADR-004 migration ownership, ADR-005 identity, ADR-007 atomic outbox, ADR-009 immutable XP and ADR-011 Main/IRT boundaries remain in force.

This first PR provides configuration/startup validation and operator examples. It does not provision roles/server, copy data, enable IRT/publication, change secrets, connect to the real VPS, or authorize cutover. Bootstrap, source inventory, restore/integrity, off-host backup and recovery/cutover rehearsals remain separate work. A single API/DB VPS shares failure/resource domains; actual pool/memory/disk budgets require measurement.

## Verification

Production guard tests cover target/secret/TLS overrides, unsafe runtime permissions and unchanged Development/test behavior. Real disposable PostgreSQL/TLS tests exercise certificate trust and role checks. Static validation does not establish domain ownership, correct Auth project credentials, complete schema/ACL equivalence, capacity or restored-data integrity.

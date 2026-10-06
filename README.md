# TKA Mathematics SMP Platform

Monorepo bootstrap for Numora, the independent and school-affiliated TKA Mathematics SMP learning platform. Current product source of truth: owner-approved PRD v0.6 Final (4 October 2026), with the confirmed Tryout XP ×10 correction. See `docs/development/SPRINT_2_GOAL.md` for the first Student vertical slice and prototype trial scope.

## Architecture baseline

- `apps/web` — Next.js, mobile-first role-based web UI.
- `apps/api` — NestJS REST API; later also the PvP Socket.IO gateway.
- `apps/worker` — BullMQ workers and scheduled jobs.
- `packages/database` — PostgreSQL/Drizzle schema, migrations, seed.
- `packages/contracts` — OpenAPI and Data/AI/event/WebSocket contracts.
- `packages/ui` — reusable accessible UI primitives.
- Supabase cloud — PostgreSQL + Auth, with an isolated development branch/project.
- Redis cloud — cache, queues, rate-limit/PvP ephemeral state.
- Cloudflare R2 — media assets; not required for the first walking skeleton.

Read `AGENTS.md` before implementing product features. Use `docs/development/PROJECT_STRUCTURE.md` as the code-placement guide. For frontend work before the final UI/UX handoff, see `docs/design/README.md` and the team-supplied design system there.

## Required local tools

- Node.js 24 LTS
- pnpm 12
- Git

The cloud team must provide a development Supabase URL/key, a database runtime URL, and a Redis TCP/TLS URL. Development must not use the staging database that contains real-user data. The Redis instance may be shared only with a unique BullMQ prefix per developer.

## First setup

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

Fill `.env` with the development cloud values before `pnpm dev`; `.env` is ignored by Git. The API and worker need their cloud endpoints. Schema migrations are applied separately by a designated operator, so first run does not modify the database. See [Getting Started](docs/development/GETTING_STARTED.md) for the credential handoff.

### Local URLs

- Web: http://localhost:3000
- API health: http://localhost:3001/api/v1/health
- API database health: http://localhost:3001/api/v1/health/database
- Swagger UI: http://localhost:3001/api/docs
- Supabase dashboard and Redis endpoints: use the development cloud resources supplied by the cloud team.

### Alur produk dan data pengembangan

Buka `/` untuk login Google atau `/admin/login` untuk Admin. `/qa/login` adalah alat internal yang tidak ditautkan dan hanya tersedia di project Development yang diizinkan.

Paket sintetis memerlukan `ALLOW_SYNTHETIC_CONTENT=true` di server dengan identitas Auth/database Development yang cocok, atau database localhost `numora_test_*` dengan `NODE_ENV=test`. Nilai default `false`; staging pengguna nyata dan Production memakai konten yang disetujui. Jalankan `pnpm db:seed:scenarios` untuk paket skenario ber-versi setelah bootstrap fixture internal. Lihat [keputusan dan laporan cleanup](docs/development/DEMO_CLEANUP_2026-10-06.md) untuk manifest, backup dan replay.

## Normal development

```bash
pnpm dev
```

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# or all together
pnpm run ci
```

## Database workflow

1. Edit schemas under `packages/database/src/schema`.
2. Run `pnpm db:generate`.
3. Review the generated SQL under `packages/database/drizzle`.
4. Commit schema + migration together.
5. A designated operator applies the reviewed migration with `DATABASE_MIGRATION_URL` against the intended isolated branch, then rehearses it before staging.
6. Update seed if the new model needs fixtures. Run scenario seeders only with verified `ALLOW_SYNTHETIC_CONTENT=true` isolation; never on staging with real users.

Do not make normal shared schema changes manually in Supabase Studio.

## OpenAPI

The API is code-first. Generate the committed contract after API changes:

```bash
pnpm openapi:generate
```

`packages/contracts/openapi/openapi.json` is committed as the FE/BE/QA contract. Regenerate it after controller/DTO changes and commit the diff together with the implementation.

## Bootstrap status

This repository includes the P0 walking skeleton and separate Student/PvP/leaderboard UI previews:

- monorepo/workspace;
- web/API/worker processes;
- PostgreSQL and Redis connectivity;
- foundational identity/school/class schema;
- idempotent development scenario seed;
- OpenAPI/Swagger bootstrap;
- contract placeholders and JSON schemas;
- CI baseline.

It does **not** silently implement unresolved PRD OPEN items. See `docs/product/OPEN_DECISIONS.md`.

## Handoff generator paket

Untuk menjalankan generator di localhost:3000 dengan alur impor preview dan akun Super Admin Development yang sama, ikuti [panduan handoff](docs/development/GENERATOR_HANDOFF.md). Launcher permanen: `corepack pnpm dev:generator`. Service Python dan konfigurasi privat tim diperlukan; tidak ada ketergantungan pada PID atau lokasi temporary komputer pembuat PR.

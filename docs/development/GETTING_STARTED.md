# Getting Started

## Prerequisites

- Git
- Node.js 24 LTS
- Corepack

pnpm is pinned by the repository. Obtain the isolated cloud development credentials from the cloud team before running the apps.

On Windows, run `node --version` in the terminal you will use for development. It must report v24; an older system installation can take precedence over a user-installed Node 24 in `PATH`.

## First run

```bash
git clone <repository-url>
cd <repository>
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

The lockfile and initial Drizzle migration are committed with the bootstrap. Use `pnpm install --frozen-lockfile` to reproduce the dependency versions.

## Local services

- `apps/web` — Next.js on `http://localhost:3000`
- `apps/api` — NestJS on `http://localhost:3001`
- `apps/worker` — BullMQ worker/scheduler process
- PostgreSQL/Auth — isolated Supabase cloud development branch/project
- Redis — cloud TCP/TLS endpoint, with a developer-specific BullMQ prefix

Useful checks:

- API: `http://localhost:3001/api/v1/health`
- DB: `http://localhost:3001/api/v1/health/database`
- Swagger: `http://localhost:3001/api/docs`

The Supabase dashboard URL is supplied by the cloud team. Local web and API ports remain 3000 and 3001.

## Environment files

Use one ignored root `.env` for development. It is loaded by root scripts. Fill it from the development cloud handoff; never copy staging credentials containing real-user data.

```bash
cp .env.example .env
```

Required current values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `REDIS_URL`, `BULLMQ_PREFIX`, and server-only `TEACHER_TOKEN_PEPPER`. The web and API Supabase values must refer to the same development project; the API uses them to validate bearer sessions. Keep `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`, and `CORS_ORIGINS` pointed at the local web/API processes. A public key is browser-visible; database and Redis URLs are secrets.

**ENGINEERING DECISION:** `pnpm env:check` runs before `pnpm dev`. It checks required variables, matching web/API Supabase values, TLS URL settings, and rejects a `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. It does not test cloud connectivity or validate the database password.

**ENGINEERING UPDATE, 1 October 2026:** the guard also compares the PostgreSQL project with Supabase Auth and rejects transaction-pooler port 6543 for the current client. `pnpm dev` then runs `pnpm db:check`, a read-only connection/catalog check for expected tables, column names, and RLS. This check is not a full constraint/type audit or an end-to-end acceptance test. See [the recovery record](MVP_RECOVERY_2026-10-01.md) for the completed sandbox reconciliation.

After the worker connects, run `pnpm worker:probe` only against the development Redis endpoint. It explicitly enqueues one job under a `numora:dev:<your-name>` prefix; the worker should log its completion. The command rejects staging prefixes. Do not run this check until the cloud team confirms the target endpoint and prefix.

Use a direct PostgreSQL connection when reachable or a session pooler for IPv4-only laptops; do not use the transaction pooler with this Postgres.js client. Append `sslmode=require` to PostgreSQL URLs, or use `sslmode=verify-full` with the provider CA. Use a Redis protocol endpoint with `rediss://`, not a REST-only URL. The cloud team should confirm BullMQ compatibility and `noeviction`. The Next.js public values are embedded at build time, so restart/rebuild after changing them.

**ENGINEERING DECISION, 2 October 2026:** the API requires a stable, environment-specific `TEACHER_TOKEN_PEPPER` for eight-character teacher tokens. Generate a secret of at least 32 random bytes; never expose it through `NEXT_PUBLIC_*`. Existing short tokens require the same pepper until they expire or are reissued. Redis is also required for verification/join throttling; unavailable limiter returns 503 before a mutation. See [the integration record](ONBOARDING_UI_INTEGRATION_2026-10-02.md).

Never commit real credentials.

## Database

The source schema lives in `packages/database/src/schema`.

```bash
pnpm db:generate
```

Run `pnpm db:generate` only after changing the Drizzle schema. It generates SQL offline; review and commit the migration with the schema change. A designated operator sets `DATABASE_MIGRATION_URL` to the target's direct connection and runs `pnpm db:migrate` separately. Do not place migration credentials in a developer's routine `.env`. `pnpm db:seed` requires both `NODE_ENV=development` and `ALLOW_DEMO_SEED=true`; use it only against the isolated development branch. Its fixed `DEMO` auth IDs do not create Google accounts.

## Seed data

The guarded seed now includes a deterministic `DEMO` school/users plus one Chapter/Subchapter, two published Levels, and two equivalent 10-question Level-1 Drill packages. The 20 demo variants are implementation fixtures; Curriculum must review all stems, keys, and explanations before school participants use them. Seed only the isolated development database after its reviewed migration is applied. The fixed demo auth IDs do not create Google accounts.

For real Google-authenticated testing, prefer `pnpm db:seed:learning` with `NODE_ENV=development` and `ALLOW_DEMO_SEED=true`. This mode creates only the learning fixtures in one transaction; it does not create placeholder Admin/Teacher/Student profiles. Student and Teacher profiles come from Google login and API registration; an operator provisions the real Admin separately. Never treat the full `db:seed` identity fixtures as login-ready accounts.

For the dedicated six-actor Google QA workflow, use the guarded [QA seed runbook](../testing/QA_SEED.md). `pnpm db:seed:qa` is separate from `db:seed`, requires a recent verified backup and an ignored UUID manifest, and refuses projects other than the temporary Development sandbox. Do not use existing school-trial accounts as QA actors.

`pnpm db:seed:monitoring` seeds a complete synthetic Teacher Monitoring fixture for a **localhost PostgreSQL database only**. It also seeds demo learning content, canonical Drill attempts/progress, and two Teacher feedback rows (one unread and one read) in the same transaction. Verification checks latest/best scores, level access, active-attempt state, answer counts, feedback ownership/class lineage, and read states; any mismatch rolls back the transaction. Set `NODE_ENV=development` and `ALLOW_DEMO_SEED=true`; the exported seed function itself rejects non-localhost database hosts because its fixed Auth IDs do not correspond to Google/Supabase users. This fixture is for local API/database walkthroughs, not a cloud login demo. Do not run it against Supabase Development, Staging, or Production.

## Authentication

Google OAuth/Supabase Auth integration was not a blocker for the original walking skeleton. The current Sprint 2 Student flow includes Google login; environment credentials and callback configuration are therefore a delivery dependency for that flow. See `SPRINT_2_GOAL.md`.

The Admin school/token screen requires an Admin profile provisioned by an operator against a real Supabase Auth identity; public registration accepts only Student and Teacher. Admin login policy remains OPEN-14. For the Teacher demo, an Admin creates an active school and issues a 3×24 hour token, then a Google-authenticated Teacher consumes that token before creating a Class. A Student joins with the Class code and completes a Drill before Teacher monitoring can show persisted progress.

## Quality

```bash
pnpm contracts:validate
pnpm test:checks
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Or:

```bash
pnpm run ci
```

Use `pnpm run ci`: pnpm 12 reserves `pnpm ci` for a clean dependency install.

`contracts:validate` compiles the four committed JSON Schema contracts with Ajv draft 2020-12, including references and formats. `test:checks` verifies the environment guard and demonstrates rejection of invalid schemas and payload formats. These checks do not resolve the deliberately open payload/content rules or prove that an unimplemented API exists.

The PostgreSQL integration test runs when `TEST_DATABASE_URL` points to a **dedicated, migrated test database**. CI starts PostgreSQL, applies migrations, and supplies this URL. Local runs can use `sslmode=disable` only with `NODE_ENV=test` and a localhost URL; non-test connections still require TLS. Do not point the test at a shared development, staging, or production database.

## Read before coding

1. `/AGENTS.md`
2. `docs/product/PRODUCT_CONTEXT.md`
3. `docs/product/OPEN_DECISIONS.md`
4. `docs/development/PROJECT_STRUCTURE.md` for code placement.
5. relevant module/API/data docs and ADRs.

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
- `apps/worker` — optional BullMQ worker/scheduler process, started explicitly
- PostgreSQL/Auth — isolated Supabase cloud development branch/project
- Redis — cloud TCP/TLS endpoint, with a developer-specific BullMQ prefix

Useful checks:

- API: `http://localhost:3001/api/v1/health`
- DB: `http://localhost:3001/api/v1/health/database`
- Swagger: `http://localhost:3001/api/docs`

The Supabase dashboard URL is supplied by the cloud team. Local web and API ports remain 3000 and 3001.

### Development process modes — 2 October 2026

**ENGINEERING DECISION — requested by Aini:** Redis consumers run only when background processing is being tested. All modes retain the existing environment/schema checks and load the ignored root `.env`.

| Command           | Processes          | Use                                                                        |
| ----------------- | ------------------ | -------------------------------------------------------------------------- |
| `pnpm dev`        | Web + API          | Default for UI, access rules, DTOs and synchronous assessment work.        |
| `pnpm dev:worker` | Worker only        | Run in a second terminal while testing outbox/projection/queue processing. |
| `pnpm dev:full`   | Web + API + worker | Connected background-flow verification. Do not also start `dev:worker`.    |

Stop an old `pnpm dev` session before switching modes. With the worker stopped, outbox delivery and hourly leaderboard projection do not run; PostgreSQL retains the durable records. Teacher-code verification and class join still require a healthy Redis rate limiter in the API. Health endpoints alone do not verify those operations. Once PvP is enabled, its API scheduler also consumes Redis independently of `apps/worker`.

BullMQ issues commands even on idle queues. Keep the worker off when it is not needed, including on other developers' machines sharing the instance. A unique `BULLMQ_PREFIX` isolates keys but does not allocate a separate provider request quota. Use a dedicated Development Redis instance, separate from test and school-facing Staging; a cloud operator must provision its TCP/TLS endpoint and supply credentials outside Git. Adding a prefix does not provision an instance.

The worker checks Redis before creating its consumer. A `max requests limit exceeded` error at startup or runtime logs `REDIS_QUOTA_EXCEEDED`, stops schedules, disconnects and exits with code 1. Restore quota or configure a healthy dedicated instance before restarting manually. Transient runtime errors retry with backoff and emit at most one diagnostic per minute; startup and shutdown waits are bounded. `dev:full` may stop the other processes when its worker exits, so use separate `dev` and `dev:worker` terminals when diagnosing an outage. No provider error text or connection URL is logged.

### Dedicated local test dependencies

Copy `.env.test.example` to `.env.test.local` and configure dedicated **localhost** PostgreSQL/Redis services. This file is ignored by Git and is separate from development `.env`. Example credentials are fixtures, not cloud credentials. Local services must be started separately; this change does not install Redis/PostgreSQL or create a cloud database.

```powershell
Copy-Item .env.test.example .env.test.local
# Apply committed migrations to the dedicated local test database before integration tests.
pnpm db:migrate:test
pnpm test:local
```

Run the copy once; preserve an already configured local file. `test:local` and `db:migrate:test` reject non-test mode, remote endpoints, database names outside `numora_test`/`numora_test_*`, non-test prefixes and inherited runtime URLs. The migration URL must exactly match `TEST_DATABASE_URL` (or be empty when not migrating); update both together when changing the local database. Test PostgreSQL credentials need permission to create/drop disposable worker-test databases. The guard confirms target configuration, not connectivity or whether other applications share a localhost service. CI continues to supply its own isolated PostgreSQL/Redis services.

Plain `redis://localhost` is permitted only for test mode by the existing API guards. Development still requires `rediss://`; do not change `NODE_ENV` to test to bypass development TLS/rate limiting. Avoid running Redis integration tests against the shared cloud instance.

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

`contracts:validate` compiles committed JSON Schema contracts with Ajv draft 2020-12, including references and formats. `test:checks` verifies the environment guard and demonstrates rejection of invalid schemas and payload formats. These checks do not resolve the deliberately open payload/content rules or prove that an unimplemented API exists. JOB-20 adds a separately labelled proposed domain-event schema; Data approval is still required.

The PostgreSQL integration test runs when `TEST_DATABASE_URL` points to a **dedicated, migrated test database**. CI starts PostgreSQL, applies migrations, and supplies this URL. Local runs can use `sslmode=disable` only with `NODE_ENV=test` and a localhost URL; non-test connections still require TLS. Do not point the test at a shared development, staging, or production database.

## PostgreSQL background diagnostics - 3 October 2026

After building database and assessment-engine, an operator can supply DATABASE_URL in the process environment and run `pnpm --filter @tka/worker outbox:status` without Redis, or `pnpm --filter @tka/worker tryout:recover --once` for one bounded recovery batch. Neither command loads .env automatically. Follow the [recovery runbook](TRYOUT_RECOVERY_RUNBOOK.md) and [analytics inventory/runbook](JOB20_ANALYTICS_INVENTORY.md); analytics flags stay server-only and default off pending Data approval.

## Read before coding

1. `/AGENTS.md`
2. `docs/product/PRODUCT_CONTEXT.md`
3. `docs/product/OPEN_DECISIONS.md`
4. `docs/development/PROJECT_STRUCTURE.md` for code placement.
5. relevant module/API/data docs and ADRs.

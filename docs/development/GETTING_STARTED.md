# Getting Started

For scenario QA, start at the [QA workflow section](#qa-scenario-workflow--27-oktober-2026) below. The development/cloud instructions are separate from disposable local testing.

For Development setup, follow the startup and worker checklist below. The [startup verification record](DEV_STARTUP_VERIFICATION.md) separates observed startup/probe results, operator-confirmed runtime/restart checks, service-audit results and owner-deferred teammate reproduction. It is engineering setup evidence, not scenario QA or deployment acceptance.

## Prerequisites

- Git
- Node.js 24 LTS, minimum 24.22.1 (see `.node-version`)
- Corepack

pnpm is pinned by the repository. Obtain the isolated cloud development credentials from the cloud team before running the apps.

On Windows, run `node --version` in the terminal you will use for development. It must report at least v24.22.1 and remain on major 24; an older system installation can take precedence over a user-installed Node 24 in `PATH`. This minimum includes the patched bundled Undici 7.30.1. Updating an npm Undici dependency does not update Node's built-in `fetch`. A portable Node installation may be selected for the current shell without replacing the global installation or restarting Codex. Verify `node -p "JSON.stringify({node:process.versions.node,undici:process.versions.undici})"` before setup. CI uses the same pinned runtime.

## First run

```bash
git clone <repository-url>
cd <repository>
corepack enable
pnpm install --frozen-lockfile
[ -f .env ] || cp .env.example .env
# Fill .env with the agreed Development settings before startup.
pnpm dev
```

The lockfile and initial Drizzle migration are committed with the bootstrap. Use `pnpm install --frozen-lockfile` to reproduce the dependency versions.

### Development baseline before startup

**ENGINEERING DECISION — documentation requested by Aini:** record the source and actual terminal runtime before reproducing Development startup. Follow [Aini's Development responsibilities in the current joblist](SE_JOBLIST_2026-10-19.md#aini--tampilan-dan-backend-pvpleaderboard-be-runtime-dan-devops).

From the repository root in PowerShell:

```powershell
git rev-parse HEAD
git status --short
node --version
pnpm --version
where.exe node
where.exe pnpm
```

Use Node 24.22.1 and pnpm 12.6.0 as the reproducible baseline. `package.json` permits Node `>=24.22.1 <25` and pnpm `>=12 <13`; `.node-version` and `packageManager` select the baseline. If another executable takes precedence, select the intended installation for that terminal, then repeat these commands. A portable runtime/launcher must use paths appropriate to the developer's machine; ignored `.tmp` launchers are not a team installation prerequisite.

Preserve an existing `.env`. For a new checkout only:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
```

Fill the startup-required settings in the [environment section](#environment-files) from the agreed Development handoff, then run `pnpm env:check` and `pnpm dev`. The environment check currently validates the settings described below; it does not enforce the Node pin or every feature-specific combination. Passing it does not establish service connectivity. `pnpm dev` builds the shared packages and performs the read-only database schema check before starting web/API. Migration and seed commands are separate operator actions.

Wait for both web and API readiness. Check the web page, API health and database health URLs below. Record actual HTTP results; a ready web page alone does not prove the API has started. Capture SHA, runtime, environment label, commands and sanitized outcomes. A dirty checkout is not immutable release evidence.

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

### Development worker, probe and restart checklist

Use the confirmed Development Redis endpoint and a developer-specific prefix such as `numora:dev:aini`. Run the commands from the repository root with the same ignored `.env` and supported runtime. A worker also starts outbox/projection schedules; it performs background processing against the configured Development resources.

1. Keep `pnpm dev` in its own terminal if web/API are needed. In another terminal, run `pnpm dev:worker`. Do not duplicate a worker already running through `dev:full`.
2. Wait in the worker terminal for:

   ```text
   [worker] Redis connected; background processing enabled
   ```

   This is emitted after the startup Redis connection/ping, database connectivity check and BullMQ readiness. It describes startup readiness, not a permanent guarantee against later outages.

3. Leave that terminal running. In a separate terminal, enqueue one diagnostic job:

   ```powershell
   pnpm worker:probe
   ```

   Expected producer output, with an example ID and prefix:

   ```text
   Queued manual probe 1 under numora:dev:aini.
   ```

   The command adds one `manual-probe` job to the `bootstrap` queue and exits. `Queued` proves enqueueing; record completion separately.

4. Check the worker terminal for:

   ```text
   [worker] bootstrap probe completed
   ```

   If the job remains waiting, confirm the worker is still running and uses the same Redis endpoint/prefix. Check worker errors before adding more probes. The completion message currently omits the job ID; record it as a completion observation, not a per-ID durable receipt. The probe retains only the latest ten completed/failed jobs, so missing old queue history is not proof of completion.

5. For a restart check, press `Ctrl+C` in the worker terminal and wait for the command prompt to return. Start `pnpm dev:worker` again, wait for readiness, then enqueue one new probe from the other terminal. Record the stop/start sequence, probe ID and completion. Mark restart verified only when that sequence is observed.
6. Stop the worker with `Ctrl+C` when background processing is no longer needed. Keep connection URLs, credentials, raw logs and browser state ignored. Record only sanitized results.

For each check use `PASS`, `FAIL`, `BLOCKED` or `NOT_VERIFIED`, with the actual SHA/environment and evidence source. Record another developer's reproduction separately. This checklist verifies bootstrap processing; outbox business correctness, leaderboard correctness, SIS-001 load, real Google login and release acceptance have their own gates.

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

### Startup-required and conditional configuration

**ENGINEERING DECISION — existing startup and feature boundaries:** `.env.example` covers both basic Development and optional features/operator commands. A blank conditional setting does not by itself block web/API startup.

| Settings                                                                           | When required                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The startup-required values listed above                                           | Basic web/API startup and its configuration/schema checks; worker additionally requires its configured Redis/database connections                                                                                                                    |
| `DATABASE_MIGRATION_URL`                                                           | Designated migration/operator commands; keep separate from routine application runtime configuration                                                                                                                                                 |
| `IRT_PSEUDONYM_KEY`, `IRT_PSEUDONYM_KEY_VERSION`                                   | IRT flows that require pseudonymisation; v3 activation needs both a valid key and explicit version. They may remain empty for basic startup with IRT disabled                                                                                        |
| `IRT_V3_ENABLED=false`                                                             | Valid default: v3 orchestration is disabled. Enabling it requires the [IRT runbook](IRT_V3_RUNBOOK.md) prerequisites                                                                                                                                 |
| `NUMORA_GENERATOR_ENABLED=false`, `NUMORA_GENERATOR_URL`, `NUMORA_GENERATOR_TOKEN` | Disabled generator does not require its token for basic startup. When activating, API/worker and the Python service share a server-only token of at least 32 characters and must satisfy the [generator handoff](../content/GENERATOR_SERVICE_V1.md) |
| `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`                                        | Optional observability placeholders in this baseline; application source does not currently read these names. Filling them alone does not establish monitoring integration                                                                           |
| R2 settings and `R2_MEDIA_UPLOADS_ENABLED`                                         | Owned media upload/serving flows; verify the scoped credentials, bucket and CORS before enabling those flows                                                                                                                                         |
| `ADMIN_ACCOUNT_INVITES_ENABLED`, mail templates and redirect configuration         | Admin invite/recovery flow activation, with Auth/SMTP acceptance as documented in the [Admin runbook](ADMIN_ACCOUNTS_RUNBOOK.md)                                                                                                                     |

PvP mode/content settings must also agree with the [existing policy](PVP_TEMPORARY_READY_CONTENT.md). Defaults are `PVP_MODE=disabled` and `PVP_CONTENT_MODE=strict`. Temporary owner-accepted content requires `PVP_MODE=demo`; `official` with temporary content is rejected by API startup. Strict DEMO requires verified `ALLOW_SYNTHETIC_CONTENT` opt-in; official play requires reviewed READY content and approved difficulty. Do not enable another feature simply to make optional values nonempty.

For basic startup without IRT/generator activation, these values may remain:

```dotenv
DATABASE_MIGRATION_URL=
IRT_PSEUDONYM_KEY=
IRT_V3_ENABLED=false
IRT_PSEUDONYM_KEY_VERSION=
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=
NUMORA_GENERATOR_ENABLED=false
NUMORA_GENERATOR_URL=http://127.0.0.1:8770
NUMORA_GENERATOR_TOKEN=
```

**ENGINEERING DECISION:** `pnpm env:check` runs before `pnpm dev`. It checks required variables, matching web/API Supabase values, TLS URL settings, and rejects a `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. It does not test cloud connectivity or validate the database password.

**ENGINEERING UPDATE, 1 October 2026:** the guard also compares the PostgreSQL project with Supabase Auth and rejects transaction-pooler port 6543 for the current client. `pnpm dev` then runs `pnpm db:check`, a read-only connection/catalog check for expected tables, column names, and RLS. This check is not a full constraint/type audit or an end-to-end acceptance test. See [the recovery record](MVP_RECOVERY_2026-10-01.md) for the completed sandbox reconciliation.

**ENGINEERING UPDATE, 20 October 2026:** API `watchOptions` in `apps/api/tsconfig.json` exclude generated `dist` and both API/root `node_modules` directories and dependency files. `watchFile: "dynamicPriorityPolling"` avoids repeated native file events for dependency manifests on Windows; instrumentation found backslash-form manifest paths still reaching watchers despite forward-slash exclusions in TypeScript 5.9.3. The separate `exclude` option controls compiler inputs; it does not replace these watcher settings. Restart `pnpm dev` after changing watcher configuration or installing dependencies; API source and workspace package builds remain watched. See [TypeScript's watch configuration](https://www.typescriptlang.org/docs/handbook/configuring-watch.html).

**ENGINEERING UPDATE, 20 October 2026:** web and API start concurrently, so a ready web page does not prove that NestJS is listening yet. An existing session's identity check retries network failures and HTTP 502/503/504 up to eight times, with delays of 2, 4, 8, 16 and then 30 seconds per retry. The session is preserved; manual **Periksa lagi** remains available after retries are exhausted. Authentication/authorization errors are not automatically retried. For a persistent failure, verify `/api/v1/health` and `/api/v1/health/database` on the configured API port, then compare the browser request URL and origin with `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS`.

If compilation reports `TS5033` with `ENOSPC`, free disk space before retrying: partially written API output can prevent the server from starting, and partially written Next route types can cause unrelated syntax errors. Stop development/build processes first, clear only verified generated build caches such as `apps/web/.next` and `apps/web/.next-e2e`, then rebuild. Do not delete `.tmp` wholesale; it can contain registered worktrees and recovery evidence.

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

The Admin school/token screen requires an Admin profile provisioned by an operator against a real Supabase Auth identity; public registration accepts only Student and Teacher. **ENGINEERING DECISION — 5 October 2026:** use `/admin/login` with the provisioned account's Supabase Auth email/password, then `/admin` as the common entry. The login form never creates an Admin profile or grants a subrole. The school/token navigation is shown for `SUPER_ADMIN`/`OPERATIONS`; `CONTENT_DATA_MODERATION` with `CONTENT_MANAGE` sees content and JSON import instead. An account without assignment sees a recovery message. See [portal scope and outstanding server permissions](ADMIN_PORTAL_2026-10-05.md). The development mock `/admin/preview` is removed; real question preview remains inside Content. This does not introduce a custom password service or change Student/Teacher Google login. For the Teacher demo, an Admin creates an active school and issues a 3×24 hour token, then a Google-authenticated Teacher consumes that token before creating a Class. A Student joins with the Class code and completes a Drill before Teacher monitoring can show persisted progress.

## QA Admin subroles

**ENGINEERING DECISION — 5 October 2026, updated at Aini's request:** all three Admin credentials are consolidated in `.qa-seed/admin-roles/accounts.json`. `.qa-seed/accounts.json` contains only the five Teacher/Student accounts. `pnpm qa:accounts` still verifies the original six identities and preserves `.qa-seed/actors.json`; it reads Content Admin from the shared Admin vault. Legacy vaults migrate automatically without changing passwords, copying Content before removing its source entry so an interrupted move can safely resume. Provisioning groups share `.qa-seed/provisioning.lock`; a pending operation must finish before starting the other group.

A sandbox operator runs `pnpm qa:admins --check`, then `pnpm qa:admins`, with server-only `SUPABASE_SECRET_KEY` and a temporary owner `DATABASE_MIGRATION_URL` for the pinned Development project. Do not put operator credentials into routine developer configuration. The command refuses another project, an unassigned/disabled original Content Admin, or conflicting profiles; it does not rotate existing passwords.

| Login role              | Ignored credential file              | Account entry              |
| ----------------------- | ------------------------------------ | -------------------------- |
| Content/Data/Moderation | `.qa-seed/admin-roles/accounts.json` | `accounts.admin`           |
| Super Admin             | `.qa-seed/admin-roles/accounts.json` | `accounts.adminSuper`      |
| Operations              | `.qa-seed/admin-roles/accounts.json` | `accounts.adminOperations` |

All three log in at `/admin/login`. These are Development QA fixtures, not production account provisioning. Read credentials locally; never copy them into commits or shared logs. Replays preserve passwords and produce no duplicate profile/audit writes. If profile assignment fails after Auth creation, retain both vault and recovery journal and rerun with the same operator configuration. Full server permission scoping remains an outstanding task.

Run `pnpm test:qa-admins` with `NODE_ENV=test` and an isolated localhost `TEST_DATABASE_URL` named `numora_test`/`numora_test_*`; the suite migrates and drops a disposable database and never skips. CI runs it alongside integration tests.

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

## QA scenario workflow — 27 Oktober 2026

ENGINEERING DECISION — standar tim QA Windows. [QA Guide](../testing/QA_GUIDE.md), [workflow](../testing/QA_WORKFLOW.md) dan [prompt](../testing/QA_PROMPTS.md) adalah pintu masuk sehari-hari.

### Prasyarat lokal

Gunakan Git, Node 24, pnpm yang dipin packageManager repository, Chromium Playwright, k6, PostgreSQL 16 dan Redis 7. Jalur layanan langsung utama adalah WSL2 Ubuntu 24.04; ini tidak membutuhkan Docker. Pemeriksaan awal dilakukan dari PowerShell:

    node --version
    pnpm --version
    wsl --list --verbose
    pnpm install --frozen-lockfile
    pnpm --filter @tka/web exec playwright install chromium

Jika WSL belum aktif, operator menjalankan instalasi resmi WSL/Ubuntu 24.04 dan menyelesaikan restart atau prompt admin yang diperlukan. Jangan menganggap keberadaan wsl.exe berarti distro siap. Pada Ubuntu 24.04, pasang layanan langsung:

    sudo apt update
    sudo apt install postgresql-16 postgresql-client-16 redis-server
    sudo service postgresql start
    sudo service redis-server start

Verifikasi major PostgreSQL 16 dan Redis 7 sebelum dipakai; package/repository yang berbeda dapat menyediakan major lain. Bind ke localhost/protected mode, jangan membuka layanan ke LAN. Buat akun PostgreSQL khusus tes dengan LOGIN CREATEDB memakai password lokal yang dibuat operator (bukan akun superuser/cloud), lalu buat database numora_test milik akun itu. Masukkan password melalui prompt/database admin, bukan prompt Codex/chat atau file tracked. Windows memakai koneksi localhost ke layanan WSL.

pg_dump/pg_restore versi 16 perlu tersedia dari terminal Node Windows. Gunakan PostgreSQL client Windows 16 dan set QA_PG_BIN ke direktori bin bila belum di PATH; layanan server boleh tetap di WSL. Alternatif layanan Windows/lokal yang sudah ada boleh dipakai jika doctor memverifikasi versi serta isolasinya. Tidak ada fallback ke endpoint cloud.

Pasang k6 Windows dari distribusi resmi; set QA_K6_BIN di konfigurasi lokal bila binary belum di PATH. @axe-core/playwright disediakan lockfile. Setup tidak men-download executable atau menaikkan hak admin tanpa operator mengetahui langkahnya.

### Konfigurasi dan pemeriksaan

    pnpm qa setup --profile full
    pnpm qa doctor --profile full
    pnpm qa validate
    pnpm qa start --role siswa
    pnpm qa run --scenario SIS-001 --profile full

setup mempertahankan .env.test.local yang sudah ada. Konfigurasi file ini dari .env.test.example dengan NODE_ENV=test, TEST_DATABASE_URL localhost menuju numora_test, TEST_REDIS_URL localhost, BULLMQ_PREFIX numora:test:<alias>, dan migration URL identik TEST_DATABASE_URL. Kosongkan DATABASE_URL/REDIS_URL runtime yang diwarisi terminal. Jangan menyalin .env cloud atau vault akun nyata.

Tambahan opsional di .env.test.local:

    QA_PG_BIN=C:\Program Files\PostgreSQL\16\bin
    QA_K6_BIN=C:\Tools\k6\k6.exe

doctor memeriksa versi Node/pnpm, dependency, guard existing, koneksi/version PostgreSQL/Redis, CREATEDB, Chromium, k6 dan client backup. Ia tidak menampilkan connection URL/password. Layanan belum tersedia menghasilkan Blocked, bukan Pass. Build/API/browser baru dijalankan setelah layanan siap.

setup juga memberikan petunjuk read-only Windows: kesiapan WSL/distro Ubuntu 24.04, token admin saat ini dan sinyal restart Windows servicing. Nilai unknown tidak dianggap false. Sinyal tersebut tidak memastikan semua kebutuhan restart WSL; pemasangan OS/elevasi/restart tetap langkah operator. Layanan localhost alternatif yang sudah lulus doctor tetap boleh digunakan.

Setiap run connected membuat database numora_test_qa_<run-id-tanpa-strip> dan prefix Redis sendiri, menerapkan migrasi existing, membangun backend/worker/web test-only, lalu memulai anggaran tes 60 menit. Port 3500–3502 harus kosong; jangan menghentikan proses pengguna lain untuk mengambil port. Aplikasi web/API tes tidak menggunakan cloud auth/data.

### Laporan, cleanup, dan troubleshooting

Laporan tersimpan pada folder skenario reports/run-id; artefak besar/state berada pada qa/.local. Sesudah selesai, pnpm qa cleanup --run <run-id> hanya membersihkan DB/prefix yang tercatat milik run dan mempertahankan laporan. Dump restore lokal tetap ignored; operator dapat menghapus artefak run yang sudah tidak diperlukan.

- NODE_ENV/URL runtime ditolak: gunakan terminal tes bersih dan .env.test.local, jangan melemahkan guard.
- PostgreSQL tidak terhubung: periksa layanan, port, DB numora_test dan password; CREATEDB diperlukan untuk isolasi.
- Redis major tidak cocok: gunakan Redis 7; prefix tidak mengisolasi quota layanan cloud.
- Chromium/k6/client backup hilang: pasang prasyarat yang diminta doctor; tes wajib tetap terlihat Blocked.
- Beberapa sesi cocok: pilih --session; status hanya membersihkan lock PID yang sudah mati.
- Stale: baca fingerprint dan retest versi baru. Jangan mengganti SHA laporan lama.
- Staging/Drive belum terkonfigurasi: hasil lokal tetap tersimpan; ikuti onboarding workflow. Izin tiga anggota folder Drive harus diverifikasi, bukan memakai link publik.

# QA identity graph on Numora-Staging

**ENGINEERING DECISION:** `Numora-Staging` (`pkamenfnwmoeisccnrnk`) is the temporary shared Development sandbox. Preserve its existing Auth users, profiles, schools, classes, attempts, and migration history. Keep any later trial with real school users on a separate project.

**PRD RULE:** Admin creates School and a single-use teacher token; a Google-authenticated Teacher verifies it, creates a Class, and a Google-authenticated Student joins by Class code. Mandiri Students can do Drill and PvP. TryOut v1.1 gives all Students free MVP access without Class; class leaderboard still requires a Class. Pretest affiliation remains the v0.5 baseline pending reconciliation.

**ENGINEERING DECISION (temporary QA):** Six email/password Auth accounts are permitted only for Development testing while Google QA accounts are unavailable. The product login and public registration still require Google; the operator seed owns these internal QA profiles. `/qa/login` exists only in a local Next.js development server pointed at this exact sandbox. This smoke verifies Auth/API/database rules, not Google OAuth.

## Prepare identities

1. For temporary QA accounts, place a **rotated** `sb_secret_*` key in ignored `.env` as `SUPABASE_SECRET_KEY` and set `SUPABASE_PROJECT_REF=pkamenfnwmoeisccnrnk`. Never use a `NEXT_PUBLIC_*` secret or commit credentials. Run `pnpm qa:accounts`. It uses the Supabase Admin API to create/verify six confirmed Auth accounts, storing generated passwords only in ignored `.qa-seed/accounts.json` and IDs in `.qa-seed/actors.json`. Rerunning verifies the same accounts. Rotate any key disclosed through chat again when provisioning is finished.
   If QA passwords were exposed or no longer match Supabase Auth, run `pnpm qa:accounts:rotate`. It validates all six named QA identities before updates, writes candidate passwords to ignored `.qa-seed/accounts.pending.json`, and atomically checkpoints only confirmed passwords into the active vault. A failed/ambiguous update resumes with the **same candidates** when the same command is rerun; do not delete the pending journal or start another rotation. Finish provisioning/rotation successfully before running login smoke.

   `.qa-seed/provisioning.lock` prevents concurrent provisioning and rotation. Ordinary errors release the lock while retaining recovery data. After a hard crash, inspect the PID recorded in that file and confirm the original process has stopped, then remove **only the lock file** and rerun the original command. The script deliberately does not reclaim locks automatically. Keep the vault, journal, temporary files and backups private; POSIX files use mode 0600 and the directory 0700; Windows operators must protect the directory with their account's ACL. These artifacts are covered by the existing `.qa-seed/` Git ignore.

   Unreadable/corrupt vaults fail closed. If the active vault was lost but the known QA Auth users remain, normal `qa:accounts` cannot verify their passwords; restore the original vault or explicitly run `qa:accounts:rotate` to re-provision only those identities. Project, email, UUID and `numora_qa` mismatches stop before any password update. Provider errors are sanitized rather than copied into logs.

2. For future Google QA identities, have six new accounts sign in through Google OAuth once and create ignored `.qa-seed/actors.json` with exactly this shape. Do not commit or paste the manifest, emails, tokens, or database credentials into chat.

```json
{
  "projectRef": "pkamenfnwmoeisccnrnk",
  "actors": {
    "admin": "00000000-0000-4000-8000-000000000001",
    "teacherA": "00000000-0000-4000-8000-000000000002",
    "teacherB": "00000000-0000-4000-8000-000000000003",
    "studentA": "00000000-0000-4000-8000-000000000004",
    "studentB": "00000000-0000-4000-8000-000000000005",
    "studentC": "00000000-0000-4000-8000-000000000006"
  }
}
```

3. Set `QA_SEED_MANIFEST` to that file's **absolute** path, `SUPABASE_PROJECT_REF=pkamenfnwmoeisccnrnk`, `SUPABASE_URL` to this project's URL, `NODE_ENV=development`, and `DATABASE_URL` to the same project's TLS PostgreSQL URL. Use the normal ignored `.env` and operator shell; no service-role key is needed.
4. Run `pnpm db:seed:qa -- --check`. It checks the project, migrated tables, the selected Auth provider, role/profile conflicts, and prints row counts without emails. It writes nothing. The temporary manifest has an additional `"mode": "EMAIL_QA"`; omission means Google mode.
5. Before writing, make a fresh PostgreSQL **custom-format** backup that includes `auth`, `public`, and `drizzle`; verify that it can be listed/restored in an isolated database. Keep the archive outside Git. Set `QA_SEED_BACKUP_PATH` to its absolute path and `QA_SEED_BACKUP_SHA256` to its lowercase SHA-256. The command checks the archive header, hash, and age (at most 24 hours).
6. Set `ALLOW_QA_SEED=true` and run `pnpm db:seed:qa`. The command refuses every project except the named Development project. It creates only `DEMO-QA` profiles, School, a **consumed** hashed token, Teacher A affiliation, Class A, Student A membership, and matching audit records in one transaction. It does not reset other rows or seed assessment results. The existing `db:seed:learning` supplies labeled DEMO Drill content separately.
7. Run the command a second time before starting the live QA workflow. Counts and graph should be unchanged. The command stops on an existing non-QA profile, wrong role, reused email/UUID, invalid provider, mismatched project, or conflicting affiliation. Never “fix” such a failure by overwriting existing rows.

## Exercise the real workflow

With temporary accounts, run local API and `pnpm qa:smoke` to check all six logins, identities, and read-only access. `pnpm qa:smoke -- --apply` performs the real API workflow: Admin issues a fresh token, Teacher B consumes it and creates Class B, Student C joins, and cross-role requests are denied. The script never prints passwords, tokens, or emails. Restart any already-running Next.js dev server after changing `.env`, then open `/qa/login` to inspect the UI. For production-path OAuth evidence, repeat the workflow with six Google QA identities when available.

**ENGINEERING MAINTENANCE — RPT-07 F-07-004, 3 October 2026:** the read-only smoke validates `GET /tryout/packages/current` against the committed `CurrentTryoutDto` OpenAPI schema for both School Student A and Mandiri Student B. No package returns only `{state:"unavailable"}`. An available `open` package has `eligible:true` and no attempt; `inProgress`, `waitingIrt`, and `resultReady` have `eligible:false` and an attempt ID. The check follows server lifecycle state, not class affiliation, and remains usable after package publication or submission. It never starts/submits an attempt or publishes test content to make the smoke pass. Dedicated isolated Tryout integration/connected tests prove actual start access, concurrency, and release gates; read-only smoke alone does not prove those flows or Google OAuth. `pnpm test:checks` includes offline smoke-contract regression coverage without QA credentials or shared services.

When Google QA accounts replace the temporary identities, disable the email QA Auth users and retire their internal fixture profiles through a reviewed operator change. Keep historical assessments and audit rows intact. The temporary email flow must not be enabled for school trials with real users.

The fixture token is already consumed and its plaintext is never stored; it cannot be used for Teacher B. Save the newly issued token only in the intended short-lived operator/Teacher handoff. This live workflow, unlike fixture rows, is the evidence for OAuth and authorization.

**Verification, 1 October 2026:** the Development email QA accounts and idempotent graph seed passed; the API workflow passed token consumption, Class B creation, Student C join, cross-Class denial, and one-Class-per-Student denial. A custom-format backup was created before the business-data seed, restored into an isolated local PostgreSQL database with matching pre-seed row counts, and remains outside Git. Mandiri Student B completed DEMO Drill at 7/10 and 8/10 through the API: the first kept Level 2 locked, the second unlocked it; retry used another question variant, duplicate submit preserved the result, and another Student could not read it. Google OAuth with QA actors remains unverified. Global OPEN and DRL-OPEN/TRY-TBC still gate unresolved final policies; see the latest feature reconciliation.

## Fixture implications of latest feature PRDs

[Drill v1.2 / TryOut v1.1](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md) require separate QA coverage for free Mandiri TryOut, 35-item packages, PG/PGK MCMA/Category, auto-submit and immutable delayed release. Existing PG demo fixtures and prior smoke results do not prove these requirements. Provide Ongoing/Past and submitted/processing/released/expired cases; label TBC durations/scales/rubrics as DEMO. Do not change or seed the shared sandbox merely to update documentation.

# PostgreSQL VPS owner/grant restore — preparation PR 4

**ENGINEERING DECISION — owner request, 15 November 2026:** prepare restore and ownership/permission mapping for the Production PostgreSQL VPS target in [ADR-012](../adr/ADR-012-development-supabase-production-postgres.md). [PR 1 startup](POSTGRES_VPS_CONFIGURATION.md), [PR 2 bootstrap](POSTGRES_VPS_BOOTSTRAP.md), and [PR 3 inventory/backup](POSTGRES_BACKUP_INVENTORY.md) remain prerequisites. Supabase Auth stays separate; no product, policy, scoring, XP, content version or UUID is recalculated.

This PR implements operator tooling and tests. No real source backup, VPS access, restore, runtime env change, feature activation, merge or deployment is performed during implementation. The commands below are an operator procedure for a reviewed **new target**; they do not grant approval to overwrite a running deployment.

## What is supported

The initial mapped profile supports a PostgreSQL **16** archive, same-major utilities and direct PostgreSQL 16 on the operator's host/VPS. The URL uses an explicit TLS DNS name/pins; that endpoint must resolve exclusively to loopback (`127.0.0.1` or `::1`) on the operator host before a restore connection is opened. A private DNS name such as `db.numora.internal` can resolve to loopback and match the certificate. A directly published local container endpoint is tested as well: its backend interface can be a container address while the client endpoint remains local. The TLS CA must be trusted by both Node and libpq. Transaction poolers, unreviewed proxies, external/foreign-schema dependencies, unsupported grants, unknown RLS roles and colliding owner defaults stop preparation/restore rather than being silently removed.

The target is either `numora_production` or an isolated `numora_test_vps_restore_<32 lowercase hex>` database, owned by `numora_owner`. It must contain **only the empty PR 2 public schema**, with no application tables/functions/types and no existing owner default privileges. It must be connection-fenced, without other sessions. The login is `numora_migrator`, whose database-specific effective role is `numora_owner`; it is not a superuser and has no CREATE ROLE/DB, replication or BYPASSRLS. The tool creates/drops no database or cluster role, terminates no session, and supports no overwrite or `--clean` option.

## 1. Produce and review a new source archive

Use PR 3 inventory/backup commands after reviewing source major/extensions/dependencies and every writer, including local Development/Staging. Mapped restore requires a **fresh backup containing `restoreAccess` metadata**. Existing PR 3-only archives remain immutable; missing structured ACL metadata blocks this new path rather than guessing privileges from text. Full exact table proofs and sequence state must be available. Changing sequences and catalog-visible external dependencies block this initial profile.

The new metadata records explicit owners and each ACL grant/grantor/option for schemas, tables/views, columns, sequences, functions, types and global/per-schema default privileges. Empty ACLs are retained. Sequence default ACLs use PostgreSQL's lowercase `s` object code; uppercase `S` denotes a different object class in `acldefault`. It must not be confused with the uppercase `S` used by `pg_default_acl` for sequence defaults. This PR corrects the earlier catalog normalization for that distinction.

Copy `deploy/postgres/restore-owner-map.example.json` outside Git and replace its review timestamp/operator and owner/grantee choices using the actual inventory. Its placeholder timestamp deliberately fails validation. No cloud role passwords or role-creation SQL are copied.

The mapping's rules are explicit:

- Every inventoried object/default-privilege owner must appear in `owners`, mapped to the stable NOLOGIN `numora_owner`. `postgres` and `pg_database_owner` are examples, not assumed source facts. Unused/missing aliases fail.
- Runtime ACL groups remain `numora_main_runtime` and `numora_irt_runtime`. Separate API/worker/Compute logins inherit their respective group from the PR 2 bootstrap; old direct-login grants are not automatically redirected to new identities.
- `dropGrantees` lists the reviewed grants to omit, for example Supabase `anon`, `authenticated`, `service_role`. A provider grant cannot be removed by an undocumented fallback. Other unmapped grantees fail. PUBLIC/owner/runtime groups cannot be dropped through this list.
- PUBLIC schema access is deliberately removed to match the VPS bootstrap. The owner retains schema USAGE/CREATE. Existing allowed object-level PUBLIC privileges, such as intentional type usage/function execution, remain exact. Runtime/PUBLIC grant options and administrative/DDL-like grants are rejected.
- Grantor chains outside mapped owners and source RLS policies for provider-specific roles are unsupported. Multiple source owners collapsing to the same target default-privilege scope must have identical mapped defaults; conflicting future-object policies need a separately reviewed decision.

No global string replacement is applied to SQL, function bodies, policy expressions or application rows. In particular, stored IRT login/resource pins and historical authorization evidence are not rewritten as part of owner mapping.

## 2. Prepare an offline plan

Build with the pinned Node/pnpm and keep backup, mapping, plan and reports on a private POSIX filesystem outside the checkout, as in PR 3. Plan generation requires no database credentials/network:

```sh
pnpm --filter @tka/database build
pnpm db:backup verify /PRIVATE_PATH/run-001
pnpm db:backup plan-vps /PRIVATE_PATH/run-001 /PRIVATE_PATH/owner-map.json /PRIVATE_PATH/restore-plan.json
```

The plan contains the reviewed mapping, exact mapped object/column/default ACLs, source major and backup-manifest SHA-256. The original mapping file's checksum is also recorded. The archive TOC retains every entry except the **single CREATE SCHEMA public** entry: PR 2 already created that empty schema with its final owner. Data, sequence, constraint, index, function, trigger, type, view and policy entries remain in the archive. Skipping dump ACL/ownership statements occurs only in the execution path below, with mandatory explicit replay and verification.

Review the private plan and record its checksum independently in the approved recovery record. Mapping review fields and checksums are operator assertions/integrity checks, not signatures or authorization by themselves. Treat source dump SQL as trusted/reviewed executable code; checksums do not sandbox a malicious dump. Do not edit generated plan ACLs or TOC to get past a failure: execution recomputes them against the verified source inventory and rejects a mismatch.

## 3. Bootstrap and quarantine only a new empty target

Complete PR 2's source-major/resource/TLS inventory gates and local role/database bootstrap first. Keep API/worker/Compute and all migration/import/ad-hoc processes stopped for this target. Do not point runtime env at it. The local PostgreSQL administrator then runs:

```sh
sudo -u postgres psql -X -d numora_production -f deploy/postgres/restore-quarantine.sql
```

The script refuses existing tables/functions/types, unexpected schemas/owner/name, a non-administrator operator or any other DB session. It does not kill connections or overwrite data. It removes PUBLIC/API/worker/Compute database access, retaining only the owner/migrator path. Review all other database ACLs too: `restore-vps` rejects other grantees with CONNECT/CREATE/TEMP rights. Local administrator/root access is a trusted operational control, not blocked by ordinary PostgreSQL ACLs.

Do not rerun `database.sql` after quarantine: that bootstrap would grant runtime CONNECT again. Do not run this quarantine script against the active source database. If a check fails, inspect inventory and the intended target; there is no automatic destructive cleanup/retry.

## 4. Execute the mapped restore

Inject `deploy/postgres/restore-target.env.example` settings privately before Node starts. This tool does not read the application's `.env` or change `DATABASE_URL`. Preserve existing durable application/Auth/pseudonym secrets. The migrator password belongs only to the separate runner, never API/worker env.

```sh
pnpm db:backup restore-vps /PRIVATE_PATH/run-001 /PRIVATE_PATH/restore-plan.json /PRIVATE_PATH/restore-report.json
```

Before mutation, the tool verifies artifact permissions/checksums, the plan/manifest binding, schema scope, major versions, real TLS/identity, loopback topology, fixed role/membership boundaries, zero other sessions, an empty owner target and its database connection fence. Main/Compute must have no ownership/admin/BYPASSRLS or ability to SET the owner/other group. The separate migrator must have only the reviewed owner membership.

The TLS/session check temporarily uses `SET LOCAL ROLE NONE` to inspect the original migrator's own backend (PostgreSQL otherwise masks that session's SSL metadata from the NOLOGIN owner), then returns to `numora_owner` within the same read-only preflight transaction. No role grants are added and certificate verification remains mandatory.

`pg_restore` runs once with `--no-owner --no-acl --role=numora_owner --single-transaction --exit-on-error` and the exact TOC selection. These flags prevent copying source owners/provider grants; **they are not a complete restore procedure on their own**. Every restored object, including SECURITY DEFINER functions, is created as the fixed non-superuser owner. The archive's frozen data and Drizzle history are copied; canonical migrations, seeds, grading, XP posting, IRT jobs or outbox delivery are not run.

In a second transaction, the tool resets ACLs on each identified object and replays only the plan's exact allowed privileges. All resets precede all grants, because PostgreSQL table-level REVOKE can also erase per-column grants. Owner schema USAGE/CREATE remains available for resolving objects during replay. Function targets come from the restored catalog, with no global SQL/body rewriting. Default privileges are rebuilt for `numora_owner`, which is the actual object creator for future migrator sessions. There are no blanket grants of current application tables to runtime roles.

The restore and ACL replay are **separate transactions**. The database therefore remains connection-fenced throughout and afterwards; an intermediate/default ACL state is never a reason to open runtime access. A failed restore/replay/check can leave a populated **quarantined target**, with no PASS report. The tool never drops it, disables integrity guards, suppresses errors or automatically repeats restoration over it. Keep that target closed and inspect it; recreate a fresh target only through a separately reviewed operator action.

## 5. Verify, then keep the connection fence closed

A PASS report is written only after these checks:

- All scoped schemas, relations/indexes/sequences, functions and types have `numora_owner`; SECURITY DEFINER bodies/search paths and RLS/trigger/policy definitions remain unchanged.
- Structured object, column and default ACLs exactly match the reviewed mapping. Provider/direct-login grants not in the plan are absent; Main/Compute membership, administrative/DDL rights, profile access, artifact writes and allowed input views meet the existing boundaries.
- The structural catalog, Drizzle history, every table's count/fingerprint and exact sequence values match the verified source backup. IDs/Auth mappings and historical assessment/content/XP facts are preserved rather than regenerated.

The report records manifest/plan checksums, target identity, checks performed, `connectionFence=REMAINS_CLOSED`, and `runtimeReady=false`. PASS means mapped logical restore verification. It is not a school trial, capacity/availability acceptance, production readiness or cutover approval.

Remaining gates before opening runtime access include the actual API/worker credential preflight from PR 1, restore/resource tests, supported-content and critical-flow QA (transactions, outbox/idempotency, timers/reconnect and authorization), real Auth login/UUID verification, off-host backup/recovery and a reviewed cutover/rollback window with every source writer frozen/drained. A source snapshot taken while writers remain active is not the final cutover state. Do not enable inactive IRT/generator paths as part of DB migration.

IRT authorization/resource pins can refer to the old database endpoint, service login or principal. They are immutable evidence and remain untouched. Follow the current reviewed IRT enrollment/resource-pin runbooks with the new deployment credentials before any production IRT operation; an ordinary Main ACL pass does not reauthorize Compute or publication. Main changes merged separately after the stacked migration branches must also be integrated/retested before release.

## Verification scope

Unit tests cover mapping completeness, reviewed dropped grantees, unknown/administrative/delegated grants, conflicting defaults, identifier quoting, exact TOC selection and target pins. A real local canonical-schema smoke maps 1,845 ACL objects and verifies structure/data/sequences. Linux CI additionally exercises fresh three-schema backup, non-superuser migrator restore, original-owner-to-NOLOGIN mapping, quarantine refusal/retention, provider-grant removal, actual TLS runtime logins, column privileges, future table/function defaults, SECURITY DEFINER execution and the real PvP cache invalidation trigger under restricted Main rights. Disposable tests never connect to Supabase or VPS.

Primary references: [pg_restore owner/ACL/role options](https://www.postgresql.org/docs/16/app-pgrestore.html), [ALTER DEFAULT PRIVILEGES creator semantics](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html), [ACL inspection functions](https://www.postgresql.org/docs/16/functions-info.html), and [GRANT](https://www.postgresql.org/docs/16/sql-grant.html).

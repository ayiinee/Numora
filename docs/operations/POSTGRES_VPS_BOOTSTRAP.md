# PostgreSQL VPS bootstrap — preparation PR 2

**ENGINEERING DECISION — owner direction, 15 November 2026:** prepare the existing Biznet Ubuntu 22.04 VPS (reported 8 vCPU, 8 GB RAM, 60 GB disk) for Production PostgreSQL; Development stays on Supabase. [ADR-012](../adr/ADR-012-development-supabase-production-postgres.md) and [PR 1 configuration](POSTGRES_VPS_CONFIGURATION.md) apply. Supabase Auth, R2, Redis placement and product rules remain unchanged.

This PR delivers reviewed files and disposable tests. It does not connect to the VPS, install software there, change existing service env, copy data or authorize cutover. Bootstrap SQL is committed infrastructure configuration, separate from the immutable canonical application migration journal. Run it only on a new dedicated target cluster.

## 1. Inventory before installation

Record source PostgreSQL **major version**, `pg_database_size(current_database())`, extensions and their versions, collation/encoding, schema/object counts, migration history, and whether any foreign keys/functions refer to Supabase-managed schemas. Obtain this through an operator-controlled read-only source session; do not paste credentials or dumps into Git/chat.

**PROPOSED baseline:** PostgreSQL **16**, matching the repository's Linux CI and bootstrap tests. Installation is gated by source inventory: this PR is not evidence that the Supabase source is version 16. Do not restore a newer-major source into 16. If the source requires 17/18 or an unavailable extension, revise and test these files for that target before provisioning. Ubuntu's unversioned `postgresql` metapackage is not the pinned baseline.

On the VPS record the existing listeners/clusters, process count, available memory and free bytes/inodes without stopping API/worker:

```sh
cat /etc/os-release
nproc
free -h
df -h / /var/lib/postgresql /var/log
df -i / /var/lib/postgresql /var/log
sudo ss -ltnp
command -v pg_lsclusters && pg_lsclusters
ps -eo comm,rss --sort=-rss | head -20
```

Paths may not exist before installation. Count **Node processes**, PM2 cluster instances, worker replicas, independent IRT pools and overlap during deployment. The 60 GB disk also hosts the OS/API/logs. Reserve room for restored data + indexes, WAL, temp files, upgrade/recovery work and logs; do not infer restore capacity from source dump size alone. Off-host backup and a restore rehearsal are subsequent release gates. No local dump retention is approved by these files.

## 2. Connection and memory budget

Copy `deploy/postgres/connection-budget.example.json` to an ignored/operator-controlled inventory and replace its assumptions. Run locally, without a database connection:

```sh
pnpm db:vps:budget deploy/postgres/connection-budget.example.json
```

The example accounts for API/worker each with Main pool 3 **plus the independent orchestration pool 2**, two simultaneous processes during replacement, a separate Compute reservation of 4, and migration/check connections 2. That totals **26 clients + 3 reserved superuser + 5 operations + 10 headroom = 44 of 60**, leaving 16 unallocated. Compute's example pool is a reservation, not evidence of its external service configuration or authorization to enable it. If orchestration uses a separate Main login, inventory that login separately rather than assigning its pool to the API login.

The checker aggregates shared logins, rejects inconsistent/exceeded login limits, and counts all overlap instances. Match live `max_connections`, `superuser_reserved_connections`, `rolconnlimit`, actual pool settings and all other tools before accepting the result. Server role limits are API 12, worker 12, Compute 4, migrator 2; changing the plan may require a reviewed role/config update. PostgreSQL connection limits are safeguards, not a capacity benchmark.

**PROPOSED co-hosted starting values:** shared buffers 1 GB, effective cache estimate 3 GB, work memory 4 MB, maintenance/autovacuum memory 128 MB, up to three autovacuum workers, and one parallel worker per gather. `effective_cache_size` does not allocate memory. `work_mem` can be consumed by multiple operations and parallel workers in one query; multiplying it only by connection count is not a memory upper bound. Measure PostgreSQL RSS/temp spills, OS available memory/swap, API/worker RSS, pool waits, latency and disk growth under realistic load. Do not allocate the entire 8 GB to PostgreSQL.

## 3. Install only after the source/version and inventory gates pass

These are **operator steps for the reviewed new target**, not commands executed by this PR. Confirm there is no existing cluster/listener to overwrite and retain current SSH access. The official PGDG repository supports Ubuntu 22.04 (`jammy`). For an approved version-16 target:

```sh
sudo apt update
sudo apt install curl ca-certificates gpg postgresql-common
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl --fail --output /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
gpg --show-keys --with-fingerprint /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
```

Verify the PGDG fingerprint `B97B 0AFC AA1A 47F0 44F2 44A0 7FCC 7D46 ACCC 4CF8` against the official installation page. Write `/etc/apt/sources.list.d/pgdg.sources` using a privileged editor:

```text
Types: deb
URIs: https://apt.postgresql.org/pub/repos/apt
Suites: jammy-pgdg
Components: main
Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
```

Then install the explicit major (current supported minor/security updates within that major), inspect the newly created cluster, and keep application env pointing at its existing service:

```sh
sudo apt update
sudo apt install postgresql-16 postgresql-client-16
sudo pg_lsclusters
sudo -u postgres psql -X -d postgres -c 'SHOW server_version'
```

Do not remove an older cluster, run `pg_dropcluster`, change firewall rules broadly, or restart API/worker as part of installation. If port 5432 is occupied, stop here and reconcile the inventory/configuration explicitly.

## 4. TLS and network files

The initial topology is direct PostgreSQL on the same VPS as native API/worker processes. `listen_addresses=localhost`; no public port 5432, public IP HBA entry, trust authentication, proxy or container-network exception is needed. Set the reviewed DB DNS hostname (example `db.numora.internal`) to loopback on that server. The certificate SAN must cover that hostname; install the issuing CA on the Node side through `NODE_EXTRA_CA_CERTS` before startup. A private CA is possible without a paid domain certificate, but its private key must stay outside the VPS/runtime repo and be retained securely for renewal/recovery. Do not use CI-generated test keys in Production.

Provision a reviewed server certificate/key and trusted CA first. Install only the leaf certificate/full chain and its private key on the database server:

```sh
sudo install -d -o postgres -g postgres -m 0700 /etc/numora/postgres
sudo install -o postgres -g postgres -m 0600 /SECURE_INPUT/server.key /etc/numora/postgres/server.key
sudo install -o postgres -g postgres -m 0644 /SECURE_INPUT/server.crt /etc/numora/postgres/server.crt
```

`/SECURE_INPUT` represents operator-controlled files, not a supplied path or generated credential. Put the reviewed config example at `/etc/postgresql/16/main/conf.d/numora.conf`; use the HBA example as the **complete HBA of the new cluster**, preserving a reviewed copy of the original. Appending it below existing permissive rules would not enforce it. Keep a local administrative terminal available: the only administrative route is the `postgres` OS account over its peer-authenticated Unix socket.

```sh
sudo install -o postgres -g postgres -m 0644 deploy/postgres/postgresql.conf.example /etc/postgresql/16/main/conf.d/numora.conf
sudo install -o postgres -g postgres -m 0640 deploy/postgres/pg_hba.conf.example /etc/postgresql/16/main/pg_hba.conf
sudo pg_ctlcluster 16 main restart
sudo -u postgres psql -X -d postgres -c 'SELECT line_number,error FROM pg_hba_file_rules WHERE error IS NOT NULL'
sudo -u postgres psql -X -d postgres -c 'SELECT sourcefile,sourceline,name,error FROM pg_file_settings WHERE error IS NOT NULL'
sudo ss -ltnp
```

Both error queries must return zero rows. Check effective SSL paths, `listen_addresses`, connection/memory settings and durability settings; `postgresql.auto.conf` or command-line arguments can override a file. The restart here affects only the new dedicated cluster, not an already-used database. TLS verification failures are fixed by correct SAN/trust/files, never by disabling certificate validation. Review certificate expiry/renewal and restricted log rotation/disk alerts as operational prerequisites; this PR does not install them.

## 5. Roles and database bootstrap

From the reviewed checkout, use the local administrator over its socket. `psql -X` avoids user startup-file side effects; scripts fail on the first SQL error:

```sh
sudo -u postgres psql -X -d postgres -f deploy/postgres/roles.sql
sudo -u postgres psql -X -d postgres -f deploy/postgres/database.sql
```

| Role                          | Purpose                           | Boundary                                                                   |
| ----------------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `numora_owner`                | Stable object/database owner      | NOLOGIN; never granted to Main/Compute                                     |
| `numora_migrator`             | Separate migration/restore runner | NOINHERIT, may SET owner; database-specific default role is `numora_owner` |
| `numora_main_runtime`         | Canonical Main ACL group          | Existing migration-owned NOLOGIN group                                     |
| `numora_irt_runtime`          | Canonical Compute ACL group       | Existing migration-owned NOLOGIN group                                     |
| `numora_api`, `numora_worker` | Separate Main logins              | Inherit only Main; cannot SET owner/Compute/group role                     |
| `numora_compute`              | Separate Compute login            | Inherits only Compute; no Main/owner membership                            |

All service roles are non-superuser, no CREATE DATABASE/ROLE, replication or BYPASSRLS. Database PUBLIC CONNECT/TEMP and schema PUBLIC access are revoked. Bootstrap adds no blanket table/sequence/function grants; canonical migrations remain responsible for grants/RLS/immutable-history rules. Main/Compute cannot create schema objects. `database.sql` rejects unexpected database/domain object ownership rather than rewriting an existing/restored database.

The scripts support reruns with the same expected role attributes/memberships/ownership. Unexpected privileges fail before new role grants; they are not automatically repaired. Creation of a missing database happens outside a transaction (PostgreSQL requirement); a later database-configuration failure leaves that empty target for inspection. Never drop it automatically. Existing passwords and business rows are not changed by a successful rerun. The scripts do not reconcile arbitrary pre-existing role ACLs on other databases: use a dedicated new cluster and review the full grant inventory.

New login passwords are unset. Provision strong independent values interactively, with SCRAM configured, using `psql`'s password command; keep passwords out of shell/SQL history, command arguments and committed env:

```sh
sudo -u postgres psql -X -d postgres
```

```text
\password numora_api
\password numora_worker
\password numora_migrator
-- Provision Compute separately only when its deployment is actually needed.
\quit
```

No Compute password or enabled feature is necessary merely to prepare the database. Keep migrator credentials out of API/worker env. If a later restore needs superuser-only extensions/roles, provision those with the local administrator after review; do not elevate the migrator or runtime to make a restore succeed.

## 6. Schema and restored-data boundary

For an **empty rehearsal database only**, the normal `@tka/database db:migrate` runner can connect as `numora_migrator` with verified TLS. Its session identity is migrator and its actual object-creating role is the database-specific `numora_owner`. Do not inject this identity as `DATABASE_URL` into API/worker.

For the real migration, stop after infrastructure preparation. The next PR must define backup/restore scope, consistent source snapshot, owner remapping (including SECURITY DEFINER function ownership), complete `public` + `irt_compute` + `drizzle` history, grants/default privileges, checksums and rollback. **Do not initialize an empty canonical schema and then restore schema over it**, copy only public tables, replay old migrations over a restored snapshot, regenerate UUIDs, or copy Supabase administrative roles into the target. Restore ordering/ownership requires its own tested procedure.

After the restore/rehearsal, run PR 1's read-only production preflight with the actual API/worker login and TLS CA. Verify Main cannot read Drizzle history, mutate Compute artifacts, create objects or SET owner; Compute can read allowed input views but cannot read/write student profiles. Full business-critical QA and Auth UUID mapping verification remain required; an empty schema/preflight pass is not data migration acceptance.

## 7. Evidence and remaining gates

Automated tests exercise fresh role/database bootstrap, null initial passwords, canonical migration replay as the non-superuser migrator/NOLOGIN owner, both Main production preflights, allowed Main writes, Compute view access, denied DDL/escalation/profile/artifact/history access, safe reruns and rejection of unexpected existing privilege/membership/ownership. They use dedicated localhost databases, never cloud credentials. CI also starts a **second disposable Linux PostgreSQL 16 cluster** using the actual server/HBA templates, tests TLS/SCRAM, rejects plaintext/wrong passwords/TCP admin, checks peer-admin access and parses effective configuration/HBA. The connection-budget tests run in the normal script-check suite.

These checks verify bootstrap compatibility and isolation, not actual VPS provisioning/capacity, source compatibility, imported data or application acceptance. Required next: source inventory/version decision, backup/restore tooling and rehearsal, off-host backup retention/recovery, disk/availability monitoring, resource tests, critical-flow QA, then a reviewed cutover/rollback window.

Primary references: [PGDG Ubuntu installation](https://www.postgresql.org/download/linux/ubuntu/), [PostgreSQL 16 role membership](https://www.postgresql.org/docs/16/role-membership.html), [HBA first-match rules](https://www.postgresql.org/docs/16/auth-pg-hba-conf.html), [memory settings](https://www.postgresql.org/docs/16/runtime-config-resource.html), and [logging settings](https://www.postgresql.org/docs/16/runtime-config-logging.html).

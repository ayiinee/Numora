# PvP DEMO cloud activation — 6 October 2026

**ENGINEERING DECISION — explicit owner instruction:** use the currently configured environment for the cloud migration and DEMO activation. This operation targets the existing Supabase Development sandbox, not a newly provisioned staging environment. Product rules and the Curriculum gate are unchanged.

## Target and outcome

| Item                                       | Verified result                                                                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase project                           | `pkamenfnwmoeisccnrnk`, PostgreSQL 17.6, TLS session connection                                                                                            |
| Migration artifact                         | Commit `ae017456a11e69816e99b18acb62f8fab3da8f91`; SQL `0029_pvp_leaderboard_activation`                                                                   |
| Migration and replay                       | PASS; journal grows from 41 to 42 entries, replay adds none                                                                                                |
| Historical preservation                    | PASS; fingerprints on 146 pre-existing public/irt_compute/auth/storage tables unchanged, excluding only the new columns and the newly published PvP policy |
| Accounts and learning history at migration | 117 Auth users, 327 assessment attempts, zero outstanding PvP rooms; no account, reward or historical result rewrite                                       |
| Authorization                              | `pvp_active_rooms` has RLS and the scoped main policy; browser/Data API roles and compute role have no table or trigger-function access                    |
| Opt-in DEMO seed                           | Three immutable published packages, ten READY PG questions each, for easy/medium/hard; replay is idempotent                                                |
| Seed preservation                          | PASS; 147 tables retain all non-PvP-DEMO rows, including Auth and rewards; migration journal unchanged                                                     |
| Runtime configuration                      | `.env`: `PVP_MODE=demo`, `PVP_NEW_MATCHES_ENABLED=true`; no browser mode flag                                                                              |
| API and web                                | Health/database checks pass; web returns HTTP 200                                                                                                          |
| Authenticated availability                 | `available=true`, `dataMode=demo`, all three difficulties available                                                                                        |
| Leaderboard worker                         | Startup projection passes; 104 class entries, `dense-v1`, current boards `stale=false`                                                                     |

SQL SHA-256:

```text
f1649c7aa45b5ba121064dff5d0032d3ddb83ab862cf74fc1cdfcae03425dfce
```

The cloud journal also contained an additional existing hash `014f57074e35b11a32e5b5dded0959d14214970f33758b721714a99a3248a178` with cursor `1791257962193`, not present in this checkout. Its origin is not inferred. All 41 existing rows are preserved. Only the timestamp of the previously unapplied local `0029` journal entry was moved to `1791261680000`, allowing the canonical `migrateIntegratedDatabase` runner to apply the reviewed additive migration after the cloud cursor. Upgrade and replay were rehearsed against a fresh restore containing that exact history before cloud application. No manual cloud DDL or history deletion was used.

The migration-only commit contains SQL, Drizzle snapshot and journal. Application artifacts were built from the combined working tree; existing learning/UI changes remain uncommitted and intact. The operation did not push Git or deploy a remote hosting artifact.

## Backup and rehearsal

Before apply, two custom-format PostgreSQL archives were created from one exported snapshot in the access-restricted operator folder:

`D:/numora-sandbox-backups/2026-10-06-pvp-0029/`

| Archive                  | Scope                                    | SHA-256                                                            |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------ |
| `business.dump`          | public, drizzle, irt_compute schema/data | `76bfe05771e5c816776e6557d5098ca2778611fd0750eefb996f19232979db8b` |
| `auth-storage-data.dump` | auth/storage data                        | `bcd42668ff5774c273ae3cc4223fcc8bd3048452aa553e1087178c051c1f67b8` |

Both archive lists and checksums were verified. Business restore to an isolated PostgreSQL 17.11 database took approximately 6.3 seconds; migration/replay retained all 111 pre-existing business-table fingerprints. The rehearsal database was stopped afterward, with data and archives preserved.

This is a business backup plus Auth/Storage data archive, not a full Supabase infrastructure restore. Auth/Storage schema, cloud ownership/ACL, Storage/R2 object files and provider configuration are outside this archive. Auth/Storage data was checked before/after cloud migration; its archive was not restored in the business rehearsal.

## Runtime and verification

One compiled NestJS API, one compiled worker and the Next.js development web server were started on the current computer, using the existing Supabase and TLS Redis configuration. They remain running after this operation:

- Web: `http://localhost:3000/student/pvp`
- Leaderboards: `http://localhost:3000/student/leaderboards`
- API: `http://localhost:3001/api/v1`
- Health: `/api/v1/health` and `/api/v1/health/database`

The runtime uses the existing Development connection configuration. Its database login is still the pre-existing owner credential; provisioning a separate runtime login was not part of this operation. Cloud table/function grants for `numora_main_runtime` were verified independently. Remote release should use the designated scoped runtime credentials described in the rollout runbook.

The authenticated REST smoke check used an existing local QA identity verified by real Supabase Auth. Its saved password was no longer accepted, so an operator-generated magic link was verified for that same existing QA user after checking its ID/email binding; no email was sent, account created or password changed. Tokens remained in memory and are excluded from evidence. No auth-provider or product-route fixture was used.

At **11:49 WIB**, availability and activity/PvP leaderboard REST checks passed. Projection timestamp was **11:47:57 WIB**, with the next update at **12:00 WIB**. The current interval is **1 October 2026 00:00 WIB ≤ event < 8 October 2026 00:00 WIB**. The DEMO PvP boards are available and initially empty; this smoke check did not create matches or award XP.

Private operator evidence includes `before.json`, `backup.json`, `restore.json`, local/cloud apply/replay results, seed preservation results, and `runtime-smoke.json`. Process IDs and launch metadata are in ignored `.tmp/job16-cloud/runtime-processes.json`. Credentials and browser auth storage are not published.

## Remaining acceptance boundary

**OPEN — authentic-user acceptance:** this operation establishes cloud migration, seeded DEMO readiness and authenticated QA API checks. It does not establish two Google-authenticated Mandiri/School browser acceptance, all match/recovery scenarios, independent review/sign-off, or public staging hosting. Those checks remain in [the rollout acceptance scenarios](PVP_LEADERBOARDS_ROLLOUT.md).

**OPEN — Curriculum dependency:** official mode remains inactive. DEMO points stay separate; official content/difficulty approvals are still required. PGK rubrics, IRT computation and XP formulas were not changed.

To stop new rooms, set `PVP_NEW_MATCHES_ENABLED=false` on the API and restart the current process using its updated environment. Restart cancels outstanding rooms according to the interruption policy. After draining/cancelling rooms, `PVP_MODE=disabled` fully gates PvP. Never delete results, reward ledgers or archives as a disable procedure.

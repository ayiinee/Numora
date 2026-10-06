# Development scenarios

**ENGINEERING DECISION — 6 October 2026:** the active runner is `pnpm db:seed:scenarios`. It uses reviewed fixture UUIDs and existing pools to create new immutable question/package versions with ordinary titles, exact 20/10/30/10 counts, and current Drill policy. Replay verifies composition and never reactivates archived replacements. Synthetic PGK covers answer storage only; it creates no invented rubric, score or XP.

`ALLOW_SYNTHETIC_CONTENT` defaults to `false`. Enable it only on the named Development project with matching Auth/database identity, or a localhost `numora_test_*` database with `NODE_ENV=test`. All other targets reject activation. Normal Admin creation defaults to `isDemo=false`. Legacy V1 bootstrap/teacher evidence remains below for reproducibility; it is internal historical tooling. Historical immutable labels use verified presentation overrides.

See [cleanup decision and verification](../../../docs/development/DEMO_CLEANUP_2026-10-06.md). Back up and rehearse operator cleanup before writing.

# Historical V1 learning bootstrap

**ENGINEERING DECISION — 3 October 2026:** the project owner explicitly authorized additive Supabase testing content during Phase 3. This is separate from the presentation changes; it does not approve new product rules or schema changes.

`redesign-learning.sql` creates one separate `DEMO-UI-ALJABAR` chapter, one subchapter, one competency, five levels, 50 question families, two equivalent variants per family, and ten DEMO Drill packages. Each package contains ten single-answer questions. The 100 question versions include four distinct options, a rotating correct option and a mathematical explanation. Questions exercise perfect-square constants and difference-of-squares identities.

**OPEN:** academic review has not occurred. Question versions stay `DRAFT`; packages are explicitly `is_demo=true`, using the existing published `DRILL_PG_DEMO` policy. The cleanup supersedes this behavior: new starts require READY content, and V2 scenario packages retain the original mathematics in reviewed test versions. Archived V1 packages remain historical. Do not represent the content as official TKA material or Curriculum-approved. This seed creates no Tryout, PGK, image-question or video content.

The CLI is pinned to the configured NUMORA Supabase project `pkamenfnwmoeisccnrnk`. It requires both explicit DEMO opt-in and a matching Supabase/DB connection, uses TLS and a transaction/advisory lock, and logs only aggregate verification results. It never changes users, classes, attempts, progress, historical content, scoring policies or schema. Deterministic UUIDs and `ON CONFLICT DO NOTHING` make repeated application additive and idempotent. Existing demo seed scripts are not called.

From the repository root, with the configured `.env` and Node 24/pnpm 12:

```powershell
$env:NODE_ENV = 'development'
$env:ALLOW_DEMO_SEED = 'true'
npx --yes pnpm@12.6.0 db:seed:redesign
```

After application the CLI reads all seeded package items, verifies the expected 5/10/100 counts, independently derives each mathematical answer from its stem, and checks four unique options and a nonempty explanation. Repeated runs were verified against the configured Supabase database. A verification failure is reported without exposing connection details; inspect the demo content before rerunning because verification occurs after the insertion transaction.

For current manual testing, run the V2 scenario command above, sign in as a Student and open **Materi → Persamaan & Fungsi Kuadrat → Faktorisasi & Bentuk Kuadrat**. A fresh Student starts at Level 1; higher levels unlock through the existing server mastery rule. Correct answers remain in server content and are disclosed through the existing result API after submission. No progress is fabricated to imitate the screenshots. The browser visual tests separately use synthetic fixtures for active/completed/locked level combinations, offline recovery and result states.

The seed is compatible with the actual configured database tables; no migration was applied. Its readiness does not establish that the cloud schema is current with every repository migration. Real Google OAuth and a complete connected API assessment lifecycle require separate connected QA.

See the [Phase 3 report](../../../docs/design/UI_REDESIGN_PHASE_3_2026-10-03.md) for implementation and browser evidence. Supabase's [seeding documentation](https://supabase.com/docs/guides/local-development/seeding-your-database) describes the general distinction between seed content and migrations; this repository uses its existing PostgreSQL seed runner conventions.

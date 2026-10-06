# Learning redesign DEMO seed

**ENGINEERING EVIDENCE — 7 October 2026:** the owner requested removal of the persisted Content demos from Development so the team can create its own. [Cleanup evidence](../../../docs/development/ADMIN_CONTENT_DEMO_CLEANUP_2026-10-07.md) records the deleted data and retained records. The seed below remains an opt-in test tool; do not rerun it on the cleared shared Development sandbox as part of normal startup.

**ENGINEERING DECISION — 3 October 2026:** the project owner explicitly authorized additive Supabase testing content during Phase 3. This is separate from the presentation changes; it does not approve new product rules or schema changes.

`redesign-learning.sql` creates one separate `DEMO-UI-ALJABAR` chapter, one subchapter, one competency, five levels, 50 question families, two equivalent variants per family, and ten DEMO Drill packages. Each package contains ten single-answer questions. The 100 question versions include four distinct options, a rotating correct option and a mathematical explanation. Questions exercise perfect-square constants and difference-of-squares identities.

**OPEN:** academic review has not occurred. Question versions stay `DRAFT`; packages are explicitly `is_demo=true`, using the existing published `DRILL_PG_DEMO` policy. The current Drill service permits these DEMO packages. Do not represent the content as official TKA material or Curriculum-approved. This seed creates no Tryout, PGK, image-question or video content.

The CLI is pinned to the configured NUMORA Supabase project `pkamenfnwmoeisccnrnk`. It requires both explicit DEMO opt-in and a matching Supabase/DB connection, uses TLS and a transaction/advisory lock, and logs only aggregate verification results. It never changes users, classes, attempts, progress, historical content, scoring policies or schema. Deterministic UUIDs and `ON CONFLICT DO NOTHING` make repeated application additive and idempotent. Existing demo seed scripts are not called.

From the repository root, with the configured `.env` and Node 24/pnpm 12:

```powershell
$env:NODE_ENV = 'development'
$env:ALLOW_DEMO_SEED = 'true'
npx --yes pnpm@12.6.0 db:seed:redesign
```

After application the CLI reads all seeded package items, verifies the expected 5/10/100 counts, independently derives each mathematical answer from its stem, and checks four unique options and a nonempty explanation. Repeated runs were verified against the configured Supabase database. A verification failure is reported without exposing connection details; inspect the demo content before rerunning because verification occurs after the insertion transaction.

For manual UI testing, sign in as a Student and open **Materi → Bab Demo UI: Persamaan & Fungsi Kuadrat → Subbab Demo UI: Faktorisasi & Bentuk Kuadrat**. A fresh Student starts at Level 1; higher levels unlock through the existing server mastery rule. Correct answers remain in server content and are disclosed through the existing result API after submission. No progress is fabricated to imitate the screenshots. The browser visual tests separately use synthetic fixtures for active/completed/locked level combinations, offline recovery and result states.

The seed is compatible with the actual configured database tables; no migration was applied. Its readiness does not establish that the cloud schema is current with every repository migration. Real Google OAuth and a complete connected API assessment lifecycle require separate connected QA.

See the [Phase 3 report](../../../docs/design/UI_REDESIGN_PHASE_3_2026-10-03.md) for implementation and browser evidence. Supabase's [seeding documentation](https://supabase.com/docs/guides/local-development/seeding-your-database) describes the general distinction between seed content and migrations; this repository uses its existing PostgreSQL seed runner conventions.

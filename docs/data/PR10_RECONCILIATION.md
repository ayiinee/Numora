# PR #10 integration against `main`

**ENGINEERING DECISION (integration draft):** Keep the existing Drill tables, columns, and `question_versions → question_variants` relationship from `main`. Migration `0003_acoustic_hellfire_club.sql` adds the nonoverlapping assessment, PvP, leaderboard, analytics, support, and Data/AI tables from PR #10. It does not replace the Drill API's content or progress tables. The resulting schema has 50 application tables because `main` already added Drill specific tables that PR #10 did not contain.

The Pretest unique index covers `SUBMITTED` and `GRADED` attempts. `CANCELLED` attempts do not consume the one completed Pretest per chapter allowance. The migration enables RLS on all new tables, removes client role grants when those roles exist, and prevents overlapping leaderboard periods.

Drill XP ledger rows reference `drill_attempts` directly; Tryout rows reference `assessment_attempts`. Question reports may reference a saved general answer or a Drill attempt question. These references keep the already implemented Drill history usable without copying it into the new assessment tables.

## Before this branch can merge

- **OPEN:** PR #10 models question versions under variants, while `main` models variants under question versions. The new general assessment tables currently refer to the `main` version ID. Confirm how an assessment pins the exact variant/content used before implementing Pretest, Tryout, PvP, or question reports on these tables. Keep historical Drill attempts and answers in their existing tables.
- **OPEN:** The copied PR #10 Staging schema already contains many of the new tables but has incompatible Drill columns and a different migration history. `0003` must not be run directly against that project. Prepare a separate, guarded transition for a restored Staging copy after a restorable backup has been verified. Preserve the two existing `auth.users` accounts.
- Run the PostgreSQL integration test and existing Drill flow against a clean database migrated with `0000`–`0003`. Test the Staging transition only on a restored copy, compare schema, row counts, migration history, and Auth users, then approve a production procedure separately.

The read-only Staging evidence is in [PR #10's audit](https://github.com/ayiinee/Numora/blob/b011866/docs/data/SUPABASE_STAGING_DRILL_AUDIT_2026-09-30.md). It is a point-in-time report, not a backup or a migration rehearsal.

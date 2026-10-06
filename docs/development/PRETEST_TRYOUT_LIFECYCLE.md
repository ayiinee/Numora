# Pretest and Tryout lifecycle — 6 October 2026

**PRD RULE:** v0.6 §7.1 defines 20 Pretest items/chapter, one completion, no XP and placement 0–7/8–18/19–20 correct → Levels 1/2/3. Blueprint distribution remains Curriculum-owned. Supplied Drill v1.3 retains this context and specifies information, attempt, result, skipped and completed UI states.

**ENGINEERING DECISION — explicit owner approval in this conversation:** all Students are eligible. Skip opens Level 1, does not consume completion, and preserves an active attempt and answers. Existing Drill progress is never reduced or marked completed by placement. One active Pretest/account/chapter; server save/resume without expiry; answer versions reject stale-tab writes; manual submit waits for acknowledged saves. Saved means server-acknowledged. Login expiry does not cancel the attempt.

**PRD RULE / owner clarification:** supplied Tryout v1.2 defines 30 items and 10-minute countdown. Batch opens Monday 00:00 WIB and closes Sunday 23:59; owner specifies the **start** of that minute (23:59:00). Effective deadline is min(start + 600 seconds, close). Past metadata remains visible, but no Start or payment UI. Existing attempts remain single and results stay release-gated. **ENGINEERING DECISION:** ×100 in v1.2 is a typo; existing ×10 and ceil-on-total remain unchanged. Preserve existing immediate persisted XP display for PG attempts; no new calculation/display policy is introduced.

## Deferred dependencies

**OPEN / deferred by owner:** approved blueprint/content, numeric PGK rubrics and production PGK publication, IRT/fallback formula and validation. No Curriculum bank is fabricated or published. TEST/DEMO Pretest packages use exactly 20 PG items with labeled synthetic placement across the fixture chapter. Non-demo Pretest start remains gated. Mixed-format Tryout demo can save and submit raw answers, ending in SUBMITTED with numeric grades/XP absent; it does not claim final PGK grading. Existing graded PG/reward/result paths stay compatible. Production mixed packages remain blocked pending rubric approval. No release timer bypass or automatic fallback result is added.

## Implementation and verification

Pretest endpoints under `/api/v1/pretest`: chapter state, start, Skip, attempt resume, revision-checked answer save, submit and persisted result. Student pages integrate chapter cards, attempt, result and history. Tryout adds Ongoing/Past package listing/detail and keeps PostgreSQL-only deadline recovery as the source of finalization truth.

Migration `0028_friendly_wind_dancer.sql` creates durable Skip state, answer revision and the result snapshot, plus the unique active Pretest constraint and restricted runtime grants. Apply the normal migration chain before deploying this API/UI. The migration and upgrade/repeat-migration checks passed on a new isolated localhost PostgreSQL cluster. Subsequent Cloud application is recorded in the dated update below. The original lifecycle fixture stays local only; an additional owner-requested mock bank is now available on the development sandbox as described below.

For legacy Tryout metadata with no pinned close timestamp, the weekly release window determines the Past label only. `closeAt`/`resultDueAt` remain null; historical attempt deadlines/results/policy pins are never rewritten.

## Local QA fixture

Run the existing normal database migration command against your **isolated localhost test database**, then:

```powershell
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgres://postgres@127.0.0.1:55442/numora_pretest_tryout?sslmode=disable'
$env:ALLOW_DEMO_SEED = 'true'
pnpm --filter @tka/database db:seed:lifecycle
```

Use your own localhost database name/port. The explicit opt-in and localhost guard reject shared remote targets. The seed creates one labeled synthetic chapter with 20 PG Pretest items and a 30-item mixed Tryout. It prints fixture IDs and creates no usable login or approved Curriculum content. It preserves any existing published weekly Tryout; in that case its new Tryout fixture is CLOSED. Use a fresh isolated database to test its current-package Start path.

## Verification — 6 October 2026

- API learning suite: **39 passed**, including six real PostgreSQL/Nest HTTP lifecycle tests. Covers start/Skip/submit races, answer revisions/retry, authorization, placement boundaries, persisted answers/results, no XP, archived-package resume and missing-package Skip.
- Database migration/upgrade/journal/Data API lockdown: **9 passed**. Engine: **16 passed**. Worker recovery without browser/Redis: **4 passed**.
- Full web regression suite: **224 passed**. Browser fixture suite: four Pretest/Past scenarios at 390/1280 px plus one mixed Tryout PGK scenario. Multi-answer and partial-category answers survive reload; raw submit stays result-gated without numeric XP.
- Workspace typecheck/build, lint and contract validation/freshness passed. Build emitted a Turbo cache-write warning because local disk space was low; all ten build tasks still succeeded.
- Screenshots reviewed at both widths, with horizontal-overflow assertions. Evidence logs/screenshots live in ignored `.tmp/pretest-tryout-evidence/`; the browser uses intercepted TEST API/auth responses, while lifecycle integration tests use the actual backend/database. These are distinct from connected Google-login/production QA.

**Cloud update — explicit owner instruction, 6 October 2026:** migration `0028` was committed as `e7cf11d` and applied to the verified Supabase sandbox after a fresh backup/restore/replay rehearsal. Cloud schema/RLS checks passed; fingerprints of all 145 prior tables remained identical. [Operation evidence and backup boundaries](../data/PRETEST_CLOUD_MIGRATION_2026-10-06.md). No new PR, application-code commit/push, DEMO seed or hosting deployment was performed. Academic approval, production PGK scoring/publication, IRT/fallback approval and independent release QA remain deferred.

**ENGINEERING DECISION — later owner request, 6 October 2026:** a separate mock seed adds 20 PG Pretest questions to each of the four existing DEMO chapters and a new 30-item mixed Tryout for the week of 5 October. The sandbox seed was applied and replayed idempotently; all existing rows across 146 tables remained unchanged. No production PGK rubric or IRT result was fabricated. [Mock bank, QA keys and repeat-seed instructions](../data/ASSESSMENT_MOCK_TESTING.md).

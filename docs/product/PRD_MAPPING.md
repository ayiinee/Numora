# PRD → Engineering Mapping

**USER CLARIFICATION — 3 Oktober 2026:** indikator kurikulum menggunakan `competencies`. Level/progres berada di subbab; nomor level kurikulum pada bank soal menentukan pool lintas indikator untuk level subbab yang sama. Ini tidak menetapkan kuota indikator, rubrik, atau jumlah level. [Rincian data dan migrasi](../data/CURRICULUM_SLUG_LEVEL_MIGRATIONS_2026-10-03.md).

This document maps [Drill v1.2 and TryOut v1.1](CORE_LEARNING_PRD_UPDATE_2026-10-02.md) (supplied 2 October 2026) and the cross-feature PRD v0.5 baseline to implementation areas. It is not a replacement for the PRD. The Sprint 2 Student slice and additional Teacher prototype UI are recorded in `docs/development/SPRINT_2_GOAL.md`.

| PRD area | Key product behavior | Primary backend modules | Primary frontend areas | Persistence / infrastructure | Test emphasis |
|---|---|---|---|---|---|
| §1 Product purpose | TKA Math practice for Mandiri and School Students; progress, monitoring, quality, PvP | cross-cutting | all | analytics | both Student journeys |
| §2 Scope/roles | Student affiliation (Mandiri/School); Student/Teacher/Admin roles; deferred payment | identity, authorization | role route groups, affiliation states | users/memberships | cross-role and cross-affiliation access |
| §3 Auth/School/Class | Google login; school token; join changes affiliation; one-class Student | identity, schools, classes | onboarding, teacher verification, admin school | users, schools, token, memberships | token race, ownership, one-class uniqueness, Mandiri access |
| §4 Material/Pretest | Chapter→Subchapter→Level; 20 questions/chapter once for life; Skip → Level 1 all subchapters; all placement mapping TBC | content, assessments, progress | core learning | taxonomy, package, attempt, level progress | OPEN distribution/placement; no duplicate pretest |
| §5 Drill | 10 questions, count-up no pause/deadline, 80 mastery, <15min bonus eligibility; stars/XP/retention TBC; retries, best score/history | assessments, progress, recommendations, XP | core learning | attempts, answers, variants, progress, XP ledger | DRL-AC-01–24; irreversible unlock, best score, warnings, failed-save, retry fallback |
| §6 Tryout/Scoring | Free all Students; 35 PG/PGK MCMA/Category; countdown auto-submit; one attempt/package; released IRT result ≤3×24h after batch end | assessments, tryout, scoring, IRT | core learning | package period, attempt, scoring/IRT version | TRY-AC01–25; same batch package, timer race, Mandiri access, past eligibility, immutable release |
| §7 PvP | 1v1 realtime across Mandiri/School; classmate invite only for School; 20s reconnect | pvp gateway/match engine | PvP | Redis transient + PostgreSQL result | cross-type access, synchronization, authoritative score |
| §8 Leaderboard | class Drill+Tryout XP vs global PvP best XP; hourly; Wed archive | leaderboard, XP | leaderboard pages | XP ledger, periods, projection/cache | no double count, archive, separation, all-Student PvP |
| §9 Monitoring/support | teacher dashboard, feedback, videos, reports | monitoring, feedback, videos, reports | teacher/admin/student support | feedback/reports/video metadata | resource ownership, read state |
| §10 Admin/content/IRT | content status, audit, historical integrity, IRT; Admin CRUD outside new student-feature scope | admin, content, audit, IRT | admin | question versions, audit, IRT result | historical immutability |
| §11 Data/NFR | events, reliability, time, privacy, WebSocket/jobs | cross-cutting | states/accessibility | outbox, logging, Redis/BullMQ | idempotency, observability |
| §12 Handoff | module specs with I/O/states/validation/tests | all | all | contracts | DoR/DoD |
| §13 OPEN items | Global OPEN-01–18 + DRL-OPEN-01–10 + TRY-TBC-01–07 | policy abstractions | feature states | config/versioning | tests gated by approved policy |
| §14 Terms | canonical vocabulary | naming | labels | naming | terminology consistency |

## User stories to technical capabilities

| User story | Technical capability |
|---|---|
| US-01 join class | class code/link/QR resolution, membership transaction, one-class constraint |
| US-02 pretest | pretest eligibility, package selection, placement policy, progress unlock |
| US-03 repeat Drill | assessment persistence, variant rotation, scoring, progress, XP |
| US-04 tryout | free shared 35-item package, three formats, countdown/auto-submit, one attempt/package, released IRT result/explanation |
| US-05 PvP | cross-affiliation WebSocket room/match state, Redis, durable result, global PvP leaderboard |
| US-06 teacher monitoring | resource-scoped query, progress aggregation, feedback |
| US-07 content correction | question versioning, archive, immutable historical attempts |
| US-08 teacher verification | single-use token transaction + teacher-school membership |
| US-09 school operations | Admin school/token/class/member interfaces + audit |
| US-10 video report | recommendation metadata + report workflow |
| US-11 IRT | response extraction, daily batch, model/versioned result, admin display |
| US-12 Mandiri upgrade | join Class and change affiliation without losing historical learning state; School exit behavior OPEN-15 |
| US-13 stars | derive 1–3 stars from Drill score independently of 80% unlock and XP |

## Sprint 2 slice and dependency

**ENGINEERING UPDATE, 29 September 2026:** the initial identity slice now targets the shared Supabase Cloud Development project. Next.js handles Google Auth; NestJS verifies the token and owns internal role/authorization state. The Database team applies committed Drizzle migrations once to Development. This does not add Class/Drill behavior or resolve any OPEN product item.

The supplied Sprint 2 Goal targets `Google login → Student profile → join Class → demo Level-1 Drill → persisted score/result → progress → Level-2 unlock`. Scope includes FE/API/PostgreSQL integration and idempotent submit. The team confirmed that approved PRD v0.5's **80%** threshold supersedes the PDF's 70%. For the two-week prototype trial with real school users on online staging, **Admin UI lists/creates/edits Schools and issues/reissues/revokes tokens → Teacher Google login and token verification UI → Teacher creates Class → School Student joins and completes Drill → Teacher opens Class list and Student detail for level status and latest/best score**. Level-1 questions are clearly labeled demo content until Curriculum supplies validated questions. Mandiri is outside the first trial. These are additional trial requirements, while the Sprint 2 PDF excludes *full* Admin/Teacher UI from its blockers. Trial starts only when login, authorization, persistence, and 80% scoring/unlock work without critical failures. See `SPRINT_2_GOAL.md`.

Prototype content clarification from the Software Engineering coordinator: the 10 demo `SINGLE_CHOICE` questions use four options `A`–`D` and simple inline LaTeX. Existing question JSON schemas cover Data/AI import, not these internal fixtures or Student-facing responses. Curriculum reviews the demo content before the school trial; see `docs/data/QUESTION_CONTRACT.md`.

## Current dependency order

```text
Identity ──┬── Mandiri Student
           └── School verification / Class ── School Student

Content taxonomy & question model
  ├── Assessment engine
  │     ├── Drill (both affiliations) ── Progress + XP ledger
  │     ├── Pretest (affiliation reconciliation; all placement OPEN)
  │     └── TryOut (all Students free MVP; 35 items; IRT release)
  ├── PvP (both affiliations) ── global PvP best XP
  ├── Recommendation / reporting
  └── IRT / analytics

Progress + XP ledger ── class leaderboard / monitoring / feedback
```

## Change-impact rule

**ENGINEERING IMPLEMENTATION, 1 October 2026:** Ferdi's canonical Drill package APIs, Student video/report support, and IRT integration boundary are described in [FERDI_CONTENT_SUPPORT](../api/FERDI_CONTENT_SUPPORT.md). See [implementation status](../development/FERDI_IMPLEMENTATION_2026-10-01.md) for handoffs and blockers. Final PGK/model/scale/duration/past-package policies and PRD alignment remain dependencies; this update does not resolve OPEN items or declare the MVP ready.

Any PRD change must be checked against at least:

- API/OpenAPI;
- database schema/migrations;
- UI states;
- analytics events;
- test scenarios;
- documentation;
- data/AI content contract where applicable.

## Pemetaan implementasi area siswa ? 1 Oktober 2026

Dashboard/area siswa berada pada `modules/learning/student-dashboard.*` dan layout `app/student`; PvP pada `modules/pvp`, leaderboard pada `modules/leaderboards`, serta proyeksi worker `class-leaderboard.ts` yang juga membangun best record PvP. Kontrak REST/WebSocket dan migrasi 0007/0008 mencatat persistensi/versioning/idempotensi. **OPEN-07/OPEN-11 tetap OPEN**; fixture tes tidak menjadi perilaku produk. Lihat [status integrasi siswa](../development/STUDENT_AREA_IMPLEMENTATION.md).

## Feature PRD traceability — 2 Oktober 2026

| Source | Primary capability | Affected context |
| --- | --- | --- |
| Drill §5 / DRL-AC-02–04 | Lifetime Pretest, 20 questions, no XP, Skip Level 1, mapping pending | assessments/progress, OPEN, QA |
| Drill §6–9 / DRL-AC-01,05–16 | Level eligibility, count-up, save/finalize, 80 unlock, retry/history/best score | API, database, test strategy |
| Drill §10–14 / DRL-AC-17–24 | Result/XP/stars pending policy, YouTube/report, explanation, warning, events | design, support API, events/privacy |
| TryOut §4–6 / TRY-AC01–13,20–22,25 | Free all Students, Ongoing/Past, 35 three-format questions, countdown, single attempt | authorization, API/PGK, UI, fixtures |
| TryOut §7–11 / TRY-AC14–19,23–24 | Waiting/release, SLA, immutable simulation score, score-only XP | IRT, operations, history/data |

The source copies contain all 49 acceptance criteria. [QA Guide](../testing/QA_GUIDE.md) groups their evidence. Updated documents do not regenerate OpenAPI, migrate data, or prove implementation compliance.

## JOB-09/20 engineering traceability - 3 October 2026

TryOut countdown/finalization maps to the shared PostgreSQL finalizer and recovery runbook; clean-SHA evidence is in backend status, with duration/close/release decisions still OPEN. Drill/TryOut events map to the [JOB-20 inventory](../development/JOB20_ANALYTICS_INVENTORY.md) and default-off proposed domain schema. Context is version-pinned and transactional; consumer correlation/backlog operations are implemented. Missing auth/view/Pretest/reward hooks and Data mapping/activation remain dependencies, not MVP acceptance.

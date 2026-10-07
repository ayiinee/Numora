**ENGINEERING DECISION — owner instruction, 7 October 2026:** opt-in DEMO-only PvP temporarily uses accepted uncalibrated READY single-choice Drill content. The three choices share the pool and retain server timers; calibrated academic difficulty remains pending. [Activation and owner replacement checklist](../development/PVP_TEMPORARY_READY_CONTENT.md).

**ENGINEERING DECISION — instruksi pemilik proyek, 7 Oktober 2026:** penerimaan langsung khusus 120 original Drill Bab 3 indikator 16–19, Paket 1 level 1–3; 12 paket PUBLISHED dengan policy allowlist. Review impor lainnya tetap berlaku; tidak mengklaim pengesahan Curriculum/IRT. [Scope dan verifikasi](../development/DRILL_CHAPTER3_OWNER_EXCEPTION.md).

**ENGINEERING DECISION - owner UI request, 7 October 2026:** compact the PvP leaderboard contents across responsive widths while retaining interactive targets and server-provided ranking behavior. [Presentation scope](../development/PVP_LEADERBOARDS_JOB16_17.md#approved-behavior).

**ENGINEERING DECISION - owner UI request, 7 October 2026:** remove the standalone `PvP DEMO` lobby card and obsolete synthetic-content copy. PvP remains connected to REST/WebSocket and the READY Drill bank; this UI change does not change server mode or historical records. [UI scope](../development/PVP_RANDOM_DRILL_BANK.md#qa-and-rollout).

**ENGINEERING DECISION - owner approved, 7 October 2026:** new PvP rooms randomly draw ten distinct READY Drill question families across all chapters at the difficulty selected in PvP. Admin review or existing CONTENT_VALID evidence, valid difficulty/content and READY hierarchy replace separate PvP-package approval for both DEMO and official modes. No additional question marker/UI choice or automatic content publication is introduced. Per-room immutable packages preserve retry/reconnect and history. [Source, compatibility and QA](../development/PVP_RANDOM_DRILL_BANK.md).

**ENGINEERING UPDATE — owner instruction, 6 October 2026:** JOB-16/17 cloud migration and DEMO activation now use the existing Development sandbox. Migration/replay, three opt-in DEMO PvP packages and authenticated QA availability/leaderboard checks pass; local API/worker/web use cloud dependencies. [Cloud evidence](../operations/PVP_CLOUD_ACTIVATION_2026-10-06.md). This is rollout evidence, not two-Google-identity staging acceptance or academic publication.

**ENGINEERING DECISION — owner approved, 6 October 2026:** JOB-16 reuses the durable engine with runtime policy, per-difficulty availability, one-room constraints, guest replacement and chronological reconnect handling. JOB-17 uses dense ranks, account XP, separate DEMO/official Best Poin, hourly metadata and authorized archives. Top 10 replaces historical Top 20. [Specification and rollout boundary](../development/PVP_LEADERBOARDS_JOB16_17.md). These decisions do not approve academic content or establish staging acceptance.

**ENGINEERING DECISION — owner clarification, 6 October 2026:** JOB-13 targets all-Student Pretest lifecycle, non-consuming Skip, retained active answers, one active session/account/chapter, revision-checked save/resume without expiry and additive placement. JOB-07/09 targets 30-item delivery, 600-second prospective deadline capped at Sunday 23:59:00 WIB, Ongoing/Past listing and raw mixed-format DEMO finalization. Academic content/rubrics and IRT/fallback computation are explicitly deferred; official mixed publication stays gated. ×10 XP is reconfirmed. [Rules, endpoints and boundaries](../development/PRETEST_TRYOUT_LIFECYCLE.md).

**ENGINEERING DECISION — owner request, 6 October 2026:** testing fixtures are now seeded on the development sandbox: four 20-PG Pretests and one weekly 30-item mixed Tryout. These map to lifecycle/delivery QA only and do not close academic approval, PGK grading or IRT dependencies. [Mock bank and verification](../data/ASSESSMENT_MOCK_TESTING.md).

**ENGINEERING DECISION — Aini, 6 October 2026:** Student result pages expose a Lihat pembahasan action leading to dedicated read-only question-layout pages. Typed PGK save/resume, server-derived review states, expandable reward details and Info nilai reuse the Student design system. This does not approve a PGK rubric or create an IRT/fallback publication policy. [Implementation boundary](../development/STUDENT_PGK_RESULT_UI.md).

> **PRD RULE - 4 October 2026:** [PRD v0.6 Final](sources/PRD_Numora_v0.6.docx.md), supplied by the project owner, supersedes conflicting earlier product rules. Relevant content rules: Admin content access requires Super Admin or Content/Data/Moderation; initial JSON import and R2 media; 5 levels per subchapter and 10 Drill items per level; one Drill variant per level for MVP; TryOut has 30 items. Historical decisions below remain evidence, not overriding policy.
>
> **ENGINEERING DECISION:** importer/preview rollout imports DRAFT only, with all preview scores null. No production publication, PGK grading, XP, or IRT is enabled by preview.

**ENGINEERING DECISION — 5 October 2026:** PRD v0.6 §3.2–3.3/§23.7 maps to a unified `/admin` entry, provisioned internal login at `/admin/login`, shared role-aware navigation and removal of the development mock. Content import/preview remains under `/admin/content`; operational subrole enforcement and limited view DTOs remain outstanding. [Scope and verification](../development/ADMIN_PORTAL_2026-10-05.md).

> **OPEN / dependency:** Curriculum still supplies approved taxonomy, blueprint, difficulty and PGK rubric; Data/AI supplies IRT details. **ENGINEERING DECISION — product correction by Aini, 5 October 2026:** TryOut XP uses correct-equivalent ×10, without speed bonus, immediately on completion (§12); this supersedes AC-15 ×100. The source wording remains historical evidence. See [decision and prospective compatibility](../development/TRYOUT_XP_V06.md). Full admin permission matrix and Ready/Revision/Archive workflow are tracked separately; content-only capability is not full RBAC acceptance.

> **USER CLARIFICATION — Reyhan, 5 October 2026:** Tryout XP is equivalent-correct ×10; AC-15's ×100 is a typo. The older v0.5/feature-PRD mapping below is historical where it conflicts with v0.6. [Current data traceability, API changes, migration 0024 and rollout dependencies](../data/PRD_V06_DATA_ALIGNMENT.md) cover five classes, teacherless takeover, leave/ban, Admin boundaries, Revision, latest stars, XP and class/global activity projections. This is data/backend alignment, not full UI/PGK/IRT acceptance.

# PRD → Engineering Mapping

**ENGINEERING DECISION — owner approved, 6 October 2026:** [directed package pipeline](../content/CONTENT_PACKAGE_PIPELINE.md) maps Excel/JSON intake to versioned questions and canonical assessment packages. PRD v0.6 counts are Drill 10, Pretest 20 and Tryout 30. Admin review/readiness is separate from publication and student runtime compatibility.

**ENGINEERING DECISION — klarifikasi Aini, 5 Oktober 2026:** JOB-11 TryOut mencatat XP saat submit; perhitungan normal ceil(benar ekuivalen ×10), fallback saat perhitungan parsial terkendala memakai benar penuh ×10. Status atau skor IRT tidak menentukan fallback XP dan tidak memicu revisi ledger. Implementasi PGK memerlukan rubrik dan penanganan kendala; jalur PG existing tidak membuktikan fallback parsial selesai. Nilai hasil fallback/release IRT tetap dipetakan terpisah ke JOB-07/JOB-10: pembahasan bersama hasil, scoring biasa untuk seluruh batch jika belum ada hasil IRT valid hingga 72 jam sesudah batch tutup; rumus nilainya belum ditetapkan. [Rincian](../development/TRYOUT_XP_V06.md#klarifikasi-fallback-xp--5-oktober-2026).

**ENGINEERING DECISION — klarifikasi Drill/bobot Aini, 5 Oktober 2026:** bobot produk PG=2, MCMA=3, Kategori=3 final. JOB-05/JOB-11 Drill memakai parsial dalam scoring ketuntasan dan benar ekuivalen XP dasar ×10 plus bonus existing; bintang mengikuti nilai akhir. Rubrik/versi scoring dan presisi nilai akhir masih perlu dirinci, dengan pin prospektif dan preservasi histori. [Spesifikasi dan batas bukti PG existing](../development/DRILL_V06_REWARDS.md#klarifikasi-pgk--5-oktober-2026).

**PRD RULE / current mapping — 5 October 2026:** v0.6 §8–10 maps to JOB-05/JOB-11 Drill: latest score/stars, 0–3 stars, 10 items, single-package retry, base correct×10 + speed bonus capped 150, account-owned immutable XP. **ENGINEERING DECISION — Aini:** once-rounded final integer XP, no expiry for new explanations, confirmation for every unfinished exit. Backend pins Drill policy v2 independently of existing content/scoring versions, grades/posts ledger/progress/outbox atomically; existing result/history/level UI consumes generated contract additions. Preserve legacy rules/results, with no retroactive rewards. [Implementation and tests](../development/DRILL_V06_REWARDS.md). TryOut XP and leaderboard reconciliation remain outside this slice; older conflicting mappings below are historical.

**USER CLARIFICATION — 3 Oktober 2026:** indikator kurikulum menggunakan `competencies`. Level/progres berada di subbab; nomor level kurikulum pada bank soal menentukan pool lintas indikator untuk level subbab yang sama. Ini tidak menetapkan kuota indikator, rubrik, atau jumlah level. [Rincian data dan migrasi](../data/CURRICULUM_SLUG_LEVEL_MIGRATIONS_2026-10-03.md).

This document maps [Drill v1.2 and TryOut v1.1](CORE_LEARNING_PRD_UPDATE_2026-10-02.md) (supplied 2 October 2026) and the cross-feature PRD v0.5 baseline to implementation areas. It is not a replacement for the PRD. The Sprint 2 Student slice and additional Teacher prototype UI are recorded in `docs/development/SPRINT_2_GOAL.md`.

| PRD area              | Key product behavior                                                                                                                | Primary backend modules                    | Primary frontend areas                         | Persistence / infrastructure                     | Test emphasis                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| §1 Product purpose    | TKA Math practice for Mandiri and School Students; progress, monitoring, quality, PvP                                               | cross-cutting                              | all                                            | analytics                                        | both Student journeys                                                                            |
| §2 Scope/roles        | Student affiliation (Mandiri/School); Student/Teacher/Admin roles; deferred payment                                                 | identity, authorization                    | role route groups, affiliation states          | users/memberships                                | cross-role and cross-affiliation access                                                          |
| §3 Auth/School/Class  | Google login; school token; join changes affiliation; one-class Student                                                             | identity, schools, classes                 | onboarding, teacher verification, admin school | users, schools, token, memberships               | token race, ownership, one-class uniqueness, Mandiri access                                      |
| §4 Material/Pretest   | Chapter→Subchapter→Level; 20 questions/chapter once for life; Skip → Level 1 all subchapters; all placement mapping TBC             | content, assessments, progress             | core learning                                  | taxonomy, package, attempt, level progress       | OPEN distribution/placement; no duplicate pretest                                                |
| §5 Drill              | 10 questions, count-up no pause/deadline, 80 mastery, <15min bonus eligibility; stars/XP/retention TBC; retries, best score/history | assessments, progress, recommendations, XP | core learning                                  | attempts, answers, variants, progress, XP ledger | DRL-AC-01–24; irreversible unlock, best score, warnings, failed-save, retry fallback             |
| §6 Tryout/Scoring     | Free all Students; 35 PG/PGK MCMA/Category; countdown auto-submit; one attempt/package; released IRT result ≤3×24h after batch end  | assessments, tryout, scoring, IRT          | core learning                                  | package period, attempt, scoring/IRT version     | TRY-AC01–25; same batch package, timer race, Mandiri access, past eligibility, immutable release |
| §7 PvP                | 1v1 realtime across Mandiri/School; classmate invite only for School; 20s reconnect                                                 | pvp gateway/match engine                   | PvP                                            | Redis transient + PostgreSQL result              | cross-type access, synchronization, authoritative score                                          |
| §8 Leaderboard        | class Drill+Tryout XP vs global PvP best XP; hourly; Wed archive                                                                    | leaderboard, XP                            | leaderboard pages                              | XP ledger, periods, projection/cache             | no double count, archive, separation, all-Student PvP                                            |
| §9 Monitoring/support | teacher dashboard, feedback, videos, reports                                                                                        | monitoring, feedback, videos, reports      | teacher/admin/student support                  | feedback/reports/video metadata                  | resource ownership, read state                                                                   |
| §10 Admin/content/IRT | content status, audit, historical integrity, IRT; Admin CRUD outside new student-feature scope                                      | admin, content, audit, IRT                 | admin                                          | question versions, audit, IRT result             | historical immutability                                                                          |
| §11 Data/NFR          | events, reliability, time, privacy, WebSocket/jobs                                                                                  | cross-cutting                              | states/accessibility                           | outbox, logging, Redis/BullMQ                    | idempotency, observability                                                                       |
| §12 Handoff           | module specs with I/O/states/validation/tests                                                                                       | all                                        | all                                            | contracts                                        | DoR/DoD                                                                                          |
| §13 OPEN items        | Global OPEN-01–18 + DRL-OPEN-01–10 + TRY-TBC-01–07                                                                                  | policy abstractions                        | feature states                                 | config/versioning                                | tests gated by approved policy                                                                   |
| §14 Terms             | canonical vocabulary                                                                                                                | naming                                     | labels                                         | naming                                           | terminology consistency                                                                          |

## User stories to technical capabilities

| User story                 | Technical capability                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| US-01 join class           | class code/link/QR resolution, membership transaction, one-class constraint                                             |
| US-02 pretest              | pretest eligibility, package selection, placement policy, progress unlock                                               |
| US-03 repeat Drill         | assessment persistence, variant rotation, scoring, progress, XP                                                         |
| US-04 tryout               | free shared 35-item package, three formats, countdown/auto-submit, one attempt/package, released IRT result/explanation |
| US-05 PvP                  | cross-affiliation WebSocket room/match state, Redis, durable result, global PvP leaderboard                             |
| US-06 teacher monitoring   | resource-scoped query, progress aggregation, feedback                                                                   |
| US-07 content correction   | question versioning, archive, immutable historical attempts                                                             |
| US-08 teacher verification | single-use token transaction + teacher-school membership                                                                |
| US-09 school operations    | Admin school/token/class/member interfaces + audit                                                                      |
| US-10 video report         | recommendation metadata + report workflow                                                                               |
| US-11 IRT                  | response extraction, daily batch, model/versioned result, admin display                                                 |
| US-12 Mandiri upgrade      | join Class and change affiliation without losing historical learning state; School exit behavior OPEN-15                |
| US-13 stars                | derive 1–3 stars from Drill score independently of 80% unlock and XP                                                    |

## Sprint 2 slice and dependency

**ENGINEERING UPDATE, 29 September 2026:** the initial identity slice now targets the shared Supabase Cloud Development project. Next.js handles Google Auth; NestJS verifies the token and owns internal role/authorization state. The Database team applies committed Drizzle migrations once to Development. This does not add Class/Drill behavior or resolve any OPEN product item.

The supplied Sprint 2 Goal targets `Google login → Student profile → join Class → demo Level-1 Drill → persisted score/result → progress → Level-2 unlock`. Scope includes FE/API/PostgreSQL integration and idempotent submit. The team confirmed that approved PRD v0.5's **80%** threshold supersedes the PDF's 70%. For the two-week prototype trial with real school users on online staging, **Admin UI lists/creates/edits Schools and issues/reissues/revokes tokens → Teacher Google login and token verification UI → Teacher creates Class → School Student joins and completes Drill → Teacher opens Class list and Student detail for level status and latest/best score**. Level-1 questions are clearly labeled demo content until Curriculum supplies validated questions. Mandiri is outside the first trial. These are additional trial requirements, while the Sprint 2 PDF excludes _full_ Admin/Teacher UI from its blockers. Trial starts only when login, authorization, persistence, and 80% scoring/unlock work without critical failures. See `SPRINT_2_GOAL.md`.

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

| Source                             | Primary capability                                                                    | Affected context                     |
| ---------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| Drill §5 / DRL-AC-02–04            | Lifetime Pretest, 20 questions, no XP, Skip Level 1, mapping pending                  | assessments/progress, OPEN, QA       |
| Drill §6–9 / DRL-AC-01,05–16       | Level eligibility, count-up, save/finalize, 80 unlock, retry/history/best score       | API, database, test strategy         |
| Drill §10–14 / DRL-AC-17–24        | Result/XP/stars pending policy, YouTube/report, explanation, warning, events          | design, support API, events/privacy  |
| TryOut §4–6 / TRY-AC01–13,20–22,25 | Free all Students, Ongoing/Past, 35 three-format questions, countdown, single attempt | authorization, API/PGK, UI, fixtures |
| TryOut §7–11 / TRY-AC14–19,23–24   | Waiting/release, SLA, immutable simulation score, score-only XP                       | IRT, operations, history/data        |

The source copies contain all 49 acceptance criteria. [QA Guide](../testing/QA_GUIDE.md) groups their evidence. Updated documents do not regenerate OpenAPI, migrate data, or prove implementation compliance.

## JOB-09/20 engineering traceability - 3 October 2026

TryOut countdown/finalization maps to the shared PostgreSQL finalizer and recovery runbook; clean-SHA evidence is in backend status, with duration/close/release decisions still OPEN. Drill/TryOut events map to the [JOB-20 inventory](../development/JOB20_ANALYTICS_INVENTORY.md) and default-off proposed domain schema. Context is version-pinned and transactional; consumer correlation/backlog operations are implemented. Missing auth/view/Pretest/reward hooks and Data mapping/activation remain dependencies, not MVP acceptance.

## Variant / IRT persistence ? 3 October 2026

**ENGINEERING DECISION — JOB-10 foundation, Aini approved 3 October 2026:** TryOut v3 Admin prepare/status/manual retry, transactional frozen inputs, generation-fenced Redis notifications and atomic adoption of scientific evidence/item parameters extend PR #51. Default off; no statistical engine, respondent grades, parameter activation, publication, fallback or XP. See [handoff/runbook](../development/IRT_V3_RUNBOOK.md). Engineering acceptance uses isolated PostgreSQL/Redis and TEST ONLY compute fixtures.

**ENGINEERING DECISION:** separate compute ownership and one shared migration stream follow [ADR-011](../adr/ADR-011-separated-irt-compute.md). [Persistence specification](../data/VARIANT_IRT_DATABASE.md) maps content lineage, scoring categories, trial/exposure, immutable inputs/results and Tryout finalization. **OPEN:** academic gates, rubrics, cohort/reference design, adjustment limits, score mapping/ties, release/fallback/correction and retention remain unresolved. Database capability does not approve or activate those product policies.

## Materi / notification extension — 4 October 2026

**ENGINEERING DECISION:** owner-approved [scope](MATERIALS_NOTIFICATIONS_2026-10-04.md) adds explicit category metadata, inline material navigation and durable event-driven in-app notifications, with 30-day archive. It does not resolve academic, scoring, reward or PvP OPEN policies.

**ENGINEERING DECISION — owner instruction, 7 October 2026:** [Latihan Soal navigation](../design/LATIHAN_SOAL_NAVIGATION_2026-10-07.md) replaces the inline chapter accordion with a chapter list and detail route. Per-chapter Pretest moves with the detail view; contracts and PRD assessment rules remain unchanged.

## UI feedback revision — 5 October 2026

**ENGINEERING DECISION — owner approved:** follow the [UI feedback revision](../design/UI_FEEDBACK_REVISION_2026-10-05.md). Teacher navigation becomes Kelas / Profil, feedback requires an explicitly selected owned-Class student, and Teacher read-receipt presentation is hidden while Student unread/read behavior remains. Student Pretest loses only its unavailable Home shortcut. No API, database, academic policy or OPEN decision is resolved by this UI revision.

## Question media and review samples — 3 October 2026

**ENGINEERING IMPLEMENTATION:** [R2 upload contract](../api/CONTENT_MEDIA_UPLOADS.md) adds Admin-only reservations/completion, durable idempotency/audit and verified hashed object keys in `numora-bucket`; migration 0021 adds only upload persistence. [Ten review samples](../data/samples/2026-10-03/README.md) cover all three content formats and six images. **USER CLARIFICATION:** source levels follow Curriculum; PvP difficulty mapping remains OPEN. **OPEN:** master approval/seed, nullable difficulty import contract, three-format rich runtime/renderer and partial PGK formula. No Cloud upload/migration or academic acceptance is implied by this infrastructure.

## Materi / notification extension — 4 October 2026

**ENGINEERING DECISION:** owner-approved [scope](MATERIALS_NOTIFICATIONS_2026-10-04.md) adds explicit category metadata, inline material navigation and durable event-driven in-app notifications, with 30-day archive. It does not resolve academic, scoring, reward or PvP OPEN policies.

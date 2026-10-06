**ENGINEERING DECISION — Aini, 6 October 2026:** Student result pages expose a Lihat pembahasan action leading to dedicated read-only question-layout pages. Typed PGK save/resume, server-derived review states, expandable reward details and Info nilai reuse the Student design system. This does not approve a PGK rubric or create an IRT/fallback publication policy. [Implementation boundary](../development/STUDENT_PGK_RESULT_UI.md).

> **PRD RULE - 4 October 2026:** [PRD v0.6 Final](sources/PRD_Numora_v0.6.docx.md), supplied by the project owner, supersedes conflicting earlier product rules. Relevant content rules: Admin content access requires Super Admin or Content/Data/Moderation; initial JSON import and R2 media; 5 levels per subchapter and 10 Drill items per level; one Drill variant per level for MVP; TryOut has 30 items. Historical decisions below remain evidence, not overriding policy.
>
> **ENGINEERING DECISION:** importer/preview rollout imports DRAFT only, with all preview scores null. No production publication, PGK grading, XP, or IRT is enabled by preview.
>
> **OPEN / dependency:** Curriculum still supplies approved taxonomy, blueprint, difficulty and PGK rubric; Data/AI supplies IRT details. **ENGINEERING DECISION — product correction by Aini, 5 October 2026:** TryOut XP uses correct-equivalent ×10, without speed bonus, immediately on completion (§12); this supersedes AC-15 ×100. The source wording remains historical evidence. See [decision and prospective compatibility](../development/TRYOUT_XP_V06.md). Full admin permission matrix and Ready/Revision/Archive workflow are tracked separately; content-only capability is not full RBAC acceptance.

> **USER CLARIFICATION — Reyhan, 5 October 2026:** Tryout XP is equivalent-correct ×10; AC-15's ×100 is a typo. OPEN-11's product formulas and OPEN-15's leave/affiliation rules are resolved by v0.6; the older register below is historical. Five active classes, account-based XP, latest-attempt stars and one Drill variant are final product rules. [Data alignment](../data/PRD_V06_DATA_ALIGNMENT.md) tracks implementation. Academic PGK rubrics, approved content, compute parameters and runtime acceptance remain delivery dependencies, not permission to guess new product formulas.

**ENGINEERING DECISION — owner clarification, 6 October 2026:** Pretest affiliation, after-Skip eligibility, post-Drill eligibility, persistence/no-expiry and one active session/account/chapter are resolved by the owner. Tryout duration is 600 seconds; batch ends Sunday 23:59:00 WIB; Past cannot Start and payment is post-MVP. ×10 XP is reconfirmed. Blueprint/content approval, PGK rubrics and IRT/fallback computation remain delivery dependencies and are explicitly deferred from this lifecycle increment. [Rules and rollout boundary](../development/PRETEST_TRYOUT_LIFECYCLE.md).

**ENGINEERING DECISION — owner request, 6 October 2026:** mock question packages are available on the development sandbox for Pretest/Tryout testing. The synthetic bank is explicitly DEMO; it does not resolve content/blueprint approval, OPEN-04 PGK rubrics, or IRT/fallback computation. [QA keys, scope and evidence](../data/ASSESSMENT_MOCK_TESTING.md).

**ENGINEERING DECISION — owner approved, 6 October 2026:** JOB-16/17 resolves room/readiness/dual-disconnect behavior and ties: room/invite 600 seconds (PRD v0.6), one active room/account, replaceable waiting guest, earliest expired reconnect forfeits, equal deadlines cancel, dense rank 1,1,2. Labelled DEMO staging is approved; official content/difficulty remains Curriculum-dependent. Activity includes all posted Drill/Tryout XP; DEMO PvP stays separate. Thursday 00:00 WIB boundary and UI archives are approved. [Specification](../development/PVP_LEADERBOARDS_JOB16_17.md). Historical OPEN-07/tie proposals below are superseded; runtime/staging acceptance still requires evidence.

**ENGINEERING UPDATE — owner instruction, 6 October 2026:** use the currently configured Development cloud environment for JOB-16/17 migration and DEMO activation. Migration/replay, additive seed/replay and authenticated QA availability/leaderboard checks now pass. [Evidence](../operations/PVP_CLOUD_ACTIVATION_2026-10-06.md). This resolves target selection for this Development operation; two Google-identity acceptance, public staging hosting and Curriculum approval remain separate dependencies.

# Open Decisions Register

**ENGINEERING DECISION — klarifikasi Aini, 5 Oktober 2026:** waktu posting XP TryOut tetap saat submit, tanpa menunggu IRT. Fallback hanya untuk kendala menghitung kontribusi parsial saat submit: benar penuh ×10. Jika parsial dapat dihitung, gunakan benar ekuivalen ×10 tanpa fallback, lalu bulatkan total XP ke atas. Kegagalan IRT tidak mengubah XP. Pembahasan dirilis bersama hasil; IRT yang belum menghasilkan hasil valid hingga 72 jam setelah batch tutup memakai scoring biasa untuk seluruh batch. Bobot produk PG=2, MCMA=3, Kategori=3 final. Parsial ikut scoring ketuntasan dan benar ekuivalen XP Drill; bonus kecepatan tetap berlaku, bintang dari nilai akhir Drill. **OPEN:** rubrik PGK/evidence benar penuh, kategori/mapping dan quality gate IRT, rumus nilai scoring biasa serta perlakuan data tidak cukup; presisi nilai akhir Drill sebelum pemetaan bintang perlu dirinci. Pembulatan XP TryOut dan pemicu produk fallback XP sudah dijawab; klasifikasi kendala teknis masih perlu diimplementasikan. [Rincian](../development/TRYOUT_XP_V06.md#klarifikasi-fallback-xp--5-oktober-2026).

**PRD RULE / supersession — 5 October 2026:** Drill base/bonus and stars are FINAL in v0.6 §8–10. DRL-OPEN-01/02/03/09 are closed for the single-package MVP. **ENGINEERING DECISION — Aini:** nearest-integer final XP, no explanation expiry for new attempts, confirmation on every unfinished exit close DRL-OPEN-06/07 for this rollout; saved answers resume and server elapsed time continues (DRL-OPEN-05 minimum). OPEN-11 / TRY-TBC-03 multiplier is resolved as ×10 by Aini; PGK rubric and fractional reward persistence remain separate dependencies. Older conflicting entries below are historical; [current decision and compatibility](../development/DRILL_V06_REWARDS.md) take precedence. Content review, analytics schema and independent QA remain separate gates.

**ENGINEERING DECISION — Aini, 5 October 2026:** consolidate Admin entry/navigation in `/admin` and remove the development-only mock `/admin/preview`. Internal login uses provisioned Supabase Auth accounts; no Admin signup or browser assignment. PRD v0.6 §3.2–3.3 defines the three subroles; navigation follows identity assignment, while full server permission enforcement/limited operational DTOs remain an implementation gap. See [portal scope](../development/ADMIN_PORTAL_2026-10-05.md). Real unscored content preview is retained.

**Product source:** [Drill v1.2](sources/PRD_01_Drill_Latihan_Soal.docx.md) §18 dan [TryOut v1.1](sources/PRD_02_Core_Learning_TryOut.docx.md) §16, diberikan 2 Oktober 2026; PRD v0.5 §13 tetap baseline lintas fitur. [Rekonsiliasi](CORE_LEARNING_PRD_UPDATE_2026-10-02.md) menjelaskan supersession. The PDF still bears its prior “draft for review” label; the team approval was confirmed by the Software Engineering coordinator on 28 September 2026.
**Rule:** an `OPEN` item must not be silently resolved. Approved PRD rules apply, while explicitly unresolved details remain open. Product decisions are made jointly with the responsible owners listed in the PRD; the Software Engineering coordinator coordinates FE/BE execution but does not unilaterally change academic/product policy.

## Status legend

**USER CLARIFICATION / engineering handoff, 3 Oktober 2026 (Reyhan, Data):** level bank sampel mengikuti Curriculum per indikator dan tidak otomatis menjadi EASY/MEDIUM/HARD. Mapping kategori PvP tetap OPEN. Arah PGK partial belum menetapkan formula/rounding atau menutup OPEN-04. [Handoff bank soal](../data/QUESTION_BANK_BACKEND_HANDOFF.md) dan [upload media](../api/CONTENT_MEDIA_UPLOADS.md) mendokumentasikan jalur review; upload tidak berarti soal/paket telah disetujui.

- **PRD RULE** — aturan eksplisit sumber terbaru untuk fitur terkait; TBC tetap unresolved.
- **OPEN** — unresolved policy/academic detail.
- **PARTLY OPEN** — part of the decision is confirmed; remaining details are listed explicitly.
- **PROPOSED** — engineering recommendation awaiting owner agreement.
- **BLOCKS FINAL** — cannot publish the affected final behavior before resolution.

| ID      | Decision needed                                                      | PRD owner                  | Baseline / treatment now                                                                                                                                                               | Impact                                            |
| ------- | -------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| OPEN-01 | Bab/subbab/kompetensi, jumlah/urutan level, definisi tuntas          | Curriculum + PO            | PRD mentions 5 levels per subbab; keep taxonomy dynamic until Curriculum confirms                                                                                                      | Blocks final content/progress                     |
| OPEN-02 | Distribution of 20 Pretest questions per subbab                      | Curriculum + PO            | 20 total per bab is baseline; demo package only until distribution approved                                                                                                            | Blocks final Pretest package                      |
| OPEN-03 | Seluruh mapping score Pretest → initial unlocked levels              | Curriculum + PO            | DRL-OPEN-04: seluruh mapping TBC; cap 3 dari v0.5 bukan keputusan final terbaru                                                                                                        | Blocks final placement                            |
| OPEN-04 | PGK MCMA/Category scoring and rounding                               | Research & Curriculum + PO | TryOut MVP wajib PG, PGK MCMA dan PGK Kategori; rubrik/pembulatan tetap OPEN, dukungan PG saja adalah gap                                                                              | Blocks final PGK scoring                          |
| OPEN-05 | Official Tryout specification                                        | Research & Curriculum + PO | 35 soal dan ketiga format FINAL; gratis semua siswa FINAL. Durasi, komposisi, skala dan jadwal akhir batch tetap TBC; rilis Senin baseline v0.5                                        | Blocks final Tryout publication                   |
| OPEN-06 | Name/positioning/language/visual identity                            | PO + UI/UX                 | Numora is current name; UI/UX supplied a v0.1 visual implementation baseline, but final identity/handoff remains open                                                                  | Does not block backend                            |
| OPEN-07 | PvP invite expiry and two-player disconnect/readiness edges          | PO + Software + QA         | Explicit state machine; no undocumented final outcome                                                                                                                                  | Blocks final edge behavior                        |
| OPEN-08 | Class end and wrong-class correction with history                    | PO + Data                  | No self-transfer; preserve immutable history                                                                                                                                           | Blocks correction/transfer flow                   |
| OPEN-09 | Performance, browser, retention, backup/recovery, Google integration | Technical + PO             | Engineering planning targets below                                                                                                                                                     | Must close before broader real-user release       |
| OPEN-10 | Variant/package counts, fallback and video mapping                   | Curriculum + PO            | Video gagal maksimum 3, YouTube relevan subbab FINAL; isi/pool dan fallback DRL-OPEN-09 belum final                                                                                    | Blocks content completeness                       |
| OPEN-11 | Final XP formula                                                     | PO + Data                  | Drill base/XP gagal/bonus DRL-OPEN-01/02 TBC; <15 menit eligible, ≥15 tidak. TryOut dari skor tanpa bonus; TRY-TBC-03 mapping TBC. Formula v0.5 tidak final                            | Blocks final XP semantics                         |
| OPEN-12 | IRT model/parameter details                                          | Data + PO                  | Minimum 30 dan daily batch tetap baseline detail soal Admin v0.5. Model/input PGK/skala/release siswa perlu Data review; jangan menyimpulkan gate universal TryOut dari baseline Admin | Blocks final statistical configuration            |
| OPEN-13 | Admin ban policy                                                     | PO                         | Represent restriction with status/reason; avoid invented effects                                                                                                                       | Blocks final ban behavior                         |
| OPEN-14 | Local password, if any                                               | PO + Software              | Google for Student/Teacher; internal Admin                                                                                                                                             | Needs PO decision if local passwords are desired  |
| OPEN-15 | Conversion School ↔ Mandiri on leaving class                         | PO + Data                  | Joining class changes affiliation; no self-leave or automatic downgrade in v0.5                                                                                                        | Blocks exit/downgrade behavior                    |
| OPEN-16 | Admin sub-role split                                                 | PO + Software              | One Admin role in v0.5                                                                                                                                                                 | Deferred                                          |
| OPEN-17 | Tryout price/payment method                                          | PO + Software              | TryOut v1.1 FINAL: gratis semua siswa termasuk Mandiri, tanpa payment MVP. Harga/metode hanya fase berikutnya                                                                          | Deferred; bukan blocker akses Mandiri             |
| OPEN-18 | IRT batch duration for weekly Tryout package                         | Data + PO                  | TryOut v1.1 FINAL: hasil/pembahasan maksimum 3×24 jam sesudah akhir batch/periode. Jadwal akhir, insufficient data, failure/delay tetap TBC                                            | Blocks scheduler/failure policy, bukan SLA produk |

## OPEN dari PRD fitur terbaru

**USER CLARIFICATION — Reyhan, 3 Oktober 2026:** `competencies` adalah indikator kurikulum. Navigasi dan progres tetap Bab → Subbab → Level; soal Level N diambil dari Level N indikator-indikator dalam subbab itu. Tidak ada progres/unlock terpisah per indikator. Jumlah level, kuota per indikator, definisi tuntas dan distribusi Pretest pada OPEN-01–03 tetap belum ditetapkan. Nama teknis tabel dipertahankan untuk kompatibilitas. Lihat [pemetaan data](../data/CURRICULUM_SLUG_LEVEL_MIGRATIONS_2026-10-03.md).

ID global OPEN-01–18 di atas tetap stabil untuk referensi lama. `DRL-OPEN-*` menambahkan namespace pada ID sumber Drill; `TRY-TBC-*` adalah alias engineering untuk topik tanpa ID pada TryOut §16.

| ID          | Keputusan yang belum final                                          | Owner                         | Dampak / hubungan global                                  |
| ----------- | ------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------- |
| DRL-OPEN-01 | Formula speed bonus <15 menit                                       | Product + Data                | OPEN-11; eligibility durasi FINAL                         |
| DRL-OPEN-02 | Base XP dan XP attempt gagal                                        | Product + Data                | OPEN-11; result/ledger/leaderboard                        |
| DRL-OPEN-03 | Threshold score → 1/2/3 stars                                       | Product                       | Menggantikan rentang lama dan CLARIFICATION-004           |
| DRL-OPEN-04 | Seluruh mapping score Pretest → level awal                          | Curriculum + Product          | OPEN-03; cap 3 dari sumber lama bukan final               |
| DRL-OPEN-05 | Persistence/session save dan expiry                                 | Software + Product            | Autosave/resume aktual bukan penutupan TBC                |
| DRL-OPEN-06 | Interaksi Exit sebelum submit                                       | Product + UI/UX               | Modal/warning final; konsekuensi jelas                    |
| DRL-OPEN-07 | Retensi pembahasan/history jika dibatasi                            | Product                       | OPEN-09; angka 90 hari kembali OPEN                       |
| DRL-OPEN-08 | Schema/metadata analitik final                                      | Data                          | Kontrak event lintas tim                                  |
| DRL-OPEN-09 | Fallback pool variant habis                                         | Data + Curriculum + Software  | OPEN-10; jangan menjanjikan variant tanpa pool            |
| DRL-OPEN-10 | Definisi mastery score atau penghapusannya dari MVP                 | Product + Data                | Jangan tampilkan metric tanpa formula                     |
| TRY-TBC-01  | Durasi angka TryOut                                                 | Research/Curriculum           | OPEN-05; countdown/auto-submit FINAL                      |
| TRY-TBC-02  | Skala TKA, komposisi konten dan rubrik PGK                          | Research/Curriculum + Product | OPEN-04/05; 35 soal/ketiga format FINAL                   |
| TRY-TBC-03  | Konversi final score → XP                                           | Product + Data                | OPEN-11; no speed/duration bonus FINAL; XP=score PROPOSED |
| TRY-TBC-04  | Persistence jawaban/sesi dan resume                                 | Software                      | Timer integrity/re-auth/data loss                         |
| TRY-TBC-05  | Eligibility paket lampau belum pernah dikerjakan                    | Product                       | Gratis/no payment FINAL; tidak otomatis boleh Start       |
| TRY-TBC-06  | Waktu akhir batch/periode dan relasi deadline attempt               | Product + Data + Curriculum   | OPEN-05/18; rilis Senin baseline v0.5; SLA 3×24 jam FINAL |
| TRY-TBC-07  | Model/kalibrasi IRT, low-response, retry dan failure/release policy | Data + Product                | OPEN-12/18; tanpa skor parsial; released score immutable  |

**OPEN — rekonsiliasi Pretest:** PRD Drill menyebut keputusan one-time dan tidak ada reattempt setelah completed, tetapi belum menentukan kesempatan setelah Skip serta akses afiliasi. Pertahankan baseline kelas v0.5 sebagai konteks sementara; minta keputusan Product/Curriculum sebelum finalisasi eligibility, bukan memperluas aturan gratis TryOut ke Pretest.

## Engineering recommendations for OPEN-09

These are planning targets, not confirmed product performance or privacy policy:

- 1,000–3,000 registered users planning range; load scenarios of 100 baseline, 500 target, 1,000 stress.
- Mobile-first; Android Chrome/iOS Safari and desktop Chrome/Edge/Firefox, latest two major versions where practical.
- WCAG 2.2 AA where feasible.
- Backup planning RPO ≤24h and RTO ≤4h, validated through a restore exercise before broad release.
- Supabase Auth + Google OAuth for Student/Teacher, NestJS authorization. Do not change providers without a migration plan.
- Drill explanation/history retention DRL-OPEN-07; 90 hari dari v0.5 bukan aturan terbaru. TryOut result/explanation gated by released IRT; expiry/other deletion periods require a separate policy. Do not auto-delete attempts, XP, events, audit, PvP history, or IRT inputs.

## Clarifications and decision records

### CLARIFICATION-001 — Drill timeout

**RESOLVED oleh PRD Drill v1.2 §7 / DRL-AC-06:** count-up informasional, tidak pause, tanpa deadline. Durasi <15 menit adalah eligibility bonus, bukan timeout. Formula bonus DRL-OPEN-01 tetap OPEN.

### CLARIFICATION-002 — Drill explanation and history

**SUPERSEDED pada 2 Oktober 2026:** PRD Drill v1.2 §12/18 menjadikan angka retensi DRL-OPEN-07. Usulan lama expiry 90 hari tidak dianggap aturan final; jangan menghapus attempt/version facts atau mengklaim retensi tanpa keputusan owner.

### CLARIFICATION-003 — Sprint 2 mastery threshold

**Resolved 28 September 2026:** the Software Engineering coordinator confirmed the team's decision to follow approved PRD v0.5 for Sprint 2. Level 2 unlocks at **≥80%**; the supplied Sprint 2 Goal PDF's ≥70% is superseded. Record Sprint 2 acceptance and tests at 80%. This does not resolve any other OPEN item.

### CLARIFICATION-004 — Star mapping

**SUPERSEDED oleh DRL-OPEN-03:** seluruh threshold 1/2/3 stars, termasuk score 0, TBC pada Drill v1.2. Rentang v0.5 tidak digunakan sebagai acceptance final. Bintang hanya dari final score dan tidak menjadi syarat unlock.

### CLARIFICATION-005 — Level count wording

MAT-01 states 5 levels per subbab but also says Curriculum defines the number of levels; OPEN-01 repeats that dependency. The schema should stay flexible until the owner confirms whether five is a fixed MVP rule. Owner: Curriculum + PO. Status: OPEN.

### CLARIFICATION-006 — Prototype trial scope

**Confirmed by the coordinator, 28 September 2026:**

- Online staging ready around **12 October 2026** for real school Students/Teachers. Initial estimate: more than 20 Students and/or several Teachers/Classes; exact count pending.
- First trial covers only Admin → Teacher → School Student → Drill → Teacher progress. Mandiri, Pretest, Tryout, PvP, leaderboard, and feedback remain in PRD v0.5 but outside this first session.
- Admin UI lists/creates/edits/changes status of Schools and issues/reissues/revokes Teacher tokens.
- Teacher uses Google login and School token verification, creates a Class, then opens a Class list and Student detail showing level status and latest/best Drill score. Access stays limited to Classes that Teacher owns.
- Software and Curriculum prepare the 10 Level-1 PG demo questions with exactly four options `A`–`D` and simple inline LaTeX in text; Curriculum reviews them before the school trial. They remain visibly labeled demo while final Curriculum material is unavailable. The existing question JSON schemas are for Data/AI import, not the demo fixture format; this prototype choice does not resolve final academic content policy.
- Product/Design and the school coordinate school permission, participant/guardian consent where needed, and demo-content notice.
- The first partner school has not been selected yet; Product/Design's coordination with a school remains a trial dependency.
- Trial cannot start if login, authorization, answer/result persistence, or the 80% scoring/unlock rule fails.
- The staging domain and access to Supabase/Google OAuth are not available yet and must be provisioned before online trial verification.
- UI/UX will prepare designs/wireframes later; a simple mock UI is accepted for the first school trial if the connected flow and basic accessibility work.

The supplied Sprint 2 Goal defines one Student vertical slice and excludes _full_ Admin/Teacher UI from sprint blockers; the specified Admin/Teacher actions are additional prototype requirements. The first partner school has **not been selected**. The **team will decide together** which staging host to use and who owns its setup; no provider or accountable owner is confirmed yet, and the monthly budget is **not set**. DevOps for the domain and Database for Supabase/Google OAuth are **tentative owners pending team confirmation**. Exact participant count, staging hosting/OAuth configuration, and QA evidence still need scoping. Owner: PO + Software + QA. **Status: PARTLY OPEN.**

**ENGINEERING UPDATE, 29 September 2026:** the Database team prepared a shared Supabase Cloud Development project. Development now uses Cloud PostgreSQL/Auth and no longer requires Supabase Local. The Database team owns Google provider/dashboard configuration for this migration. This does not close the separate staging domain, OAuth, hosting, or trial-readiness dependencies above.

## Decision workflow

When a joint decision is reached, record its owner/date and update the PRD or module specification first; then update this register, `PRD_MAPPING.md`, affected contracts/schema/tests, and an ADR only if architecture changes. The original PDF metadata should be synchronized with the team's approval record when its owner republishes it.

## Catatan implementasi area siswa ? 1 Oktober 2026

**ENGINEERING DECISION:** desain pratinjau dipindahkan ke area siswa terautentikasi dengan dashboard NestJS, engine PvP teruji fixture, serta endpoint/proyeksi leaderboard. Ini tidak menutup **OPEN-07** atau **OPEN-11**: akun nyata tidak dapat memulai PvP, kebijakan fixture tidak tersedia melalui konfigurasi runtime, dan tidak ada XP Drill/Tryout otomatis. **PROPOSED:** peringkat seri 1,1,3 tetap menunggu review produk sebelum rilis. Lihat [kontrak area siswa](../api/STUDENT_AREA_CONTRACT.md).

## DRL-OPEN-08 engineering preparation - 3 October 2026

**PROPOSED:** Aini prepared default-off domain producers and a payload/trigger/dedup schema, plus durable consumer correlation and backlog status. [Inventory](../development/JOB20_ANALYTICS_INVENTORY.md) is the Data review/handoff reference. Exact mapping, activation and other-owner producers remain OPEN; no reward/model policy is resolved.

## Variant / IRT persistence ? 3 October 2026

**ENGINEERING DECISION — Aini approved JOB-10 foundation, 3 October 2026:** manual Admin retry authorizes a new execution against identical frozen input; Redis only notifies compute. Technical evidence adoption does not resolve TRY-TBC-06/07 or OPEN-12/18. Production batch close, thresholds, PGK rubrics, score mapping, fallback and release require owner approvals; foundation remains default off.

**ENGINEERING DECISION:** separate compute ownership and one shared migration stream follow [ADR-011](../adr/ADR-011-separated-irt-compute.md). [Persistence specification](../data/VARIANT_IRT_DATABASE.md) maps content lineage, scoring categories, trial/exposure, immutable inputs/results and Tryout finalization. **OPEN:** academic gates, rubrics, cohort/reference design, adjustment limits, score mapping/ties, release/fallback/correction and retention remain unresolved. Database capability does not approve or activate those product policies.

## Materi / notification extension — 4 October 2026

**ENGINEERING DECISION:** owner-approved [scope](MATERIALS_NOTIFICATIONS_2026-10-04.md) adds explicit category metadata, inline material navigation and durable event-driven in-app notifications, with 30-day archive. It does not resolve academic, scoring, reward or PvP OPEN policies.

# Panduan QA Numora

**ENGINEERING DECISION — workflow tim QA, 27 Oktober 2026.** Mulai dengan prompt: **Mulai QA Numora untuk role siswa** (atau guru/admin). Ikuti [workflow](QA_WORKFLOW.md), [prompt pendek](QA_PROMPTS.md), [strategi terkini](TEST_STRATEGY.md), dan [setup QA Windows](../development/GETTING_STARTED.md#qa-scenario-workflow--27-oktober-2026).

## Aturan aktif untuk semua anggota

- Pengguna sudah menyetujui eksekusi workflow tim dan menutup review PIC. Ikuti [persetujuan eksekusi tim](QA_WORKFLOW.md#persetujuan-eksekusi-tim); anggota langsung melakukan setup dan pengujian tanpa mengulang persetujuan tersebut.

- Penanggung jawab siswa/guru/admin memiliki kelengkapan alur bisnis role masing-masing. Lintas role memiliki satu pemilik utama. PIC infra/helper/CI ditentukan tim, bukan otomatis QA Admin.
- Sumber expected result mengikuti AGENTS.md, PRD terbaru, klarifikasi disahkan, PRODUCT_CONTEXT, OPEN_DECISIONS dan PRD_MAPPING yang relevan. Kode serta tes lama bukan pengganti requirement. Jangan menebak OPEN.
- **PRD RULE / keputusan owner aktif:** Tryout 30 soal; siswa maksimal lima kelas aktif; retry satu pool Drill; latest score/stars dengan best/unlock dipertahankan. XP final serta pembulatan prospektif mengikuti [PRODUCT_CONTEXT](../product/PRODUCT_CONTEXT.md), [Drill v2](../development/DRILL_V06_REWARDS.md) dan [alignment](../data/PRD_V06_DATA_ALIGNMENT.md). PGK/akademik/IRT yang belum disahkan tetap OPEN.
- Keberlakuan required/optional/not-applicable berbeda dengan hasil PASS/FAIL/BLOCKED/NOT_RUN. Nol tes, skip wajib dan bukti versi lain tidak lulus. Profil quick yang lulus tidak membuktikan full.
- Bedakan bukti static/unit/component, real-database, connected-auth-fixture, benchmark dan manual. Fixture email bukan Google login; konten sintetis bukan persetujuan Curriculum. Benchmark lokal belum memiliki SLO produksi.
- Codex boleh memperbaiki alat/tes QA sesuai requirement, mempertahankan bukti gagal dan retest. Bug aplikasi dilaporkan kepada developer; jangan melemahkan assertion untuk membuat hijau.
- Setiap run mencatat identitas kode/aturan, lingkungan, cakupan dan batas kesimpulan. Temuan ditriase sebagai aplikasi/tes/lingkungan/requirement. Hasil manual hanya dicatat setelah manusia mengerjakannya.
- Setelah satu skenario, berhenti dengan satu rekomendasi dan maksimal dua alternatif. Lanjut adalah tindakan lokal; Bagikan adalah pilihan eksplisit untuk publikasi Google Docs. Tidak otomatis push/merge/deploy atau mengirim pesan tim.
- Kredensial, dump, log dan browser state tetap lokal/ignored. Ringkasan yang disanitasi dapat dibagikan. Staging tetap NOT_CONFIGURED sampai URL, SHA deployment, akun, OAuth dan isolasi terverifikasi.

## Panduan historis — bukan aturan aktif bila bertentangan

Bagian berikut dipertahankan untuk keterlacakan konteks lama. Angka 35 soal, satu kelas, rotasi varian, expiry pembahasan 90 hari dan formula XP/stars pending di bawah **sudah digantikan** oleh sumber aktif di atas. Scope JOB-06/trial dan bukti lama tetap mempunyai batas versi masing-masing. Gunakan manifest skenario baru untuk eksekusi saat ini.

## QA should join before implementation ends

QA reviews:

- acceptance criteria;
- edge cases;
- state transitions;
- authorization boundaries;
- OPEN-item assumptions;
- test data needs.

## Required UI states

For main flows verify:

- loading;
- empty;
- validation error;
- system/dependency error;
- success;
- session ended where applicable;
- access denied/locked.

For the first school trial, a simple mock UI is accepted while UI/UX designs are pending. QA still checks the connected task flow, readable text, form labels, keyboard navigation, and status cues that do not rely only on color.

## High-risk scenarios

The six-actor Cloud Development fixture and live Google flow are described in [QA_SEED.md](QA_SEED.md). Use new QA identities; retain the existing sandbox data.

For JOB-06, use the [release-chain runner and evidence gates](JOB06_RELEASE_CHAIN.md). It runs built web/API against isolated PostgreSQL/Redis on one clean SHA; its email auth fixture does not prove Google login or reviewed trial content. Repeat the complete chain on one approved deployment SHA for independent trial acceptance.

### School verification

- prototype Admin UI lists/creates/edits Schools, changes School status, and issues/reissues/revokes tokens before Teacher onboarding;
- Teacher signs in with Google, chooses the School, and enters the token through UI;
- invalid token;
- expired token;
- used token;
- concurrent use;
- successful verification cannot be duplicated.

### Class

- invalid code/link;
- repeated join;
- Student already in another Class;
- Teacher accesses another Teacher's Class;
- prototype Teacher UI creates a Class, opens its Student list, and shows each authorized Student's level status and latest/best Drill score after submission;
- Teacher with several Classes cannot inspect another Teacher's Students or mix Class progress.

### Drill

- 10 seeded Level-1 PG questions each show four options `A`–`D`; simple inline LaTeX renders legibly, and the questions are visibly labeled demo for school trial participants;
- locked Level direct API access;
- duplicate submit;
- refresh/resume;
- retry receives another variant;
- 70% vs 80% boundary for 10-question Drill; only ≥80 unlocks under Drill v1.2;
- stars do not replace the 80 unlock rule; all star thresholds await DRL-OPEN-03;
- explanation only after submit; retention boundary tests wait for DRL-OPEN-07; legacy 90-day tests are implementation evidence only;
- count-up no pause/no deadline; <15 minutes bonus eligible, exactly 15 minutes not eligible; formula pending.

### Tryout

- one shared package for all Students in the same weekly period;
- second start of the same package denied or resumes existing attempt;
- Monday 00:00 WIB release remains baseline; previous packages remain visible and past never-attempted Start follows TRY-TBC-05, not blanket lock;
- result/explanation hidden until IRT batch completes;
- Mandiri and School Students can access eligible TryOut free; no payment UI or class-required gate;
- Tryout does not unlock Drill.

### PvP

- Mandiri and School Students may match across affiliations; Mandiri cannot send classmate notification invites;
- same question/order both players;
- one/both answer timeout;
- reconnect within 20s;
- reconnect after 20s;
- intentional leave;
- system cancellation;
- forfeit not recorded as leaderboard best;
- client attempts to fake score/time.

### Historical integrity

- revise question after Student completes attempt;
- old result still shows old version and same score.

## Regression focus after PRD updates

Every PRD revision requires impact check against `docs/product/PRD_MAPPING.md` and the affected acceptance suite.

## Acceptance matrix — latest Core Learning PRDs

Sources copied into [product/sources](../product/CORE_LEARNING_PRD_UPDATE_2026-10-02.md). This matrix groups all 24 Drill and 25 TryOut criteria; record concrete evidence per ID before acceptance.

| IDs          | Scenario / expected behavior                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| DRL-AC-01    | Locked direct URL/API cannot start; eligible level can                                                                             |
| DRL-AC-02–04 | Lifetime one-time Pretest, 20 questions/no XP, Skip → Level 1 every subchapter; mapping pending                                    |
| DRL-AC-05–07 | 10 one-by-one questions; count-up no pause/deadline; <15 minutes versus ≥15 bonus eligibility                                      |
| DRL-AC-08–10 | Navigator/edit before final; confirmation; locked after final; duplicate/concurrent submit one result/history/XP                   |
| DRL-AC-11–16 | 80 unlock, failure retry, no relock, equivalent variant, all attempts separate, best score highest and never decreases             |
| DRL-AC-17–18 | Result score/XP/stars/progress; explanation only after submit; pending policy shown honestly                                       |
| DRL-AC-19–21 | Failure-only relevant max-three YouTube videos, video/report modal, question/report context/category, empty/error non-blocking     |
| DRL-AC-22–24 | Refresh/exit loss warning matches actual persistence; failed save never Saved; valid activity contribution exactly once            |
| TRY-AC01–03  | Ongoing/Past listing and attempt status; identical package for two users in batch                                                  |
| TRY-AC04–08  | One attempt/user/package, 35 questions, PG/MCMA/Category, one-by-one navigator and editable answers                                |
| TRY-AC09–13  | Countdown no pause; 0 auto-submit without confirmation; manual confirm/cancel; race yields one final submission and locked answers |
| TRY-AC14–17  | Submitted success/processing without score; release ≤3×24h from batch end; explanation gated; released score never changes         |
| TRY-AC18–19  | Simulation result and score-derived XP without speed/duration bonus; numeric conversion awaits policy                              |
| TRY-AC20–22  | No reattempt via direct URL/refresh/double-click/repeated/re-auth request; expired/unavailable cannot Start                        |
| TRY-AC23–25  | Delay/error waiting without partial score; result distinguished from official TKA; all Students free/no checkout                   |

Additional source-state checks: save/connection/session expiry/recovery; package detail/tutorial/rules; result load errors; report success/error; variant pool exhaustion; past never-attempted eligibility; batch insufficient/failure retry. **OPEN:** do not turn fixture durations, XP=score recommendation, old star ranges/90-day retention, max-three-level Pretest mapping, or ≥30 TryOut gate into final acceptance policy.

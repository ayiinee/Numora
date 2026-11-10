# Current source — PRD v0.6 with owner-approved variant/IRT v2 amendment

**ENGINEERING IMPLEMENTATION — distribusi Drill.** Routing pilot per level memakai assignment 1:1 yang disimpan saat percobaan pertama berhasil dibuat. Percobaan baru mengikuti revisi aktif pada kelompok asal. Sesi berjalan dan histori tetap dipin. Saat varian dihentikan, siswa tanpa assignment menunggu dan kelompok varian dapat memakai original yang sah sesuai policy. `ADM-DEP-01` untuk pemerataan completion, default original, dan rotasi lintas arm tetap terbuka. [Konfigurasi dan pengujian pilot](../data/ASSESSMENT_ARMS_V2.md#pilot-routing-drill).

**ENGINEERING DECISION - usulan Reyhan, disetujui pemilik Aini pada 10 November 2026.** Ruang tunggu PvP menambah satu langkah sadar sebelum arena: `player:ready` hanya menandai kesiapan, lalu `match:start` dari pembuat room memulai pertandingan setelah server memastikan dua pemain aktif, terhubung dan siap. Input kode gabung selalu ditampilkan uppercase. Aturan server tetap: 10 soal identik, timer/poin server-authoritative, reconnect 20 detik, satu room aktif. Aini mengonfirmasi "Setuju, host memulai duel" dalam review [PR #150](https://github.com/ayiinee/Numora/pull/150); ini merupakan amendemen yang disetujui untuk alur PRD v0.6 bagian 23.5 `Ready -> Arena`. [Kontrak event dan state](../architecture/REALTIME_PVP.md).

**ENGINEERING DECISION — permintaan pemilik, 10 November 2026.** Login Admin dipindahkan ke `/admin-numora`, dengan pengalihan dari `/admin/login`. Tautan Admin dihapus dari modal landing dan halaman masuk Siswa/Guru. Identitas dan izin Admin diperiksa melalui alur autentikasi serta otorisasi existing.

**ENGINEERING DECISION — Teacher presentation, 9 November 2026:** the owner-approved [UI alignment](../design/TEACHER_UI_ALIGNMENT_2026-11-09.md) maps existing class, roster, progress, history, feedback, invitation, profile and verification APIs to a class-centred blue interface. Legacy feedback URLs lead to contextual student notes. No product rule, API capability or academic metric is added.

**ENGINEERING DECISION — pemilik, 9 November 2026.** Pretest original 20 soal mendukung PG, beberapa jawaban, dan kategori dengan nilai sebagian. Total poin sebelum pembulatan menentukan level awal; jumlah soal benar seluruhnya tetap terpisah. Implementasi mencakup pin aturan nilai, rubrik, penerbitan versi baru, akses gambar siswa, dan perlindungan hasil lama. [Aturan dan verifikasi](../development/PRETEST_ORIGINAL_RELEASE_2026-11-09.md).

**ENGINEERING DECISION — 9 November 2026:** login Siswa dengan email/password memakai Supabase Auth. NestJS memakai UUID Auth untuk membuka profil Siswa existing atau membuat satu profil Siswa pada login pertama dari akun yang ditandai pengelola. Pemetaan login Google dan verifikasi Guru tetap berlaku.

**ENGINEERING IMPLEMENTATION — 8 November 2026:** [handoff kalibrasi dan hasil peserta v1](../IRT_CALIBRATION_CONTRACT_V1.md) menetapkan payload dan validasi input/output identik di kedua repo, termasuk identitas respondent–attempt–package–batch, status gagal/data kurang, serta contoh tersanitasi dan pengujian kompatibilitas. Bentuk kontrak bukan lagi OPEN; scientific producer, policy numerik/approval, adapter/adopter dan publikasi tetap delivery gap. Generator existing tidak berubah. Rubrik Tryout `TRYOUT_PGK_PARTIAL_V1` sudah disetujui 7 Oktober dan tersedia pada assessment engine; review rubrik Drill tetap terpisah. Catatan lama mengenai fallback seluruh batch, formula fallback sepenuhnya OPEN atau ceil XP universal tidak menggantikan konteks/pin terbaru. Tidak ada perubahan runtime atau XP historis pada pekerjaan kontrak ini.

**ENGINEERING DECISION — pemilik, 8 November 2026:** [amendemen v2](../AI_IRT_V2_CONTEXT.md) menggantikan target lama yang bertentangan. Pemetaan berikut membedakan keputusan target dari implementasi pada commit acuan; tabel historis di bawah tidak membatalkannya.

| Perubahan target yang disetujui | Area implementasi terkait | Gate yang belum selesai |
|---|---|---|
| Drill A/B reguler sejak awal, original+varian aktif, assignment tetap | Routing `learning/drill-distribution.ts`, assessment packages, assignment dan delivery | Approval paket dan penerimaan pilot di lingkungan tujuan |
| Concurrent IRT Level dan adjustment hanya DRIFT; PASS freeze item | IRT snapshot/compute/adoption, generator config/version | Scientific engine, policy threshold/anchor, review Curriculum dan bounded adjuster |
| Tryout multi-arm, satu attempt/siswa/batch | Tryout batch/package relation, allocation dan lifecycle | Multi-package contract, assignment/uniqueness dan frozen package list |
| Nilai+pembahasan tanpa ranking; fallback per arm maksimal 72 jam | Participant result, mapping, finalization/readers dan UI | Respondent producer v3, mapping theta, detail policy fallback dan release per arm |
| IRT Indikator dan Bab terpisah | Measurement contexts, linked evidence dan ability snapshots | Model/linking/coverage/precision tervalidasi; bukan rata-rata theta |
| Histori tetap, review manusia awal, XP activity tetap | Version pins, approvals, XP ledger dan audit | Penerimaan integrasi; kompensasi insiden perlu keputusan eksplisit |

**Klarifikasi operasional beta, 8 November 2026:** [keputusan terbaru](../AI_IRT_V2_CONTEXT.md#klarifikasi-dua-belas-kebijakan-operasional) mempersempit gate di atas: mapping IRT memakai prediksi paket acuan (detail estimator/numerik belum final); hasil serentak per batch, maksimum valid nol = UNSCORABLE; beta Drill menerima exposure lintas fitur seperti Pretest/PvP; komposisi Drill 3 anchor/7 focal dan Tryout 5/25. Gate review Curriculum, kecukupan/linking serta QA tetap berlaku. Nomor 7 telah diputuskan: original aktif boleh menjadi fallback distribusi sementara ketika varian dihentikan tanpa pengganti siap; catat assignment vs delivered arm, pin sesi, dan pisahkan crossover dari perbandingan utama. Saat pengganti siap, start berikutnya kembali mengikuti arm asal. Eksperimen baru tidak membuat siswa lama fresh.

**ENGINEERING DECISION — klarifikasi pemilik, 9 November 2026.** Timer Drill menghitung durasi aktif sejak Mulai latihan, dijeda saat siswa keluar, dan dilanjutkan dari durasi tersimpan saat siswa memilih Lanjutkan latihan. Durasi aktif menjadi input bonus XP. [Kebijakan timer Drill](../development/DRILL_V06_REWARDS.md).

**ENGINEERING DECISION — konsolidasi Admin, 10 November 2026:** [PRD Admin v1.0](ADMIN_PRD.md) dan [Spesifikasi Teknis Admin](../architecture/ADMIN_TECHNICAL_SPEC.md) memetakan [ADM-DEC-001–076](ADMIN_REQUIREMENTS_DISCOVERY.md#21-keputusan-kebutuhan-dari-klarifikasi-pemilik) serta acceptance ADM-AC-001–081. Atribut/detail rutin memakai baseline existing sesuai instruksi terakhir pemilik; discovery menjadi arsip.

| Area sumber PRD/amendemen | PRD Admin | Spesifikasi teknis / pekerjaan | Acceptance |
| --- | --- | --- | --- |
| §3.2–3.3/§19: subrole/izin | §2, §12–15 | §2–3, ADM-IMP-01/11/13/14; current capability dan limited DTO | 043–062 |
| §7.1 dan penerbitan Pretest original | §3–4, §8 | §5–7, ADM-IMP-02/03/04; slot, policy pin, partial draft/Simpan | 001–005, 015, 018–022 |
| §10 dan v2: Drill/varian | §5, §7–8 | §5–7, ADM-IMP-05/06; assigned/delivered arm, anchor dan immutable version | 006, 008–014, 079; konflik DEP-01 |
| §11–13 dan v2: Tryout multipaket/hasil | §6–7 | §7.5/§8, ADM-IMP-07; unique student-batch, frozen packages, per-arm fallback dan coverage | 007, 080–081 |
| §18/ADR-008: konten/master/intake | §3, §8, §19 | §4–9, ADM-IMP-02/03/04; field existing, autosave, duplikat, archive dependency, concurrency | 016–022, 063–067, 071–075, 078 |
| §10.2/§18: moderasi | §9 | §7.6, ADM-IMP-08; case+source reports, close reason, reopen history | 023–027, 070; konflik DEP-02 |
| §10.1/§18: video | §10 | §4/§7.6, ADM-IMP-09; manual, satu subbab, maksimal tiga, urutan otomatis | 028–032, 068–069 |
| §4–6: sekolah/token/membership | §11–12 | §7.7–7.8, ADM-IMP-10/11; bulk/reissue, cutoff, reactivate | 033–047 |
| Dashboard/audit/UX: keputusan pemilik | §13, §15, §18 | §10–14, ADM-IMP-12/14; filters/comparison, scoped unavailable,5menit, mobile dan list context | 048–052, 058–061, 075–078 |
| Persetujuan dan dependensi lanjutan | §17 | §13–14; gap bukan klaim implementasi | ADM-DEP-01–06 |

V2 telah menetapkan batas attempt/batch, freeze, komposisi3+7/5+25, metode mapping paket acuan dan fallback per arm; kontrak payload v1 sudah tersedia. Rekonsiliasi distribusi/availability dan penyerahan ilmiah/operasional tetap eksplisit. Daftar ADM-IMP-01–14 bukan laporan hasil tes. Tidak ada perubahan kontrak/schema/aplikasi dalam pekerjaan dokumentasi ini. Catatan Admin/navigasi lama yang bertentangan menjadi riwayat; route awal semua subrole sekarang Dashboard.

**ENGINEERING IMPLEMENTATION — Admin dan Guru, 10 November 2026.**

- ADM-AC-029 — Server mengunci subbab sebelum mengaktifkan video dan menolak jika tiga video aktif sudah terisi. Daftar Admin dan rekomendasi Drill mengikuti waktu penambahan. Sebelum rilis, periksa data lama yang memiliki lebih dari tiga video dengan status video dan pemetaan sama-sama `READY` pada subbab yang sama. Admin berwenang menentukan video yang tetap aktif sambil mempertahankan histori laporan.
- ADM-AC-037 — Penerbitan ulang token Guru menambah token sekali pakai tanpa mengubah status atau kedaluwarsa token sumber. Token sumber yang sudah kedaluwarsa tetap kedaluwarsa. Catatan audit membatasi satu penerbitan ulang per token sumber. Bulk dan akses histori sekolah mengikuti cakupan tersendiri.
- ADM-AC-048 — Pintu masuk `/admin` mengarahkan ketiga subrole dengan izin Analytics ke Dashboard `/admin/analytics`. Bagian ini mencakup tujuan awal. Filter, perbandingan periode, dan metrik mengikuti cakupan Dashboard tersendiri.

**ENGINEERING DECISION ? pemilik, 9 November 2026:** Paket asesmen dipisah menjadi halaman daftar tabel, tambah dan detail per Pretest/Drill/Tryout; tanpa header berulang atau tab jenis. Search/filter/pagination server dan URL; seluruh mutasi di tambah/detail. [Keputusan daftar asesmen](../design/ADMIN_ASSESSMENT_DIRECTORY_2026-11-09.md).

**ENGINEERING DECISION — pemilik, 9 November 2026:** menu Analytics dinamai Dashboard; halaman berfokus pada metrik dengan menghapus header berulang dan memindahkan penjelasan ke Info metrik tertutup. Route/API, lingkup subrole dan tujuan awal tetap. [Keputusan tampilan Dashboard](../design/ADMIN_ANALYTICS_UX_2026-10-30.md#dashboard-ringkas--keputusan-pemilik-9-november-2026).

**ENGINEERING DECISION — pemilik, 9 November 2026:** sidebar Admin memakai empat kelompok dengan dropdown dua tingkat yang dapat terbuka bersamaan, preferensi sesi per akun/assignment, dan penanda aktif berdasarkan URL. Tab halaman tetap dipertahankan pada tahap pertama; tujuan subrole dan permission existing tetap berlaku. [Struktur dan penerimaan sidebar](../design/ADMIN_NAVIGATION_UX_2026-11-02.md#sidebar-dropdown--keputusan-pemilik-9-november-2026).

**ENGINEERING DECISION — pemilik, 9 November 2026:** [matriks Admin dan acceptance](../development/ADMIN_ASSESSMENT_REWORK.md) memetakan §3, §7, §11–13, §18–19 ke navigasi, pipeline paket canonical, ketersediaan siswa dan Analytics scoped ketiga subrole. Ini menggantikan pembatasan UI Analytics hanya Super; rilis Tryout fleksibel dan histori tetap dipertahankan. Draft AI/IRT dipakai sebagai fondasi versi/status tanpa eksperimen A/B.

**ENGINEERING DECISION — instruksi pemilik, 30 Oktober 2026:** Analytics menjadi dashboard dan menu pertama/tujuan `/admin` untuk Super Admin aktif dengan capability Analytics. Operations tetap ke sekolah dan Content/Data/Moderation tetap ke konten; assignment kosong tidak memperoleh modul. Tujuan Super Admin pada keputusan 27 Oktober di bawah menjadi konteks historis. Tidak ada Ringkasan baru, perubahan capability server, rumus, migrasi, atau data historis. [Pemetaan agregat dan penerimaan UI-04](../design/ADMIN_ANALYTICS_UX_2026-10-30.md).

**ENGINEERING DECISION — 29 October 2026 integration:** [Runtime/QA after Admin #110](../development/RUNTIME_QA_INTEGRATION_2026-10-29.md) maps Redis-independent PvP, Student main-API routing, pinned-policy XP compatibility, worker/QA/dependency improvements and append-only migration reconciliation to existing ADR-006/009 and owner decisions. No new academic or scoring rule is introduced; Cloud backup/rehearsal and independent acceptance remain distinct evidence.

**ENGINEERING DECISION - instruksi pemilik, 27 Oktober 2026:** hapus halaman Ringkasan untuk seluruh Admin, termasuk Super Admin. `/admin` hanya menjadi pintu masuk berdasarkan assignment aktif: Super Admin dan Operations ke `/admin/schools`, Content/Data/Moderation ke `/admin/content`. Menu Ringkasan dan kartu pemilih modul dihapus; akun tanpa assignment tetap menerima pesan akses tanpa modul. Permintaan ini tidak mengubah Analytics, otorisasi NestJS, kontrak API, maupun data tersimpan. Keputusan ini menggantikan pengecualian lama yang mempertahankan Ringkasan untuk Super Admin.

**PRD RULE:** the owner-approved [PRD v0.6 Final](sources/PRD_Numora_v0.6.docx.md), supplied 4 October 2026, is authoritative. Earlier product/module rules apply only where they do not conflict. The historical text below is superseded context, not a second current specification.

Current rules: three fixed Admin subroles and action-level permissions; maximum five active classes; account-based progress/XP; leave/ban/takeover preserving history; active teacher may be absent. Pretest: 20 items, one completed attempt/chapter, optional/skip, placement 0–7 L1 / 8–18 L2 / 19–20 L3, zero XP. Drill: 10 items/level, five levels/subchapter, one MVP variant, >=80 unlock, irreversible unlock, latest stars (0 included), final base/time bonus formula. Tryout: 30 items, free ongoing batch Monday–Sunday WIB, one attempt/package, close-time auto-submit, immediate XP independent of IRT, immutable value/explanation within 72 hours. PvP: 10-minute waiting/invite, 20-second reconnect, Top 10 plus self leaderboard. Admin cannot ban students or edit product formulas.

**ENGINEERING DECISION - approved Product clarifications in main PR #77, 5 October 2026:** Tryout XP uses ceil(equivalent-correct x10) at completion; Drill XP rounds the final total once to the nearest integer. Product weights are PG=2, MCMA=3 and Category=3. Drill partial credit contributes to mastery and equivalent-correct XP. New Drill explanation access has no expiry; legacy attempts retain their pins. Tryout XP fallback applies only when partial calculation is unavailable at submit, using fully-correct x10. Result fallback is separate and applies to the whole batch after 72 hours without a valid IRT result. See [Drill decisions](../development/DRILL_V06_REWARDS.md) and [Tryout decisions](../development/TRYOUT_XP_V06.md).

**OPEN:** approved Curriculum bank/metadata/blueprints, exhaustive PGK rubric/full-correctness evidence and Drill score precision before stars; Data scientific configuration, respondent mapping/quality and ordinary-result fallback formula; Cloud/independent QA acceptance. The scoring handoff remains partially unapproved. No substitute scientific mapping or academic rubric is inferred.

**ENGINEERING DECISION — user-approved 5 October plan:** full-stack Admin implementation, fixed role capabilities, invite by email, stage gates without a fixed date. Import preview stays unscored. Main now provides the Pretest Student lifecycle; academic blueprint/rubric approval remains a separate gate. Main PR #77 supplies membership/ownership lifecycle; Admin readers must integrate that implementation without taking over Teacher-only actions. See [Admin implementation and acceptance](../development/ADMIN_FULL_STACK_STATUS.md).

**ENGINEERING UPDATE - M6:** request/pin/adoption UI, aggregate analytics, batch SLA and immutable participant readers now reuse the foundation models. Response snapshot v2 separates collection deadline from actual grading time and preserves historical v1 data. Production participant publication remains blocked by the approved versioned respondent producer/mapping/release handoff. See [implementation boundary](../api/ADMIN_IRT_ANALYTICS.md).

## Current engineering mapping

**PRD RULE — Admin permissions:** §3.2–3.3 grants Content limited school/class views and aggregate Student data, without operational management; ban/unban remains Teacher-only even for Super Admin. **ENGINEERING DECISION:** the [three-subrole API and portal matrix](../api/ADMIN_PERMISSION_MATRIX.md) implements credential status counts, scoped IRT diagnostics and masked non-Admin audit actors.

| Domain            | v0.6 implementation target                                                              | Gate                                   |
| ----------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| Admin permissions | Per-action server guard, limited structure DTO, scoped audit                            | Direct HTTP + browser matrix           |
| Admin accounts    | Internal invite, fixed assignment/status, durable reconciliation, last-Super protection | Provider/DB failure + actual email     |
| Operations        | Address, credential used_by, verified teacher, memberships/roster, limited view         | No individual data for Content         |
| Content/media     | JSON rich formats, Draft/Ready/Revision/Archive, immutable lineage, R2 receipt          | Curriculum review + storage acceptance |
| Assessment        | 10 Drill/20 Pretest/30 Tryout, approved pins, retry, batch close, XP                    | Rubric/precision approval + consumer   |
| IRT/publication   | Existing requests, respondent contract, SLA, immutable release                          | Data pipeline/quality/mapping          |
| Analytics         | Authorized aggregate queries over durable truth                                         | Unavailable metrics explicitly marked  |

**ENGINEERING DECISION — owner instruction, 7 October 2026:** opt-in DEMO-only PvP temporarily uses accepted uncalibrated READY single-choice Drill content. The three choices share the pool and retain server timers; calibrated academic difficulty remains pending. [Activation and owner replacement checklist](../development/PVP_TEMPORARY_READY_CONTENT.md).

**ENGINEERING DECISION — owner approved, 6 October 2026:** unresolved Excel metadata remains in intake preview with immutable source provenance. Destination/scope is chosen before mapping validation. Preview progress is separate from final draft eligibility; non-ARCHIVED master may support draft, READY is required for every mapped master at Publish. Official taxonomy and PGK scoring remain dependencies. [Approved refinement](../content/UPLOAD_FIRST_WORKFLOW.md).

**ENGINEERING DECISION — owner approved, 6 October 2026:** remove obsolete demo presentation; retain isolated synthetic fixtures and immutable academic history. The configured cloud project remains Development. This does not approve Curriculum content, PGK scoring or IRT policies. [Cleanup decision and verification](../development/DEMO_CLEANUP_2026-10-06.md).

**ENGINEERING DECISION — owner approval, 6 October 2026:** content intake now starts with Excel upload, then preview/validation, destination/title, draft and one Publish confirmation. V5 uses material names and server-generated IDs; tracked upload sessions retain source workbooks in R2. Curriculum approval is recorded against the current composition at Publish. Counts 30/20/10 and PGK publication restriction remain. [Approved workflow](../content/UPLOAD_FIRST_WORKFLOW.md).

**ENGINEERING DECISION — permintaan dan klarifikasi pemilik, 6 Oktober 2026:** input soal baru memakai template Excel; drag-and-drop/pemilih file → parser NestJS → preview perubahan → satu tombol Simpan → verifikasi R2 → transaksi importer JSON v2 → review → catat persetujuan Curriculum → Publish PG. Super Admin/Content/Data/Moderation saja. Backend memeriksa ulang approval terhadap susunan/versi, menyegel blueprint aktual, mem-pin kebijakan scoring dan menyediakan gambar attempt siswa. PGK menunggu rubrik skor parsial; IRT/release hasil existing tetap berlaku. Migrasi 0031 dan smoke nyata DEMO selesai pada development. [Pipeline dan batas aktivasi](../content/EXCEL_UPLOAD_WORKFLOW_2026-10-06.md).
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

## Runtime integration repair — 21 October 2026

**ENGINEERING DECISION — implementation mapping:** existing Student learning/PvP routing and the Chapter 3 owner exception map to their runtime clients/package selector. ADR-006 durability maps to PostgreSQL deadline sweeps and migration 0039's transactional cancellation guard; ADR-009 and the 7 October Tryout equivalent-correct decision map to migration 0040's six-decimal ledger validation. [Scope and regression coverage](../development/RUNTIME_RELIABILITY_2026-10-21.md). No new scoring/publication policy or academic approval is introduced.

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

## Keputusan pemilik — 7 Oktober 2026: indikator Tryout

**ENGINEERING DECISION — disetujui pemilik:** Tryout mengabaikan indikator pada alur upload, draft dan Publish. Nilai asli Excel tetap disimpan sebagai provenance; indikator efektif kosong tidak menghalangi Tryout. Drill dan Pretest tetap wajib memiliki indikator sah. Bab, subbab, level, kesulitan, konten, media dan aturan Publish lain tetap diperiksa. Identitas soal/paket dibuat otomatis; sistem tidak mengarang materi akademik. Migrasi forward membolehkan primary_competency_id NULL hanya untuk keluarga TRYOUT; histori tidak ditulis ulang.

**ENGINEERING DECISION — pemilik, 7 Oktober 2026 (menggantikan aturan sebelumnya yang mengabaikan indikator Tryout):** Tryout mengizinkan subbab, indikator dan level sumber kosong (`null`) sampai Publish. Nilai yang diberikan tetap dipertahankan dan divalidasi terhadap master/induk. Bab dan kesulitan tetap wajib; Drill/Pretest, konten/kunci/pembahasan, jumlah, media, review, jadwal dan pembatasan PGK tidak dilonggarkan. Migrasi 0034 menambahkan referensi bab/subbab nullable pada keluarga soal agar Tryout tanpa level tetap tersimpan dan dapat dibaca; histori tidak diubah.

**ENGINEERING DECISION — pemilik, 7 Oktober 2026 (menggantikan kewajiban bab Tryout sebelumnya):** Bab, subbab, indikator dan level per soal maupun scope paket tidak wajib untuk Tryout campuran. Metadata materi kosong disimpan null sampai Publish. Admin dapat secara eksplisit melewati pemetaan materi tanpa menghapus sumber Excel; materi yang tetap dipakai divalidasi terhadap master. Kesulitan, konten, kunci, pembahasan dan gate Publish lain tetap berlaku; Drill/Pretest tetap memerlukan scope.

**ENGINEERING DECISION — pemilik, 7 Oktober 2026:** Tryout boleh tanpa kesulitan serta tanpa pemetaan materi. Referensi Excel yang belum dapat dipetakan tetap menjadi provenance, dengan relasi efektif null; tidak mengarang materi atau kunci. Status DRAFT materi tidak menghalangi paket Tryout, tetapi materi ARCHIVED tidak dipakai. Rubrik PGK yang disetujui pemilik: MCMA dinilai per keputusan memilih/tidak memilih setiap opsi; Kategori per pernyataan tepat; jawaban kosong 0. Nilai proporsional dibulatkan ke dua desimal mengikuti kolom awarded_points; XP = jumlah benar ekuivalen ×10 dari poin tersimpan. Rubrik dipin melalui kebijakan baru TRYOUT_PGK_PARTIAL_V1 (migrasi 0035); paket/hasil lama tidak diubah. Urutan Tryout diacak server saat attempt dibuat dan disimpan tetap selama resume. Gambar diunggah dengan maksimal tiga pekerjaan paralel dan receipt R2 wajib diverifikasi. Konten, pilihan/pernyataan, kunci, pembahasan, otorisasi, review, jumlah, jadwal, dan integritas versi tetap divalidasi.

**ENGINEERING DECISION — pemilik, 7 Oktober 2026:** Tryout dapat dipublish kapan saja, menggantikan batas Senin dan satu paket mingguan pada alur Admin. Tanggal rilis opsional: kosong berarti Publish sekarang; waktu lampau menjadi sekarang; waktu mendatang menjadwalkan akses. Batch tetap berjalan selama 7 hari dikurangi satu menit sejak rilis efektif, durasi attempt 10 menit dan IRT setelah batch tutup tetap berlaku. Paket dan attempt lama tidak diubah.

**ENGINEERING DECISION — perbaikan akses, pemilik 7 Oktober 2026:** Publish Excel Tryout mengunci snapshot beserta scoring/blueprint pins secara atomik. Digest komposisi review dipertahankan sebagai compositionDigest; manifestDigest persetujuan mengikuti digest snapshot database. Distribusi paket Excel yang sudah direview/disetujui Admin tidak menunggu package_quality_results generator; jalur ini memeriksa 30 versi READY, provenance impor, persetujuan SEALED dan tetap menahan keputusan HOLD/RETIRED. Tidak membuat hasil statistik sintetis. Dua paket terbit tanpa attempt dipulihkan dengan backup; jadwal/histori attempt tidak diubah.

## Generator service v1 — 7 Oktober 2026

**ENGINEERING DECISION — handoff implementasi:** Admin Generate → preview read-only → Simpan VARIANT DRAFT mengikuti compute v3 dan approval main-owned. CONTENT_VALID tidak berarti READY atau approval akademik. Default flag false; activation menunggu mapping/rubric/context Curriculum dan restricted runtime staging. Detail: [GENERATOR_SERVICE_V1.md](../content/GENERATOR_SERVICE_V1.md).

## Generator paket — keputusan pemilik 7 Oktober 2026

**ENGINEERING DECISION — permintaan pemilik:** Admin memilih Tryout/Drill/Pretest dan generate satu paket sesuai jumlah existing (30/10/20). Hasil memiliki halaman/navbar tersendiri, dapat dilihat atau diunduh JSON, kemudian diimpor melalui halaman impor dengan preview dan validasi yang sama. Generate/export belum membuat canonical DRAFT atau publication. Generator service v1 tetap satu kandidat per request; pusat mengelompokkan request durable secara atomik. Source, rubric, context dan approval tetap dipin; jumlah dan scope paket mengikuti validasi impor existing. Kandidat tetap VARIANT dengan lineage, bukan ORIGINAL baru. Dependency akademik tidak diselesaikan oleh perubahan UX ini.

**ENGINEERING DECISION — owner request:** combine package generation and results in one menu; completion opens /admin/content/imports directly at Preview & tujuan (step 2). Reuse import validation and guarded publication; generated lineage stays immutable.


## Batch Tryout dan delegasi ? 10 November 2026

**ENGINEERING DECISION ? persetujuan pemilik:** bank paket terpisah dari batch pelaksanaan. Batch memiliki judul, rentang mulai/tutup bebas dalam WIB, beberapa versi paket dan delegasi Mandiri/sekolah. Batch terbit tidak boleh bertabrakan. Siswa Mandiri tidak memiliki kelas aktif; sekolah tanpa delegasi tidak mendapat akses. Siswa multisekolah memilih satu sekolah yang sah saat mulai; assignment/attempt dikunci per siswa/batch. Beberapa penerima boleh memakai paket sama. Konfigurasi dapat direvisi sebelum mulai, terkunci saat mulai. Pembatalan hanya sebelum mulai. Durasi attempt sepuluh menit, dibatasi penutupan batch.

**ENGINEERING DECISION:** delegasi adalah alokasi Admin, bukan randomisasi A/B. Paket historis, attempt dan XP tidak ditulis ulang. Aktivasi start berbasis batch terjadi setelah batch Admin pertama diterbitkan; endpoint start paket lama kemudian menolak start baru. Resume/histori tetap tersedia. Hasil multi-paket menunggu finalisasi seluruh batch dengan kontrak/policy sah; kegagalan tidak menghasilkan nilai buatan.

## ENGINEERING DECISION � pemilik, 10 November 2026: publikasi Pretest sederhana

Instruksi pemilik menggantikan kewajiban review per soal dan input bukti persetujuan Curriculum tambahan untuk paket Pretest. Sumber soal disiapkan Curriculum. Admin dapat langsung menerbitkan DRAFT yang lolos seluruh validasi server: jumlah 20, struktur/kunci/pembahasan, metadata/cakupan, provenance/media dan kompatibilitas scoring. Impor tetap menyimpan DRAFT, bukan publikasi otomatis. Masalah validasi tetap memblokir publikasi dan ditampilkan melalui checklist. Tidak mengubah aturan Drill/Tryout, penempatan Pretest, XP, paket terbit atau histori siswa. Snapshot/blueprint internal existing tetap dibuat secara transaksional saat publikasi; bukan langkah persetujuan manual baru.


## Automatic Pretest rubric - 10 November 2026

**ENGINEERING DECISION - owner-approved plan:** Pretest imports use SEALED `PRETEST_PGK_PARTIAL_V1` rubrics validated by the scoring engine. Unchanged content with an invalid rubric creates a new version. `POST /api/v1/admin/content/packages/{id}/prepare-scoring` accepts `expectedRevision`, requires Content Admin and a DRAFT Pretest package. One audited transaction replaces only affected question-version references, preserving content, answers, order and count. Repeats at the current revision create no versions; stale revisions are rejected. Published packages, attempts, results and historical policy pins remain unchanged. Preparation does not publish. Scoring problems link to preparation rather than content editing.

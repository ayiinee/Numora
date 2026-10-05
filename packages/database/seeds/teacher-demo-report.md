# NUMORA Phase 0 — Teacher development seed

Dataset `teacher-demo-2026-v1` sudah diterapkan dan diverifikasi pada **Numora-Staging**, project ref `pkamenfnwmoeisccnrnk`. Repo mengidentifikasi project ini sebagai sandbox development di `docs/testing/QA_SEED.md` dan `docs/development/MVP_RECOVERY_2026-10-01.md`. Target lain ditolak oleh runner. Tidak ada perubahan UI, API produk, schema, migration, RLS, grants, atau policies oleh pekerjaan ini.

Waktu acuan fixture: **4 Oktober 2026, 21:53:45 WIB** (`2026-10-04T14:53:45.008Z`). Rerun mempertahankan waktu dan riwayat ini. Batch aktif memiliki deadline **5 Oktober 2026, 00:00 WIB**; setelah deadline, status ketersediaan aplikasi mengikuti waktu sebenarnya. Dataset tidak memperpanjang deadline secara otomatis.

Label aturan: **PRD RULE** untuk aturan approved; **ENGINEERING DECISION** untuk konvensi engineering existing; **OPEN** untuk kebijakan belum final; **PROPOSED** untuk saran fase berikutnya. Angka di bawah adalah hasil verifikasi row development, bukan aturan produk baru.

## A. Current schema mapping

Mapping diselesaikan sebelum penulisan data. Live schema diperiksa melalui katalog PostgreSQL: columns, enum, foreign keys, constraints, indexes, triggers, grants, policies, migration history, serta relasi Auth/profile. Ditemukan 89 public tables dengan RLS aktif. Required legacy `chapters.slug` dan `subchapters.slug` di live schema ikut diisi oleh seed.

| Design entity                               | Existing table → relevant columns                                                                                                                                       | Relation / derivation                                                                                         | Status                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Teacher/Student aktif                       | `users`: `id`, `auth_user_id`, `role`, `display_name`, `email`, `status`                                                                                                | `auth_user_id` → `auth.users.id`; email identities dibuat melalui server Admin API                            | SUPPORTED                 |
| Sekolah                                     | `schools`: `id`, `code`, `name`, `address`, `status`                                                                                                                    | `classes.school_id`, `teacher_school_memberships.school_id` → school                                          | SUPPORTED                 |
| Teacher verified                            | `teacher_school_memberships`: `teacher_user_id`, `school_id`, `verification_token_id`, `verified_at`, `ended_at`                                                        | token → `teacher_verification_tokens`: `token_hash`, `created_at`, `expires_at`, `used_at`, `used_by_user_id` | SUPPORTED                 |
| Academic year / NISN / NIP / phone          | Tidak tersedia kolom produk yang relevan                                                                                                                                | Academic year hanya metadata audit fixture; UUID dan email synthetic menjadi identifier testing               | NOT_SUPPORTED             |
| Kelas aktif                                 | `classes`: `id`, `teacher_user_id`, `school_id`, `name`, `join_code`, `archived_at`                                                                                     | Teacher → classes; aktif jika `archived_at IS NULL`                                                           | SUPPORTED                 |
| Keanggotaan                                 | `class_memberships`: `class_id`, `student_user_id`, `joined_at`, `left_at`                                                                                              | class/student FKs; unique index membership aktif per Student                                                  | SUPPORTED                 |
| Student count / total                       | `class_memberships` dengan `left_at IS NULL`                                                                                                                            | COUNT per kelas / seluruh kelas Teacher; tidak menyimpan KPI 98 terpisah                                      | DERIVED                   |
| Bab/subbab/level                            | `chapters` → `subchapters.chapter_id` → `levels.subchapter_id`; `competencies.subchapter_id`                                                                            | Existing Aljabar tetap canonical; dua kelompok tambahan ditandai DEMO                                         | SUPPORTED                 |
| Versioned assessment content                | `questions.primary_competency_id`, `question_variants.question_id`, `question_versions.variant_id`                                                                      | `assessment_packages.scoring_policy_version_id`, `package_items.package_id/question_version_id/max_points`    | SUPPORTED                 |
| Drill attempts / snapshots                  | `assessment_attempts`: `student_id`, `package_id`, `status`, `started_at`, `finished_at`, `score_0_100`, `raw_points`, `level_id_at_start`, `scoring_policy_version_id` | `attempt_items` → package item/version; `attempt_answers.attempt_item_id`, `answer`, `awarded_points`         | SUPPORTED                 |
| Progres, latest/best, mastery               | `level_progress`: `student_id`, `level_id`, `unlocked_at`, `completed_at`, `latest_score`, `best_score`, `completion_attempt_id`, `unlocking_attempt_id`, `best_stars`  | Proyeksi diisi dari raw graded attempts; latest dapat lebih rendah daripada best                              | SUPPORTED                 |
| Drill locked/in progress/failed             | Progress dan attempts di atas                                                                                                                                           | Locked dari `unlocked_at`; in progress dari attempt status; nilai <80 menunjukkan belum mastered              | DERIVED                   |
| Stars final                                 | `assessment_attempts.stars`, `level_progress.best_stars`                                                                                                                | Mengikuti formula fixture backend existing; threshold final DRL-OPEN-03 belum approved                        | PRODUCT_DECISION_REQUIRED |
| Tryout batch/eligible/submitted/pending     | `assessment_packages`, `tryout_batches`: `package_id`, `starts_at`, `closes_at`, `status`; `assessment_attempts`                                                        | Paket shared; class cohort lewat membership dan attempt class snapshot, bukan batch private milik kelas       | PARTIALLY_SUPPORTED       |
| AVG / distribution Tryout                   | `assessment_attempts.score_0_100`                                                                                                                                       | AVG dan bands hanya completed submissions; pending tidak dihitung                                             | DERIVED                   |
| Released result                             | `irt_batches`: `package_id`, `batch_kind`, `status`, `result_released_at`; `irt_item_results`: `question_version_id`, `sample_size`, `data_status`                      | Existing demo release gate; tidak membuat scientific IRT calibration/finalization                             | PARTIALLY_SUPPORTED       |
| Feedback satu arah/read rate                | `feedback`: `teacher_id`, `student_id`, `class_id_at_send`, `body`, `sent_at`, `read_at`                                                                                | Teacher/class/student ownership; read rate = read / sent                                                      | SUPPORTED / DERIVED       |
| Feedback category/context/reaction/video FK | Tidak ada kolom/relasi khusus dalam `feedback`                                                                                                                          | Tema hanya teks `body`; tidak membuat chat atau category enum                                                 | NOT_SUPPORTED             |
| Remedial / intervention count               | Attempt gagal dan isi feedback tersedia                                                                                                                                 | Indikasi kesulitan dapat dibaca; aturan remedial resmi belum final                                            | PRODUCT_DECISION_REQUIRED |
| Teacher notifications                       | Tabel notifications tidak ada pada live DB                                                                                                                              | Implementasi lokal yang belum dimigrasikan membatasi endpoint ke Student                                      | NOT_SUPPORTED             |
| Weekly activity                             | `assessment_attempts.student_id/assessment_type/started_at` + active memberships                                                                                        | Definisi laporan fixture: aktivitas Drill/Tryout dalam periode mulai 1 Oktober WIB sampai waktu acuan         | DERIVED                   |
| XP / ranking                                | `xp_ledger`, `leaderboard_periods`, `class_leaderboard_entries`                                                                                                         | Ledger/projection existing tersedia, formula final OPEN-11                                                    | PRODUCT_DECISION_REQUIRED |
| Join code / QR source                       | `classes.join_code`                                                                                                                                                     | Copy dan QR dirender dari code / logical join URL; tidak ada bitmap DB                                        | DERIVED                   |
| Direct join route                           | API `POST /api/v1/classes/join` tersedia                                                                                                                                | Logical `/join/NUM-9A26` belum menjadi frontend route yang diverifikasi                                       | PARTIALLY_SUPPORTED       |

**ENGINEERING DECISION:** browser hanya memakai Supabase untuk Auth; data bisnis melalui NestJS. Keberadaan row tidak menjamin setiap screen dapat dirender dengan kontrak API existing. Pemeriksaan GET membuktikan Teacher identity, class list, student roster, Student progress, feedback, dan assessment history dapat dibaca. Endpoint class list mengembalikan identitas kelas/kode; KPI dashboard, ringkasan batch/distribusi seluruh kelas, dan kategori feedback terstruktur belum dibuktikan tersedia sebagai respons Teacher khusus. Jangan menghubungkan frontend langsung ke Data API untuk mengisi gap tersebut.

## B. Seeded scenarios

Sekolah synthetic **SMP Negeri 1 Surabaya**, kode `DEMO-TEACHER-SBY-01`; Teacher **Pak Budi Hartono, S.Pd**, `budi.hartono.teacher@numora.test`, ACTIVE, school assigned dan verified. Token development hanya tersimpan sebagai hash, sudah dikonsumsi pada waktu yang valid dalam 72 jam. Tidak dibuat reusable credential, Google identity, NIP, NISN, telepon atau token OAuth palsu. Tahun 2026/2027 berada di metadata skenario audit.

| Persona                     | Development state yang tersedia                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Alya Nurhaliza              | 15 level relevan mastered, akurasi tinggi, Tryout lampau 97, feedback apresiasi; tanpa indikasi gagal                       |
| Dimas Arya Pratama          | Progres tinggi, aktivitas mingguan, Tryout 91                                                                               |
| Farhan Rahman               | Progres tinggi, aktivitas rutin, apresiasi                                                                                  |
| Ahmad Fauzi                 | Drill dan Tryout completed, aktivitas rutin, feedback positif                                                               |
| Siti Rahma                  | Empat attempt Aljabar Level 1 dengan score 50/60/60/70, variant bergantian, belum mastered; Tryout 49 dan feedback remedial |
| Budi Wibowo                 | Drill completed dan satu IN_PROGRESS dengan 3 jawaban tersimpan, Tryout aktif belum submit, pengingat deadline              |
| Budi Santoso                | Progres menengah/tinggi, aktivitas pada beberapa hari; latest score 70 dan best 90, mastery/unlock tetap tersimpan          |
| Dewi Anggraini              | Progres parsial, satu attempt Geometri 70, feedback normal; tidak menetapkan critical alert otomatis                        |
| Rian Hidayat                | Persona normal dalam roster utama, aktivitas/progres bervariasi                                                             |
| Maya Safitri / Rian Pratama | Aktivitas rendah/lama, Tryout belum submit, feedback tersedia                                                               |
| Fikri Ramadhan              | Anggota baru dua jam sebelum acuan, tanpa attempt/progress, Tryout pending; empty/new state                                 |
| Student synthetic lainnya   | Variasi level completion dan aktivitas; enam Student 9-A tidak aktif pada periode fixture                                   |

Semua 98 nama/akun merupakan data testing synthetic. Status warning/danger/remedial dapat disajikan sebagai interpretasi attempt/feedback; seed tidak menambahkan status remedial resmi atau counter otomatis.

**PRD RULE:** mastery ≥80, Drill count-up tanpa deadline, unlock berikutnya dari mastery, retry varian berbeda. Data memuat locked, unlocked, mastered, failed retry, IN_PROGRESS, regression dan snapshot historis. Dua attempt tambahan melengkapi timeline retry Siti dan Budi Santoso agar varian berurutan berbeda; snapshot existing tidak ditimpa. Bintang mengikuti demo backend existing, **OPEN** DRL-OPEN-03, bukan acceptance final.

Existing Aljabar dan Bilangan dipertahankan. Dua kelompok baru adalah **Bab DEMO: Teorema Pythagoras & Geometri Ruang** dan **Bab DEMO: Statistika & Peluang Soal TKA**. Masing-masing satu subbab, lima level, dua paket/varian per level, sepuluh soal PG per paket. Konten dan paket ditandai DEMO; question versions DRAFT mengikuti konvensi fixture existing, tanpa klaim review Curriculum resmi.

## C. Data counts

Counts berikut hanya row baru milik namespace seed, bukan seluruh database.

| Entity                                         |                                       Inserted rows |
| ---------------------------------------------- | --------------------------------------------------: |
| Auth email QA accounts                         |                                                  99 |
| Application Teacher / Students                 |                                              1 / 98 |
| School                                         |                                                   1 |
| Verification token / Teacher-school membership |                                               1 / 1 |
| Classes / active Student memberships           |                                              3 / 98 |
| Chapters / subchapters / competencies / levels |                                      2 / 2 / 2 / 10 |
| Questions / variants / versions                |                                     100 / 200 / 200 |
| Scoring policy version                         |                                1 DEMO Tryout policy |
| Assessment packages / package items            |                                            22 / 270 |
| Assessment attempts                            |                          304: 244 Drill + 60 Tryout |
| Attempt items / saved answers                  |                                       4,540 / 4,533 |
| Level progress                                 |                                               1,455 |
| Tryout batches                                 |                                                   2 |
| DEMO IRT batch / item results                  |                                              1 / 35 |
| Feedback                                       |                              42: 38 read / 4 unread |
| Analytics outbox                               | 383: 303 assessment completions + 42 sent + 38 read |
| Audit logs                                     |                                                   6 |
| XP events / leaderboard projections            |                                               0 / 0 |
| Teacher notifications                          |                        Tidak didukung; tidak dibuat |

| Class                                  | Active Students |
| -------------------------------------- | --------------: |
| Kelas 9-A Matematika TKA — NUM-9A26    |              34 |
| Kelas 8-C Drill & Latihan — NUM-8C15   |              32 |
| Kelas 7-B Persiapan Pretest — NUM-7B99 |              32 |
| Total unique Students / memberships    |         98 / 98 |

Tryout lampau dan aktif masing-masing memiliki 34 eligible, 30 completed submissions dan empat tanpa submission: Budi Wibowo, Maya Safitri, Rian Pratama, Fikri Ramadhan. Setiap completed attempt memiliki 35 item dan 35 jawaban. Batch lampau released; batch aktif `waitingIrt`, API score null. Nilai persentase DEMO dihitung dengan backend PG existing dari jumlah jawaban benar, bukan skala TKA final.

| Past batch score band | Completed attempts |
| --------------------- | -----------------: |
| 90–100                |                  8 |
| 75–89                 |                 12 |
| 60–74                 |                  6 |
| <60                   |                  4 |
| Total                 |                 30 |

SUM nilai integer 2,442; AVG **81.4**. Alya **97** karena 34/35 jawaban benar dibulatkan oleh backend; Dimas **91**, Siti **49**. Nilai mockup 96 tidak dipaksakan. Raw percentage pada batch aktif tidak dibuka sebagai hasil sebelum release. Read rate feedback **38/42 = 90.48%**; aktivitas periode fixture **28/34 = 82.35%**.

Progres: **960 LOCKED**, **287 UNLOCKED_NOT_MASTERED**, **208 MASTERED**. Drill: **243 GRADED**, termasuk **7** score <80, dan **1 IN_PROGRESS**. Fikri tidak memiliki row progres sehingga empty state tersedia.

## D. Design data gaps

Design location merujuk daftar screen dalam permintaan Phase 0; tidak ada Figma handoff yang digunakan. **PROPOSED** di kolom saran memerlukan pekerjaan fase berikutnya, bukan implementasi fase ini.

| Feature / design location                       | Required data; current support                                                      | Can derive?                          | Need schema?                              | Need product approval?                  | Suggested implementation                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Dashboard KPI / monitoring kelas                | Raw memberships, attempts, feedback tersedia; kontrak summary Teacher belum lengkap | Ya                                   | Tidak untuk KPI dasar                     | Definisi window/eligibility jika baru   | PROPOSED aggregate endpoint NestJS dari rows                                   |
| Weekly XP / leaderboard (#6)                    | Ledger/projections ada; final formula tidak approved                                | Belum aman                           | Tidak untuk ledger dasar                  | Ya: OPEN-11, DRL-OPEN-01/02, TRY-TBC-03 | Finalkan formula sebelum mencatat event/ranking                                |
| Stars / Drill (#4)                              | Kolom ada; thresholds final OPEN                                                    | Demo saja                            | Tidak                                     | Ya: DRL-OPEN-03                         | Pertahankan fixture berlabel DEMO                                              |
| Scientific IRT / TKA scale (#5)                 | DEMO release gate tersedia; tanpa theta/calibration/finalization ilmiah             | Tidak dari demo percentage           | Evaluasi model existing setelah keputusan | Ya: scale/calibration/configuration     | Gunakan pipeline approved; jangan menganggap fixture sebagai validasi akademik |
| Remedial otomatis / intervention state (#7/#12) | Raw failures dan feedback; tidak ada aturan final                                   | Indikasi saja                        | Evaluasi setelah rule final               | Ya                                      | Finalkan rule, lalu derive atau persist workflow yang disetujui                |
| Feedback category/context/reaction/video (#7)   | `body`/read timestamp; tidak ada structured FKs atau reactions                      | Tema teks saja                       | Ya untuk struktur baru                    | Ya                                      | Spec feedback satu arah; jangan menambahkan chat                               |
| Teacher notification center / unread 3 (#8)     | Live tables tidak ada; kode lokal Student-only                                      | Tidak                                | Ya dan kontrak Teacher                    | Ya untuk scope/categories               | Rancang terpisah; jangan apply migration lokal 0018 pada fase ini              |
| Remedial/deadline/read preferences (#9/#10/#15) | Tidak ada user preference storage yang relevan                                      | Tidak                                | Ya                                        | Ya                                      | MISSING_BACKEND; finalkan pilihan dan defaults                                 |
| Academic year, NISN/NIP/phone (#2/#9)           | Tidak ada field yang relevan                                                        | Academic year fixture di audit saja  | Ya jika field produk diperlukan           | Ya                                      | Jangan isi PII real; spec identifier synthetic dan validation                  |
| Class archive (#10)                             | `classes.archived_at` tersedia; controller existing tidak punya aksi archive        | Ya untuk state                       | Tidak untuk penyimpanan                   | Konfirmasi lifecycle endpoint           | SUPPORTED_EXISTING DB; PROPOSED endpoint terotorisasi                          |
| Allow joining (#10/#11)                         | Eligibility existing dari archive/school/member; tidak ada toggle independen        | Ya untuk eligibility                 | Ya untuk toggle baru                      | Ya                                      | DERIVED; gunakan existing `POST /classes/join`                                 |
| Join URL / QR / poster (#11)                    | Kode ada; direct frontend `/join/{code}` belum dibuktikan                           | Ya untuk payload                     | Tidak untuk QR                            | Route/UX perlu handoff                  | Copy/QR FRONTEND_ONLY; poster sebagai export client setelah approval UI        |
| Capacity 36 versus unlimited (#10/#11)          | Tidak ada cap backend                                                               | Tidak membuktikan unlimited approved | Bergantung keputusan                      | Ya                                      | PRODUCT_DECISION_REQUIRED; jangan memilih angka dari screenshot                |
| Weekly Tryout requirement (#10)                 | Tidak ada class setting                                                             | Tidak                                | Evaluasi setelah keputusan                | Ya                                      | PRODUCT_DECISION_REQUIRED                                                      |
| Include class in leaderboard (#10)              | Tidak ada opt-out setting                                                           | Tidak                                | Evaluasi setelah keputusan                | Ya                                      | PRODUCT_DECISION_REQUIRED                                                      |
| Teacher takeover/history (#10/#16)              | Tidak ada workflow/history yang mendukung fitur desain                              | Tidak                                | Ya                                        | Ya                                      | MISSING_BACKEND; ownership transitions perlu spec dan audit                    |
| Student block list (#10)                        | Tidak ada class block model                                                         | Tidak                                | Ya                                        | Ya                                      | MISSING_BACKEND; jangan menyamakan inactive membership dengan block            |
| WhatsApp broadcast/integration (#15/#16)        | Tidak ada integration/delivery model                                                | Tidak                                | Ya                                        | Ya                                      | Future/disabled feature; tidak mengirim pesan eksternal                        |
| Leaderboard sharing/report export (#6/#16)      | Tidak ada endpoint/format export yang diverifikasi                                  | Sebagian dari sumber data            | Belum tentu                               | Format, privacy, scope perlu keputusan  | MISSING_BACKEND; desain kontrak/export setelah approval                        |
| Session management / 2FA indicator (#9/#16)     | Supabase Auth session tersedia; fitur produk/desain belum implemented               | Tidak untuk state fitur palsu        | Evaluasi Auth API existing                | Ya untuk UX/security policy             | Jangan seed indikator 2FA palsu                                                |
| Notification analytics (#8/#16)                 | Tidak ada Teacher notification rows/preferences                                     | Tidak                                | Evaluasi setelah notification spec        | Ya                                      | MISSING_BACKEND                                                                |

Tidak ada stored aggregate palsu, XP berangka, badge unread Teacher nol yang dianggap sukses, WhatsApp integration, atau business toggle baru.

## E. Files changed

Hanya file seed/verifikasi/report berikut dibuat oleh pekerjaan Phase 0:

- `packages/database/src/teacher-demo-seed.ts` — guarded runner, preflight, transaction, fingerprints, verification.
- `packages/database/seeds/teacher-demo.sql` — insert-or-verify fixture, temporary connection-local helpers.
- `packages/database/seeds/teacher-demo-roster.json` — deterministic synthetic roster/persona parameters.
- `apps/api/scripts/teacher-demo-accounts.mjs` — server Auth provisioning dan recovery journal.
- `apps/api/scripts/teacher-demo-accounts.test.mjs` — environment/key/identity safety checks.
- `apps/api/scripts/teacher-demo-verify.mjs` — authenticated GET/access checks dan direct-role denial checks.
- `packages/database/src/teacher-demo-seed.integration.spec.ts` — isolated restore test, idempotency/collision/rollback.
- `packages/database/seeds/teacher-demo-report.md` — laporan dan operator runbook ini.

Perubahan API/UI/docs/schema/migration lain yang sudah ada di working tree tidak disentuh. Tidak ada perubahan package scripts atau dependency.

## F. Supabase changes and safe operation

Inserted entities dijelaskan pada C. Deterministic application UUID menggunakan prefix `04000000-0000-4000-8000-`; Auth UUID berasal dari Admin API. Existing QA Admin hanya direferensikan sebagai issuer/audit actor; QA Teacher B hanya dipakai untuk pemeriksaan akses. Password existing tidak diubah. Auth QA email identity adalah mekanisme testing existing; tidak menggantikan **PRD RULE** Google Auth untuk pengguna produk.

Sebelum provisioning dibuat PostgreSQL custom-format backup di ignored `.qa-seed/teacher-demo/before-teacher-demo-20261004.dump`, 1,051,244 bytes, SHA-256 diverifikasi dan archive listing diperiksa. Backup public/auth/drizzle/irt_compute berhasil direstore dan diuji dalam database localhost terisolasi. Restore validasi menggunakan PostgreSQL 16; hanya statement dump PG17 `SET transaction_timeout` dihapus untuk kompatibilitas clone. Cloud database tidak direstore/reset.

Auth provisioning berada di luar transaksi SQL. Vault password acak, pending journal, manifest, backup receipt, dan hasil verifikasi disimpan di ignored `.qa-seed/teacher-demo/`; ACL Windows dibatasi ke operator lokal. Jangan commit/cetak vault, dump, link login, password, key, atau token. Jika vault hilang, provisioner berhenti dan tidak mengambil alih/reset akun existing.

Insert bisnis, enam audit records dan outbox dilakukan dalam satu transaksi dengan advisory lock. Temporary `pg_temp` helpers bukan durable schema. Insert-or-verify memeriksa row existing sebelum insert, sehingga immutability triggers tetap aktif. Konflik payload/ownership menghentikan transaksi, bukan mengubah riwayat. Tidak ada DELETE/TRUNCATE, migration apply, atau permanent DDL.

Operator commands, dari root repo dengan `.env` development existing:

```powershell
# Default / --check selalu read-only.
node --env-file=.env packages/database/node_modules/tsx/dist/cli.mjs packages/database/src/teacher-demo-seed.ts --check

# Gunakan receipt backup terbaru yang telah diverifikasi. Backup wajib <24 jam.
$receipt = Get-Content .qa-seed/teacher-demo/backup.json | ConvertFrom-Json
$env:ALLOW_TEACHER_DEMO_SEED = 'true'
$env:TEACHER_DEMO_BACKUP_PATH = $receipt.archive
$env:TEACHER_DEMO_BACKUP_SHA256 = $receipt.sha256
node --env-file=.env apps/api/scripts/teacher-demo-accounts.mjs
node --env-file=.env packages/database/node_modules/tsx/dist/cli.mjs packages/database/src/teacher-demo-seed.ts --apply

# Verifikasi data read-only; tidak perlu menggeser waktu atau mereset seed.
node --env-file=.env packages/database/node_modules/tsx/dist/cli.mjs packages/database/src/teacher-demo-seed.ts --verify
node --env-file=.env apps/api/scripts/teacher-demo-verify.mjs
```

Sebelum apply berikutnya setelah backup expired, gunakan mekanisme backup repo existing untuk target yang sama dan perbarui receipt; jangan mencoba mengakali guard atau mengeksekusi SQL langsung. API verifier mengharuskan API development lokal di `http://localhost:3001/api/v1`. Untuk Teacher B QA dengan password fixture stale, verifier memvalidasi existing ID/email/QA marker/email provider sebelum menghasilkan Admin login link dan menukarnya dengan session Supabase; tidak mengirim email, mengganti password, atau mencetak token. Session verifier sendiri di-sign-out saat selesai.

Referensi resmi yang diperiksa: [Database seeding](https://supabase.com/docs/guides/local-development/seeding-your-database), [Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Admin generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), dan [PostgreSQL changelog](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). Runner membaca schema live dan tidak menerapkan perubahan dari changelog.

## G. Verification

`teacher-demo-seed.ts` menyertakan query verifikasi yang benar-benar dijalankan, termasuk COUNT active memberships, AVG/bands completed attempts, feedback read rate, activity EXISTS per Student, progress state distribution, raw scoring dari answer keys, latest/best dari attempt history, snapshot versions, unlock prerequisite, retry variant, Auth ownership dan validitas school token.

| Check                                                   | Executed result                                                                                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classes/unique Students/active memberships              | 34/32/32, 98/98; existing one-active-class unique index tetap berlaku                                                                                            |
| Tryout submissions, items/answers, average/distribution | Dua batch 30/4; 35 jawaban per submission; past AVG 81.4 dan bands 8/12/6/4                                                                                      |
| Pending/released API gating                             | Past history `ready`, Alya score 97; active `waitingIrt`, score null; active result GET 409                                                                      |
| Feedback/timestamps/ownership                           | 42/38/4, 90.48%, valid class/student relation                                                                                                                    |
| Weekly activity and Drill states                        | 28/34, 82.35%; progress/attempt counts sesuai C                                                                                                                  |
| Raw score/mastery/versions/variants                     | Semua assertions lulus; latest 70/best 90 tetap mastered; Siti belum mastered; retry variant berbeda                                                             |
| DEMO IRT evidence                                       | 35 item, masing-masing 30 jawaban nyata synthetic; scientific parameters null dan measurement UNCALIBRATED                                                       |
| Auth provisioning rerun                                 | Tetap 99 akun demo; global Auth count 126, tanpa duplikasi/password reset                                                                                        |
| Seed rerun                                              | Counts/payload tetap sama, tidak menambah membership/attempt/feedback/audit/outbox                                                                               |
| Isolated integration test                               | PASS; full seed dua kali, konflik ditolak, seluruh transaksi test rollback; fingerprint clone unchanged                                                          |
| Node safety tests                                       | 3 PASS: environment, server key, Auth identity conflict                                                                                                          |
| Lint                                                    | Full repository lint PASS; scoped new seed/verifier lint PASS                                                                                                    |
| Database typecheck/build                                | PASS                                                                                                                                                             |
| Full repository typecheck/build                         | Terhalang error existing `apps/web/e2e/materials-notifications.spec.ts:437`: TS2769, `cors` bukan property `Partial<ServerOptions>`; tidak diubah pada fase seed |

API verifier: 22 pemeriksaan lulus. Pak Budi dan Teacher B sama-sama verified; Pak Budi dapat membaca tiga kelas dan roster 34/32/32. Teacher B mendapat 403 pada roster/progress kelas Pak Budi dan 404 pada feedback siswa tersebut. Student mendapat 403 pada Teacher/admin endpoints; anonymous 401. Teacher mendapat 403 pada endpoint Student notifications. Role PostgreSQL `anon` dan `authenticated` mendapat `42501` saat membaca `public.users`.

Global database setelah seluruh seed: 126 Auth users, 124 application profiles, 8 schools, 23 classes, 326 assessment attempts. Counts initial masing-masing 27, 25, 7, 20, 22 dipertahankan sebagai rows existing. Bukti runtime di `.qa-seed/teacher-demo/verification.json` dan `api-verification.json` tidak mengandung credential, tetap ignored.

## H. Security check

**RLS tidak dilemahkan.** Seluruh 89 public tables tetap RLS aktif; security/schema/migration fingerprint before/after sama: `3471e493bb8e327b550431dca1e3002f5105df0a6a64ab4d61603589b9672470`. Existing non-demo row counts dan ordered row digests sama sebelum/sesudah transaksi. Foreign keys, constraints, indexes, triggers, grants dan policies tidak berubah.

Existing policy `numora_main_access` dengan `USING(true)` hanya untuk role backend internal `numora_main_runtime`; seed tidak menambah/memperluasnya. `anon`/`authenticated` tidak diberi product-table grants. Authorization lintas Teacher diuji melalui NestJS dengan session Auth asli. Tidak ada service-role key di frontend/`NEXT_PUBLIC_*`/committed files; guard menolak kondisi tersebut. Tidak ada production write, penghapusan data existing, RLS disable atau fake Google identity.

Phase 0 selesai pada seed, verifikasi dan gap report. Pada saat laporan fase ini dibuat, UI implementation menunggu persetujuan berikutnya.

**ENGINEERING VERIFICATION — tindak lanjut 4 Oktober 2026:** owner kemudian mengizinkan seluruh fase frontend Teacher dilanjutkan tanpa review per fase. [Connected QA](../../../docs/design/TEACHER_CONNECTED_QA_2026-10-04.md) telah lulus menggunakan Auth/API development nyata, dengan business rows tetap sama. Full repository lint, typecheck dan build kini PASS; blocker typecheck pada tabel G adalah catatan historis fase seed. Tidak ada perubahan tambahan pada schema/RLS atau data seed dalam tindak lanjut ini.

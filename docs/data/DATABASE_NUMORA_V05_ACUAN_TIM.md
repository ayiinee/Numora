# Numora - Acuan Database PRD v0.5

29 September 2026 | Skema dan migrasi di repo | Staging termigrasi; Production belum

## Aturan pemakaian

- PRD v0.5 (28 September 2026) menentukan perilaku produk. PDF BIG DATA - Data & Analytics menjadi model konseptual awal. ADR PostgreSQL, Drizzle, outbox, versioning dan XP ledger menentukan teknik. Dokumen repo yang masih v0.4 harus diselaraskan sebelum aturan lama diterapkan dalam kode.
- Status Ada berarti tabel dan atribut intinya sudah didefinisikan dalam schema Drizzle serta migrasi repo. Numora-Staging sudah diverifikasi memiliki 46 tabel, tetapi Production belum dimigrasi dan aturan bisnis/API belum seluruhnya diimplementasikan. Tanda ? berarti nullable/opsional. PK/FK/UQ adalah primary key, foreign key, unique.
- Nama tabel ini adalah kontrak fisik rancangan pada repo. Verifikasi riwayat migrasi di staging sebelum tim mulai melakukan query; constraint lintas entitas tetap memerlukan transaksi dan validasi Backend.

## Relasi dan batas transaksi

- users -> class_memberships -> classes -> schools; teacher_verification_tokens -> teacher_school_memberships -> classes. Tipe siswa Mandiri/Sekolah diturunkan dari keanggotaan kelas aktif.
- chapters -> subchapters -> competencies/levels -> questions -> question_variants -> question_versions -> package_items -> assessment_attempts/attempt_items -> attempt_answers. Versi soal yang sudah dipakai tetap tersedia untuk hasil historis.
- Finalisasi asesmen harus atomik: kunci percobaan, nilai final, progres, XP ledger, analytics_outbox. Konsumsi token + afiliasi guru dan join kelas + cek satu kelas juga harus atomik. PvP finalisasi hasil + rekor + outbox harus idempoten.
- Aturan lintas tabel (role, pemilik kelas, status konten, validitas paket) tidak selesai dengan FK sederhana; Backend wajib validasi server-side dalam transaksi. CHECK dipakai untuk rentang/status/tanggal satu baris, UQ parsial untuk keanggotaan aktif dan pretest sekali per bab.

## Aturan v0.5 yang memengaruhi data

- Drill: 10 soal per sesi, 5 level per subbab sebagai baseline, skor >=80 membuka level berikut; bintang 1 untuk 10-50, 2 untuk 60-90, 3 untuk 100; XP = benar x 100 + max(0, (15 - menit) x 10). Formula XP final tetap OPEN-11.
- Pretest: opsional, 20 soal per bab, sekali per bab, tidak memberi XP; dapat membuka maksimal tiga level/subbab bila semua benar. Pemetaan parsial masih OPEN-01 sampai OPEN-03.
- Tryout: paket baru Senin 00:00 WIB, paket sama untuk seluruh peserta pada periode sama, satu pengerjaan per siswa per paket; paket lama ditutup. Hasil/pembahasan menunggu IRT batch setelah periode berakhir (maksimum 3 x 24 jam). Pembayaran siswa Mandiri ditunda dari MVP.
- PvP: dua siswa termasuk lintas tipe, 10 soal, server-authoritative, satu jawaban/pemain/soal, reconnect 20 detik; forfeit tidak menjadi rekor. Leaderboard kelas hanya XP drill+tryout; leaderboard global PvP memakai best valid score per kesulitan; keduanya update per jam dan arsip Rabu 23:59 WIB.
- Semua timestamp tahan lama disimpan sebagai timestamptz UTC; jadwal bisnis dihitung dalam Asia/Jakarta. Penilaian, soal dan paket historis tidak dihitung ulang setelah revisi.

## A. Akun, sekolah, dan kelas

| Entitas | Status | Atribut inti | Relasi/fungsi | Constraint/catatan |
|---|---|---|---|---|
| users | Ada | id PK, auth_user_id UQ, role, display_name, email, status, created_at, updated_at | Akun siswa/guru/admin; auth_user_id mengacu identitas Supabase Auth. | Role tetap; email unik sesuai kebijakan akun; siswa mandiri diturunkan dari ketiadaan keanggotaan aktif. |
| schools | Ada | id PK, code UQ, name, address?, status, created_at, updated_at | Induk afiliasi guru dan kelas. | Kode dan nama tidak boleh kosong; address opsional. |
| teacher_verification_tokens | Ada | id PK, school_id FK, token_hash UQ, created_by_user_id FK, created_at, expires_at, used_at?, used_by_user_id?, revoked_at? | Token verifikasi guru untuk satu sekolah. | Sekali pakai; berlaku 3 x 24 jam; konsumsi atomik; hash, bukan plaintext; used_at/used_by konsisten. |
| teacher_school_memberships | Ada | id PK, teacher_user_id FK, school_id FK, verification_token_id FK UQ, verified_at, ended_at? | Afiliasi guru setelah verifikasi token. | Afiliasi aktif wajib untuk membuat kelas. Aturan guru di banyak sekolah perlu keputusan sebelum indeks diperketat. |
| classes | Ada | id PK, school_id FK, teacher_user_id FK, name, join_code UQ, created_at, updated_at, archived_at? | Kelas milik guru pada sekolah tertentu. | Guru harus memiliki afiliasi aktif ke sekolah yang sama; kode join unik. |
| class_memberships | Ada | id PK, class_id FK, student_user_id FK, joined_at, left_at? | Riwayat siswa bergabung ke kelas. | Indeks unik parsial: satu keanggotaan aktif per siswa; jangan hapus riwayat. |
| account_restrictions | Ada | id PK, user_id FK, reason, starts_at, ends_at?, revoked_at?, actor_admin_id FK | Jejak ban/unban tanpa menghapus akun. | Efek ban menunggu OPEN-13; jangan tetapkan perilaku akses diam-diam. |

## B. Materi, soal, dan generator

| Entitas | Status | Atribut inti | Relasi/fungsi | Constraint/catatan |
|---|---|---|---|---|
| chapters | Ada | id PK, code UQ, name, description?, display_order, status | Bab materi TKA Matematika. | Daftar final menunggu Curriculum/PO OPEN-01. |
| subchapters | Ada | id PK, chapter_id FK, code, name, description?, display_order, status | Subbab berada pada satu bab. | UQ (chapter_id, code) dan (chapter_id, display_order). |
| competencies | Ada | id PK, subchapter_id FK, code, description, status | Kompetensi yang diukur soal. | UQ (subchapter_id, code); status kurikulum tervalidasi. |
| levels | Ada | id PK, subchapter_id FK, level_number, description?, difficulty_criteria?, status | Tahap drill tiap subbab. | UQ (subchapter_id, level_number); level_number > 0; baseline 5 level/subbab PRD v0.5. |
| questions | Ada | id PK, primary_competency_id FK, source_ref?, created_at, status | Identitas keluarga soal; tidak menyimpan isi revisi. | Original dan varian berbagi keluarga/lineage. Referensi sumber opsional. |
| question_variants | Ada | id PK, question_id FK, original_variant_id? FK, variant_code, kind, origin, generation_run_id? FK | Original dan candidate varian setara dari satu keluarga. | UQ (question_id, variant_code); parent original tetap; candidate belum otomatis READY. |
| question_versions | Ada | id PK, variant_id FK, version_number, question_type, stem, options_or_statements, answer_key, explanation, media?, difficulty, content_status, reviewed_by?, created_at | Isi soal, kunci, dan pembahasan konkret yang dapat dipakai paket. | UQ (variant_id, version_number); versi terpakai immutable; READY perlu kunci, pembahasan, metadata, review akademik. |
| generator_configs | Ada | id PK, template_or_competency_id, config_version, parameters_json, curriculum_limits_json, created_at | Versi konfigurasi generator soal. | UQ (template_or_competency_id, config_version); jangan mengubah config versi lama. |
| generation_runs | Ada | id PK, config_id FK, original_question_version_id FK, generator_version, random_seed, parameter_values_json, started_at, finished_at?, status | Provenance setiap proses generate/regenerate. | Seed dan config version wajib agar hasil dapat direproduksi; simpan run gagal. |
| variant_evaluations | Ada | id PK, candidate_question_version_id FK, original_question_version_id FK, calibration_run_id? FK, delta_a?, delta_b?, delta_d?, decision, reviewed_by?, evaluated_at | Hasil compare PASS/DRIFT/ANOMALY/NOT_ENOUGH_DATA. | Threshold belum final; bukan alasan untuk mengubah hasil historis atau original. |

## C. Paket, pengerjaan, dan progres

| Entitas | Status | Atribut inti | Relasi/fungsi | Constraint/catatan |
|---|---|---|---|---|
| assessment_packages | Ada | id PK, family_code, package_version, name, assessment_type, chapter_id? FK, level_id? FK, variant_index?, duration_seconds?, scoring_policy_version_id? FK, release_at?, close_at?, status | Paket PRETEST, DRILL, TRYOUT, atau PVP. | UQ (family_code, package_version); item paket terbit tidak dimutasi; tryout satu paket aktif per periode WIB. |
| package_items | Ada | id PK, package_id FK, question_version_id FK, display_order, max_points | Urutan soal tetap dalam paket. | UQ (package_id, display_order); max_points > 0; FK ke versi soal konkret. |
| scoring_policy_versions | Ada | id PK, policy_code, version, configuration_json, effective_at, status | Aturan skor historis yang diacu paket/percobaan. | UQ (policy_code, version); PG dapat berjalan; rubrik PGK menunggu OPEN-04. |
| assessment_attempts | Ada | id PK, student_id FK, package_id FK, assessment_type, chapter_id_at_start? FK, class_id_at_start? FK, scoring_policy_version_id? FK, started_at, deadline_at?, finished_at?, status, raw_points?, score_0_100?, stars? | Satu sesi pretest/drill/tryout, dengan snapshot konteks. | Pretest UQ siswa+bab; tryout UQ siswa+paket; tipe attempt wajib cocok dengan paket; skor 0..100; finalisasi idempoten. |
| attempt_items | Ada | id PK, attempt_id FK, package_id, package_item_id FK, question_version_id FK, display_order, max_points | Snapshot urutan/versi soal yang diberikan ke siswa. | UQ (attempt_id, display_order); FK komposit memastikan item berasal dari paket attempt dan versi soal cocok. |
| attempt_answers | Ada | id PK, attempt_item_id FK UQ, answer_json, saved_at, awarded_points?, graded_at? | Jawaban tersimpan per item percobaan. | Boleh diubah sebelum finalisasi; sesudah final dikunci; satu jawaban per item. |
| level_progress | Ada | id PK, student_id FK, level_id FK, unlocked_at?, completed_at?, unlock_source, unlocking_attempt_id? FK, completion_attempt_id? FK, latest_score?, best_score?, best_stars? | Akses dan ketuntasan level independen dari percobaan. | UQ (student_id, level_id); unlock >=80% drill; akses yang sudah terbuka tidak ditutup kembali. |

## D. PvP dan leaderboard

| Entitas | Status | Atribut inti | Relasi/fungsi | Constraint/catatan |
|---|---|---|---|---|
| pvp_matches | Ada | id PK, room_code UQ, package_id FK, creator_student_id FK, difficulty, status, started_at?, ended_at?, end_reason?, record_eligible, scoring_snapshot_json | Room dan hasil pertandingan 1v1. | Paket/urutan sama bagi pemain; server menentukan waktu dan skor; forfeit tidak layak rekor. |
| pvp_players | Ada | id PK, match_id FK, student_id FK, player_slot, ready_status, connection_status, disconnected_at?, reconnect_deadline_at?, total_points?, result? | Dua peserta pertandingan. | UQ (match_id, student_id) dan (match_id, player_slot); maksimal dua slot. |
| pvp_match_questions | Ada | id PK, match_id FK, package_id, package_item_id FK, display_order, started_at?, deadline_at?, status | Satu jadwal soal bersama bagi dua pemain. | UQ (match_id, display_order); FK komposit menjaga item dalam paket match; timer otoritatif server. |
| pvp_answers | Ada | id PK, player_id FK, match_id, match_question_id FK, answer_json, received_at, base_points, speed_bonus | Jawaban dan poin setiap pemain per soal. | UQ (player_id, match_question_id); FK komposit memastikan pemain dan soal dalam match yang sama. |
| pvp_invites | Ada | id PK, match_id FK, class_id_at_invite FK, sender_student_id FK, recipient_student_id FK, status, created_at, expires_at?, responded_at? | Undangan teman sekelas; room code tetap dapat bekerja tanpa baris ini. | UQ undangan PENDING per penerima/match; kelayakan sesama kelas dan masa kedaluwarsa final masih butuh validasi Backend/OPEN-07. |
| xp_ledger | Ada | id PK, student_id FK, class_id_at_event? FK, source_type, attempt_id FK, xp_amount, occurred_at, period_id? FK | Sumber kebenaran XP drill/tryout, immutable. | UQ attempt_id; FK komposit memastikan attempt milik student; XP >=0; pretest/PvP tidak masuk ledger kelas. |
| leaderboard_periods | Ada | id PK, starts_at, ends_at, timezone, status, archived_at? | Periode aktif/arsip leaderboard. | Rabu 23:59 WIB tutup/arsip; periode lama tidak dihapus; rentang tidak overlap. |
| class_leaderboard_entries | Ada | id PK, period_id FK, class_id FK, student_id FK, total_xp, rank, updated_at | Proyeksi akumulasi XP kelas. | UQ (period_id, class_id, student_id); hanya drill+tryout; dapat dibangun ulang dari ledger. |
| pvp_best_records | Ada | id PK, period_id FK, student_id FK, difficulty, match_id FK, best_points, achieved_at | Best XP PvP per kesulitan/periode. | UQ (period_id, student_id, difficulty); update hanya bila pertandingan valid dan skor membaik. |
| pvp_leaderboard_entries | Ada | id PK, period_id FK, student_id FK, difficulty, best_points, rank, updated_at | Proyeksi ranking PvP global. | UQ (period_id, student_id, difficulty); termasuk Mandiri dan Sekolah; top 20 + posisi sendiri. |

## E. Dukungan belajar, laporan, dan operasi

| Entitas | Status | Atribut inti | Relasi/fungsi | Constraint/catatan |
|---|---|---|---|---|
| feedback | Ada | id PK, teacher_id FK, student_id FK, class_id_at_send FK, body, sent_at, read_at? | Catatan guru satu arah yang historis. | 1..1000 karakter; guru harus memiliki kelas siswa saat kirim; siswa tidak membalas. |
| learning_videos | Ada | id PK, title, url, source, curation_status, created_at, updated_at | Video rekomendasi yang telah dikurasi. | Simpan metadata; pencarian tidak dilakukan realtime saat siswa membuka hasil. |
| video_subchapter_mappings | Ada | id PK, video_id FK, subchapter_id FK, recommendation_order, status | Pemetaan video ke subbab. | UQ (video_id, subchapter_id); maksimal tiga ditampilkan per subbab. |
| question_reports | Ada | id PK, reporter_student_id FK, attempt_answer_id FK, category, details?, status, follow_up?, reported_at | Laporan soal yang benar-benar dikerjakan. | FK ke jawaban memastikan versi soal historis dapat ditelusuri. |
| video_reports | Ada | id PK, reporter_student_id FK, mapping_id FK, category, details?, status, follow_up?, reported_at | Laporan relevansi video pada subbab. | Pemetaan historis perlu dijaga bila admin mengganti tautan/video. |
| analytics_outbox | Ada | id PK, event_name, event_version, actor_user_id? FK, entity_type, entity_id?, correlation_id?, payload_json, occurred_at, processed_at?, failed_at? | Event domain yang ditulis dalam transaksi bisnis. | ID unik; worker at-least-once; payload tidak berisi token atau PII yang tak perlu. |
| analytics_events | Ada | event_id PK, event_name, event_version, actor_user_id? FK, occurred_at, entity_type, entity_id?, payload_json | Log peristiwa analitik hasil konsumsi outbox. | Event ID sama dengan outbox untuk idempotensi; skema payload harus disepakati. |
| audit_logs | Ada | id PK, actor_user_id? FK, action, entity_type, entity_id?, metadata_json, created_at | Jejak tindakan admin dan perubahan penting. | Append-only secara aplikasi; beda dari event analitik. |
| irt_batches | Ada | id PK, package_id? FK, batch_kind, model_version, status, started_at, finished_at?, result_released_at? | Proses IRT harian atau penutupan paket tryout. | Jenis batch dibedakan; hasil tryout terbuka setelah batch paket valid, paling lambat 3 x 24 jam menurut PRD. |
| irt_item_results | Ada | id PK, batch_id FK, question_version_id FK, sample_size, difficulty_b?, discrimination_a?, guessing_c?, standard_error_json?, scale_id?, data_status | Parameter kualitas versi soal dari batch tertentu. | UQ (batch_id, question_version_id); tampilkan hanya jika sampel >=30 dan status valid; tidak ubah nilai lama. |
| calibration_runs | Ada | id PK, item_role, anchor_scale_id?, model_version, sample_size, status, started_at, finished_at?, notes? | Kalibrasi original/varian pada skala yang dapat dibandingkan. | Simpan anchor/theta/metode dan ketidakpastian; angka drift threshold masih keputusan Data+Curriculum. |

## Alur original - kalibrasi - varian

- Original yang divalidasi Curriculum menjadi baseline. Kalibrasi respons siswa menghasilkan parameter dan ketidakpastian. Generator membuat candidate dengan random seed, versi config, parameter terpakai dan relasi ke original. Candidate melewati validasi statis, uji, compare, review, lalu READY atau DRIFT/ANOMALY/NOT_ENOUGH_DATA.
- Perbandingan a, b, dan D hanya bermakna pada skala yang sama dengan anchor/theta yang terdokumentasi. Batas PASS/DRIFT, jumlah regenerate otomatis dan konfigurasi adjustment belum final. Candidate gagal disimpan; original dan hasil lama tidak ditulis ulang.
- Demo tanpa >=30 respons valid memakai fixture berlabel DEMO atau status Data belum cukup; jangan menampilkan parameter simulasi sebagai IRT empiris yang sah.

## Seed demo minimum dan pemilik data

- Onboarding/Data: 1 sekolah, 1 admin, 1 guru terverifikasi, 3 siswa Sekolah, 1 siswa Mandiri, 1 kelas, token belum dipakai/terpakai/kedaluwarsa. Auth ID akun yang dipakai login harus cocok dengan Supabase Auth, bukan UUID placeholder semata.
- Curriculum/Admin/Data-AI: 1 bab, 2 subbab, 5 level per subbab, kompetensi, original PG, sedikitnya 2 varian untuk level yang didemokan, versi soal READY dan DRAFT, kunci/pembahasan. Konten dummy ditandai DEMO dan direview sebelum dipakai UI.
- Core Learning: paket pretest 20 soal, dua paket drill 10 soal untuk variasi ulang, satu paket tryout mingguan demo dengan item tetap; percobaan selesai pada nilai 70, 80, 100 dan percobaan berjalan. Spesifikasi tryout resmi menunggu OPEN-05.
- Monitoring: progres berbeda antarsiswa, dua feedback dengan status baca berbeda, laporan soal dan video. PvP: paket 10 soal per kesulitan yang didemokan, pertandingan selesai, disconnect/reconnect dan forfeit; periode leaderboard aktif dan arsip. Data/AI: generation run, candidate, tiga video relevan per subbab bila ada, IRT DEMO/NOT_ENOUGH_DATA.
- Seed harus deterministik dan idempoten, dipisah base/demo. QA membutuhkan kasus penolakan: token expired/dipakai, siswa di dua kelas, tryout paket sama dua kali, soal DRAFT, jawaban PvP ganda, guru membaca kelas lain.

## Keputusan terbuka yang tidak boleh ditebak

- OPEN-01..03 taksonomi dan pemetaan pretest; OPEN-04 rubrik PGK; OPEN-05 spesifikasi tryout resmi; OPEN-07 edge PvP; OPEN-11 formula XP final; OPEN-12 model/parameter IRT; OPEN-13 efek ban; OPEN-15 perpindahan Sekolah/Mandiri; OPEN-18 durasi batch IRT paket tryout. Untuk demo gunakan fixture/policy versi DEMO, jangan memasarkan sebagai keputusan final.
- Khusus desain DB: perlu keputusan apakah satu guru dapat aktif di lebih dari satu sekolah; apakah revisi paket pretest tetap menghitung kesempatan yang sama per bab; bagaimana snapshot kelas saat siswa pindah. Simpan fleksibilitas sampai keputusan ada.

## Sumber

- PRD_v0.5.docx.pdf (diberikan pengguna).
- BIG DATA - Data & Analytics.pdf (diberikan pengguna).
- Workflow_Original_Kalibrasi_Generate_Uji_Compare_Adjust_Regenerate.docx (diberikan pengguna).
- Repo Numora: docs/adr/ADR-003, 004, 007, 008, 009 dan packages/database/src/schema.

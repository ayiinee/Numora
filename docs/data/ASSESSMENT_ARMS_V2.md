# Assessment arms v2 — fondasi schema

ENGINEERING IMPLEMENTATION — tahap 4, 8 November 2026. Acuan kebijakan tetap `docs/AI_IRT_V2_CONTEXT.md`. Perubahan ini tidak mengalihkan routing siswa.

## Model dan guard

- `assessment_arm_sets` memin context, blueprint dan policy yang disetujui. Drill mempunyai tepat satu ORIGINAL dan satu VARIANT; Tryout mendukung satu ORIGINAL dan beberapa VARIANT.
- Identitas arm persisten; `assessment_arm_revisions` memin paket immutable. Aktivasi memakai compare-and-swap, sementara delivery attempt tetap menunjuk revisi lama. Retry berikutnya dapat memakai revisi aktif baru.
- Blueprint SEALED wajib memuat `anchorQuestionVersionIds` dan `familyIds` yang diurutkan UUID. Guard memverifikasi 3+7 Drill atau 5+25 Tryout, versi anchor identik dan roster keluarga sama. Soal focal VARIANT memerlukan lineage original.
- Persetujuan komposisi diverifikasi terhadap digest item sebenarnya. READY/CONTENT_VALID dan rubrik SEALED merupakan prasyarat terpisah dari hasil Compare. PROVISIONAL tidak memerlukan PASS; READY memerlukan artifact COMPARE_VARIANTS PASS yang telah diadopsi untuk context/paket yang sama.
- `tryout_batch_packages` membekukan keanggotaan ketika batch dibuka. Anchor dan revisi Tryout tidak dapat diganti setelah set dibuka. Satu siswa hanya dapat mempunyai satu attempt per batch, walaupun memilih arm lain.
- Assignment immutable menyimpan assigned arm, fakta exposure dan kelayakan evidence pertama. Attempt delivery menyimpan actual revision serta alasan original fallback. Fallback hanya untuk Drill bila variant tidak distributable dan policy mengizinkan; assignment tidak berubah.
- Eksperimen baru tidak menghapus bukti attempt lama. Exposure lintas fitur Drill dicatat tanpa mengecualikan akses belajar. Nama `first_valid_evidence` adalah flag eligibility konservatif saat assignment, bukan penetapan bahwa respons statistik sudah valid; pipeline evidence tetap memvalidasi submission dan kualitas data.
- Status konten, pengukuran, perbandingan dan distribusi existing tetap terpisah. Tidak ada rewrite histori, policy XP atau hasil.

`getOrAssignAssessmentArm` dan `activateAssessmentArmRevision` adalah primitive internal main-service, bukan endpoint publik. Pemanggil wajib mengotorisasi actor/student. Routing existing secara eksplisit mengecualikan paket ber-arm; mengaktifkannya memerlukan implementasi routing pada tahap berikutnya. Compute tidak mempunyai hak menulis tabel ini; RLS/grants mengikuti boundary main runtime existing.

## Verifikasi lokal

```powershell
node node_modules/typescript/bin/tsc -p packages/database/tsconfig.build.json
$env:POSTGRES_BIN='C:\Program Files\PostgreSQL\16\bin'
python -B scripts/test-assessment-arms-local.py
```

Harness membuat cluster loopback sementara, memasang migrasi sampai 0050, menambah histori TEST ONLY, meng-upgrade dengan migrator canonical, menjalankan 12 tes guard (termasuk role main/compute, assignment bersamaan, fallback, pergantian revisi dan Tryout tiga arm), lalu menguji instalasi baru dan menghentikan cluster. Tidak membaca `.env`. Fixture tidak memberikan approval pada bank development.

## Penerapan dan pemulihan

Migration forward `0051_assessment_arms_v2.sql` dimiliki repo utama, termasuk journal, fungsi dan grants. Pada pekerjaan ini hanya diterapkan di cluster disposable. Sebelum penerapan nyata, tim Software harus mereview DDL dan menjalankan upgrade-check terhadap salinan histori yang disanitasi. Tidak ada DROP/UPDATE atas histori attempt atau XP.

Rollback operasional: biarkan routing v2 tidak aktif; hentikan pembuatan arm/set baru. Jangan menghapus delivery/assignment atau menjalankan down migration yang membuang histori. Koreksi schema berikutnya harus berupa migration forward.

Produksi masih membutuhkan blueprint/anchor Curriculum yang nyata, policy dan approval komposisi yang sah. Fixture tidak boleh dipromosikan. Handoff generator tahap 5 dan routing siswa merupakan pekerjaan terpisah.

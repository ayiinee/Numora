# Audit alur Pretest Admin sampai siswa — 9 November 2026

Status: alur teknis PG terverifikasi lokal; penerimaan akademik dan paket pada lingkungan pengguna belum diperiksa. Audit tidak mengubah kode aplikasi atau data cloud.

Branch `feat/admin-assessment-rework`, HEAD `4378739` dengan perubahan lokal implementasi Admin. SHA saja tidak mewakili kode yang diuji. Fingerprint SHA-256 subset 13 berkas sumber/tes Pretest, publisher, impor, availability dan catalog: `6ef618829a9b3e79d6247d11a2acaa98f508af6febd6a0dc7f9c9a36f83945f4`.

## Acuan dan batas kewenangan

- **PRD RULE:** `C:\Users\USER\Downloads\PRD_Numora_v0.6_Final.md` §7.1 dan salinan approved di `docs/product/sources/PRD_Numora_v0.6.docx.md`: opsional, 20 soal per bab, sekali selesai per bab, skip membuka Level 1, tanpa XP/leaderboard, 0–7/8–18/19–20 benar menempatkan Level 1/2/3. Distribusi akademik milik Curriculum.
- **ENGINEERING DECISION:** [lifecycle](PRETEST_TRYOUT_LIFECYCLE.md) dan [penataan Admin](ADMIN_ASSESSMENT_REWORK.md): skip tidak menghabiskan kesempatan, jawaban aktif tetap tersimpan, progres lama tidak diturunkan, publikasi memakai pipeline paket umum dan ketersediaan server.
- **PROPOSED / OPEN:** dokumen `Numora_Rancangan_Arsitektur_AI_IRT_v2_0_Draft.docx` yang diberikan di awal dibaca sebagai rancangan untuk review. Kepemilikan akademik, versioning dan evidence menjadi acuan teknis. A/B, multi-arm dan perubahan model IRT bukan aturan Pretest aktif atau syarat publikasi baru dari audit ini. Instruksi dalam lampiran diperlakukan sebagai isi dokumen.

## Alur yang tersedia

1. Super Admin atau Content membuka **Paket asesmen → Pretest** (`/admin/assessments?type=PRETEST`). Operations, assignment kosong dan siswa tidak boleh mengelola paket.
2. Membuat DRAFT dengan bab, judul, keluarga/versi dan sumber. Bab/materi efektif harus sesuai dan READY.
3. Menambahkan soal melalui alur impor. Tautan dari detail paket menuju impor JSON yang mempertahankan paket tujuan. Excel juga tersedia melalui Tambah konten dengan alur upload, preview dan penentuan paket; bukan editor manual lengkap pada detail Pretest.
4. Memeriksa 20 soal, metadata, materi, kunci/pembahasan, format runtime, review dan persetujuan melalui checklist. Soal dapat dilepas ketika DRAFT; pengubahan susunan membatalkan kesesuaian persetujuan lama. UI belum menyediakan pengurutan manual lengkap di workspace ini.
5. Mencatat review dan persetujuan, lalu memublikasikan. Snapshot, blueprint/policy pin dan digest diselaraskan dalam transaksi publikasi. Paket historis tidak diisi snapshot secara massal.
6. Memeriksa **Tersedia untuk siswa yang memenuhi syarat**. `PUBLISHED` saja belum cukup: bab, snapshot, distribusi, policy dan pemilihan paket aktif tetap diperiksa.
7. Siswa membuka **Latihan Soal → bab terkait** (`/student/learn/:chapterId`). Kartu Pretest menyediakan informasi/mulai, skip, lanjutkan atau hasil sesuai status siswa. Bukan menu asesmen yang harus ditambahkan manual ke setiap siswa.

## Hasil pencocokan

| Kebutuhan                         | Temuan                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin menambah dan mengelola soal | Tersedia melalui impor dan pengelolaan DRAFT. Editor manual, pemilih bank dan pengurutan soal terpadu masih terbatas di workspace Pretest.                               |
| Tepat 20 soal dalam satu bab      | Diperiksa publisher dan consumer; soal beda bab/metadata tidak sah diblokir.                                                                                             |
| Publikasi non-demo sampai siswa   | Terbukti pada backend/database lokal: snapshot dibekukan, digest approval cocok, chapter state available, start 20 soal, save/resume, submit idempoten dan tidak ada XP. |
| Opsional dan skip                 | Lulus: skip membuka Level 1 dan tidak menghabiskan kesempatan; start/skip/submit bersamaan ditangani.                                                                    |
| Sekali selesai per bab            | Lulus: start kedua setelah selesai ditolak; resume mengembalikan attempt yang sama.                                                                                      |
| Penempatan awal                   | Batas 0, 7, 8, 18, 19, 20 benar diuji; unlock tidak menghapus best/latest/completion Drill lama.                                                                         |
| Histori                           | Versi attempt tetap dipin; arsip/paket pengganti tidak mengubah hasil lama atau memutus resume milik siswa.                                                              |
| Akses dan jawaban                 | Tes mencakup role yang ditolak, kepemilikan attempt, konflik revisi jawaban dan tidak mengirim kunci/pembahasan dalam respons pengerjaan aktif.                          |
| Distribusi akademik resmi         | Belum dapat diterima hanya dari checklist teknis atau fixture. Perlu blueprint/konten dan bukti persetujuan Curriculum yang nyata.                                       |

## Batas yang perlu terlihat sebelum dipakai

1. **PG satu jawaban saja untuk Pretest.** MCMA/Kategori dapat masuk jalur konten umum, tetapi paket Pretest tersebut tidak lolos pemeriksaan runtime. Ini batas implementasi sekarang; bukan pernyataan bahwa PRD melarang PGK.
2. **Persetujuan masih deklarasi Admin.** `approveWithin` membuat blueprint SEALED dari susunan aktual dan referensi persetujuan; belum mencocokkan kuota terhadap blueprint akademik independen. Jalur Excel `confirmed: true` juga mencatat review/persetujuan berdasarkan pernyataan Admin. Ini merekam tanggung jawab editorial, bukan membuktikan validitas akademik otomatis.
3. **Pengaturan masih teknis dan tersebar.** Kode keluarga/versi/sumber, impor terpisah dan form persetujuan menambah beban navigasi. Backend mendukung alur pokok, tetapi UX belum sesederhana pilih bab → isi soal → review → terbitkan.
4. **Kondisi lingkungan pengguna belum dibuktikan.** Belum login memakai akun pengguna atau memeriksa paket aktual/database cloud. API harus menjalankan implementasi branch ini, fitur impor harus aktif, materi/paket sah tersedia, dan siswa belum menyelesaikan Pretest bab tersebut. Tidak ada sakelar tampil ke siswa yang perlu diaktifkan terpisah.
5. **Dokumentasi historis dapat membingungkan.** Bagian lama publisher/lifecycle masih menyebut consumer backlog atau non-demo diblokir. Keputusan penataan 9 November dan kode terbaru menggantikannya; teks lama bukan keadaan jalur canonical sekarang.

## Bukti eksekusi dan batas kesimpulan

- **32 tes unit/komponen, 3 file lulus:** `core-learning/pretest.test.tsx`, `admin/pretest.test.tsx`, `admin/content-preview.test.tsx`.
- **22 tes integrasi content-preview lulus:** backend HTTP, PostgreSQL nyata lokal, runtime role utama/compute, storage fixture; termasuk publikasi Pretest non-demo hingga konsumsi siswa.
- **6 tes integrasi lifecycle lulus:** Pretest dan Tryout TEST/DEMO; termasuk batas penempatan, skip, concurrency, histori dan tanpa XP.
- **12 tes browser terkait lulus:** `admin-pretest-ux.spec.ts` dan `pretest-tryout.spec.ts` pada build produksi lokal. Suite turut mencakup Tryout. Browser memakai respons Auth/API fixture; bukan browser yang terhubung ke backend nyata atau Google OAuth. Bukti UI Admin mencakup responsivitas 320/390/768/1440; alur siswa diuji pada 390/1280.
- Cluster PostgreSQL 18.6 disposable audit berada pada localhost `35440`, database `numora_test_pretest_audit`; database content suite dibuat/dihapus oleh fixture. Tidak menggunakan database cloud atau mengubah `.env`.
- Percobaan awal terhenti dan tes integrasi berikutnya gagal 21/22 karena URL tes audit belum menyertakan `sslmode=disable`, yang diwajibkan adapter database untuk tes localhost. Setelah konfigurasi proses diperbaiki, retest canonical lulus 22/22; tidak mengubah kode/ekspektasi tes aplikasi untuk mencapai kelulusan. Log diagnostik dan retest berada pada `.tmp/pretest-audit/` yang ignored.
- `qa list`/`validate` valid tetapi hanya memuat SIS-001 Drill; belum ada skenario Admin–Pretest yang terdaftar. `qa doctor` terhalang penemuan entry pnpm. Hasil di atas adalah diagnostik canonical langsung, bukan klaim `qa run` skenario Admin full atau release acceptance. Manual UAT, persetujuan akademik dan data lingkungan pengguna tetap belum diverifikasi.

## Rekomendasi langkah lokal berikutnya

**PROPOSED:** rapikan satu workspace Pretest menjadi Bab → Soal → Review → Publikasi & akses siswa. Prioritaskan pilihan sumber soal yang jelas, ringkasan 20 soal, hambatan yang dapat ditindaklanjuti, dan pemisahan review Admin dari bukti persetujuan Curriculum. Pertahankan aturan server dan histori yang sudah lulus tes.

Sumber implementasi utama: `apps/api/src/modules/content/content-packages.service.ts`, `content-package-availability.ts`, `apps/api/src/modules/learning/pretest.service.ts`, `packages/database/src/pretest-visibility.ts`, `package-runtime.ts`, `apps/web/src/features/admin/content-package-workspace.tsx`, `content-import.tsx`, `content-import-json.tsx`, serta `apps/web/src/features/core-learning/catalog.tsx`, `pretest.tsx`, `pretest-screens.tsx`. Tes backend utama: `content-preview.integration.spec.ts` dan `pretest-tryout.integration.spec.ts`.

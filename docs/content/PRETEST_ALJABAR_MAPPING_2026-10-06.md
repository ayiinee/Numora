# Pemetaan sampel Pretest Aljabar — 6 Oktober 2026

**PROPOSED — bahan review Curriculum.** Pemetaan di bawah mempertahankan metadata workbook, bukan pengesahan kode, penempatan atau level akademik. Tidak ada perubahan Excel, master database, soal atau publikasi.

Sumber: `C:\Users\user\Downloads\NUMORA_Pretest_Aljabar_10_Soal_V3.xlsx`, sheet PG, MCMA, Kategori dan Kurikulum. Isi lampiran diperlakukan sebagai data sumber; petunjuk dalam workbook bukan instruksi untuk menjalankan seed atau publikasi.

## Hasil pemeriksaan master

**ENGINEERING DECISION / evidence pemeriksaan:** pada 6 Oktober 2026, koneksi `DATABASE_URL` dari `.env` workspace diperiksa dengan transaksi read-only. Master yang terlihat hanya fixture DEMO berikut. Pemeriksaan ini tidak menyatakan isi staging/production atau aplikasi yang memakai koneksi berbeda.

| Bab existing            | Subbab existing    | Indikator existing | Level existing |
| ----------------------- | ------------------ | ------------------ | -------------- |
| DEMO-BILANGAN           | DEMO-OPERASI       | DEMO-OPERASI       | 1, 2           |
| DEMO-UI-ALJABAR         | DEMO-UI-FAKTOR     | DEMO-UI-KUADRAT    | 1–5            |
| DEMO-TEACHER-GEOMETRI   | DEMO-TEACHER-1     | DEMO-TEACHER-1     | 1–5            |
| DEMO-TEACHER-STATISTIKA | DEMO-TEACHER-2     | DEMO-TEACHER-2     | 1–5            |
| NUMORA-PVP-DEMO-V1      | NUMORA-PVP-DEMO-V1 | NUMORA-PVP-DEMO-V1 | Tidak tersedia |

Semua entri yang terlihat berstatus READY. `CH-ALG`, `SC-PPL`, `SC-BA` dan `IND-007`–`IND-010` tidak ditemukan. Karena itu, seluruh 10 kombinasi soal gagal pemeriksaan master. Bab demo kuadrat tidak setara dengan materi persamaan linear/bentuk aljabar pada file; jangan mengganti kode hanya agar validasi lolos.

## Pemetaan per soal

Semua soal menggunakan bab `CH-ALG` (Aljabar). Nomor adalah kolom `no` lintas sheet, bukan nomor baris Excel. Ringkasan topik berasal dari teks soal. Level dan difficulty disalin dari file, belum dikalibrasi atau disahkan ulang.

| No  | Lokasi Excel     | Ringkasan topik                                        | Subbab sumber | Indikator sumber | Level sumber | Difficulty | Status master |
| --- | ---------------- | ------------------------------------------------------ | ------------- | ---------------- | ------------ | ---------- | ------------- |
| 1   | PG baris 2       | Menyelesaikan 3(2x−5)=4x+7                             | SC-PPL        | IND-007          | 2            | EASY       | Belum ada     |
| 2   | PG baris 3       | Menyelesaikan −3x+5>17                                 | SC-PPL        | IND-008          | 2            | EASY       | Belum ada     |
| 3   | PG baris 4       | Model persamaan linear dalam soal umur                 | SC-PPL        | IND-007          | 3            | MEDIUM     | Belum ada     |
| 4   | MCMA baris 2     | Menilai pernyataan tentang sistem dua persamaan linear | SC-PPL        | IND-009          | 3            | MEDIUM     | Belum ada     |
| 5   | Kategori baris 2 | Mengevaluasi kesalahan tanda pertidaksamaan            | SC-PPL        | IND-008          | 5            | HARD       | Belum ada     |
| 6   | PG baris 5       | Menggabungkan suku sejenis                             | SC-BA         | IND-010          | 2            | EASY       | Belum ada     |
| 7   | MCMA baris 3     | Penjabaran dan pemfaktoran bentuk aljabar              | SC-BA         | IND-010          | 4            | MEDIUM     | Belum ada     |
| 8   | PG baris 6       | Menyederhanakan 3(2x−4)−2(x−5)                         | SC-BA         | IND-010          | 3            | MEDIUM     | Belum ada     |
| 9   | MCMA baris 4     | Bentuk aljabar pada ukuran persegi panjang             | SC-BA         | IND-010          | 4            | MEDIUM     | Belum ada     |
| 10  | Kategori baris 3 | Kesetaraan bentuk aljabar                              | SC-BA         | IND-010          | 5            | HARD       | Belum ada     |

Jumlah: 10 soal; 5 PG, 3 MCMA, 2 Kategori. SC-PPL memuat 5 soal dan SC-BA memuat 5 soal. Tabel ini bukan review kebenaran kunci/pembahasan atau blueprint Pretest final.

## Master yang perlu ditinjau

**PROPOSED:** gunakan struktur berikut sebagai bahan konfirmasi, bukan seed siap dijalankan. Nama mengikuti tab Kurikulum workbook. Jika Curriculum mempunyai kode resmi lain, ganti metadata Excel dengan kode resmi dan pertahankan isi soal serta provenance sumber.

| Jenis     | Kode sumber | Nama/deskripsi sumber                                                             | Induk  | Soal terkait |
| --------- | ----------- | --------------------------------------------------------------------------------- | ------ | ------------ |
| Bab       | CH-ALG      | Aljabar                                                                           | —      | 1–10         |
| Subbab    | SC-PPL      | Persamaan dan Pertidaksamaan Linier                                               | CH-ALG | 1–5          |
| Subbab    | SC-BA       | Bentuk Aljabar                                                                    | CH-ALG | 6–10         |
| Indikator | IND-007     | Persamaan linear satu variabel                                                    | SC-PPL | 1, 3         |
| Indikator | IND-008     | Pertidaksamaan linear satu variabel                                               | SC-PPL | 2, 5         |
| Indikator | IND-009     | Sistem persamaan linear dua variabel                                              | SC-PPL | 4            |
| Indikator | IND-010     | Bentuk aljabar dan sifat-sifat operasinya (komutatif, asosiatif, dan distributif) | SC-BA  | 6–10         |

**OPEN — review akademik:** pastikan IND-009 memang ditempatkan dalam SC-PPL; pastikan cakupan IND-010 mencakup penjabaran, pemfaktoran dan penerapan bentuk aljabar pada soal 7/9/10. Kemiripan topik bukan persetujuan penempatan resmi.

Level yang dirujuk file: SC-PPL memakai 2, 3, 5; SC-BA memakai 2, 3, 4, 5. Ini daftar kebutuhan sampel, bukan keputusan menghapus level lainnya. **PRD RULE:** Drill mempunyai lima level per subbab. **OPEN:** pengesahan makna akademik level sumber dan distribusi soal tetap milik Curriculum. Level kognitif dan difficulty tidak menggantikan source_level.

## Cara menyelesaikan

1. Curriculum mengonfirmasi kode/nama, hubungan induk, cakupan indikator dan level sumber pada tabel di atas dengan referensi serta tanggal keputusan. Indikator workbook saat ini berlabel PROPOSED.
2. Jika ada master resmi berbeda, sesuaikan hanya metadata terkait dalam salinan Excel. Jika struktur sumber disetujui dan belum ada, daftarkan melalui alur Admin/API yang berlaku; jangan memodifikasi schema atau mengubah fixture DEMO menjadi kurikulum resmi.
3. Tentukan slug dan display_order berdasarkan urutan resmi serta data existing saat membuat master. Jangan menganggap urutan tabel usulan sebagai urutan final. Status READY memerlukan pengesahan yang sesuai; tabel pemetaan ini tidak memberikannya.
4. Periksa lagi tiap kombinasi bab → subbab → indikator dan level. Backend saat ini mencari level berdasarkan `(subchapter_id, level_number)` serta indikator berdasarkan subbab yang sama; semua entri harus bukan ARCHIVED untuk pemeriksaan scope.
5. Unggah ulang file, jalankan Preview & validasi, lalu simpan sebagai draft setelah seluruh pemeriksaan yang berlaku lolos. Untuk template V5, pilih nama master yang tersedia; V3 memakai kode sumber di tabel ini.

**PRD RULE / batas berikutnya:** Pretest final berisi 20 soal. Sampel 10 soal boleh menjadi bahan draft, bukan paket Pretest lengkap. **OPEN:** publikasi/penilaian PGK tetap mengikuti kesiapan rubrik dan engine yang disetujui. Lolos pemetaan master tidak otomatis berarti layak Publish.

Referensi internal: [alur upload](UPLOAD_FIRST_WORKFLOW.md), [handoff bank soal](../data/QUESTION_BANK_BACKEND_HANDOFF.md), [level kurikulum](../data/CURRICULUM_SLUG_LEVEL_MIGRATIONS_2026-10-03.md). Pemeriksaan scope: `apps/api/src/modules/content/content-import.service.ts`, metode `inspect`.

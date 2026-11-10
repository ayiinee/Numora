# PvP — 30 soal hasil review pemilik, 10 November 2026

**ENGINEERING DECISION — disetujui pemilik, 10 November 2026.** Pemilik menyetujui laporan review 30 kandidat (10 EASY, 10 MEDIUM, 10 HARD) dan tujuh koreksi redaksi/pembahasan, lalu meminta penerusan menjadi versi baru. Persetujuan mencakup klasifikasi editorial ini; bukan kalibrasi empiris/IRT atau aktivasi server official.

Manifest sumber, pengganti, kunci, alasan koreksi dan solusi independen ada pada `apps/api/scripts/data/pvp-owner-reviewed-2026-11-10.json`. Referensi persetujuan: `PROJECT_OWNER_2026_11_10_PVP_30_REVIEW_AND_SEVEN_CORRECTIONS`.

## Koreksi yang disetujui

| Kandidat  | Koreksi                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| EASY-08   | Bak mula-mula kosong, debit konstan.                                                 |
| MEDIUM-03 | Yang ditanya setoran khusus bulan ke-12, bukan saldo kumulatif.                      |
| MEDIUM-04 | Hapus konteks tiga halaman buku yang sedang terbuka.                                 |
| MEDIUM-06 | Lengkapi pembahasan jarak 5 km dan kecepatan minimum 25 km/jam.                      |
| MEDIUM-09 | Langkah pertama memakai perkalian silang; bukan mengalikan kedua ruas dengan KPK 4.  |
| HARD-01   | Total belanja Rp17.000 dan kembalian Rp1.000. Kunci D tetap benar.                   |
| HARD-07   | Setengah lingkaran berada di luar persegi, diameter berimpit tepat dengan satu sisi. |

## Operator terbatas

`apps/api/scripts/release-owner-reviewed-pvp.mjs` secara default READ ONLY. `--rehearse` menjalankan penulisan dalam transaksi yang sengaja dibatalkan; `--apply` membuat 30 versi READY baru dalam satu transaksi. Kedua mode penulisan memerlukan `--actor` operator Content/Data/Moderation existing yang juga menangani seluruh sumber dan rilis original sebelumnya; status aktif dan izin diperiksa kembali. Atribusi adalah eksekusi atas persetujuan pemilik dan review berbantuan AI, bukan klaim bahwa operator melakukan review manual terpisah.

Operator memeriksa digest manifest persetujuan, snapshot sumber, hierarchy READY, tipe PG, media, decoder, kunci/opsi tetap, tepat 10 keluarga per kesulitan dan versi terbaru. Kunci advisory serta lock per varian melindungi alokasi versi. Asal-usul impor dan audit disimpan bersama versi baru, tanpa menyalin keputusan validasi versi lama. Pengulangan memverifikasi rilis existing tanpa menambah versi. Tidak mengubah versi sumber, package items, attempt, hasil, XP, assignment atau pin sesi.

## Batas distribusi

Versi baru masuk bank Drill READY sehingga dapat dipilih PvP strict; paket Drill dan room existing tetap merujuk versi lama yang sudah dipin. Mode sementara memilih hanya versi READY terbaru tiap varian: setelah revisi, 30 keluarga ini keluar dari pool sementara. Tidak ada perubahan bank lain atau perpindahan konfigurasi/restart server oleh operator ini.

**OPEN / dependency:** klasifikasi ini tidak membuktikan kesulitan empiris, kecukupan timer atau kalibrasi IRT. Pengalihan mode strict/official dan penerimaan dua pemain adalah pekerjaan rollout terpisah setelah room aktif selesai. Review ini tidak mengesahkan 545 keluarga sementara lainnya.

## Hasil penerbitan dan verifikasi

**ENGINEERING IMPLEMENTATION — 10 November 2026:** 30 versi baru berhasil diterbitkan ke database Development Supabase yang dikonfigurasi pada `.env`. Semua versi baru READY/CONTENT_VALID. Selector backend `PvpDrillBank('strict')` memverifikasi tepat 10 keluarga EASY, 10 MEDIUM dan 10 HARD; seluruh hasil menunjuk 30 versi rilis ini. Sampling backend memilih 10 keluarga berbeda pada setiap tingkat. Pool sementara menjadi 545 keluarga eligible pada setiap pilihan timer.

Simulasi transaksi 30 versi berhasil dan seluruhnya di-rollback sebelum apply. Apply menyimpan 30 provenance impor serta 30 audit rilis; pemeriksaan hash memastikan seluruh row sumber tetap sama. Pengulangan apply menghasilkan 30 `already-released` tanpa versi tambahan. Digest manifest persetujuan: `a48515b4cb8d46aaa30c3e5ed71731627d01a732a25a91e5be62819b9200bb1a`.

Pemeriksaan sintaks Node, ESLint operator dan format berkas baru lulus. Tidak ada perubahan kode aplikasi runtime, kontrak, schema atau migrasi. Suite/build aplikasi penuh tidak dijalankan untuk operasi konten ini. Bukti lokal tersimpan di `.tmp/pvp-academic-review-2026-11-10/{rehearsal,release,verification,idempotency}.json` dan tidak memuat credential. Konfigurasi tetap `PVP_MODE=demo`, `PVP_CONTENT_MODE=temporary-owner-accepted`; penerbitan ini belum memindahkan PvP yang sedang dilayani ke bank strict. Penerimaan dua pemain/restart/aktivasi official belum dilakukan.

## Batch 2 — persetujuan pemilik

**ENGINEERING DECISION — disetujui pemilik, 10 November 2026:** lanjutkan batch kedua berisi 30 keluarga baru, klasifikasi 7 EASY dan 23 MEDIUM, serta tujuh koreksi dalam laporan batch-02. Dua saran klarifikasi opsional tidak termasuk perubahan yang diterapkan. Ini tidak mengaktifkan mode official dan bukan kalibrasi empiris/IRT.

Manifest: `apps/api/scripts/data/pvp-owner-reviewed-2026-11-10-batch02.json`. Referensi: `PROJECT_OWNER_2026_11_10_PVP_BATCH02_30_REVIEW_AND_SEVEN_CORRECTIONS`. Operator yang sama memakai `--batch=2`; default batch pertama dipertahankan. Kedua batch dibatasi digest manifest dan jumlah klasifikasi yang disetujui masing-masing.

| ID batch 2 | Koreksi yang disetujui                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| B2-08      | Perbaiki baris antara pembahasan saldo yang salah mengubah −40.000 menjadi +40.000.                                            |
| B2-10      | Hapus penanda mentah `[cite:12]`; jelaskan galat dua estimasi secara mandiri.                                                  |
| B2-12      | Tegaskan cashback masuk saldo kartu dan hapus nominal Rp13.000 tanpa asal dalam alasan pengecoh.                               |
| B2-24      | Jelaskan pemilihan substitusi langsung tanpa klaim efisiensi universal atau hitungan dua langkah yang tidak didefinisikan.     |
| B2-25      | Koreksi alasan pengecoh: penjumlahan 6√5 dan 3√5 menghasilkan 9√5, bukan 5√5.                                                  |
| B2-29      | Penutup pembahasan merujuk hanya Analisis II; ganti Analisis III yang semula menduplikasi Analisis I dengan urutan salah lain. |
| B2-30      | Jelaskan alasan substitusi langsung karena x terisolasi tanpa klaim lebih cepat mutlak.                                        |

Kunci dan semua opsi tetap sama. Saran opsional B2-19 (presisi jangkauan) dan B2-20 (domain ukuran/redaksi luas) dicatat dalam manifest tetapi tidak diterapkan. Snapshot 30 sumber dan tidak adanya overlap keluarga dengan batch 1 diverifikasi ulang secara READ ONLY. Laporan review lengkap lokal: `.tmp/pvp-academic-review-2026-11-10/batch-02/REVIEW.md`.

### Hasil penerbitan batch 2

**ENGINEERING IMPLEMENTATION — 10 November 2026:** batch 2 berhasil diterbitkan ke database Development sebagai 30 versi baru READY/CONTENT_VALID. Tujuh koreksi diterapkan; kunci/opsi dan dua saran opsional tetap sesuai batas persetujuan. Simulasi penulisan berhasil dan dibatalkan sebelum apply; snapshot row sumber tetap sama. Pengulangan apply mengembalikan 30 `already-released` tanpa versi ganda. Audit dan provenance masing-masing memuat 30 entri batch 2.

Selector backend PvP strict memverifikasi total dua batch: **17 EASY, 33 MEDIUM, 10 HARD**; seluruh 60 versi menunjuk rilis yang disetujui. Sampling 10 keluarga tanpa duplikasi lulus pada ketiga tingkat. Pool sementara tersisa **515 keluarga** per pilihan timer. Konfigurasi server tetap sementara; tidak ada restart, perubahan mode official, paket existing, sesi atau XP historis.

Digest manifest batch 2: `b829e863b6474d86c3e610cd4ad30c2e2f5dd22fce038839d9190552c6dffc0f`. Bukti lokal: `.tmp/pvp-academic-review-2026-11-10/batch-02/{dry-run,rehearsal,release,release-verification,idempotency}.json`. Sintaks Node, ESLint operator dan format berkas baru lulus; tidak ada perubahan kode aplikasi runtime/schema sehingga build dan suite aplikasi penuh tidak diulang.

## Batch 3 — persetujuan pemilik

**ENGINEERING DECISION — disetujui pemilik, 10 November 2026:** terbitkan 30 keluarga baru hasil review batch 3 dengan klasifikasi 7 EASY, 19 MEDIUM dan 4 HARD serta tiga koreksi konkret di bawah. Dua saran opsional tidak diterapkan. Persetujuan editorial ini tidak mengaktifkan official dan bukan kalibrasi empiris/IRT.

| ID    | Koreksi yang disetujui                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| B3-11 | Hapus alasan pengecoh yang menganggap penalti −6 memberi nilai43; 64−12−6 sebenarnya46. Pertahankan alasan penalti −9 yang memang memberi43. |
| B3-25 | Samakan pembahasan dengan konteks rantai sepeda putus: memperbaiki rantai, bukan menambal ban.                                               |
| B3-27 | Hapus harga Paket B yang sudah membocorkan jawaban; siswa menghitung harga7 buku dari harga satuan Paket A.                                  |

Kunci dan opsi tetap sama. Saran opsional B3-19 (domain jumlah kursi) dan B3-22 (istilah besar penurunan versus beda bertanda) dicatat tanpa diterapkan.

Manifest: `apps/api/scripts/data/pvp-owner-reviewed-2026-11-10-batch03.json`. Referensi: `PROJECT_OWNER_2026_11_10_PVP_BATCH03_30_REVIEW_AND_THREE_CORRECTIONS`. Digest: `959c8b5544d515ca4510e53624a4a57c192e85a617bedaf761e9ab985001a540`. Operator dibatasi `--batch=3`, jumlah klasifikasi dan tiga koreksi dari manifest persetujuan; pengaman dua batch sebelumnya tetap tersedia. Laporan review lokal: `.tmp/pvp-academic-review-2026-11-10/batch-03/REVIEW.md`.

### Hasil penerbitan batch 3

**ENGINEERING IMPLEMENTATION — 10 November 2026:** 30 versi baru batch3 berhasil diterbitkan READY/CONTENT_VALID dengan tiga koreksi yang disetujui. Kunci/opsi tetap dan dua saran opsional tidak diterapkan. Pemeriksaan READ ONLY memverifikasi snapshot sumber; simulasi penulisan30 versi berhasil dan seluruhnya dibatalkan sebelum apply. Rilis berhasil setelah gangguan DNS/koneksi sementara; pengulangan apply memverifikasi30 `already-released` tanpa versi ganda. Hash seluruh row sumber tetap sama; audit dan provenance masing-masing memuat30 entri batch3.

Selector backend PvP strict memverifikasi total90 keluarga dari tiga batch: **24 EASY,52 MEDIUM,14 HARD**. Semua hasil menunjuk versi dari tiga rilis yang disetujui; sampling10 keluarga berbeda lulus pada setiap tingkat. Pool sementara menjadi **485 keluarga** pada ketiga pilihan timer. Konfigurasi server tetap sementara, tanpa restart atau aktivasi official. Tidak ada perubahan paket/sesi/hasil/XP historis.

Bukti lokal: `.tmp/pvp-academic-review-2026-11-10/batch-03/{dry-run,rehearsal,release,release-verification,idempotency}.json`. Sintaks Node, ESLint operator, format berkas baru dan diff check lulus. Tidak ada perubahan schema atau kode aplikasi runtime; build/suite aplikasi penuh tidak diulang.

## Batch 4 — persetujuan pemilik

**ENGINEERING DECISION — disetujui pemilik, 10 November 2026:** terbitkan 30 keluarga baru hasil review batch 4 dengan klasifikasi 12 EASY, 13 MEDIUM dan 5 HARD serta lima revisi konkret. Tiga saran opsional tidak diterapkan. Persetujuan editorial ini bukan kalibrasi empiris/IRT dan tidak mengaktifkan mode official.

| ID    | Revisi yang disetujui                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B4-01 | Nyatakan koin seimbang dan dua sisi sama mungkin.                                                                                                                  |
| B4-14 | Minta syarat lengkap seluruh nilai k sehingga k≠8 menjadi jawaban tunggal; jelaskan sistem dengan mengalikan persamaan, tanpa pembagian4/k yang mengecualikan k=0. |
| B4-24 | Nyatakan dadu seimbang dengan enam sisi bernomor1 sampai6.                                                                                                         |
| B4-27 | Tegaskan setoran harian yang bertambah, terpisah dari jumlah seluruh setoran/saldo.                                                                                |
| B4-30 | Nyatakan kolam mula-mula kosong dan debit pompa konstan.                                                                                                           |

Opsi dan kunci tetap sama. Saran opsional B4-15 (periode laporan), B4-21 (domain dan tanda kurung satuan) dan B4-23 (kalimat pembelian kedua) dicatat tanpa diterapkan. Manifest: `apps/api/scripts/data/pvp-owner-reviewed-2026-11-10-batch04.json`. Referensi: `PROJECT_OWNER_2026_11_10_PVP_BATCH04_30_REVIEW_AND_FIVE_CORRECTIONS`. Digest: `0b38b415ab3ffb86911244fce03b9662d3dc4d4547d44cf24632bc0d6cf817a2`. Operator dibatasi `--batch=4`, jumlah klasifikasi dan lima revisi sesuai persetujuan. Laporan sumber lokal: `.tmp/pvp-academic-review-2026-11-10/batch-04/REVIEW.md`.

### Hasil penerbitan batch 4

**ENGINEERING IMPLEMENTATION — 10 November 2026:** 30 versi baru batch 4 terbit READY/CONTENT_VALID. Lima revisi diterapkan, opsi/kunci tetap sama dan tiga saran opsional tidak diterapkan. Simulasi berhasil di-rollback sebelum apply; hash row sumber tetap sama. Pengulangan apply mengembalikan 30 `already-released` tanpa versi tambahan. Selector backend memverifikasi total 120 keluarga: **36 EASY, 65 MEDIUM, 19 HARD**, serta pool sementara **455 keluarga**. Sampling sepuluh keluarga berbeda lulus pada setiap tingkat. Konfigurasi server tetap sementara. Bukti: `.tmp/pvp-academic-review-2026-11-10/batch-04/{dry-run,rehearsal,release,release-verification,idempotency}.json`.

## Batch 5 — persetujuan pemilik

**ENGINEERING DECISION — pemilik, 10 November 2026:** jawaban “se7” diterima sebagai setuju atas 30 kandidat batch kelima: 6 EASY, 17 MEDIUM, 7 HARD dan delapan revisi konkret. Empat saran opsional tidak diterapkan. Persetujuan editorial bukan kalibrasi empiris/IRT atau aktivasi official.

Revisi: B5-11 membetulkan selisih waktu menjadi 70 menit; B5-13 memperjelas x tanpa satuan dan domain ukuran; B5-15 memperbaiki alasan pembulatan pengecoh serta batas metode estimasi; B5-16 menyatakan spinner seimbang; B5-22 meminta syarat lengkap seluruh nilai k; B5-26 memperbaiki jumlah jadwal menjadi tiga; B5-27 menegaskan jalan di luar kolam; B5-30 meminta alasan fungsi paling lengkap yang menjawab pengulangan komponen kedua. Opsi/kunci tetap. Saran opsional B5-01, B5-12, B5-17 dan B5-25 tidak diterapkan.

Manifest: `apps/api/scripts/data/pvp-owner-reviewed-2026-11-10-batch05.json`; referensi `PROJECT_OWNER_2026_11_10_PVP_BATCH05_30_REVIEW_AND_EIGHT_CORRECTIONS`; digest `2059539d2d8bda260b72042ff448b01f01cc16b6dc74a9ea36803e18b4b83daa`. Operator dibatasi `--batch=5`, digest dan jumlah klasifikasi/koreksi. Laporan lokal: `.tmp/pvp-academic-review-2026-11-10/batch-05/REVIEW.md`.

### Hasil penerbitan batch 5

**ENGINEERING IMPLEMENTATION — 10 November 2026:** batch 5 terbit sebagai 30 versi READY/CONTENT_VALID, dengan delapan revisi dan empat saran opsional tidak diterapkan. Opsi/kunci tetap sama; snapshot row sumber tetap utuh. Simulasi berhasil di-rollback sebelum apply. Pengulangan apply mengembalikan 30 `already-released` tanpa versi ganda; audit/provenance masing-masing memuat 30 entri batch 5.

Selector backend PvP memverifikasi total 150 keluarga: **42 EASY, 82 MEDIUM, 26 HARD**, semua menunjuk versi dari lima rilis. Sampling sepuluh keluarga berbeda lulus pada setiap tingkat. Pool sementara tersisa **425 keluarga** per pilihan timer. Tidak ada perubahan konfigurasi/restart/aktivasi official atau pin paket/sesi/hasil/XP historis.

Bukti lokal: `.tmp/pvp-academic-review-2026-11-10/batch-05/{dry-run,rehearsal,release,release-verification,idempotency}.json`. Pemeriksaan sintaks Node, ESLint operator, format dan diff check lulus. Tidak ada perubahan schema/kode aplikasi runtime, sehingga build/suite aplikasi penuh tidak diulang.

## Batch 6 — persetujuan pemilik

**ENGINEERING DECISION — pemilik, 10 November 2026:** “setuju lanjut” menyetujui lima revisi dan klasifikasi **29 kandidat selain B6-17**: 9 EASY, 19 MEDIUM, 1 HARD. Enam saran opsional tidak diterapkan. B6-17 (invers matriks) tetap HOLD untuk konfirmasi cakupan Curriculum; tidak ikut penerbitan. HOLD ini hanya pada laporan dan tidak menonaktifkan sumber yang masih berada di bank sementara.

| ID    | Revisi yang disetujui                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B6-06 | Koreksi alasan pengecoh saldo: mengabaikan es krim menghasilkan Rp24.500; salah mengurangkan cashback menghasilkan Rp8.500. Kunci B tetap.                |
| B6-11 | Nyatakan produktivitas setiap relawan sama/konstan, jam kerja harian tetap dan bagian hari kerja dihitung proporsional.                                   |
| B6-12 | Tanya nama prosedur mengganti y dengan ekspresi dari persamaan lain (substitusi), tanpa klaim eliminasi harus diubah ke bentuk baku atau metode tercepat. |
| B6-26 | Nyatakan dadu seimbang dengan enam sisi bernomor 1–6.                                                                                                     |
| B6-29 | Hapus pengulangan “denah” tiga kali.                                                                                                                      |

Opsi dan kunci tetap. Saran B6-04, B6-10, B6-20, B6-23, B6-25 dan B6-27 tidak diterapkan. Manifest: `apps/api/scripts/data/pvp-owner-reviewed-2026-11-10-batch06.json`. Referensi: `PROJECT_OWNER_2026_11_10_PVP_BATCH06_29_REVIEW_AND_FIVE_CORRECTIONS`; digest `81c96427f2c1bdf0936e7ba447a4cd2c021d61c5fa2200d860aab86daa4cafcd`.

Operator `--batch=6` memeriksa tepat 29 keluarga sesuai jumlah klasifikasi yang dipin dan menolak kandidat yang masuk daftar HOLD. Jumlah per batch sebelumnya tetap dipin 30. Sumber tetap direvisi menjadi versi baru; tidak ada penimpaan pin paket/sesi atau aktivasi official. Persetujuan ini bukan kalibrasi empiris/IRT. Laporan lokal: `.tmp/pvp-academic-review-2026-11-10/batch-06/REVIEW.md`.

### Hasil penerbitan batch 6

**ENGINEERING IMPLEMENTATION — 10 November 2026:** 29 versi baru batch 6 terbit READY/CONTENT_VALID, dengan lima revisi; opsi/kunci tetap dan enam saran opsional tidak diterapkan. Pemeriksaan snapshot sumber dan simulasi penulisan (rollback seluruhnya) lulus sebelum apply. Hash row sumber tidak berubah. Pengulangan apply mengembalikan 29 `already-released`; audit dan provenance masing-masing 29 entri batch 6.

Selector PvP memverifikasi total **179 keluarga: 51 EASY, 101 MEDIUM, 27 HARD**, seluruhnya menunjuk versi rilis yang disetujui. Sampling sepuluh keluarga berbeda lulus tiap tingkat. Pool sementara tersisa **396 keluarga**. B6-17 diverifikasi tidak memiliki revisi baru, payload sumber tetap sama, tidak masuk bank strict dan tetap ada di bank sementara: HOLD laporan belum merupakan penonaktifan konten runtime.

Bukti lokal: `.tmp/pvp-academic-review-2026-11-10/batch-06/{dry-run,rehearsal,release,release-verification,idempotency}.json`. Konfigurasi PvP tetap sementara; tidak ada restart/aktivasi official atau perubahan paket/sesi/hasil/XP historis. Sintaks Node, ESLint operator, format dan diff check lulus; tidak ada perubahan schema/kode aplikasi runtime, sehingga build/suite penuh tidak diulang.

## Batch 7 — persetujuan pemilik

**ENGINEERING DECISION — pemilik, 10 November 2026:** “setuju” menyetujui 30 kandidat batch ketujuh: 11 EASY, 14 MEDIUM, 5 HARD dan lima revisi konkret. Enam saran opsional tidak diterapkan; B6-17 tetap HOLD dan terpisah. Ini persetujuan editorial, bukan kalibrasi empiris/IRT atau aktivasi official.

| ID    | Revisi yang disetujui                                                                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| B7-07 | Nyatakan akuarium mula-mula kosong dan debit masing-masing konstan; lengkapi hasil selisih debit menjadi 4 liter/menit.                |
| B7-13 | Nyatakan setiap siswa memilih tepat satu kategori survei sehingga belajar dan bermain tidak beririsan.                                 |
| B7-20 | Tegaskan produktivitas sama dan konstan untuk siswa existing/rekrutan, jam kerja harian sama serta tidak berubah ketika tim bertambah. |
| B7-25 | Tegaskan tenda terpakai diisi penuh dan tepat dua tenda kosong pada kondisi lima siswa per tenda.                                      |
| B7-28 | Perjelas tujuan ukuran pemusatan sebagai ketahanan terhadap penggantian nilai tertinggi dengan nilai jauh lebih besar.                 |

Opsi dan kunci tetap. Saran B7-02, B7-08, B7-10, B7-16, B7-19 dan B7-24 tidak diterapkan. Manifest: `apps/api/scripts/data/pvp-owner-reviewed-2026-11-10-batch07.json`; referensi `PROJECT_OWNER_2026_11_10_PVP_BATCH07_30_REVIEW_AND_FIVE_CORRECTIONS`; digest `f181a7d7785293846e4b9743570d4cc00e425848e30940954232b6f98d9fabeb`. Operator dibatasi `--batch=7`, jumlah klasifikasi/koreksi dan digest yang dipin; daftar HOLD B6-17 tetap dicegah masuk rilis. Laporan lokal: `.tmp/pvp-academic-review-2026-11-10/batch-07/REVIEW.md`.

### Hasil penerbitan batch 7

**ENGINEERING IMPLEMENTATION — 10 November 2026:** 30 versi baru batch 7 terbit READY/CONTENT_VALID dengan lima revisi. Opsi/kunci tetap; enam saran opsional tidak diterapkan. Pemeriksaan snapshot sumber, simulasi rollback, apply dan pengulangan apply lulus. Hash row sumber tetap sama; rilis ulang memverifikasi 30 `already-released` tanpa versi tambahan. Provenance dan audit masing-masing memuat 30 entri batch 7.

Selector PvP memverifikasi total **209 keluarga: 62 EASY, 115 MEDIUM, 32 HARD**. Semua menunjuk versi tujuh rilis yang disetujui; sampling sepuluh keluarga berbeda lulus pada setiap tingkat. Pool sementara tersisa **366 keluarga**. B6-17 tetap tanpa revisi baru, sumbernya utuh dan tetap di bank sementara; HOLD laporan bukan penonaktifan runtime.

Bukti lokal: `.tmp/pvp-academic-review-2026-11-10/batch-07/{dry-run,rehearsal,release,release-verification,idempotency}.json`. Sintaks Node, ESLint operator, format dan diff check lulus. Tidak ada perubahan schema/kode aplikasi runtime; build/suite penuh tidak diulang. Konfigurasi PvP tetap sementara; tidak ada restart/aktivasi official atau perubahan paket/sesi/hasil/XP historis.

## Batch 8 — persetujuan pemilik

**ENGINEERING DECISION — pemilik, 10 November 2026:** “setuju” menyetujui 30 kandidat batch kedelapan: 10 EASY, 16 MEDIUM, 4 HARD dan tiga revisi konkret. Lima saran opsional tidak diterapkan; B6-17 tetap HOLD terpisah. Persetujuan editorial ini bukan kalibrasi empiris/IRT dan tidak mengaktifkan official.

| ID    | Revisi yang disetujui                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| B8-07 | Tegaskan setoran bulanan, tanpa bunga/penarikan, kedua skema mampu dipenuhi, dan tujuan memaksimalkan total setoran sepuluh bulan. |
| B8-11 | Ganti rata-rata penambahan harian menjadi nominal tetap setiap hari, tanpa pengeluaran dan dibandingkan pada akhir hari.           |
| B8-24 | Ganti konteks pengukuran massa negatif menjadi latihan jenis bilangan, mempertahankan angka dan kunci.                             |

Opsi/kunci tetap. Saran B8-03, B8-04, B8-09, B8-22 dan B8-28 tidak diterapkan. Manifest `apps/api/scripts/data/pvp-owner-reviewed-2026-11-10-batch08.json`; referensi `PROJECT_OWNER_2026_11_10_PVP_BATCH08_30_REVIEW_AND_THREE_CORRECTIONS`; digest `74b83789ff6b30dd19d9a729afb0a8bc281d693ef2e3d668c4759367dfedaab1`. Operator `--batch=8` memeriksa digest, jumlah klasifikasi/koreksi, serta pengecualian HOLD. Laporan lokal `.tmp/pvp-academic-review-2026-11-10/batch-08/REVIEW.md`.

### Hasil penerbitan batch 8

**ENGINEERING IMPLEMENTATION — 10 November 2026:** 30 versi baru batch 8 terbit READY/CONTENT_VALID dengan tiga revisi. Opsi/kunci tetap; lima saran opsional tidak diterapkan. Pemeriksaan snapshot sumber, simulasi rollback, apply dan pengulangan apply lulus. Hash row sumber tetap sama; pengulangan memverifikasi 30 `already-released` tanpa versi ganda. Audit/provenance masing-masing memuat 30 entri batch 8.

Selector backend PvP memverifikasi total **239 keluarga: 72 EASY, 131 MEDIUM, 36 HARD**, seluruhnya menunjuk versi delapan rilis. Sampling sepuluh keluarga berbeda lulus pada setiap tingkat. Pool sementara tersisa **336 keluarga**. B6-17 tetap tanpa revisi baru, sumbernya utuh dan tetap tersedia di bank sementara; HOLD laporan bukan penonaktifan runtime.

Bukti lokal: `.tmp/pvp-academic-review-2026-11-10/batch-08/{dry-run,rehearsal,release,release-verification,idempotency}.json`. Sintaks Node, ESLint operator, format dan diff check lulus. Tidak ada perubahan schema/kode aplikasi runtime; build/suite penuh tidak diulang. Konfigurasi PvP tetap sementara, tanpa restart/aktivasi official atau perubahan paket/sesi/hasil/XP historis.

## Batch 9 — persetujuan pemilik

**ENGINEERING DECISION — pemilik, 10 November 2026:** “setuju” menyetujui 30 kandidat batch kesembilan: 9 EASY, 17 MEDIUM, 4 HARD dan empat revisi konkret. Lima saran opsional tidak diterapkan; B6-17 tetap HOLD terpisah. Persetujuan editorial ini bukan kalibrasi empiris/IRT dan tidak mengaktifkan official.

| ID    | Revisi yang disetujui                                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B9-15 | Koreksi alasan pengecoh uang kembalian: tanpa diskon Rp40.000; harga minuman keliru Rp16.000 memberi Rp34.000; diskon keliru ditambahkan memberi Rp38.000. Kunci A Rp42.000 tetap. |
| B9-16 | Nyatakan bak mula-mula kosong, ukuran bagian dalam, debit konstan dan tanpa kebocoran; waktu 157 menit.                                                                            |
| B9-19 | Tanya nama langkah mengganti x dengan ekspresi 2y−3 dan nilai y, tanpa klaim metode paling efisien universal atau keharusan bentuk baku eliminasi.                                 |
| B9-30 | Tegaskan wadah bola mula-mula kosong, radius bagian dalam 7 cm dan pemindahan tanpa kehilangan air; desimal kapasitas/sisa merupakan pembulatan dua angka.                         |

Opsi/kunci tetap. Saran B9-05, B9-06, B9-07, B9-21 dan B9-26 tidak diterapkan. Manifest `apps/api/scripts/data/pvp-owner-reviewed-2026-11-10-batch09.json`; referensi `PROJECT_OWNER_2026_11_10_PVP_BATCH09_30_REVIEW_AND_FOUR_CORRECTIONS`; digest `94f10588feb1639b82341477c34554b31154015b34c89e13db9555808d81d932`. Operator `--batch=9` membatasi digest, jumlah klasifikasi/koreksi dan pengecualian HOLD. Laporan lokal `.tmp/pvp-academic-review-2026-11-10/batch-09/REVIEW.md`.

### Hasil penerbitan batch 9

**ENGINEERING IMPLEMENTATION — 10 November 2026:** batch 9 terbit sebagai 30 versi READY/CONTENT_VALID dengan empat revisi. Opsi/kunci tetap; lima saran opsional tidak diterapkan. Pemeriksaan snapshot sumber, simulasi rollback, apply dan pengulangan apply lulus. Hash row sumber tetap sama; pengulangan memverifikasi 30 `already-released` tanpa versi tambahan. Audit/provenance masing-masing memuat 30 entri batch 9.

Selector backend PvP memverifikasi total **269 keluarga: 81 EASY, 148 MEDIUM, 40 HARD**, semuanya menunjuk versi sembilan rilis. Sampling sepuluh keluarga berbeda lulus pada setiap tingkat. Pool sementara tersisa **306 keluarga**. B6-17 tetap tanpa revisi baru, sumbernya utuh dan masih berada di bank sementara; HOLD laporan bukan penonaktifan runtime.

Bukti lokal: `.tmp/pvp-academic-review-2026-11-10/batch-09/{dry-run,rehearsal,release,release-verification,idempotency}.json`. Sintaks Node, ESLint operator, format dan diff check lulus. Tidak ada perubahan schema/kode aplikasi runtime; build/suite penuh tidak diulang. Konfigurasi PvP tetap sementara, tanpa restart/aktivasi official atau perubahan paket/sesi/hasil/XP historis.

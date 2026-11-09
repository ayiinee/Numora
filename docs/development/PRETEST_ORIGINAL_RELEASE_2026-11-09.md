# Pretest original dapat dikerjakan siswa

**ENGINEERING DECISION — disetujui pemilik, 9 November 2026.** Pretest memakai nilai sebagian seperti Tryout: PG bernilai 0 atau 1; soal beberapa jawaban dinilai dari keputusan memilih atau tidak memilih setiap opsi; kategori dinilai per pernyataan. Setiap soal berbobot 1 dan jawaban kosong mendapat 0. Jumlah poin sebelum pembulatan menentukan level awal: kurang dari 8 → level 1, 8 sampai kurang dari 19 → level 2, mulai 19 → level 3. Nilai tampilan adalah total poin × 5, maksimal 100. Tidak ada XP.

Aturan baru dipin sebagai `PRETEST_PGK_PARTIAL_V1`; sesi dengan aturan lama `PRETEST_PRD_V06` tetap memakai perhitungan PG lama. `correctCount` tetap jumlah soal yang benar seluruhnya, bukan total poin sebagian. Poin per soal disimpan dengan dua desimal; penempatan memakai jumlah proporsi sebelum pembulatan poin per soal. Hasil lama tidak dihitung ulang. Lewati, lanjutkan sesi, satu penyelesaian per bab, dan penambahan akses level tetap berlaku. Kunci dan pembahasan tidak dibuka melalui akses gambar Pretest.

## Isi yang diterbitkan

Empat paket original, masing-masing 20 soal: total 40 PG, 24 beberapa jawaban, dan 16 kategori. Sebanyak 35 soal memiliki gambar: Bab 1 = 5; Bab 2 = 10; Bab 3 = 10; Bab 4 = 10. Versi sumber dan empat paket DRAFT awal tetap disimpan; penerbitan membuat versi soal dan paket baru. Ini bukan persetujuan kalibrasi IRT atau varian.

Dua koreksi berikut disetujui pemilik sebelum penerbitan:

| ID               | Koreksi                                                                                                                                                                                                                                        | Kunci   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `pretest-b3-q05` | Pernyataan 3 menjadi “Secara umum, kesamaan dua sisi dan satu sudut yang bukan sudut apit selalu menjamin dua segitiga kongruen.” Klaim umum ini salah; ukuran khusus 6 dan 8 tidak lagi dipakai untuk klaim tersebut. Pembahasan disesuaikan. | 1 dan 2 |
| `pretest-b4-q08` | Opsi A menjadi “Selisih nilai tertinggi dan terendah kelompok A lebih kecil daripada kelompok B.” Pembahasan hanya menyimpulkan perbandingan jangkauan, bukan konsentrasi data di sekitar rata-rata.                                           | A       |

Dua belas catatan klarifikasi pada audit sumber 28 Oktober tetap dicatat dalam asal-usul soal; perubahan redaksi di luar dua koreksi di atas tidak diterapkan diam-diam. Catatan tersebut mencakup asumsi produktivitas/dadu adil, interpretasi setoran, domain panjang, notasi vektor, serta batas penafsiran sampel dan jangkauan. Audit sumber di repo AI tetap menjadi bukti versi awal.

## Penerbitan dan pemeriksaan

Operator `apps/api/scripts/publish-original-pretest.mjs` membatasi pekerjaan ke empat paket sumber yang sudah diperiksa. Tanpa `--apply`, operator hanya membaca. Penerbitan memerlukan koneksi migrasi dan `--actor=<id Admin konten aktif>`, membuat versi baru, mencatat persetujuan pemilik, menyimpan aturan nilai dan rubrik, mengunci susunan paket, serta mencatat audit. Pengulangan perintah tidak membuat paket tambahan. Seluruh penerbitan berlangsung dalam satu transaksi.

Paket original Pretest tidak memerlukan hasil kalibrasi varian palsu. Aksesnya tetap memeriksa persetujuan susunan paket, blueprint, 20 soal original READY yang ditinjau, dan keputusan HOLD/RETIRED. Jalur gambar tetap memeriksa kepemilikan sesi dan mengeluarkan tautan R2 sementara.

Struktur database Development diperbarui melalui migrasi resmi repo, bukan penambahan kolom manual. Pemeriksaan struktur lulus untuk 132 tabel/kolom yang diharapkan dengan RLS aktif. Konfigurasi lokal `DATABASE_MIGRATION_URL` kosong; untuk pelaksanaan ini koneksi database pemilik yang sudah tersedia dipakai hanya di proses operator, tanpa mengubah berkas kredensial.

Pemeriksaan mencakup aturan nilai/batas level, mulai dan lanjutkan empat paket, simpan jawaban ketiga tipe, nilai sebagian, pengumpulan berulang yang aman, larangan mengulang Pretest selesai, serta unduhan dan pemeriksaan ukuran/hash 35 gambar melalui layanan akses siswa. Pengujian layanan memakai akun sementara di dalam transaksi yang selalu dibatalkan, sehingga tidak meninggalkan akun, sesi, jawaban, unlock, atau XP uji. Pengujian ini memanggil layanan API; pemeriksaan tampilan browser tetap berbeda dari pengujian layanan.

Untuk mengulang pemeriksaan layanan, jalankan dari `apps/api` dengan `.env` Development dan `PRETEST_RELEASE_ROLLBACK_QA=true`:

```powershell
node --env-file=../../.env ../../node_modules/vitest/vitest.mjs run src/modules/learning/pretest-original-release.integration.spec.ts
```

Jika proses aplikasi masih memakai kode lama, mulai ulang API dan web dari repo ini, lalu buka Pretest pada halaman bab siswa. Tidak diperlukan perubahan di repo AI untuk menjalankan Pretest ini.

## Pengujian otomatis pada PR

Suite `pretest-tryout.integration.spec.ts` juga menguji paket original sintetis pada PostgreSQL localhost yang terisolasi, melalui HTTP API nyata. Skenario mencakup paket original yang sudah disetujui tanpa hasil kalibrasi varian, ketiga tipe soal, perlindungan kepemilikan sesi, hapus/lanjutkan jawaban, nilai sebagian, kumpulkan berulang, serta tidak adanya XP. Suite ini berjalan pada job pengujian GitHub ketika `TEST_DATABASE_URL` tersedia. Pemeriksaan berkas gambar Development di atas merupakan bukti terpisah dan tidak dijalankan otomatis oleh CI.

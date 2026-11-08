# Connected smoke — tiga subrole Admin

**ENGINEERING IMPLEMENTATION — 4 November 2026:** regresi penyelarasan Operations/Content memperluas runner JOB-06 existing dengan identitas Operations dan Content yang tersimpan pada PostgreSQL lokal terisolasi. Identitas `admin` tetap Super Admin. Tidak ada perubahan API produksi, capability atau migrasi.

Ini adalah pemeriksaan integrasi developer, bukan skenario ADM formal pada katalog QA (yang saat implementasi hanya menyediakan SIS-001), bukan login Google nyata dan bukan persetujuan rilis.

| Role        | Alur browser                                                                                        | Pemeriksaan server                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Super Admin | `/admin` menuju Analytics, 22 tile agregat                                                          | Akun Admin dapat dibaca; ban siswa ditolak                                                                    |
| Operations  | Sekolah, pencarian/detail credential, daftar pengguna; Konten ditolak                               | Akun Admin dan bank soal ditolak; ban siswa ditolak                                                           |
| Content     | Bank soal, struktur sekolah/kelas baca saja, filter URL bertahan setelah reload; Operations ditolak | Limited DTO hanya memiliki field struktur/jumlah; akun, pengguna, sekolah penuh, roster dan ban siswa ditolak |

Seluruh request produk melewati API NestJS nyata tanpa route mock atau override service/guard. Sesi email fixture hanya menggantikan batas Supabase Auth. Semua identitas, sekolah, credential, kelas dan assessment adalah sumber TEST ONLY pada database run, bukan Development cloud.

Gunakan `pnpm test:release-chain` dengan Node/pnpm yang dipin dan `TEST_DATABASE_URL`/`TEST_REDIS_URL` menuju layanan localhost milik run. Guard existing mewajibkan checkout bersih, satu SHA dan database bernama `numora_test_job06` atau suffix run alfanumerik; jangan melewatinya. Runner memigrasikan database run, membangun aplikasi, menjalankan tujuh kasus serial dan merekam delapan required checks, termasuk seluruh tujuh checks lama.

Bukti JSON berada pada `.tmp/job06-evidence/connected.json`; SHA awal/akhir harus sama, `productApiMocks` false, semua required checks tercatat dan status PASS. File mentah, browser state, token dan log tetap ignored. Hasil aktual dan tautan CI dicatat terpisah pada PR tanpa mengubah SHA yang diuji.

Google OAuth, layanan media/ilmiah nyata, Curriculum, staging/deployment dan review manusia tetap memiliki gate tersendiri. Tidak ada konfigurasi branch protection yang diubah oleh smoke ini.

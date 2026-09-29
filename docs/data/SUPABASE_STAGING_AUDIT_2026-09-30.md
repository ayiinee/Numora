# Audit baca Supabase Numora-Staging — 30 September 2026

Laporan ini adalah snapshot **baca saja** pada 29 September 2026 pukul 17:16 UTC (30 September 00:16 WIB). Sumbernya adalah metadata proyek, katalog PostgreSQL, hasil query `count(*)`, riwayat migrasi, advisor, dan agregat log melalui konektor Supabase. Tidak ada password, token, connection string, isi baris pengguna, atau perubahan konfigurasi database dalam laporan ini. Kondisi operasional dapat berubah sesudah waktu snapshot.

**Lampiran yang diminta reviewer PR #10:** [12 entri Drizzle lengkap dan struktur tujuh tabel Drill](SUPABASE_STAGING_DRILL_AUDIT_2026-09-30.md), termasuk kolom, constraint/FK, indeks, jumlah baris, dan catatan tentang dua akun Supabase Auth.

**Arah rekonsiliasi (klarifikasi Reyhan, 30 September):** skema Numora-Staging yang diaudit adalah acuan model database. Perbedaan dengan migrasi/kode `main` harus diselesaikan dengan menyesuaikan riwayat migrasi dan integrasi aplikasi terhadap acuan Staging; keberadaan kode di `main` tidak menjadikan skemanya pengganti Staging. Ini adalah keputusan arah integrasi setelah snapshot, bukan hasil query database.

## Status dan struktur

| Pemeriksaan                                                                        | Hasil                                                                                           |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Proyek                                                                             | `Numora-Staging` (`pkamenfnwmoeisccnrnk`), `ACTIVE_HEALTHY`, paket organisasi Free              |
| Tabel aplikasi di `public`                                                         | 46; daftar dan tujuan tabel ada di [acuan database](DATABASE_NUMORA_V05_ACUAN_TIM.md)           |
| RLS                                                                                | Aktif pada 46/46 tabel                                                                          |
| Hak `SELECT`/`INSERT` tabel `public` untuk `anon`, `authenticated`, `service_role` | 0/46 untuk ketiga role tersebut; data domain memakai Backend/worker melalui koneksi server-side |
| Jumlah data                                                                        | `count(*)` pada masing-masing 46 tabel = 0; total 0 baris                                       |
| Koneksi PostgreSQL saat diperiksa                                                  | 13 dari `max_connections=60`, 1 aktif dan 5 idle; ini hanya snapshot sesaat                     |

Struktur terperinci ada di [dokumen skema](DATABASE_NUMORA_V05_ACUAN_TIM.md), sedangkan SQL dan snapshot Drizzle ada di [`packages/database/drizzle`](../../packages/database/drizzle/). Belum ada seed demo pada tabel aplikasi. Pemeriksaan menemukan **dua akun di `auth.users`**. Pada 30 September, Reyhan mengonfirmasi keduanya sebagai entri yang keliru, bukan akun pengguna Numora yang sengaja disiapkan. Ini adalah klarifikasi pemilik proyek setelah snapshot, bukan hasil inferensi dari metadata database. Kedua akun masih ada; audit ini tidak menghapusnya atau mengubah Staging.

## Riwayat migrasi

- Riwayat migrasi Supabase mencatat 10 entri: sembilan migrasi bootstrap awal (`0000`–`0008`) dan satu rekonsiliasi riwayat Drizzle.
- Tabel `drizzle.__drizzle_migrations` berisi 12 hash unik: sembilan catatan bootstrap serta tiga hash kanonik untuk rangkaian repo `0000`–`0002`. Rekonsiliasi mencatat riwayat kanonik **tanpa menjalankan ulang DDL** yang sudah diterapkan.
- Migrasi kanonik di repo: `0000` dari `main` membuat 8 tabel fondasi, `0001` menambah 38 tabel, dan `0002` mengaktifkan RLS/mencabut grant Data API serta melindungi rentang periode leaderboard. Lihat [panduan Supabase Cloud](SETUP_SUPABASE_CLOUD_V05.md).
- Pemeriksaan ini untuk Staging. Status migrasi Production tidak dinyatakan oleh snapshot Staging ini.

## Audit log, temuan, dan backup

`public.audit_logs` adalah tabel aplikasi dan masih berisi 0 baris; tabel ini tidak otomatis mencatat semua perubahan dashboard atau SQL. `auth.audit_log_entries` juga berisi 0 baris saat query dilakukan; sumber log eksternal Supabase menampilkan tiga entri `auth_audit_logs` dalam 24 jam terakhir. [Auth Audit Logs](https://supabase.com/docs/guides/auth/audit-logs) terpisah dari [Platform Audit Logs](https://supabase.com/docs/guides/security/platform-audit-logs). Platform Audit Logs hanya tersedia pada paket Team/Enterprise, sehingga belum tersedia pada organisasi Free ini. `pgaudit` tidak terpasang dan `pgaudit.log` bernilai `none`; audit rinci setiap query database belum diaktifkan.

Proyek berstatus sehat dan query baca berhasil, tetapi **bukan berarti tidak ada kesalahan historis**. Dalam log `supavisor_logs` 24 jam terakhir terdapat 73 entri berlevel `error`: 58 pesan penolakan autentikasi password dan 15 pesan batas jumlah koneksi. Rentang timestamp entri tersebut adalah 29 September 2026 13:29–17:03 UTC. Agregat ini tidak membuktikan aplikasi saat ini gagal, dan belum mengidentifikasi klien penyebabnya. Periksa target/username/password URL yang dipakai proses lokal atau CI, encoding karakter khusus, serta jumlah pool koneksi bila kejadian berulang. Jangan menyalin pesan log mentah yang mungkin memuat metadata sensitif ke PR.

Security Advisor saat diperiksa mengeluarkan 46 informasi `RLS Enabled No Policy`, sesuai desain awal yang menutup akses Data API klien, dan satu peringatan `Leaked Password Protection Disabled` untuk Auth. Performance Advisor menandai 51 foreign key tanpa indeks penutup serta 30 indeks belum terpakai; pada database yang masih kosong, ini menjadi bahan review sebelum data/traffic nyata, bukan bukti kegagalan migrasi. [RLS Advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) · [Perlindungan password](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) · [FK Advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

Organisasi ini berada pada paket **Free**. Supabase menyediakan backup harian terkelola untuk Pro, Team, dan Enterprise; dokumentasi menyarankan ekspor manual berkala untuk Free. Karena konektor yang dipakai tidak menampilkan daftar backup, keberadaan dan waktu backup manual belum terverifikasi. Periksa **Database → Backups** pada dashboard Staging, lalu tetapkan proses `db dump` dan penyimpanan di luar Supabase sebelum data demo bernilai penting dimasukkan. Jangan menyatakan ada titik pemulihan yang siap dipakai sebelum file backup dan uji restore diverifikasi. [Dokumentasi backup Supabase](https://supabase.com/docs/guides/platform/backups).

## Akses review admin

Laporan ini dan migrasi di PR dapat direview tanpa berbagi rahasia. Keanggotaan akun admin di organisasi Supabase belum dapat diverifikasi oleh pemeriksaan ini. Pada paket Free, role dashboard **Read-Only** dan role yang dibatasi ke satu proyek tidak tersedia. Mengundang admin sebagai **Developer** melalui **Organization → Team** memberi akses konten proyek dan cakupan organisasi; ini bukan akses audit baca murni dan dapat mencakup Production. Bila harus memberi akses dashboard yang benar-benar baca saja dan terbatas pada Staging, gunakan paket Team/Enterprise lalu undang akun admin dengan role **Read-Only** yang dibatasi ke proyek Staging. Jangan membagikan password database, secret/service-role key, atau personal access token di PR. [Access Control Supabase](https://supabase.com/docs/guides/platform/access-control).

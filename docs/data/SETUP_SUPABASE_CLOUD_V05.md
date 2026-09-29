# Setup database Supabase Cloud Numora (PRD v0.5)

**Status (29 September 2026):** Numora-Staging (`pkamenfnwmoeisccnrnk`) sudah memiliki 46 tabel publik dan RLS aktif pada semuanya. Numora-Production belum dimigrasi. Ini adalah baseline struktur data berdasarkan `DATABASE_NUMORA_V05_ACUAN_TIM.md`, bukan implementasi lengkap seluruh aturan bisnis/seed/API.

Staging mula-mula menerima sembilan migrasi dari checkout lama (`0000`–`0008`) melalui koneksi Supabase karena `.env` lokal masih mengarah ke `127.0.0.1`. Setelah `origin/main` menambahkan migrasi fondasi resminya, branch ini membangun ulang lanjutan Drizzle sebagai `0001` dan `0002`. Snapshot akhir kedua rangkaian sama untuk 46 tabel; RLS, grant Data API, dan constraint periode diperiksa di Staging. Tiga hash migrasi kanonik branch ini kemudian dicatat sebagai rekonsiliasi **tanpa menjalankan ulang DDL yang sudah ada**. Riwayat Drizzle Staging kini berisi 12 entri: 9 bootstrap awal dan 3 entri kanonik yang hash-nya cocok dengan branch ini. Jangan menghapus sembilan catatan awal. Belum ada seed demo yang dijalankan.

## 1. Simpan target dan kredensial tanpa memasukkannya ke Git

1. Buat proyek Supabase **demo/staging** pada Dashboard. Catat Project ID dari URL `https://supabase.com/dashboard/project/<project-ref>`.
2. Di Dashboard proyek, buka **Connect** dan salin connection string **Direct** port `5432` jika jaringan mendukung IPv6. Jika tidak, pilih **Session pooler** port `5432`. Jangan pilih Transaction pooler port `6543` untuk migrasi Drizzle ini. [Panduan koneksi Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
3. Salin `.env.cloud.example` menjadi `.env.cloud.local`, lalu isi `SUPABASE_PROJECT_REF` dan `DATABASE_URL`. File `.env.cloud.local` diabaikan Git. Password dalam URL harus di-*URL encode*; gunakan `sslmode=require`.
4. Jangan kirim `DATABASE_URL`, password, service-role key, atau access token ke chat, issue, PR, atau anggota frontend. URL proyek dan publishable key boleh dipakai web; password DB hanya untuk operator migrasi dan backend/worker yang memerlukan koneksi langsung.

PowerShell dari root repo:

```powershell
Copy-Item .env.cloud.example .env.cloud.local
# Edit .env.cloud.local dengan editor lokal. Jangan commit file ini.
corepack pnpm db:cloud:check
```

Perintah `db:cloud:check` hanya membaca target: memastikan Project ID cocok dengan host/user connection string, TLS diminta, database adalah `postgres`, dan menampilkan jumlah/nama tabel publik tanpa menampilkan password.

## 2. Terapkan migrasi yang sudah direview

Setelah hasil `db:cloud:check` menunjukkan proyek yang benar dan schema yang diharapkan:

```powershell
corepack pnpm db:cloud:migrate
corepack pnpm db:cloud:check
```

Perintah ini memakai migrasi **Drizzle** di `packages/database/drizzle` dan tidak membaca `.env` lokal. Jika proyek cloud sudah mempunyai tabel publik tanpa riwayat migrasi Drizzle, script menolak migrasi; audit dan rekonsiliasi schema dulu. Jangan membuat tabel yang sama melalui SQL Editor/Studio. Simpan migration SQL dalam Git agar seluruh tim memakai versi yang sama.

Rangkaian migrasi kanonik di branch ini: `0000` dari `main` membuat 8 tabel fondasi; `0001` menambah 38 tabel beserta kolom, indeks, FK, dan constraint hingga total 46; `0002` menyalakan RLS dan mencabut akses Data API untuk semua tabel aplikasi serta mencegah periode leaderboard saling tumpang tindih. Di database kosong, jalankan ketiganya berurutan. Di Staging yang sudah direkonsiliasi, migrator Drizzle akan melewatinya dan hanya menjalankan migrasi baru berikutnya. NestJS menggunakan koneksi PostgreSQL server-side sebagai jalur data domain. [Panduan RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

Aturan apakah guru boleh aktif di beberapa sekolah masih menunggu keputusan produk. Schema sekarang mengizinkan satu afiliasi aktif per pasangan guru–sekolah; Backend harus menegakkan kebijakan produk yang nantinya disetujui. Kecocokan tipe paket–attempt dan beberapa relasi item/pertandingan kini ditahan FK komposit. Aturan lintas tabel lain seperti role peserta, kepemilikan kelas, dan kelayakan konten terbit tetap perlu transaksi dan validasi Backend.

## 3. Seed cloud dan integrasi tim

Jangan jalankan `db:seed` yang ada sekarang pada cloud: script itu memakai UUID Auth placeholder dan hanya membuktikan koneksi lokal. Akun yang dapat login harus terlebih dahulu ada di Supabase Auth dan `users.auth_user_id` harus cocok dengan `auth.users.id`. Siapkan seed demo cloud terpisah sesudah akun dan kontrak data tiap fitur disepakati.

Frontend menerima `NEXT_PUBLIC_SUPABASE_URL` dan publishable key proyek demo untuk Auth. Backend dan worker menerima `DATABASE_URL` cloud dari penyimpanan rahasia deployment. Hanya satu operator/CI menerapkan migrasi; tim fitur mengajukan kebutuhan tabel, constraint, dan fixture lewat review. Frontend tidak memakai database password maupun secret/service-role key.

Setelah migrasi, kontrak seed dan API tiap tim tetap perlu disepakati dan diuji. Aturan OPEN pada PRD tidak boleh dikunci sebagai kebijakan final hanya karena seed demo memerlukan contoh data. Migrasi berikutnya harus menjaga RLS dan grant, serta tidak mengubah versi soal, paket, atau hasil historis yang sudah dipakai.

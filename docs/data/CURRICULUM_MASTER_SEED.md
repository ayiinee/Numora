# Master bab dan subbab kurikulum

**USER REQUEST — Reyhan, 6 Oktober 2026:** siapkan seeder master bab dan subbab dari draf soal Curriculum untuk menjadi acuan pengisian spreadsheet. Baseline `main`: `607c3c5`. Main sudah mempunyai tabel dan seed DEMO; `master-data.proposed.json` hanya memuat dua bab/tiga subbab sampel dan bukan seeder lengkap.

**ENGINEERING DECISION — disetujui Reyhan, 6 Oktober 2026:** daftar empat bab dan sepuluh subbab dalam `packages/database/seeds/curriculum-master.json` ditetapkan sebagai acuan master identitas bab/subbab untuk spreadsheet, konversi JSON, dan seeder. Kode dalam daftar ini digunakan konsisten oleh tim Curriculum, Data, dan Backend. Persetujuan ini tidak mengubah status konten menjadi READY dan tidak menyatakan bahwa seeder sudah diterapkan ke Cloud.

**SOURCE:** [Blueprint Draft Soal Drill](https://docs.google.com/document/d/1xqdU-DLVW3dlscxKOCb1H1MNPqIPgQFtgpGc-1Jbexg/edit), tab **Main Draft Soal**, tabel Komponen (Tema) / Variabel (Sub Tema). Snapshot 6 Oktober 2026 beserta revision ID dan baris tabel tersimpan di `packages/database/seeds/curriculum-master.json`. Nama mengikuti sumber; kode dan slug adalah **ENGINEERING DECISION** yang mempertahankan acuan JSON sebelumnya, bukan kode resmi yang tertulis di draf.

| Kode bab | Bab                     | Kode subbab | Subbab                              |
| -------- | ----------------------- | ----------- | ----------------------------------- |
| CH-BIL   | Bilangan                | SC-BR       | Bilangan Real                       |
| CH-ALG   | Aljabar                 | SC-PPL      | Persamaan dan Pertidaksamaan Linier |
| CH-ALG   | Aljabar                 | SC-BA       | Bentuk Aljabar                      |
| CH-ALG   | Aljabar                 | SC-FUNGSI   | Fungsi                              |
| CH-ALG   | Aljabar                 | SC-BD       | Barisan dan Deret                   |
| CH-GP    | Geometri dan Pengukuran | SC-OG       | Objek Geometri                      |
| CH-GP    | Geometri dan Pengukuran | SC-TG       | Transformasi Geometri               |
| CH-GP    | Geometri dan Pengukuran | SC-PENG     | Pengukuran                          |
| CH-DP    | Data & Peluang          | SC-DATA     | Data                                |
| CH-DP    | Data & Peluang          | SC-PELUANG  | Peluang                             |

Pada spreadsheet soal gunakan `chapter_code` dan `subchapter_code` di atas, misalnya `CH-GP` / `SC-OG`. Nama Geometri & Pengukuran pada acuan sampel lama merujuk bab yang sama; kode `CH-GP` dan slug `geometri-pengukuran` dipertahankan. Nama pada manifest sekarang mengikuti teks sumber **Geometri dan Pengukuran**. Seeder melaporkan perbedaan nama existing untuk review, tidak menggantinya diam-diam.

## Identitas pada spreadsheet dan JSON

**ENGINEERING DECISION:** identitas yang diisi tim Curriculum adalah **kode master**, misalnya `CH-GP` dan `SC-OG`. UUID `chapters.id` dan `subchapters.id` tetap dibuat database ketika seeder dijalankan; jangan mengarang UUID atau menyalin UUID DEMO sebagai identitas kurikulum. Kode tetap dapat dipakai untuk menyiapkan spreadsheet sebelum seeder diterapkan.

| Lapisan               | Identitas bab                         | Identitas subbab                                      |
| --------------------- | ------------------------------------- | ----------------------------------------------------- |
| Pengisian spreadsheet | `CH-GP`                               | `SC-OG`                                               |
| JSON impor            | `chapterCode: "CH-GP"`                | `subchapterCode: "SC-OG"`                             |
| Database              | UUID `chapters.id` hasil resolve kode | UUID `subchapters.id` hasil resolve bab + kode subbab |

Nama kolom dan susunan template Excel existing tetap dipertahankan. Label `chapter_code` / `subchapter_code` dalam panduan ini menjelaskan makna kolom; tidak memerintahkan perubahan header template. Tim konverter memetakan kolom identitas bab/subbab existing ke `chapterCode` dan `subchapterCode` pada JSON, bukan mengirim kode ke field API bertipe UUID seperti `chapterId` / `subchapterId`.

Contoh **fragmen metadata**, bukan payload soal lengkap:

```json
{
  "chapterCode": "CH-GP",
  "subchapterCode": "SC-OG"
}
```

Backend menyelesaikan `CH-GP` melalui `chapters.code`, kemudian `SC-OG` melalui pasangan `(chapter_id, code)`. Pasangan bab/subbab harus sesuai tabel acuan; `CH-ALG` / `SC-OG` tidak valid. Kode tidak diubah berdasarkan nomor baris spreadsheet, nama file, jenis paket (Pretest/Drill/Tryout), atau nomor soal. Slug dipakai untuk route, bukan foreign key. Jika ada bab/subbab baru atau perubahan identitas, perbarui manifest dan acuan bersama terlebih dahulu agar konverter dan database tetap selaras.

Indikator dan level belum ditetapkan oleh persetujuan master bab/subbab ini. Jangan memakai kode bab/subbab sebagai pengganti `competencyCode` atau mengisi level berdasarkan perkiraan.

## Perilaku seeder

**ENGINEERING DECISION:** seeder terpisah dari seed DEMO, migrasi, dan impor soal. Hanya INSERT pada `public.chapters` dan `public.subchapters`. Tidak menambah indikator, level, soal, paket, akun, progres, atau gambar R2. Untuk impor soal, `competencies` dan `levels` yang cocok tetap harus disiapkan melalui pekerjaan master berikutnya; dua tabel ini saja belum memenuhi `MASTER_SCOPE_NOT_FOUND` pada importer.

- Empat bab dan sepuluh subbab baru berstatus **DRAFT**. Tidak memberi approval akademik atau menampilkan konten resmi ke Student.
- UUID dibuat database; replay menemukan baris melalui kode bab dan pasangan kode bab/kode subbab, mempertahankan UUID, status dan display order existing.
- Nama/slug berbeda pada kode existing, identitas ARCHIVED, atau slug/nama yang digunakan kode lain dalam scope sama menjadi konflik. Seluruh seed batal; tidak ada UPDATE, DELETE atau silent merge.
- `sourceOrder` mencatat urutan sumber. Pada database kosong, urutan bab 1–4; pada database berisi DEMO, baris baru ditambahkan setelah display order terbesar agar tidak bertabrakan dengan unique constraint. Subbab ditambahkan setelah urutan terbesar dalam babnya. Partial master existing tidak diurutkan ulang; urutan katalog tetap perlu review jika sebagian bab sudah ada.
- Semua INSERT dan verifikasi terjadi dalam satu transaksi; lock dua tabel mencegah benturan alokasi display order dengan penulis lain. Timeout lock 5 detik dan statement 30 detik. Pengulangan input identik tidak menambah baris.
- `material_category` untuk bab baru: Bilangan=numbers, Aljabar=algebra, Geometri=geometry, Data & Peluang=statistics; metadata existing dipertahankan.

**OPEN:** draf sumber belum merupakan persetujuan final Curriculum atas taxonomy/blueprint/difficulty. Mengubah DRAFT menjadi READY, memasukkan indikator/level, penyusunan paket dan publikasi soal adalah langkah terpisah.

## Menjalankan dari root repo

Periksa manifest tanpa akses database; ini juga default jika tidak ada argumen:

```powershell
corepack pnpm run db:seed:curriculum --dry-run
```

Untuk koneksi Cloud, gunakan `.env.cloud.local` yang diabaikan Git dan sudah dipakai `db:cloud:check`. Isi `SUPABASE_PROJECT_REF` dan `DATABASE_MIGRATION_URL` secara lokal. URL harus sesuai project ref, database `postgres`, direct atau session pooler port 5432, dengan `sslmode=require` atau `sslmode=verify-full`. Jangan memakai transaction pooler 6543 atau mengirim password/key ke PR. Tidak membutuhkan Docker atau Supabase Local.

Periksa database dan lihat rencana INSERT/conflict tanpa write:

```powershell
corepack pnpm run db:seed:curriculum --check
```

Setelah kode direview dan target Cloud serta prasyarat backup/restore Staging yang diminta admin sudah dipenuhi, pemilik database dapat menerapkan:

```powershell
corepack pnpm run db:seed:curriculum --apply
corepack pnpm run db:seed:curriculum --check
```

`--apply` memakai koneksi operator yang sudah dipakai untuk migrasi; perintah ini tidak menjalankan migrasi. Database harus sudah mempunyai kolom slug/material_category dan constraint dari main. Kegagalan `--check`/`--apply` tidak menampilkan error database mentah atau connection string. Konflik ditampilkan sebagai kode master yang perlu direview. Hasil apply memuat jumlah created/verified; replay seharusnya createdChapters=0 dan createdSubchapters=0. `--check` berikutnya seharusnya tidak mempunyai newChapters/newSubchapters/conflicts.

Seeder tidak ikut dijalankan otomatis oleh `db:seed`, `dev`, migrasi, atau importer Excel.

## Pengujian

Tes unit mencakup pemetaan 4/10, scope subbab, parent/slug duplikat, status DRAFT, pelestarian identitas/urutan existing, konflik dan validasi target Cloud. Tes PostgreSQL memakai database TEST terisolasi melalui `TEST_DATABASE_URL`, mengikuti runner CI existing: seed, replay concurrent, rollback konflik, dan verifikasi bahwa tabel bisnis serta riwayat migrasi tidak berubah. Tes terisolasi tidak memakai Cloud Development/Staging.

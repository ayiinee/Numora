# Master Curriculum dan seeder DRAFT — PRD v0.6

Disiapkan 4 Oktober 2026. Status: kode usulan Data, belum persetujuan akademik dan belum diterapkan ke Supabase Cloud. Ini inventaris lengkap dari tabel **Main Draft Soal**, bukan pernyataan bahwa seluruh bank soal sudah lengkap.

## Sumber dan cakupan

Sumber primer: [Blueprint Draft Soal Drill](https://docs.google.com/document/d/1xqdU-DLVW3dlscxKOCb1H1MNPqIPgQFtgpGc-1Jbexg/edit), tab `Main Draft Soal` (`t.0`), ekstraksi 4 Oktober 2026. Revision ID dan nomor baris tabel tersimpan di JSON. PRD v0.6 dari user menjadi acuan lima level per subbab.

- Master: `docs/data/curriculum-master.v0.6.json`.
- Seeder operator: `scripts/seed-curriculum-master.mjs`.
- Test: `scripts/seed-curriculum-master.test.mjs`.
- Isi: 4 `chapters`, 10 `subchapters`, 23 `competencies` (indikator), 50 `levels` (1–5 tiap subbab). Total 87 baris baru bila belum ada master yang cocok.
- Level progres tetap milik subbab. Level sumber soal tetap `questions.curriculum_level_number`; tidak ada tabel indikator-per-level baru. Pemilihan bank level menggunakan indikator dalam subbab tersebut dan nomor level sumber yang sama.
- Tidak mengisi soal, paket Pretest/Drill/TryOut, rubrik, kriteria difficulty atau pemetaan Easy/Medium/Hard PvP. Komposisi paket menunggu bank dan keputusan Curriculum.
- Bab/subbab/indikator yang sama dapat menjadi acuan ketiga jenis paket. Sumber draf ini adalah Drill; jangan menganggap otomatis tersedia paket Pretest/TryOut.

## Pemetaan kode

Kode yang telah digunakan pada 10 sampel dipertahankan. Kode lainnya adalah usulan stabil, UUID ditentukan database saat insert.

| Bab / kode                      | Slug                  | Subbab / kode                                  | Slug subbab                       | Indikator                                            | Level |
| ------------------------------- | --------------------- | ---------------------------------------------- | --------------------------------- | ---------------------------------------------------- | ----- |
| Bilangan / `CH-BIL`             | `bilangan`            | Bilangan Real / `SC-BR`                        | `bilangan-real`                   | IND-001, IND-002, IND-003, IND-004, IND-005, IND-006 | 1–5   |
| Aljabar / `CH-ALG`              | `aljabar`             | Persamaan dan Pertidaksamaan Linier / `SC-PPL` | `persamaan-pertidaksamaan-linier` | IND-007, IND-008, IND-009                            | 1–5   |
| Aljabar / `CH-ALG`              | `aljabar`             | Bentuk Aljabar / `SC-BA`                       | `bentuk-aljabar`                  | IND-010                                              | 1–5   |
| Aljabar / `CH-ALG`              | `aljabar`             | Fungsi / `SC-FUNGSI`                           | `fungsi`                          | IND-011                                              | 1–5   |
| Aljabar / `CH-ALG`              | `aljabar`             | Barisan dan Deret / `SC-BD`                    | `barisan-deret`                   | IND-012, IND-013                                     | 1–5   |
| Geometri & Pengukuran / `CH-GP` | `geometri-pengukuran` | Objek Geometri / `SC-OG`                       | `objek-geometri`                  | IND-014, IND-015, IND-016                            | 1–5   |
| Geometri & Pengukuran / `CH-GP` | `geometri-pengukuran` | Transformasi Geometri / `SC-TG`                | `transformasi-geometri`           | IND-017                                              | 1–5   |
| Geometri & Pengukuran / `CH-GP` | `geometri-pengukuran` | Pengukuran / `SC-PENG`                         | `pengukuran`                      | IND-018, IND-019                                     | 1–5   |
| Data & Peluang / `CH-DP`        | `data-peluang`        | Data / `SC-DATA`                               | `data`                            | IND-020, IND-021, IND-022                            | 1–5   |
| Data & Peluang / `CH-DP`        | `data-peluang`        | Peluang / `SC-PELUANG`                         | `peluang`                         | IND-023                                              | 1–5   |

Slug bab unik global; slug subbab unik dalam bab. Resolve melalui `chapterCode` + `subchapterCode`; indikator juga diperiksa dalam scope subbab. Seeder fixture ini menolak kode IND/SC yang sudah berada pada parent lain, walaupun schema SQL mengizinkan kode scoped.

## Seluruh indikator

Kolom deskripsi berikut adalah nilai yang akan masuk `competencies.description`. JSON juga mempertahankan `sourceDescription` asli.

| Kode      | Subbab       | Deskripsi                                                                                                                                                                              | Review                |
| --------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `IND-001` | `SC-BR`      | Perbandingan dan sifat-sifat bilangan                                                                                                                                                  | DRAFT                 |
| `IND-002` | `SC-BR`      | Operasi aritmetika pada bilangan                                                                                                                                                       | DRAFT                 |
| `IND-003` | `SC-BR`      | Estimasi/ perkiraan hasil perhitungan                                                                                                                                                  | DRAFT                 |
| `IND-004` | `SC-BR`      | Faktorisasi prima bilangan asli                                                                                                                                                        | DRAFT                 |
| `IND-005` | `SC-BR`      | Rasio (skala, proporsi, dan laju perubahan)                                                                                                                                            | DRAFT                 |
| `IND-006` | `SC-BR`      | Perbandingan senilai dan berbalik nilai.                                                                                                                                               | DRAFT                 |
| `IND-007` | `SC-PPL`     | Persamaan linear satu variabel                                                                                                                                                         | DRAFT                 |
| `IND-008` | `SC-PPL`     | Pertidaksamaan linear satu variabel                                                                                                                                                    | DRAFT                 |
| `IND-009` | `SC-PPL`     | Sistem persamaan linear dua variabel                                                                                                                                                   | DRAFT                 |
| `IND-010` | `SC-BA`      | Bentuk aljabar dan sifat-sifat operasinya (komutatif, asosiatif, dan distributif)                                                                                                      | DRAFT                 |
| `IND-011` | `SC-FUNGSI`  | Relasi dan fungsi (domain, kodomain, range), serta penyajiannya.                                                                                                                       | DRAFT                 |
| `IND-012` | `SC-BD`      | Barisan berhingga bilangan                                                                                                                                                             | DRAFT                 |
| `IND-013` | `SC-BD`      | Deret berhingga bilangan.                                                                                                                                                              | DRAFT                 |
| `IND-014` | `SC-OG`      | Hubungan antar- sudut yang terbentuk oleh dua garis yang berpotongan, dan oleh dua garis sejajar yang dipotong suatu garis transversal (termasuk penentuan besar sudut dalam segitiga) | DRAFT                 |
| `IND-015` | `SC-OG`      | Teorema Pythagoras. Kekongruenan dan kesebangunan bangun datar                                                                                                                         | DRAFT                 |
| `IND-016` | `SC-OG`      | Jaring-jaring bangun ruang: prisma, tabung, limas, dan kerucut                                                                                                                         | DRAFT                 |
| `IND-017` | `SC-TG`      | Transformasi tunggal: refleksi, translasi, rotasi, dan dilatasi terhadap titik, garis, dan bangun datar pada bidang                                                                    | DRAFT                 |
| `IND-018` | `SC-PENG`    | Keliling dan luas bangun datar (daerah segi banyak dan daerah lingkaran, serta daerah gabungannya)                                                                                     | DRAFT                 |
| `IND-019` | `SC-PENG`    | Volume bangun ruang (prisma, limas, dan bola)                                                                                                                                          | DRAFT                 |
| `IND-020` | `SC-DATA`    | Perumusan pertanyaan untuk mendapatkan data, serta penyajian dan penginterpretasian data                                                                                               | DRAFT                 |
| `IND-021` | `SC-DATA`    | Penentuan dan penaksiran rerata (mean), median, modus, dan jangkauan (range) dari data                                                                                                 | DRAFT                 |
| `IND-022` | `SC-DATA`    | Perbandingan ukuran pemusatan dan ukuran penyebaran beberapa kelompok data                                                                                                             | Konfirmasi penempatan |
| `IND-023` | `SC-PELUANG` | Peluang dan frekuensi relatif dari kejadian tunggal.                                                                                                                                   | DRAFT                 |

## Hal yang tetap perlu review Curriculum

1. Indikator 6: nama header penulis `Bilangan`, sedangkan tabel utama `Bilangan Real`; dipetakan ke satu subbab SC-BR.
2. Data & Peluang adalah bab keempat pada tabel utama/ringkasan, tetapi tab penulis menyebut Bab 3. Referensi kode CH-DP tidak bergantung pada penomoran header.
3. Ringkasan mencantumkan Transformasi Geometri di bawah Data & Peluang. Tabel utama menempatkan subbab Peluang di sana; SC-TG tetap berada di CH-GP.
4. **IND-022**: tabel utama/ringkasan menempatkannya di Data; intro tab Abim di Peluang. Fixture mengikuti tabel utama sebagai DRAFT, dengan `reviewRequired: true`. Jangan publish pemetaan ini sebelum konfirmasi.
5. `Geometri dan Pengukuran` adalah nama primer; nama tampil `Geometri & Pengukuran` mempertahankan kontrak sampel. Alias dicatat dalam `sourceName`, tidak membuat bab kedua.
6. IND-016/017/020 mempertahankan normalisasi deskripsi master sampel terdahulu, termasuk koreksi ejaan `peginterpretasian` menjadi `penginterpretasian`. Teks primer disimpan verbatim dalam `sourceDescription` untuk review.

Seeder tidak mengubah status existing atau menaikkan DRAFT menjadi READY. Baris existing yang READY dipertahankan; level existing dengan deskripsi/kriteria yang telah ditetapkan juga dipertahankan. ARCHIVED tidak diaktifkan ulang.

## Cara kerja seeder

Semua insert dan audit berada dalam satu transaksi. Seeder memakai advisory lock serta table lock pada empat tabel master, timeout lock 5 detik dan statement 30 detik. Saat ada konflik, seluruh batch dibatalkan; tidak ada UPDATE, DELETE, perubahan schema, grant atau histori migrasi.

- Existing cocok: pakai UUID/status/urutan yang sudah ada; tanpa audit baru.
- Belum ada: insert DRAFT, kemudian audit `CURRICULUM_MASTER_CREATED` untuk setiap baris baru.
- Existing kode/parent/slug/nama/deskripsi berbeda atau ARCHIVED: gagal, tanpa overwrite. Perubahan kurikulum yang sah perlu prosedur revisi terpisah.
- Urutan baru ditambahkan setelah `max(display_order)` existing, agar demo tidak tertimpa. `sourceOrder` mempertahankan urutan akademik primer. Jika master hanya terisi sebagian sebelumnya, urutan database bisa berbeda; tinjau urutan terpisah, jangan menganggap seeder menyusun ulang data existing.
- Audit menyimpan batch, run ID, fingerprint, sumber, item sumber, flag review dan urutan aktual; `actor_user_id` null karena ini operator bootstrap, bukan tindakan Admin lewat aplikasi. Provenance baris existing tidak ditulis ulang.
- Tidak memakai runtime credential, tidak membuat user Auth, tidak mengubah RLS. Aplikasi tetap lewat NestJS.

## Menjalankan dari root repo

Node 24 dan dependency workspace harus sudah tersedia. Root script membaca file rahasia `.env.cloud.local` yang diabaikan Git.

**1. Validasi offline:** tidak memerlukan koneksi, tidak membuka database.

```powershell
corepack pnpm db:seed:curriculum
```

Hasil harus `OFFLINE_PLAN`, status DRAFT dan counts 4/10/23/50. Ini langkah yang sudah aman dilakukan sekarang untuk review fixture.

**2. Setelah baseline/review dan bukti backup-restore siap**, isi koneksi operator lokal; jangan kirim password/key di chat atau PR:

```dotenv
SUPABASE_PROJECT_REF=pkamenfnwmoeisccnrnk
DATABASE_MIGRATION_URL=postgresql://postgres:[PASSWORD_URL_ENCODED]@db.pkamenfnwmoeisccnrnk.supabase.co:5432/postgres?sslmode=require
```

Gunakan URL asli dari Dashboard Connect; contoh di atas adalah placeholder. Untuk jaringan IPv4, session pooler port 5432 dengan username `postgres.pkamenfnwmoeisccnrnk` juga diterima. Port 6543, target Production, URL tanpa TLS, atau parameter yang bisa mengganti target ditolak. Cara koneksi mengikuti [dokumentasi Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Seeder master hanya mengisi data pada schema yang sudah menyediakan code/slug/level/status; tidak memerlukan migrasi schema baru. Branch ini memakai baseline PR #62 dan juga memuat 0023 untuk importer soal; **master tidak otomatis menerapkan 0023**. Rekonsiliasi baseline tetap mengacu [panduan impor sampel](DRAFT_SAMPLE_IMPORT.md). Jangan menjalankan db:migrate hanya karena ingin mengisi master.

**3. Rehearsal transaksi di Staging:** lakukan setelah review dan kesiapan database; ini mencoba insert/audit lalu ROLLBACK. Bukan query read-only, dapat mengambil lock sebentar.

```powershell
corepack pnpm db:seed:curriculum --dry-run
```

Hasil `ROLLED_BACK_DRY_RUN`. Bila target kosong, created berjumlah 87; bila sebagian cocok sudah ada, hanya menghitung yang belum ada. Jumlah data tersimpan setelah transaksi harus tetap sama.

**4. Penerapan oleh operator setelah review:**

```powershell
$env:ALLOW_CURRICULUM_MASTER_SEED='true'
try {
  corepack pnpm db:seed:curriculum --apply
} finally {
  Remove-Item Env:ALLOW_CURRICULUM_MASTER_SEED -ErrorAction SilentlyContinue
}
```

Hasil `APPLIED`. Ulangi identik: `created: []`, tanpa duplikasi dan tanpa audit insert tambahan. Seeder tidak menghapus data untuk reset. Jika gagal, jangan mengubah file migration lama atau memakai seeder demo sebagai jalan pintas; cek pemetaan yang konflik.

## Verifikasi operator

```sql
select code, slug, name, display_order, status
from public.chapters
where code in ('CH-BIL','CH-ALG','CH-GP','CH-DP')
order by display_order;

select c.code as chapter_code, s.code as subchapter_code, s.slug, s.status,
       count(l.id) filter (where l.level_number between 1 and 5) as levels_1_to_5
from public.chapters c
join public.subchapters s on s.chapter_id=c.id
left join public.levels l on l.subchapter_id=s.id
where c.code in ('CH-BIL','CH-ALG','CH-GP','CH-DP')
group by c.code,s.id order by c.code,s.display_order;

select c.code as chapter_code, s.code as subchapter_code, i.code, i.description, i.status
from public.competencies i
join public.subchapters s on s.id=i.subchapter_id
join public.chapters c on c.id=s.chapter_id
where i.code ~ '^IND-[0-9]{3}$'
order by i.code;

select entity_type, count(*)
from public.audit_logs
where action='CURRICULUM_MASTER_CREATED'
  and metadata->>'batchCode'='CURRICULUM-DRILL-MASTER-2026-10-04-v1'
group by entity_type;
```

Periksa fixture dalam scope: tepat 4 kode bab, 10 subbab, 23 kode indikator dan 5 level per subbab. Audit berjumlah 87 hanya untuk seed baru penuh; existing yang digunakan tidak mendapat audit create baru. Total global tabel bisa lebih besar karena data demo/tim lain. Bandingkan ID/status/isi existing dan akun Auth sebelum/sesudah.

## Setelah master direview

1. Curriculum mengonfirmasi kode/pemetaan, khususnya IND-022 dan alias header. Perubahan pada data yang sudah diterapkan memerlukan revisi terkontrol, bukan seeder overwrite.
2. Uji importer 10 sampel dengan kode yang sama; lihat DRAFT_SAMPLE_IMPORT.md. Master lengkap kompatibel dengan master sampel, tidak mengubah JSON soal/kunci/media.
3. Backend memakai UUID hasil resolve kode untuk penyimpanan soal. Slug digunakan di route, bukan mengganti foreign key.
4. Setelah preview, validasi isi dan aset R2, lengkapkan difficulty/rubrik dari Curriculum dan gunakan alur review/publish Admin. Membuat master 50 level belum menyediakan 500 soal atau paket yang siap dimainkan.
5. Importer Admin umum dan komposisi paket Pretest/TryOut tetap pekerjaan terpisah.

## Pengujian yang dilakukan

Tanggal 4 Oktober 2026: validasi fixture/scope/kontrak sampel dan guard target lulus. Rehearsal PostgreSQL **PGlite in-memory** menjalankan rantai migration 0000–0023, rollback dry-run, insert 87 master DRAFT, impor ulang tanpa duplikasi, pelestarian data legacy dan 26 identitas Auth dummy, konflik atomik, serta kompatibilitas importer 10 soal.

```powershell
corepack pnpm test:curriculum-master
```

Tiga pemeriksaan offline selalu dijalankan. Rehearsal PostgreSQL tambahan aktif hanya jika `CURRICULUM_TEST_PGLITE_MODULE` menunjuk file modul PGlite yang tersedia di mesin uji; tanpa itu test ditandai SKIP secara eksplisit. Tidak menginstal dependency aplikasi baru.

Pengujian in-memory **bukan restore backup live**. Tidak ada Cloud migration/seed/import yang dijalankan dalam pekerjaan persiapan ini.

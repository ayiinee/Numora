# Impor percobaan 10 soal Curriculum

Tanggal: 4 Oktober 2026. Baseline main `6550710`, kemudian PR #62 commit `2539e3c` yang cocok dengan schema Staging; branch `feat/data-draft-sample-import`. PR #62 masih terbuka saat pemeriksaan. Migrasi fitur ini bernomor 0023 agar tidak bertabrakan dengan 0022 dari tim.

## Keputusan dan status

**USER CLARIFICATION:** DRAFT boleh tanpa difficulty. READY wajib mempunyai difficulty yang diisi Curriculum. Level 1 sumber tetap disimpan pada `questions.curriculum_level_number`, bukan otomatis EASY. Draft yang diarsipkan boleh mempertahankan null supaya riwayat ekstraksi tidak berubah. Constraint review READY yang sudah ada tetap berlaku.

**Status aktual:** berkas dan pengujian disiapkan; **belum ada migrasi atau impor ke Supabase Cloud**. Target yang diperiksa adalah Numora-Staging (`pkamenfnwmoeisccnrnk`), bukan Production. Snapshot baca menemukan 60 keluarga soal, 120 versi dan 26 akun Auth; tidak ada source_ref sepuluh sampel ini.

Entri tambahan Staging dengan hash `21ee101cf8b257b55669138811f66e19829203b89c8b95273bffba215c29da86` dan cursor `1791104652421` telah ditemukan: `0022_data_api_runtime_lockdown` dari [PR #62](https://github.com/ayiinee/Numora/pull/62). SHA-256 SQL cocok persis dengan Cloud. Tidak ada histori yang dihapus atau ditulis ulang.

[Laporan operator tim](SUPABASE_MIGRATION_2026-10-04.md) menyatakan backup public/drizzle/irt_compute sudah diuji restore, dengan arsip di `D:/numora-sandbox-backups/2026-10-04-main-6550710`. Lokasi tersebut tidak ditemukan pada komputer yang dapat diakses dalam sesi ini, termasuk setelah pemeriksaan akses host. Jadi hasil restore tersebut adalah bukti yang dilaporkan tim, belum diverifikasi ulang oleh pekerjaan ini. Arsip itu juga bukan backup penuh Auth/Storage/configuration. Penerapan 0023 dan impor tetap menunggu arsip/target restore yang dapat diakses untuk menguji perubahan baru, sesuai permintaan admin sebelumnya.

## Berkas dan isi database

- Migrasi `packages/database/drizzle/0023_draft_difficulty.sql` melepas NOT NULL difficulty dan menambahkan `question_versions_ready_difficulty_ck`; tidak menghapus/menulis ulang konten.
- Schema Drizzle serta kontrak draft JSON mengikuti aturan null DRAFT/terisi READY. Respons Admin menyatakan difficulty nullable; form legacy tetap meminta difficulty untuk authoring legacy.
- Skrip `scripts/prepare-draft-sample-import.mjs` memvalidasi sepuluh sumber, kunci tiga tipe, master/level serta SHA-256/enam gambar lokal, kemudian menghasilkan SQL. Skrip ini **tidak terkoneksi ke database**, tidak membaca env dan bukan endpoint importer Admin umum.

SQL akan membuat master sampel yang belum ada sebagai DRAFT: 2 bab, 3 subbab, 3 indikator, 3 level sumber. `display_order` baru ditambahkan setelah urutan existing, hanya untuk penempatan teknis demo, bukan persetujuan urutan akademik. Master existing yang sesuai digunakan; nama/slug/pemetaan yang konflik membatalkan seluruh transaksi.

Untuk inventaris seluruh draf, tersedia [master lengkap dan seeder Curriculum](CURRICULUM_MASTER_SEED.md): 4 bab, 10 subbab, 23 indikator dan 50 level DRAFT. Kode/nama/deskripsi subset sampel tetap kompatibel. Menjalankan master lengkap terlebih dahulu membuat importer sampel menggunakan master yang sudah ada; importer sampel sendiri tidak melengkapi seluruh inventaris.

Setiap sampel membuat satu `questions`, satu `question_variants` ORIGINAL dan satu `question_versions` versi 1, semuanya DRAFT. Komposisi: 7 PG, 2 MCMA, 1 Kategori. Foreign key level tetap per subbab. Tidak ada paket, attempt, skor, XP, rubrik atau perubahan akun.

| Field sumber                        | Penyimpanan                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| externalId                          | questions.source_ref, untuk lookup operator sampel                                     |
| chapter/subchapter/competency/level | UUID hasil resolve dalam scope hierarki                                                |
| stem, explanation                   | JSONB `{text,assetKeys}` utuh                                                          |
| options dan metadata.categories     | options_or_statements `{options,categories}`; categories `[]` untuk non-Kategori       |
| answer                              | answer_key utuh, sesuai tipe                                                           |
| metadata.assetManifest              | media, dengan objectKey null dan status upload belum selesai                           |
| sumber/metadata asli                | sourcePayload pada audit_logs internal, disertai externalId, namespace dan fingerprint |

Marker `[[asset:...]]` menunjuk assetId pada manifest. `assetKeys` masih kosong karena upload belum terkonfirmasi; proposedObjectKey bukan bukti objek tersedia. Enam file PNG tetap di paket repo, tidak dimasukkan sebagai binary database. Bucket tujuan `numora-bucket`.

Jejak audit berasal dari operator SQL atas permintaan Reyhan, dengan actor_user_id null (bukan berpura-pura sebagai user Admin aplikasi). Metadata audit hanya untuk operator berwenang. Penyimpanan provenance/identitas impor umum yang durable tetap perlu desain importer versi berikutnya; audit bukan API konten siswa.

Impor ulang identik dilewati tanpa duplikasi versi/audit. Konflik isi/status/pemetaan ditolak dan seluruh transaksi di-rollback; perubahan memerlukan importer revisi yang membuat versi baru. Transaksi mengunci tabel bank/master sementara untuk melindungi lookup source_ref dan penomoran master dari penulis lain; timeout lock 5 detik. Skrip ini terbatas batch sampel, tidak menggantikan unique source identity bagi importer umum.

## Menyiapkan dan menerapkan

1. Pada root branch ini, jalankan `corepack pnpm data:samples:prepare ./ten-draft-samples.sql`. File output baru diperlukan; file existing tidak ditimpa. Ini hanya validasi dan pembuatan SQL.
2. Asal entri tambahan sudah cocok dengan PR #62. Integrasikan/review PR #62 sebelum menggabungkan branch ini ke main, atau koordinasikan baseline yang sudah diterapkan bersama admin; jangan mengedit migrasi yang sudah diterapkan. Branch ini bergantung pada 0022 tersebut.
3. Lengkapi backup dengan hasil restore yang diminta admin, lalu uji migrasi dan SQL sampel pada salinan restore yang terisolasi. Tes PGlite di bawah bukan pengganti restore live Staging.
4. Setelah baseline, backup/restore, rehearsal dan review siap, operator menjalankan rantai Drizzle yang sudah direkonsiliasi melalui `db:migrate` menggunakan koneksi migrasi server yang tersimpan lokal. Jangan menjalankan file SQL schema secara manual di dashboard sebagai pengganti rantai repo. Skrip impor tidak mengubah atau memalsukan histori migrasi.
5. Jalankan SQL sampel pada koneksi operator ke Staging yang sudah diverifikasi. Jangan menggunakan koneksi Production. Catat hasil SELECT terakhir: tepat 10 source_ref, content_status DRAFT, difficulty null, level sumber 1.
6. Bandingkan jumlah dan identitas akun Auth, keluarga/versi lama serta paket sebelum/sesudah. Jika tidak ada perubahan tim lain, target total keluarga 70 dan versi 130; akun Auth tetap 26. Impor ulang harus menghasilkan nol baris baru.

Cloud connector tersedia untuk inspeksi baca. Env lokal pada workspace yang diperiksa masih menggunakan placeholder URL migrasi Cloud; jangan menyalin secret ke dokumen/PR/chat.

## Bukti pengujian dan pekerjaan berikutnya

Lulus validasi ketiga tipe, kunci/ID/level invalid, duplikasi ID, klaim upload tanpa bukti serta quoting teks SQL. Kontrak JSON terkompilasi dan typecheck package database lulus.

Pengujian SQL pada PostgreSQL in-memory PGlite menjalankan rantai fresh 0000–0023, mempertahankan konten existing dummy ketika upgrade, mengimpor tepat 10 DRAFT, menjalankan ulang tanpa duplikat, mempertahankan semua isi/kategori/enam manifest, menolak READY dengan difficulty null, menerima versi terklasifikasi dengan review, serta menolak konflik konten dan master secara atomik. 26 identitas Auth pada pengujian tersebut adalah dummy, **bukan backup akun Cloud**.

Setelah impor Staging berhasil, backend perlu endpoint preview/operator yang membaca rich JSON dan tiga tipe, decoder `{options,categories}`, pemisahan kunci dari respons siswa, URL gambar sementara serta renderer FE. Renderer legacy PG belum memenuhi kontrak ini. Lanjutkan upload R2 melalui endpoint backend, konfirmasi semua objectKey, review Curriculum dan rubrik sebelum publikasi. Sepuluh soal lintas subbab ini bukan satu paket Drill atau TryOut siap digunakan.

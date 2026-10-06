# Verifikasi pipeline impor tujuan/paket — 6 Oktober 2026

**ENGINEERING DECISION:** cakupan implementasi mengikuti [rencana yang disetujui](CONTENT_PACKAGE_PIPELINE.md). Publikasi dan keputusan akademik OPEN tetap diproteksi.

## Hasil

- Import Excel/JSON terarah menyimpan keluarga soal, versi, susunan paket, laporan dan audit dalam satu transaksi. Tujuan permanen, revision conflict dan retry idempoten diuji. Soal legacy tidak diklasifikasikan otomatis.
- V4 terikat paket tersedia untuk Drill 10, Pretest 20 dan Tryout 30. V3 tetap dapat dipreview, dengan konversi eksplisit sebelum simpan. Preview menampilkan tabel, LaTeX, gambar, urutan, seleksi dan editor.
- Checklist membedakan validasi struktur/media/penempatan, jumlah, review admin dan blocker publikasi. Review menyimpan pelaku/waktu/catatan tanpa mengubah versi impor menjadi READY.
- Migrasi canonical Drizzle `0025_magical_phil_sheldon` sudah diterapkan ke project pengembangan Supabase `pkamenfnwmoeisccnrnk` menggunakan migration runner repositori, tanpa perubahan schema manual dashboard.
- Tiga paket DEMO DRAFT kosong dibuat pada project tersebut. File contoh di `outputs/2026-10-06/NUMORA_V4` diunduh melalui endpoint template yang sama dengan aplikasi. Contoh soal belum disimpan ke bank development.
- Browser nyata dengan Supabase Auth dan API NestJS berhasil login admin, memilih ketiga paket DEMO, membaca file masing-masing, merender 10/20/30 baris serta LaTeX, dan mendapatkan validasi yang mengizinkan penyimpanan DRAFT. Smoke ini hanya membaca/preview, tidak mengimpor contoh ke bank.
- Kredensial akun QA admin pada penyimpanan lokal diselaraskan kembali; login dan otorisasi CONTENT_MANAGE diverifikasi. Tidak ada kredensial di laporan/Git.

## Pemeriksaan

| Pemeriksaan | Cakupan |
|---|---|
| `corepack pnpm lint` | ESLint seluruh workspace |
| `corepack pnpm contracts:validate` | Delapan JSON Schema |
| `corepack pnpm contracts:types:check` | OpenAPI/shared frontend types konsisten |
| `corepack pnpm exec turbo run typecheck --concurrency=1` | Seluruh workspace |
| Build package/API dan Next webpack | Build produksi; worker dibatasi untuk memori Windows |
| API unit | 60 tes, 15 file |
| Content integration | 30 tes, tiga file; PostgreSQL lokal terisolasi, migrasi lengkap dan role runtime |
| Web unit | 208 tes, 30 file; termasuk preview paket/media, konversi dan binding |
| Playwright admin | Empat skenario dengan fixture API/media: tiga tujuan sampai DRAFT/review/checklist, kegagalan upload gambar dan retry |
| Migration integration | 13 tes, tiga file; histori fork/canonical, upgrade curriculum dan jurnal migrasi |
| Browser smoke nyata | Supabase login, paket DEMO, parser/template/validasi melalui API nyata |

Pengujian integrasi mencakup salah tujuan/paket/scope, penomoran lintas sheet, paket parsial, seleksi/revisi/penghapusan keanggotaan, konflik admin, retry, rollback audit/transaksi, salinan lintas tujuan, klasifikasi legacy dan penolakan bypass lewat endpoint manual. Student, Teacher dan Admin Operasional tidak berhak menjalankan impor/review. Paket ber-blocker tetap tidak dapat diterbitkan.

Perintah tes content: `corepack pnpm --filter @tka/api exec vitest run src/modules/content/content-preview.integration.spec.ts src/modules/content/content.integration.spec.ts src/modules/content/drill-packages.integration.spec.ts --maxWorkers=1 --pool=threads`. Set `NODE_ENV=test` dan `TEST_DATABASE_URL` hanya ke PostgreSQL uji lokal yang telah dimigrasikan. Tes migrasi membuat dan menghapus database fixture sendiri; jangan arahkan ke database bersama.

## Batas bukti dan OPEN

**OPEN:** blueprint resmi/kontrak validasinya, runtime Pretest, kompatibilitas rich format/media pada pembaca siswa, dan kebijakan scoring/release terkait. Distribusi aktual ditampilkan; tidak ada kuota akademik yang ditebak.

Konfigurasi R2 nyata belum tersedia. Uji receipt, pemetaan gambar, upload gagal, retry dan preview media menggunakan fixture; hasil tersebut bukan bukti integrasi Cloudflare R2. File DEMO sengaja tanpa gambar. Uji upload cloud nyata diperlukan setelah konfigurasi dan CORS tersedia.

Suite integrasi domain lain yang memerlukan Redis tidak menjadi bukti penerimaan perubahan ini. Keterbatasan memori proses pengujian Windows ditangani dengan worker tunggal, pool threads dan heap build 768 MiB; pemeriksaan yang semula berhenti karena memori dijalankan ulang.

Gunakan [panduan admin](EXCEL_TEMPLATE_GUIDE.md) untuk QA dan [spesifikasi template](EXCEL_IMPORT_TEMPLATE_SPEC.md) untuk kontrak workbook.

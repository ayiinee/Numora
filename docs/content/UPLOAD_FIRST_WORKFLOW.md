# Alur upload dan pemetaan soal

**ENGINEERING DECISION â€” disetujui pemilik, 6 Oktober 2026:** preview memakai representasi intake terpisah dari kontrak impor final. Upload â†’ preview dan tujuan â†’ pemetaan/validasi â†’ draft â†’ Publish. Metadata kosong tidak membuang soal/gambar. Progres dapat disimpan tanpa paket; draft paket tetap memerlukan seluruh relasi wajib, kesulitan dan media terverifikasi. Penulis, namespace dan kode internal tidak diminta; identitas dan provenance dibuat server.

Drill hanya mengisi bab/subbab/level sumber yang kosong dari tujuan, Pretest hanya bab, Tryout tetap per soal. Indikator kosong diisi hanya jika tepat satu kandidat sah. Nama dinormalisasi NFC, trim dan huruf kecil; kode dicocokkan tepat. Semua pencocokan memeriksa induk. Nilai sumber yang tidak ditemukan tidak diganti otomatis. Pilihan pengguna dan konflik dicatat; perubahan tujuan menghitung ulang isian otomatis.

**PRD RULE:** jumlah Tryout/Pretest/Drill 30/20/10; jumlah parsial boleh DRAFT. Tryout 600 detik, rilis Senin 00:00 WIB, tutup Minggu 23:59:00 WIB; tanggal Senin mendatang dipilih Admin. Akses Super Admin/Content saja. Histori hasil, attempt dan XP dipertahankan.

**OPEN / dependency:** rubrik parsial PGK belum tersedia; upload/review tetap tersedia, Publish tertahan. Master development masih berisi fixture DEMO. Kedua workbook akademik dapat dipreview tetapi tidak dialihkan ke DEMO untuk meloloskan impor. Lengkapi master melalui halaman Materi setelah pengesahan Curriculum. Metadata nullable historis bukan izin mengosongkan metadata impor baru. Master bukan ARCHIVED boleh dipetakan untuk draft; seluruh master terkait, termasuk level setiap soal, harus READY saat Publish.

Keputusan ini memperbarui alur paket-dahulu pada `EXCEL_UPLOAD_WORKFLOW_2026-10-06.md` dan refinement upload-first sebelumnya. Template V5 memakai nama master serta level/kesulitan akademik. Template lama dibaca sebagai salinan baru; paket asal tidak ditimpa. Tampilan memakai panel netral, border formulir/tabel dan langkah bernomor.

## Panduan Admin

1. Buka **Impor soal â†’ Upload soal**, unduh template V5. Isi konten, pilihan, kunci, pembahasan, level dan kesulitan akademik. Nama bab/subbab/indikator memakai pilihan master. Nilai yang belum tersedia tetap dapat dipreview. Tanam gambar pada `img_*` dan isi `alt_*`.
2. Drag-and-drop satu `.xlsx` (maksimal 10 MiB, 100 soal). **Preview dan tujuan** menampilkan baris yang terbaca beserta gambar. Periksa/edit konten, pilih dan urutkan soal. Isi jenis/judul dan cakupan: Pretest satu bab; Drill bab/subbab/level; Tryout materi tiap soal. **Lanjutkan ke pemetaan** menyimpan progres meskipun pemetaan belum lengkap.
3. Pada **Pemetaan dan validasi**, pilih materi per soal atau beberapa soal terpilih. Dropdown memakai nama dan hubungan induk. Nilai asli tetap terlihat bersama asal **Dari Excel**, **Diisi otomatis**, atau **Dipilih pengguna**. Buka **Materi** apabila master belum tersedia. **Simpan progres preview** tersedia sebelum pemetaan selesai. Setelah konten, relasi wajib, kesulitan dan media valid, **Simpan draft** memverifikasi gambar lalu membuat paket/soal secara atomik. Jumlah parsial boleh disimpan tetapi belum boleh Publish.
4. Periksa checklist. Untuk Tryout pilih Senin mendatang. Centang konfirmasi tinjauan/persetujuan Curriculum lalu **Publish paket**. Master terkait harus READY; PGK tetap DRAFT sampai scoring tersedia. Tidak ada isian penulis atau kode internal.
5. **Riwayat unggahan** menampilkan file, waktu WIB, admin, jenis/judul sebelum paket terbentuk, jumlah, masalah konten/pemetaan dan status paket. Cari/filter lalu **Lihat/Lanjutkan**. URL `?upload=<id>` memulihkan sesi setelah refresh.

Perubahan lokal baru tersimpan setelah Simpan progres/Validasi. Setelah paket dibuat, jenis/cakupan paket tetap. Perubahan teks membuat versi baru; susunan paket mengubah revisi dan membatalkan approval sebelumnya. Paket terbit/arsip tidak ditimpa. Receipt gambar diverifikasi kembali server tanpa PUT ulang.

## Penyimpanan dan kontrak

- Migrasi existing `0032_excel_upload_sessions.sql` menyediakan tabel sesi, RLS dan privilege runtime. Refinement intake tidak menambah migrasi: tujuan, pemetaan, provenance dan `intakeVersion: 1` memakai JSONB existing.
- File asli disimpan pada `excel-uploads/<uuid>/source.xlsx` di R2 dengan checksum SHA-256. PostgreSQL tidak menyimpan binary/base64. Sesi lama dipulihkan dari Excel asal tanpa menimpa edit. GET tidak menulis hasil pemulihan; PATCH tetap memerlukan revisi. File lama tanpa arsip hanya dapat dilihat, lalu diunggah ulang untuk salinan editable.
- Endpoint: `GET /api/v1/admin/content/upload-template`, `POST /uploads` (multipart dan Idempotency-Key), `GET /uploads`, `GET /uploads/:id`, `PATCH /uploads/:id/preview`, `POST /uploads/:id/draft` (Idempotency-Key). Prefix endpoint upload adalah `/api/v1/admin/content`.
- PATCH menerima revisi, soal intake, pilihan/urutan dan `destination` (jenis, judul, UUID scope). Respons memisahkan masalah konten/pemetaan dan kelayakan draft. Kontrak JSON final serta endpoint Excel lama tetap ketat dan kompatibel.
- Draft memeriksa ulang master dan media, lalu mengunci sesi/paket dan mengimpor dalam transaksi existing. Retry mempertahankan paket yang sama; body berbeda pada key sama ditolak. Revisi stale tidak menimpa edit.
- Upload gagal tetap tercatat tanpa paket. File ditolak ukuran/format tidak diarsipkan. Kegagalan R2/database tidak meninggalkan paket setengah tersimpan; objek R2 yang belum tertaut mungkin tersisa.
- Publish existing dengan `confirmed: true` memeriksa kesiapan, mencatat review/approval versi saat itu, menyegel blueprint dan menerbitkan dalam satu transaksi. Perubahan isi membatalkan kesiapan. Bank soal memakai versi READY, histori/attempt lama tetap.

## Bukti pengujian

**QA evidence sebelumnya â€” upload-first:** development `pkamenfnwmoeisccnrnk` telah memakai migrasi 0032. Smoke TEST ONLY/DEMO membuktikan arsip Excel di R2, pemulihan gambar, CORS PUT, receipt, draft/retry, Publish dan gambar siswa. Bukti ini berasal dari tahap upload-first sebelumnya, bukan pengesahan workbook akademik.

**QA evidence refinement intake â€” 7 Oktober 2026:** 74 tes modul konten/API pada PostgreSQL lokal terisolasi, 19 tes UI, dan 14 tes browser desktop/mobile lolos. Enam alur upload browser diulang setelah penyempurnaan visual dan kembali lolos. Sembilan tes pemetaan, termasuk NFC, diuji ulang dan lolos. Lint workspace, typecheck/build API/database/web, production build Next, delapan schema kontrak serta pemeriksaan generated types lolos. Refinement ini tidak menjalankan seed atau migrasi shared cloud.

Tes database membuktikan progres tanpa indikator tersimpan tanpa paket, pemulihan sesi lama tidak menulis saat GET, identitas/media tidak dapat dipalsukan, revisi stale ditolak, dan draft lengkap menghasilkan sepuluh versi DRAFT dengan level/indikator serta urutan 1â€“10 yang benar. Perubahan master setelah validasi menahan penyimpanan; Publish memeriksa level setiap soal, jumlah, tanggal, READY, receipt dan pembatasan PGK. Fixture PG lengkap berhasil diterbitkan; hasil ini bukan pengesahan workbook akademik.

Smoke development nyata memakai akun QA yang telah tersedia: NestJS RBAC, riwayat Supabase, pemulihan Excel asal dari R2, provenance, preservasi revisi GET dan template V5 lolos. Sesi yang diperiksa memulihkan 10 soal dan 3 gambar dengan 40 masalah pemetaan yang tetap ditampilkan. Tidak membuat paket atau menerbitkan workbook akademik dalam smoke tersebut. Web/API/database pada 3000/3001 merespons 200; endpoint upload tanpa login merespons 401.

### Mencoba workbook asli

- `C:/Users/user/Downloads/TryOut.xlsx`: parser intake mempertahankan 30 soal (18 PG, 6 MCMA, 6 kategori) dan 5 gambar. Indikator dan level sumber kosong; kode akademik belum tersedia pada master development yang diperiksa. Upload, isi judul/jenis Tryout, lanjutkan ke pemetaan dan simpan progres. Draft menunggu penyelesaian metadata/relasi; PGK menahan Publish.
- `C:/Users/user/Downloads/NUMORA_Pretest_Aljabar_10_Soal_V3.xlsx`: intake mempertahankan 10 soal (5 PG, 3 MCMA, 2 kategori) dan 3 gambar, termasuk kode sumber yang belum ditemukan. Pilih Pretest dan bab yang benar setelah master Curriculum tersedia; koreksi secara eksplisit. Jumlah masih 10 dari 20 dan PGK tetap menahan Publish.

Buka `http://localhost:3000/admin/content/imports`, login sebagai Super Admin/Content, lalu unggah file. Nilai sumber yang tidak ditemukan tetap terlihat; gunakan **Materi** untuk menambahkan master melalui alur existing setelah pengesahan Curriculum. Tidak memetakan otomatis ke fixture DEMO. **Simpan progres preview** dan **Riwayat unggahan â†’ Lanjutkan** dapat dipakai sebelum metadata selesai. Screenshot terverifikasi berada di `.tmp/upload-first-browser/mapping-TRYOUT-390.png` dan `mapping-TRYOUT-1280.png`.

Perintah pemeriksaan (URL test harus database lokal yang sudah dimigrasi):

```powershell
node node_modules/eslint/bin/eslint.js . --max-warnings=0
node scripts/validate-contracts.mjs
node scripts/generate-learning-types.mjs --check
# apps/api, NODE_ENV=test, ALLOW_SYNTHETIC_CONTENT=true, TEST_DATABASE_URL lokal:
node node_modules/vitest/vitest.mjs run src/modules/content --maxWorkers=1
# apps/web:
node node_modules/vitest/vitest.mjs run src/features/admin/content-upload.test.tsx
$env:NUMORA_E2E_WEBPACK='true'
node node_modules/@playwright/test/cli.js test e2e/admin.spec.ts --grep 'Upload-first|Unified Admin portal'
```


## Keputusan pemilik â€” 7 Oktober 2026: indikator Tryout

**ENGINEERING DECISION â€” disetujui pemilik:** Tryout mengabaikan indikator pada alur upload, draft dan Publish. Nilai asli Excel tetap disimpan sebagai provenance; indikator efektif kosong tidak menghalangi Tryout. Drill dan Pretest tetap wajib memiliki indikator sah. Bab, subbab, level, kesulitan, konten, media dan aturan Publish lain tetap diperiksa. Identitas soal/paket dibuat otomatis; sistem tidak mengarang materi akademik. Migrasi forward membolehkan primary_competency_id NULL hanya untuk keluarga TRYOUT; histori tidak ditulis ulang.

### Verifikasi pengecualian indikator Tryout — 7 Oktober 2026

- 79 tes API konten lulus; fixture PG Tryout 30 soal tanpa indikator berhasil Publish, primary_competency_id tersimpan NULL, dan versi READY tetap muncul di bank soal. Fixture terisolasi, bukan kelayakan workbook akademik pengguna.
- 15 tes UI preview/upload dan 6 skenario browser desktop/mobile lulus. Dropdown indikator tidak tampil untuk Tryout; tetap tersedia untuk Drill/Pretest.
- Build database/API/frontend, typecheck frontend, lint file terkait, kontrak dan generated types lulus.
- Migrasi 0033 diterapkan melalui migrator existing ke Supabase development pkamenfnwmoeisccnrnk setelah baseline diperiksa. Constraint terverifikasi: indikator kosong hanya diizinkan untuk TRYOUT. Tidak ada seed, pengubahan master, atau penulisan ulang histori.
- Cara mencoba: buka /admin/content/imports, lanjutkan unggahan lama atau unggah Excel baru, pilih Tryout, lalu Simpan progres preview / Validasi untuk memperbarui laporan. Indikator tidak diperlukan; bab, subbab, level dan kesulitan tetap harus sah. PGK tetap menunggu aturan scoring sebelum Publish.

Smoke live setelah migrasi: Excel Tryout pengguna tetap terbaca 30 soal/5 gambar melalui arsip R2. Indikator diabaikan; level yang kosong tetap memerlukan pemetaan, sehingga hasil fixture Publish tidak berarti workbook pengguna otomatis siap terbit.


**ENGINEERING DECISION — pemilik, 7 Oktober 2026 (menggantikan aturan sebelumnya yang mengabaikan indikator Tryout):** Tryout mengizinkan subbab, indikator dan level sumber kosong (`null`) sampai Publish. Nilai yang diberikan tetap dipertahankan dan divalidasi terhadap master/induk. Bab dan kesulitan tetap wajib; Drill/Pretest, konten/kunci/pembahasan, jumlah, media, review, jadwal dan pembatasan PGK tidak dilonggarkan. Migrasi 0034 menambahkan referensi bab/subbab nullable pada keluarga soal agar Tryout tanpa level tetap tersimpan dan dapat dibaca; histori tidak diubah.


### Aktivasi Tryout dengan metadata opsional — 7 Oktober 2026

Migrasi 0034 diterapkan melalui migrator resmi ke Staging `pkamenfnwmoeisccnrnk`. Journal bertambah 55 → 56; replay tidak menambah entri. Digest 150 tabel lama identik, referensi bab/subbab nullable tersedia, dan akses RLS/runtime terverifikasi. Snapshot data terkait dan bukti privat berada di `.tmp/tryout-null-activation-backup/`; ini bukan backup Supabase penuh.

Smoke API aktif: unggahan `TEST_ONLY_tryout_null.xlsx` dengan bab sah dan subbab/indikator/level kosong mencapai VALIDATED; nilai subbab yang tidak dikenal ditolak. Tidak dibuat draft paket baru atau publikasi akademik. API berjalan pada localhost:3001 dan frontend hasil build compile → generate pada localhost:3000. Typecheck terpisah sudah lulus; build dipisahkan untuk menghindari keterbatasan memori host. Unggahan lama perlu divalidasi ulang; master READY dan seluruh gate Publish lainnya tetap berlaku.


**ENGINEERING DECISION — pemilik, 7 Oktober 2026 (menggantikan kewajiban bab Tryout sebelumnya):** Bab, subbab, indikator dan level per soal maupun scope paket tidak wajib untuk Tryout campuran. Metadata materi kosong disimpan null sampai Publish. Admin dapat secara eksplisit melewati pemetaan materi tanpa menghapus sumber Excel; materi yang tetap dipakai divalidasi terhadap master. Kesulitan, konten, kunci, pembahasan dan gate Publish lain tetap berlaku; Drill/Pretest tetap memerlukan scope.


**ENGINEERING DECISION — pemilik, 7 Oktober 2026:** Tryout boleh tanpa kesulitan serta tanpa pemetaan materi. Referensi Excel yang belum dapat dipetakan tetap menjadi provenance, dengan relasi efektif null; tidak mengarang materi atau kunci. Status DRAFT materi tidak menghalangi paket Tryout, tetapi materi ARCHIVED tidak dipakai. Rubrik PGK yang disetujui pemilik: MCMA dinilai per keputusan memilih/tidak memilih setiap opsi; Kategori per pernyataan tepat; jawaban kosong 0. Nilai proporsional dibulatkan ke dua desimal mengikuti kolom awarded_points; XP = jumlah benar ekuivalen ×10 dari poin tersimpan. Rubrik dipin melalui kebijakan baru TRYOUT_PGK_PARTIAL_V1 (migrasi 0035); paket/hasil lama tidak diubah. Urutan Tryout diacak server saat attempt dibuat dan disimpan tetap selama resume. Gambar diunggah dengan maksimal tiga pekerjaan paralel dan receipt R2 wajib diverifikasi. Konten, pilihan/pernyataan, kunci, pembahasan, otorisasi, review, jumlah, jadwal, dan integritas versi tetap divalidasi.


**ENGINEERING DECISION — aktivasi 7 Oktober 2026:** Migrasi 0035–0036 aktif pada proyek pengembangan pkamenfnwmoeisccnrnk; replay tidak menambah migrasi dan 150 tabel mempertahankan data sebelumnya (hanya kebijakan scoring baru ditambahkan). Rubrik SEALED per jenis/jumlah opsi atau pernyataan dipin saat impor, lalu diwariskan ke package_items/attempt_items. Draft PGK lama tanpa rubric perlu impor ulang untuk membuat revisi; histori tidak dimutasi. Pemeriksaan runtime menahan versi PGK tanpa rubric. Validasi menggunakan cache master lokal dalam transaksi serta lookup identitas impor secara batch; tidak ada cache global yang dapat menutupi perubahan master. Tes integrasi membuktikan Publish paket campuran 30 soal dengan semua metadata materi/kesulitan null, skor parsial, XP dan submit idempoten.


**ENGINEERING DECISION — pemilik, 7 Oktober 2026:** Tryout dapat dipublish kapan saja, menggantikan batas Senin dan satu paket mingguan pada alur Admin. Tanggal rilis opsional: kosong berarti Publish sekarang; waktu lampau menjadi sekarang; waktu mendatang menjadwalkan akses. Batch tetap berjalan selama 7 hari dikurangi satu menit sejak rilis efektif, durasi attempt 10 menit dan IRT setelah batch tutup tetap berlaku. Paket dan attempt lama tidak diubah.


**ENGINEERING DECISION — perbaikan akses, pemilik 7 Oktober 2026:** Publish Excel Tryout mengunci snapshot beserta scoring/blueprint pins secara atomik. Digest komposisi review dipertahankan sebagai compositionDigest; manifestDigest persetujuan mengikuti digest snapshot database. Distribusi paket Excel yang sudah direview/disetujui Admin tidak menunggu package_quality_results generator; jalur ini memeriksa 30 versi READY, provenance impor, persetujuan SEALED dan tetap menahan keputusan HOLD/RETIRED. Tidak membuat hasil statistik sintetis. Dua paket terbit tanpa attempt dipulihkan dengan backup; jadwal/histori attempt tidak diubah.

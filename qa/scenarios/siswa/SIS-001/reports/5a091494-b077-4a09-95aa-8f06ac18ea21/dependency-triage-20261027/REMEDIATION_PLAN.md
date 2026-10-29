# Kandidat rencana remediasi dependency

**PROPOSED — belum diimplementasikan.** Acuan review DEP-20261027-SIS001-OPT, run 5a091494-b077-4a09-95aa-8f06ac18ea21. Metadata registry diverifikasi pada 2026-10-27T14:14:10.689Z; ketersediaan versi tidak membuktikan kompatibilitas.

## R0 — runtime (P0, PROPOSED)

Built-in fetch tetap rentan bila hanya paket Undici diupgrade. jsdom yang sudah terpasang juga meminta Node ^24.15.0 sehingga Node saat ini di bawah engine range.

- Node 24.14.1 -> 24.22.1 (Undici bawaan 7.30.1) pada runtime tes/CI/deployment yang disepakati; pnpm tetap 12.6.0

Verifikasi yang diperlukan:

- Catat node executable, process.versions.node dan process.versions.undici di setiap lingkungan
- Validasi tools/build/test Node 24; tidak mengganti binary global atau runtime aplikasi Codex tanpa scope eksplisit

## R1 — web (P0, PROPOSED)

Menangani sepuluh advisory Next, termasuk dua critical dan dua high. Node24 dan React19.3 memenuhi metadata peer/engine kandidat; kompatibilitas belum dites.

- apps/web/package.json: next 16.3.6 -> 16.4.1
- apps/web/package.json: @next/env ^16.3.8 -> 16.4.1
- Regenerasi lockfile dengan target terkontrol; verifikasi Sharp >=0.35.5 untuk deployment target

Verifikasi yang diperlukan:

- Lint, typecheck, build web; periksa perubahan Next 16.4 dan panduan lokal apps/web/AGENTS.md sebelum edit
- Connected SIS-001, ownership/anonymous/wrong-role, refresh/resume/retry, hasil dan XP
- Periksa bundle/deployment image: versi Next/Sharp, endpoint image dan penggunaan cache/Server Action; tidak menjalankan RCE PoC

## R2 — API HTTP and upload (P0, PROPOSED)

body-parser aktif sebelum guard; Multer ditangani lewat parent yang sama. Metadata platform-express12.3.2 menerima core/common ^12.0.0, tetapi kompatibilitas peer dan perilaku HTTP tetap perlu tes.

- Kandidat parent: @nestjs/platform-express 12.1.0 -> 12.3.2 (Express 5.3.0 dan Multer 2.5.0)
- Pastikan semua resolusi Express > body-parser = 2.4.0 atau versi patched yang diverifikasi. Express 5.3.0 masih mendeklarasikan ^2.3.0; upgrade parent saja tidak membuktikan versi lock aman.
- Jika masih terpilih versi rentan, gunakan override terarah yang terdokumentasi pada pnpm-workspace.yaml untuk jalur Express > body-parser; jangan override global sembarang major.

Verifikasi yang diperlukan:

- Database tes baru; suite API serial --maxWorkers=1 untuk menghindari konflik fixture TryOut yang sudah diamati
- JSON valid/malformed, batas 2mb, compressed request dan teardown: child process sekali pakai di loopback dengan batas waktu; API harus tetap hidup sesudah respons
- Excel parse/upload, batas ukuran/field, multipart abort, Admin subrole/401/403/413; inventaris async fileFilter tetap kosong
- Kontrak problem+json/OpenAPI freshness dan learning42/worker25 + concurrency/idempotency; tidak mengubah grading/XP/pool/timeouts

## R3 — remaining production transitive/direct (P1, PROPOSED)

Enam advisory tambahan (dua high, dua moderate, dua low). Range transitif/lock harus diperiksa; jangan menyamakan tidak ditemukan pemakaian dengan kelulusan audit.

- Zod 4.6.5 -> 4.6.6 pada web
- source-map-js 1.2.1 -> 1.2.2 pada semua jalur
- fast-uri 3.1.8 -> 3.1.9 pada semua jalur Ajv

Verifikasi yang diperlukan:

- Build CSS/source map, component/browser checks, kontrak Ajv, validasi URI dan boundary input; audit ulang seluruh workspace

## R4 — development toolchain (P1, PROPOSED)

Sebelas advisory dev; Windows team membuat launch-editor relevan. Memperbarui Vitest saja tidak menjamin peer Vite atau jsdom/Undici ikut berubah.

- Vitest 5.0.2 -> 5.0.3 di setiap manifest yang meminjamnya; mocker 5.0.3
- Resolusi Vite 8.3.1 -> 8.3.3
- Undici jsdom 8.11.2 -> 8.12.2; range jsdom ^8.10.2 menerima target. Tidak perlu menaikkan major jsdom.

Verifikasi yang diperlukan:

- Daftar resolusi seluruh workspace; engine check Node baru; API/worker/component suites dan workflow39
- Jangan memakai passWithNoTests untuk klaim acceptance; fixture workbook yang hilang tetap NOT_RUN

## R5 — legacy transitive (P2, PROPOSED_REQUIRES_COMPATIBILITY_INVESTIGATION)

Dua moderate memerlukan evaluasi kompatibilitas. Drizzle-kit terbaru saat pemeriksaan masih 0.31.11; upgrade parent ke versi sama tidak menghilangkan loader tua.

- ExcelJS4.4.0 > uuid8.3.2: patched >=11.1.1 melewati major range ^8.3.0
- drizzle-kit0.31.11 > @esbuild-kit/esm-loader > core-utils > esbuild0.18.20: patched >=0.25.0 melewati range lama

Verifikasi yang diperlukan:

- Evaluasi parent/fork atau override terarah setelah pembuktian CommonJS UUID dan XLSX import/export, gambar/formula/Unicode/batas ukuran
- Esbuild0.x lintas minor perlu smoke loader/migrasi/skema pada DB disposable; jangan menghasilkan migrasi produk baru
- Audit full baru harus tetap FAIL bila advisory ini masih terbuka; tidak menambah ignore/suppression

## Urutan eksekusi dan kriteria selesai

1. Snapshot source dirty saat ini, manifest/lock dan hash bukti. Jalankan runtime kandidat24.22.1 terisolasi dengan executable eksplisit. Instalasi global, proses Codex, layanan umum dan deployment tidak diubah.
2. Terapkan batch R1/R2 dengan versi exact terpilih, pertahankan pnpm12.6.0 dan allowBuilds. Perubahan override harus sempit, memiliki alasan compatibility dan dihapus bila parent sudah menyediakan fix. Ikuti [mekanisme overrides pnpm](https://pnpm.io/settings/dependency-resolution#overrides). Hindari audit fix --force atau update --latest seluruh workspace.
3. Audit full/prod dan baca lock/resolusi nyata. Paket Next16.4.1 harus terpilih bersama env16.4.1; body-parser>=2.4.0 dan Multer>=2.5.0; jangan menyimpulkan dari versi parent saja. Catat advisory yang selesai perID, temuan sisa dan temuan baru.
4. Jalankan frozen-lockfile reproducibility, lint, typecheck, build, kontrak/freshness; unit/component/worker/API serial pada DB/prefix baru; lalu SIS-001 terhubung dan uji keamanan terarah di child disposable. Jangan mengurangi assertion/timeout agar lulus.
5. Setelah R0–R5 yang dipilih selesai dan tes terkait lulus, jalankan satu full SIS-001 versi dependency baru dengan parent run5a091494-b077-4a09-95aa-8f06ac18ea21. Volume1k/10k/100k, drain120detik, timeoutHTTP15detik, VU10/25/50/100/250 dan full60menit setelah build tetap. Jangan menimpa result.json lama atau menganggap PASS optimasi berlaku otomatis pada graph baru.
6. Bila gagal, simpan bukti, hentikan hanya batch yang terdampak dan pulihkan file kandidat dari snapshot milik tahap itu; hindari git reset/clean yang menghapus optimasi sebelumnya. Remediasi yang belum lulus tetap OPEN.

## Batas penerimaan

Audit all dan prod harus dinilai terpisah. Menutup P0 tidak berarti audit full hijau; seluruh31 advisory awal tetap memiliki disposisi dan bukti. Remediasi berbasis metadata ditandai belum diuji sampai hasil baru tersedia. Keyboard manual dan fixture workbook akademik tetap NOT_RUN sampai bukti yang sah tersedia; test ini tidak diberi PASS dari audit. Staging/produksi memerlukan pemeriksaan versi yang benar-benar terdeploy.

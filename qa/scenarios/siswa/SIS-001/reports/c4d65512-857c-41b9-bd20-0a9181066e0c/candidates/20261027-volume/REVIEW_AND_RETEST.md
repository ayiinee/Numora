# SIS-001 — paket patch kandidat volume

**PROPOSED — artefak review, belum diterapkan.** Disiapkan 27 Oktober 2026 untuk sesi siswa `7cbff6b0-2467-4216-8792-67cc990eb369`, berdasarkan investigasi run `c4d65512-857c-41b9-bd20-0a9181066e0c`.

Paket berisi dua patch independen agar pengaruh perubahan query dapat diukur sebelum perubahan alat QA. Persetujuan penggunaan workflow tim sudah selesai; dokumen ini tidak membuka kembali review PIC. Kandidat belum menjadi perbaikan terverifikasi atau hasil pengujian aplikasi yang lulus.

## Isi perubahan

| Patch | File sasaran | Perubahan |
| --- | --- | --- |
| `01-worker-order.patch` | `apps/worker/src/outbox.ts` | Menambahkan `processed_at` sebagai kunci urutan pertama, diikuti `occurred_at, id`, untuk menyelaraskan query dengan indeks existing. |
| Patch 01 | `apps/worker/src/outbox-order.integration.spec.ts` baru | Dua regresi database: urutan waktu/UUID ketika timestamp sama; melewati event pertama yang dikunci transaksi lain lalu memprosesnya setelah lock dilepas. |
| `02-qa-volume.patch` | `qa/runtime/pipeline.mjs` | Menandai fixture dengan run/stage ID, menghentikan eskalasi pada FAIL/BLOCKED, mencatat tahap lanjutan sebagai NOT_RUN, dan menyimpan sampel backlog/usia serta hasil parsial. |
| Patch 02 | `scripts/qa/volume-flow.mjs` baru | Mengatur tahapan kumulatif, normalisasi hasil, probe EXISTS, snapshot penuh pada awal/akhir dan sekitar setiap satu detik, serta batas drain. |
| Patch 02 | `scripts/qa/volume-flow.test.mjs` baru | Dua belas tes perilaku alat QA, otomatis tercakup oleh glob `pnpm test:qa-workflow` setelah diterapkan. |

Patch 01 mempertahankan `WHERE processed_at IS NULL`, cooldown lima menit, tie-breaker ID, `FOR UPDATE SKIP LOCKED`, satu transaksi per event, dan idempotensi `event_id`. Karena semua kandidat memiliki `processed_at = NULL`, penambahan kunci urutan ini tidak mengubah urutan logis kandidat. Tidak ada migrasi atau indeks baru dalam kandidat ini.

Patch 02 tetap memakai eksperimen **kumulatif**, bukan database baru per ukuran. Tahap 1k, tambahan 10k, lalu tambahan 100k hanya dilanjutkan bila tahap sebelumnya selesai beserta rekonsiliasinya. Baris processed dari tahap terdahulu tetap ada. Rekonsiliasi dan persentil latensi existing tetap kumulatif; stage ID memungkinkan investigasi per gelombang tanpa merekonstruksi timestamp. Contoh keluaran terhalang: `PASS, BLOCKED, NOT_RUN`; ringkasan `passed=1, blocked=1, skipped=1, total=3` tetap menghasilkan BLOCKED pada parser existing.

Probe EXISTS hanya dipakai untuk kendali loop. Hitungan total/pending/usia dan rekonsiliasi identitas/isi tetap diperlukan untuk bukti. Interval snapshot bersifat kooperatif: query atau batch yang sedang berjalan dapat membuat interval lebih panjang. Drain masih memakai batch 10 dan batas 120 detik. Batch/query berjalan tidak dibatalkan paksa; jika penyelesaiannya melampaui batas, hasil tetap incomplete walaupun pending sudah nol. Batas keseluruhan full tetap 3.600 detik di luar setup/build.

Tidak ada perubahan aturan Drill/XP, ukuran volume, VU, durasi eksperimen, dependency, konfigurasi PostgreSQL/Redis, atau hasil run lama.

## Dasar dan risiko yang masih harus dibuktikan

Investigasi baca sebelumnya menemukan median query ekuivalen 30,375 ms menjadi 0,341 ms, dan plan exact diagnostik berubah dari sequential scan/sort menjadi index scan/incremental sort. Angka ini bukan pengukuran transaksi worker dan bukan janji peningkatan throughput 89 kali. Plan nyata masih bergantung pada data, statistik dan versi database.

Satu transaksi/commit per event tetap dapat menjadi batas berikutnya. Mengosongkan 100.000 event dalam 120 detik memerlukan rata-rata sekitar 833 event/detik; ini kebutuhan eksperimen, bukan SLO produk. Probe EXISTS juga belum dibuktikan mengurangi durasi keseluruhan harness melalui retest nyata.

Dokumen investigasi sumber: `SIS_001_VOLUME_INVESTIGATION.md` pada ekspor laporan, atau `VOLUME_INVESTIGATION.md` pada direktori laporan run di repository. Tidak ada koneksi database dibuka ketika menyiapkan atau memvalidasi paket kandidat ini.

## Validasi yang sudah dilakukan

- **12/12 tes alat QA PASS**, tanpa skip: penghentian eskalasi, kegagalan integritas, seleksi kosong/invalid, pencatatan NOT_RUN, frekuensi snapshot, bukti akhir, serta batas waktu/probe/batch yang terlambat.
- **5 kasus kompatibilitas parser existing PASS**, termasuk bukti terhalang, gagal, lulus lengkap, semua NOT_RUN, dan nol tes. Nol tes/NOT_RUN tidak dianggap lulus.
- Syntax tiga file JavaScript PASS; format empat file baru/QA PASS.
- TypeScript untuk kandidat worker dan dua regresi database PASS dengan sumber virtual di memori dan `noEmit`. Ini pemeriksaan tipe, bukan eksekusi dua tes database tersebut.
- `git apply --check` dan pemeriksaan whitespace PASS untuk masing-masing patch dan keduanya bersama pada working tree yang menjadi baseline.
- Hash sumber aktif, konfigurasi eksperimen dan `result.json` run full sama sebelum/sesudah validasi; file kandidat baru tidak muncul di sumber aplikasi aktif.

Rincian: `validation.json`; baseline sumber dan SHA-256 patch: `manifest.json`. Log validasi disertakan. Build kandidat, regresi database worker, benchmark tulis, dan full retest **NOT_RUN**.

## Kompatibilitas sebelum penerapan

Baseline HEAD: `6ba9638c0a60469f1919e675e35d999f2dbde407`, branch lokal `feat/qa-scenario-workflow`, dengan implementasi QA yang masih berupa perubahan lokal. Patch dibangun terhadap **isi working tree saat ini**, bukan klaim bahwa semua alat QA sudah terdapat pada commit HEAD tersebut.

Khusus patch 02, penerima harus memiliki versi `qa/runtime/pipeline.mjs` dan helper QA yang sesuai implementasi workflow ini. Clone main yang belum berisi implementasi QA belum memenuhi prasyaratnya. Gunakan hash baseline di manifest dan `git apply --check`; jangan memaksa penerapan apabila sumber berbeda. Patch 01 tidak bergantung pada patch 02. Tidak ada commit, push, merge, atau deploy yang dilakukan untuk paket ini.

Pemeriksaan berikut hanya memvalidasi kompatibilitas, tanpa menerapkan patch. Jalankan dari akar checkout yang dituju; ubah lokasi folder paket sesuai tempat file disimpan:

```powershell
$candidatePackage = 'C:\lokasi\qa-volume-candidate'
git apply --check (Join-Path $candidatePackage '01-worker-order.patch')
git apply --check (Join-Path $candidatePackage '02-qa-volume.patch')
```

## Rencana retest berurutan

Laksanakan pada checkout developer terpisah setelah pengguna memilih langkah retest kandidat. Gunakan layanan localhost terverifikasi, database tes milik run, data sintetis, dan ledger resource. Pertahankan clone bukti run awal; setiap run baru memakai ID/resource sendiri. Jangan menjalankan benchmark lain pada sumber daya yang sama.

| Urutan | Versi yang diuji | Tujuan dan bukti |
| --- | --- | --- |
| A | Bukti baseline original yang sudah tersimpan | Simpan run full dan investigasi apa adanya. Catat versi alat, fingerprint, parameter layanan dan perangkat; ulangi baseline hanya jika ada perubahan kondisi yang mengganggu perbandingan. |
| B | Hanya patch 01; harness original | Uji regresi worker dahulu, build ulang, lalu full retest dengan parameter sama untuk mengukur efek query tanpa perubahan harness. Simpan plan, throughput, batch/commit time bila tersedia, backlog/usia dan delta temp spill. |
| C | Patch 01 + patch 02 | Jalankan tes alat QA, kemudian full retest baru. Buktikan efek observasi antrean dan penghentian eskalasi secara terpisah; jangan mengatribusikan seluruh peningkatan C kepada query. |

Pada B, keterbatasan harness original tetap berlaku: jika tahap 10k terhalang, harness lama dapat menambahkan 100k pada antrean yang masih berisi pending. Laporkan ini sebagai eksperimen kumulatif yang belum selesai; jangan menyebutnya drain mandiri 100k. Beban tetap dibatasi database tes dan parameter awal. Pada C, kondisi tersebut harus menghentikan insert tahap berikutnya dan memberi status NOT_RUN. Jika menghendaki benchmark tiap ukuran dari baseline kosong, desain itu merupakan eksperimen tambahan dengan clone terpisah dan label berbeda, bukan penggantian diam-diam hasil kumulatif.

Regresi yang wajib terlihat sebelum benchmark B:

1. Dua tes canonical `outbox.integration.spec.ts`: redelivery tidak menggandakan event; rollback, cooldown dan dua consumer mempertahankan satu efek bisnis.
2. Dua tes kandidat `outbox-order.integration.spec.ts`: urutan timestamp/ID tetap benar dan event yang dikunci dilewati tanpa kehilangan event setelah lock dilepas.
3. Seluruhnya benar-benar berjalan, tidak skip; pool database minimal dua koneksi untuk tes locking. Setup package membuat database lokal terpisah per file dan membersihkannya setelah tes.
4. Verifikasi input sintetis, ID event, payload, processed flag, failed/cooldown, serta hasil analytics. Jangan menyimpulkan durabilitas dari exit code saja.

Contoh perintah setelah kandidat diterapkan dalam checkout terpisah, dari akar repository. Pertahankan `.env.test.local`; jangan menampilkan isinya:

```powershell
pnpm qa validate --scenario SIS-001
pnpm qa doctor --profile full
pnpm exec dotenv -e .env.test.local -- node scripts/check-test-env.mjs

$workerEvidenceDir = Join-Path (Get-Location) ('qa\.local\artifacts\candidate-worker-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $workerEvidenceDir | Out-Null
$workerEvidence = Join-Path $workerEvidenceDir 'worker-regression.json'
pnpm exec dotenv -e .env.test.local -- pnpm --filter @tka/worker exec vitest run src/outbox.integration.spec.ts src/outbox-order.integration.spec.ts --reporter=json --outputFile $workerEvidence

pnpm lint
pnpm typecheck
```

Setelah B dan sesudah menerapkan patch 02 untuk C, jalankan `pnpm test:qa-workflow`. Sebelum setiap full retest, pilih sesi lokal yang benar pada checkout tersebut, lalu:

```powershell
pnpm qa status --session SESSION_ID
pnpm qa retest --scenario SIS-001 --profile full --session SESSION_ID
```

Ganti `SESSION_ID` dengan sesi nyata yang dipilih. Jangan menyalin state lintas perangkat tanpa pemeriksaan. Runner full membangun artefak sesuai workflow dan mencatat fingerprint baru. Tidak ada opsi seleksi benchmark `--check volume` pada operasi retest saat ini; flag `--check` dipakai untuk pencatatan manual. Jangan mengklaim perintah retest di atas hanya menjalankan volume.

Jika fingerprint belum berubah, hentikan dan periksa penerapan kandidat/build; `--diagnostic` hanya untuk pengulangan investigasi yang sengaja dipilih. Catat run baru sebagai turunan bukti sebelumnya, bukan mengubah hasil awal menjadi PASS.

## Kriteria evaluasi dan penanganan kegagalan

Untuk volume, semua tiga tahap harus selesai dalam batas yang sama, dengan seluruh event yang diharapkan terkirim, identitas/isi cocok, tidak ada duplikasi atau processed tanpa analytics, dan snapshot akhir konsisten. Nol tes, NOT_RUN wajib atau bukti hilang tidak cukup untuk kelulusan. Timeout menghasilkan BLOCKED/incomplete; mismatch integritas menghasilkan FAIL. Simpan bukti parsial pada keduanya.

Pada alat QA, buktikan bahwa 100k tidak diinsert setelah tahap 10k BLOCKED, setiap fixture memiliki stage/run ID, snapshot akhir tetap dicatat, dan parser tidak mengubah NOT_RUN menjadi PASS. Tes helper sudah membuktikan perilaku kendali dalam simulasi; pengawatan runtime nyata masih perlu C.

Jika regresi worker gagal, simpan reproduksi dan hentikan benchmark yang bergantung padanya. Jika volume tetap terhalang, jangan menaikkan timeout atau mengubah VU/ukuran batch/commit untuk menyatakan lulus. Laporkan throughput dan sisa backlog aktual; evaluasi bottleneck transaksi sebagai pekerjaan berikutnya dengan eksperimen terpisah. Revert hanya hunk/file milik kandidat dalam checkout uji bila diperlukan; jangan memakai reset/clean terhadap perubahan pengguna.

**Hasil original tetap:** full FAIL karena dependency; volume BLOCKED; manual keyboard NOT_RUN. Perbaikan dependency dan pemeriksaan manusia belum diselesaikan oleh paket ini. Bahkan bila volume kandidat lulus, keseluruhan full belum otomatis lulus. Hasil lokal tetap bukan bukti SLO produksi, staging, atau Google login nyata.

## Langkah berikutnya

Rekomendasi: uji kandidat worker dalam checkout terpisah mengikuti B, lalu kandidat alat QA mengikuti C. Sumber aplikasi aktif dan batas eksperimen tetap seperti semula sampai langkah penerapan/retest dipilih. Paket ini siap dibaca dan dibawa ke developer tanpa menulis ulang konteks investigasi.

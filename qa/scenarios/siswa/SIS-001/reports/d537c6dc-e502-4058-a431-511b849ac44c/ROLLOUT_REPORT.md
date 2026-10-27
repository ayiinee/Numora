# SIS-001 — P0, recovery PvP, dan penutupan pekerjaan QA

Run **d537c6dc-e502-4058-a431-511b849ac44c**, parent optimasi **5a091494-b077-4a09-95aa-8f06ac18ea21**, role **siswa**, profil **full**. Kode diuji pada commit **820a76bfc279feb50e2a2826f23c4f9d8488d9cd** dengan working tree source bersih. Laporan dan commit bukti sesudah run tidak mengubah hasil ini menjadi kelulusan SHA baru; CI PR harus memverifikasi head PR.

## Hasil utama

- Workflow QA berbasis skenario, panduan/skill/setup Windows, laporan/kelanjutan sesi, pilot SIS-001 dan bukti A/B/C/optimasi dipertahankan pada branch yang sama.
- Worker tetap memakai kelompok atomik sepuluh event dan hasil Drill memakai satu projection. Kriteria rollback, deduplikasi, urutan, ownership, delivery pascacommit dan reward tersimpan tetap berlaku.
- P0 memakai Node **24.22.1** / bundled Undici **7.30.1**, Next/@next/env **16.4.1**, platform-express **12.3.2**, Express **5.3.0**, body-parser **2.4.0**, Multer **2.5.0**. Instalasi Node/browser global tidak diubah.
- Audit full: **31 -> 19 advisory**, critical **2 -> 0**, high **8 -> 4**. Produksi: **8 advisory**. Semua advisory sisa dicatat, tanpa ignore/force-fix.
- Full SIS-001: **FAIL**, **948.1 detik** sesudah build, dari batas3.600detik. Manual keyboard **NOT_RUN**. Hasil benchmark bersifat lokal tanpa SLO produksi.

## Regresi dan verifikasi

| Kelompok | Bukti aktual |
| --- | --- |
| Database | 61 PASS; mencakup enam rekonsiliasi migrasi |
| Worker | 25 PASS |
| Web | 273 PASS |
| Assessment / IRT | 21 / 14 PASS |
| API retest terisolasi | 244 PASS, 0 FAIL, 1 NOT_RUN; workbook asli belum tersedia |
| Workflow / guard fixture | 40 / 3 PASS |
| PvP dua browser | PASS untuk tiga difficulty, reconnect/reload, ledger/projection dan own rank |
| Kualitas | lint, typecheck, build, kontrak/freshness dan frozen-lockfile lulus; pemeriksaan kualitas full juga PASS |

Suite root pertama menghasilkan FAIL karena hook setup notifikasi melewati10detik saat build terpisah masih berjalan; sembilan kasusnya tidak dijalankan pada sweep itu. Paket API diulang sendirian pada DB baru dan meluluskan seluruh kasus yang tersedia tanpa menaikkan timeout. Kegagalan awal implementasi SQL/fixture, launch Chromium global, config PvP yang diwarisi dan selector UI lama tetap tersedia di artefak lokal. Tidak ada hasil lama yang ditimpa, test case wajib di-skip, expected bisnis dilemahkan, atau Google OAuth dianggap terbukti. Paket UI yang tidak memiliki tes tidak dihitung sebagai acceptance.

## Masalah #102 dan migrasi

Regresi mereproduksi23514 ketika clock recovery tertinggal dari persisted started_at. Cancellation kini memakai greatest di PostgreSQL, lalu outbox dan invitation menggunakan timestamp tersimpan yang sama, termasuk mikrodetik. Constraint waktu, no-record cancellation, room claims, replay dan XP tetap diuji. Uji parser HTTP memakai child disposable: compressed trailing bytes tidak mematikan proses; malformed JSON dan limit2mb tetap ditolak.

Rekonsiliasi memakai SQL asli PR#92 dan #102 dengan hash/provenance. Kandidat gabungan menempatkan Admin0039–0047, runtime0048/0049; guard desimal terakhir mencegah guard ceil lama mengambil alih. Fresh/runtime/Admin upgrade, replay, unknown/partial history dan rollback drift lulus. Journal aktif tetap0000–0040 selama PRAdmin belum digabung. Ini kandidat integrasi yang teruji, bukan klaim persetujuan Ferdi atau instruksi mengubah database bersama. Detail: docs/development/QA_RUNTIME_REMEDIATION_2026-10-27.md.

Harness PvP menetapkan strict mode dan memakai helper READY sintetis yang sama dengan SIS-001. Ia tidak mewarisi temporary-owner-accepted dari .env developer. Peringkat UI diperiksa lewat heading saat ini, difficulty terpilih, rank dan poin aktual; pemisahan DEMO tetap diuji pada API. Instalasi Chromium terpisah dengan versi sama memperbaiki kegagalan launch cache global tanpa mengubah cache tersebut.

## Full run setelah P0

| Pemeriksaan | Optimasi sebelumnya | Setelah P0/recovery |
| --- | --- | --- |
| quality | PASS | PASS |
| rewards | PASS | PASS |
| components | PASS | PASS |
| persistence | PASS | PASS |
| connected | PASS | PASS |
| accessibility | PASS | PASS |
| variety | PASS | PASS |
| recovery | PASS | PASS |
| velocity | PASS | PASS |
| volume | PASS | PASS |
| load | PASS | FAIL |
| dependencies | FAIL | FAIL |
| manual-keyboard | NOT_RUN | NOT_RUN |

| Event tambahan | Drain (detik) | Delivered kumulatif | Pending |
| --- | ---: | ---: | ---: |
| 1000 | 0.670 | 1000 | 0 |
| 10000 | 4.896 | 11000 | 0 |
| 100000 | 51.871 | 111000 | 0 |

Drain100k sebelumnya **29.002 detik**, run ini **51.871 detik**. Ini dua pengukuran lokal pada waktu berbeda; penyebab perubahan belum diisolasi. Keduanya dinilai memakai batas120detik yang sama, tanpa klaim kapasitas produksi.

Rekonsiliasi tambahan READ ONLY: source **111000**, delivered **111000**, pending **0**, mismatch **0**, processed tanpa analytics **0**.

| Fase | Submit diterima | HTTP p95 (s) | HTTP p99 (s) | Error HTTP |
| --- | ---: | ---: | ---: | ---: |
| load (10/25/50/100 VU) | 2823 | 0.692 | 1.155 | 0.00% |
| stress (250 VU) | 750 | 4.029 | 4.407 | 0.00% |

Distribusi HTTP mencakup request alur k6, bukan hanya endpoint submit. Rekonsiliasi load: `{"graded":3603,"broken":0,"accepted":3573}`. Volume1k/10k/100k, drain120detik, timeoutHTTP15detik, VU10/25/50/100/250, tahap60detik dan full60menit sesudah build dipertahankan.

## Advisory yang masih terbuka

| Advisory | Paket | Severity | Patched range |
| --- | --- | --- | --- |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | esbuild 0.18.20 | moderate | >=0.25.0 |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | uuid 8.3.2 | moderate | >=11.1.1 |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | source-map-js 1.2.1 | high | >=1.2.2 |
| [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) | vite 8.3.1 | moderate | >=8.3.3 |
| [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | vite 8.3.1 | moderate | >=8.3.3 |
| [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | vite 8.3.1 | high | >=8.3.3 |
| [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | vite 8.3.1 | low | >=8.3.3 |
| [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) | vite 8.3.1 | moderate | >=8.3.3 |
| [GHSA-vfpm-58rq-9qcg](https://github.com/advisories/GHSA-vfpm-58rq-9qcg) | vite 8.3.1 | moderate | >=8.3.3 |
| [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) | @vitest/mocker 5.0.2 | moderate | >=5.0.3 |
| [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp) | @vitest/mocker 5.0.2 | moderate | >=5.0.3 |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | zod 4.6.5 | high | >=4.6.6 |
| [GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685) | undici 8.11.2 | moderate | >=8.12.2 |
| [GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472) | undici 8.11.2 | moderate | >=8.12.2 |
| [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) | fast-uri 3.1.8 | moderate | >=3.1.9 |
| [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) | fast-uri 3.1.8 | low | >=3.1.9 |
| [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr) | fast-uri 3.1.8 | moderate | >=3.1.9 |
| [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) | fast-uri 3.1.8 | low | >=3.1.9 |
| [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c) | undici 8.11.2 | high | >=8.12.2 |

Paket Undici8 jsdom/dev masih berbeda dari Undici7 bawaan Node yang telah diperbarui. Sisa dependency, workbook akademik asli, keyboard manusia, Google login nyata dan staging/produksi tetap pekerjaan terbuka sesuai bukti masing-masing. Tindakan berikutnya yang direkomendasikan: remediasi high tersisa dengan regresi yang relevan; tidak ada merge/deployment otomatis.

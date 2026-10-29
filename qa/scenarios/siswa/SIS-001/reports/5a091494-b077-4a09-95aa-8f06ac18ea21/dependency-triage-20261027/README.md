# Triase dependency SIS-001 setelah optimasi

Review **DEP-20261027-SIS001-OPT**, 2026-10-27T14:17:58.844Z; branch feat/qa-scenario-workflow, SHA 598ab47bcba7d79bae9c170b18ee394878397bb5 dengan perubahan optimasi lokal. Sumber run **5a091494-b077-4a09-95aa-8f06ac18ea21**. Hasil otomatis run tetap **FAIL**; triase selesai tidak berarti kerentanan sudah diperbaiki. Review PIC telah ditutup berdasarkan persetujuan pengguna; laporan ini tidak membuka ulang gate tersebut.

## Hasil audit yang direproduksi

| Scope | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Seluruh dependency | 2 | 8 | 17 | 4 | 31 |
| Dependency produksi | 2 | 6 | 8 | 3 | 19 |

Dua perintah read-only pnpm audit --json dan pnpm audit --prod --json selesai dengan exit 1 karena temuan. Audit ulang cocok dengan run sumber; ada 31 advisory unik pada 11 paket, bukan 31 insiden eksploit yang terkonfirmasi. Prod adalah keanggotaan dependency graph, tidak otomatis jalur runtime yang dapat dijangkau pengguna. Dua belas advisory hanya muncul pada dev graph. Tidak ada install/update, modifikasi manifest/lockfile/aplikasi, pengujian exploit atau kontak developer pada triase ini.

## Sepuluh critical/high

| Advisory | Paket terpasang | Severity upstream | Prod graph | Range patched dari audit | Prioritas kerja |
| --- | --- | --- | --- | --- | --- |
| [GHSA-68fv-2mgg-jv7q](https://github.com/7rulnik/source-map-js/pull/79) | source-map-js 1.2.1 | high | Ya | >=1.2.2 | P1 |
| [GHSA-cjq9-62q9-8jv4](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4) | next 16.3.6 | high | Ya | >=16.3.8 | P0 |
| [GHSA-587h-7wmj-h5pm](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm) | vite 8.3.1 | high | Tidak | >=8.3.3 | P1 |
| [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) | next 16.3.6 | critical | Ya | >=16.4.1 | P0 |
| [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) | next 16.3.6 | high | Ya | >=16.4.1 | P0 |
| [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) | next 16.3.6 | critical | Ya | >=16.4.1 | P0 |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/colinhacks/zod/pull/6652) | zod 4.6.5 | high | Ya | >=4.6.6 | P1 |
| [GHSA-27r3-jxmh-p828](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828) | body-parser 2.3.0 | high | Ya | >=2.4.0 | P0 |
| [GHSA-q7qp-rjg7-q26m](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m) | multer 2.4.0 | high | Ya | >=2.5.0 | P1 |
| [GHSA-xjj6-f33q-929c](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c) | undici 8.11.2 | high | Tidak | >=8.12.2 | P1 |

P0/P1 adalah rekomendasi urutan kerja, bukan perubahan severity upstream atau keputusan produk baru.

### source-map-js — GHSA-68fv-2mgg-jv7q

**high; production and development graphs; build path.** Next > postcss > source-map-js; juga toolchain CSS/test. Tidak ditemukan parser source map milik aplikasi yang menerima input pengguna. Graph produksi tidak membuktikan endpoint publik memproses source map.

Acuan: [maintainer / perbaikan upstream](https://github.com/7rulnik/source-map-js/pull/79). Status remediasi NOT_RUN, exploit NOT_TESTED.

### next — GHSA-cjq9-62q9-8jv4

**high; production graph; condition not observed.** Tidak ada images.remotePatterns pada next.config.ts. Pemakaian next/image yang ditemukan untuk QR menggunakan unoptimized. Syarat remote URL allow-list tidak ditemukan pada konfigurasi ini.

Acuan: [maintainer / perbaikan upstream](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4). Status remediasi NOT_RUN, exploit NOT_TESTED.

### vite — GHSA-587h-7wmj-h5pm

**high; development graph; Windows relevant.** Vite 8.3.1 melalui Vitest. Semua anggota memakai Windows. Pemakaian vitest run tidak membuktikan endpoint launch-editor terbuka; risiko dev server tetap relevan dan perlu patch.

Acuan: [maintainer / perbaikan upstream](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm). Status remediasi NOT_RUN, exploit NOT_TESTED.

### next — GHSA-2464-fhr4-w9xw

**critical; production graph; local workaround observed.** Next 16.3.6; Sharp yang di-resolve Next = 0.35.5; host tes Windows. Workaround versi Sharp terpenuhi lokal. Jalur Linux glibc/SVG dan artefak deployment belum diverifikasi.

Acuan: [maintainer / perbaikan upstream](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw). Status remediasi NOT_RUN, exploit NOT_TESTED.

### next — GHSA-p3m5-59mp-jv5r

**high; production graph; condition not observed.** App Router digunakan, tetapi directive use server / Server Action tidak ditemukan pada source yang diperiksa. Verifikasi ulang bundle hasil build dan dependency saat remediasi.

Acuan: [maintainer / perbaikan upstream](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r). Status remediasi NOT_RUN, exploit NOT_TESTED.

### next — GHSA-673q-mjm6-r5xr

**critical; production graph; condition not observed.** Tidak ada directive use cache atau cacheComponents pada source/config web yang diperiksa. Syarat fungsi cache yang mengembalikan beberapa typed array tidak ditemukan; tidak ada pengecualian audit.

Acuan: [maintainer / perbaikan upstream](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr). Status remediasi NOT_RUN, exploit NOT_TESTED.

### zod — GHSA-mrhx-c7xc-m3w5

**high; production graph; application import not observed.** Zod 4.6.5 adalah dependency langsung web; pencarian source tidak menemukan pemakaian/import Zod. Keterjangkauan input koleksi besar belum terbukti. Kandidat patch 4.6.6.

Acuan: [maintainer / perbaikan upstream](https://github.com/colinhacks/zod/pull/6652). Status remediasi NOT_RUN, exploit NOT_TESTED.

### body-parser — GHSA-27r3-jxmh-p828

**high; production API; parsing enabled.** NestFactory.create memakai parser bawaan; configureApplication mengaktifkan JSON limit 2mb tanpa inflate:false. Parsing mendahului guard route. Keterjangkauan disimpulkan dari konfigurasi; exploit tidak dijalankan.

Acuan: [maintainer / perbaikan upstream](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828). Status remediasi NOT_RUN, exploit NOT_TESTED.

### multer — GHSA-q7qp-rjg7-q26m

**high; production API; async filter condition not observed.** Dua FileInterceptor upload memakai limits tanpa fileFilter asinkron, dilindungi ContentAdminGuard. Syarat khusus advisory tidak ditemukan; paket tetap terdampak menurut audit.

Acuan: [maintainer / perbaikan upstream](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m). Status remediasi NOT_RUN, exploit NOT_TESTED.

### undici — GHSA-xjj6-f33q-929c

**high; development package; additional Node runtime exposure.** Undici 8.11.2 dari jsdom adalah dev graph. Secara terpisah Node 24.14.1 membundel Undici 7.24.4, masuk rentang 7.18.0 sampai sebelum 7.30.1. Perubahan lockfile tidak mengganti built-in fetch Node.

Acuan: [maintainer / perbaikan upstream](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c). Status remediasi NOT_RUN, exploit NOT_TESTED.

## Temuan runtime tambahan di luar hitungan pnpm

Node 24.14.1 membundel Undici 7.24.4. Rentang terdampak [advisory Undici](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c) mencakup versi tersebut; built-in fetch dipakai juga secara transitif oleh SDK. Ini inferensi versi/runtime, bukan bukti eksploit endpoint Numora. Paket Undici8 dari jsdom dan Undici7 di Node harus dicatat sebagai dua komponen berbeda.

Kandidat Node **24.22.1** memuat [Undici7.30.1 pada source rilis](https://raw.githubusercontent.com/nodejs/node/v24.22.1/deps/undici/src/package.json) dan masih sesuai constraint major24 repository. [Catatan security release Node24.22.1](https://github.com/nodejs/node/releases/tag/v24.22.1) mengonfirmasi update Undici. Engine jsdom yang sudah terpasang meminta ^24.15.0 pada jalur Node24; runtime24.14.1 saat ini berada di bawahnya walaupun tes sebelumnya dapat berjalan. Runtime deployment dan aktual CI belum diverifikasi.

## Bukti lokal yang diperiksa

- apps/web/next.config.ts: tanpa remotePatterns, cacheComponents atau dangerouslyAllowSVG; apps/web/src/features/monitoring/teacher-class-tools.tsx memakai QR Image dengan unoptimized. Pencarian directive use cache, use server dan import Zod pada source web tidak menemukan pemakaian. Absennya pola source tidak membuktikan semua dependency/generated bundle aman.
- Node next-resolved Sharp **0.35.5**, sama dengan versi patched/workaround maintainer; ini verifikasi instalasi lokal, bukan verifikasi artefak Linux produksi.
- apps/api/src/main.ts dan bootstrap.ts: Nest/Express default plus JSON2mb tanpa inflate:false.
- apps/api/src/modules/content/excel-import.controller.ts dan content-uploads.controller.ts: upload terbatas dan ContentAdminGuard, tanpa fileFilter asinkron.
- Installed parent: platform-express12.1.0 mematok Express5.2.1 dan Multer2.4.0; Express5.2.1 memakai body-parser^2.2.1. Registry kandidat platform-express12.3.2 mematok Express5.3.0 dan Multer2.5.0; Express5.3.0 memakai body-parser^2.3.0. Karena range masih menerima2.3.0, hasil lock harus dibuktikan2.4.0+.
- pnpm-lock.yaml dan manifest seluruh workspace; audit full/prod serta registry-metadata.json disertakan. Hash lockfile **3ab7f6f5c17e7f0787c6ffbdf6827e9bdb9ffba2776796e8ebe50e4a523a9f3b**. Semua snapshot hasil A/B/C dan run optimasi tetap identik; hash implementasi optimasi juga tetap sama.

## Seluruh advisory dan batch tindak lanjut

| Advisory | Paket terpasang | Severity upstream | Prod graph | Range patched dari audit | Prioritas kerja |
| --- | --- | --- | --- | --- | --- |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | esbuild 0.18.20 | moderate | Tidak | >=0.25.0 | P2 |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | uuid 8.3.2 | moderate | Ya | >=11.1.1 | P2 |
| [GHSA-68fv-2mgg-jv7q](https://github.com/7rulnik/source-map-js/pull/79) | source-map-js 1.2.1 | high | Ya | >=1.2.2 | P1 |
| [GHSA-3w37-wq28-93x7](https://github.com/advisories/GHSA-3w37-wq28-93x7) | next 16.3.6 | moderate | Ya | >=16.3.8 | P0 |
| [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) | next 16.3.6 | moderate | Ya | >=16.3.8 | P0 |
| [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) | next 16.3.6 | low | Ya | >=16.3.8 | P0 |
| [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) | next 16.3.6 | moderate | Ya | >=16.3.8 | P0 |
| [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) | next 16.3.6 | moderate | Ya | >=16.3.8 | P0 |
| [GHSA-cjq9-62q9-8jv4](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4) | next 16.3.6 | high | Ya | >=16.3.8 | P0 |
| [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) | vite 8.3.1 | moderate | Tidak | >=8.3.3 | P1 |
| [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | vite 8.3.1 | moderate | Tidak | >=8.3.3 | P1 |
| [GHSA-587h-7wmj-h5pm](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm) | vite 8.3.1 | high | Tidak | >=8.3.3 | P1 |
| [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | vite 8.3.1 | low | Tidak | >=8.3.3 | P1 |
| [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) | vite 8.3.1 | moderate | Tidak | >=8.3.3 | P1 |
| [GHSA-vfpm-58rq-9qcg](https://github.com/advisories/GHSA-vfpm-58rq-9qcg) | vite 8.3.1 | moderate | Tidak | >=8.3.3 | P1 |
| [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) | @vitest/mocker 5.0.2 | moderate | Tidak | >=5.0.3 | P1 |
| [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp) | @vitest/mocker 5.0.2 | moderate | Tidak | >=5.0.3 | P1 |
| [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) | next 16.3.6 | critical | Ya | >=16.4.1 | P0 |
| [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) | next 16.3.6 | high | Ya | >=16.4.1 | P0 |
| [GHSA-h694-7cp9-m8p3](https://github.com/advisories/GHSA-h694-7cp9-m8p3) | next 16.3.6 | moderate | Ya | >=16.3.8 | P0 |
| [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) | next 16.3.6 | critical | Ya | >=16.4.1 | P0 |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/colinhacks/zod/pull/6652) | zod 4.6.5 | high | Ya | >=4.6.6 | P1 |
| [GHSA-27r3-jxmh-p828](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828) | body-parser 2.3.0 | high | Ya | >=2.4.0 | P0 |
| [GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685) | undici 8.11.2 | moderate | Tidak | >=8.12.2 | P1 |
| [GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472) | undici 8.11.2 | moderate | Tidak | >=8.12.2 | P1 |
| [GHSA-q7qp-rjg7-q26m](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m) | multer 2.4.0 | high | Ya | >=2.5.0 | P1 |
| [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) | fast-uri 3.1.8 | moderate | Ya | >=3.1.9 | P1 |
| [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) | fast-uri 3.1.8 | low | Ya | >=3.1.9 | P1 |
| [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr) | fast-uri 3.1.8 | moderate | Ya | >=3.1.9 | P1 |
| [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) | fast-uri 3.1.8 | low | Ya | >=3.1.9 | P1 |
| [GHSA-xjj6-f33q-929c](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c) | undici 8.11.2 | high | Tidak | >=8.12.2 | P1 |

Detail lengkap jalur/version ada di triage.json dan audit JSON. Dua moderate legacy (UUID ExcelJS dan esbuild loader Drizzle) tetap perlu investigasi kompatibilitas; tidak ada pengecualian otomatis. Status semua remediasi masih NOT_RUN.

## Rekomendasi tindakan berikutnya

**Implementasikan batch P0 R0/R1/R2 pada kandidat lokal yang menjaga branch optimasi, lalu retest terarah.** R0 memakai runtime Node24.22.1 yang terisolasi untuk proses kandidat, tanpa mengganti instalasi global/Codex; runtime deployment tetap tindak lanjut terpisah. R1/R2 menaikkan Next/@next/env dan parent HTTP API dengan pembuktian body-parser patched. Simpan snapshot manifest/lock dan jalankan pemeriksaan terkait sebelum melanjutkan R3/R4/R5.

Rincian target serta acceptance ada pada [REMEDIATION_PLAN.md](REMEDIATION_PLAN.md). Alternatif: selesaikan checklist keyboard manual pada build yang sudah diuji, atau prioritaskan seluruh remediasi R0–R5 bila ruang lingkupnya dipilih eksplisit. Tidak ada klaim release-ready dari hasil triase.

# Remediasi dependency — 28 Oktober 2026 WIB

**ENGINEERING EVIDENCE.** Audit baru menemukan **20 advisory** (0 critical,
4 high, 13 moderate, 3 low), termasuk temuan qs baru dibanding 19 pada run lama.
Audit lama tetap utuh. Tidak memakai audit-ignore, force-fix atau suppression.

| Tahap | Perubahan terkontrol | Audit setelah instalasi | Verifikasi terarah |
| --- | --- | --- | --- |
| A — produksi | Zod 4.6.5→4.6.6; source-map-js 1.2.1→1.2.2; fast-uri 3.1.8→3.1.9; qs 6.16.0→6.16.1 | 13: 2 high, 10 moderate, 1 low | 12 schema kontrak terkompilasi; tes HTTP awal terhalang startup fixture 5 detik, tetap disimpan |
| B — tooling | Vitest 5.0.2→5.0.3 beserta mocker; Vite 8.3.1→8.3.3; jsdom memakai Undici 8.12.2 | 2 moderate, 0 high/critical | Workflow 49 lulus; sweep web awal terputus dengan Node heap OOM, bukan bukti kelulusan |
| C — parent lama | Scoped ExcelJS→uuid 11.1.1 dan esbuild-kit/core-utils→esbuild 0.25.12 | **0 advisory seluruh workspace** | CommonJS uuid.v4 kompatibel; drizzle-kit check lulus; parser Excel 9/9 termasuk workbook asli; UI upload/Drill 15/15; HTTP parser 1/1 lulus tanpa menaikkan timeout |

## Pemetaan dan batas kompatibilitas

- Zod langsung dipakai web; source-map-js melalui Next/PostCSS dan tooling CSS.
- fast-uri melalui Ajv API/kontrak, qs melalui Express. Override dibatasi versi
  rentan yang sudah teridentifikasi; tidak mengubah parent/domain API.
- Vitest diperbarui konsisten di semua workspace; Vite dan Undici mengikuti
  rentang mayor parent. Undici jsdom berbeda dari Undici bawaan Node 24.22.1.
- ExcelJS 4.4.0 hanya memanggil ekspor CommonJS `v4` untuk ID conditional-format;
  uuid 11 menyediakan ekspor tersebut. Karena melintasi mayor transitive,
  kompatibilitas impor workbook/gambar harus diuji, bukan diasumsikan dari audit.
- Drizzle-kit masih membawa loader lama dengan esbuild ~0.18.20. Override
  dibatasi pada core-utils; API transform/build dan loader konfigurasi diperiksa.
  Migrasi/runtime PostgreSQL tidak diganti dan SQL tidak diubah oleh remediasi ini.

Versi/engine/ekspor kandidat diperiksa terhadap metadata registry npm. Rujukan
primer untuk perubahan produksi: [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q),
[Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).

Audit nol bukan pengesahan fungsional atau keamanan menyeluruh. Suite regresi
akhir, build, connected browser dan full SIS-001 tetap memerlukan bukti pada
versi akhir. Kegagalan startup/OOM awal tetap terlihat terpisah. Runtime global,
timeout HTTP, beban, dan aturan bisnis tidak diubah.

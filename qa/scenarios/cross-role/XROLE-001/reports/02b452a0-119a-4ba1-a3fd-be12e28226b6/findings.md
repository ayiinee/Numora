# Temuan diagnostik Pretest

Skenario: XROLE-001, cross-role. Run resmi: 02b452a0-119a-4ba1-a3fd-be12e28226b6.
Hasil resmi tetap **BLOCKED**; diagnostik berikut bukan penerimaan E2E.

## P1: Gambar soal tidak dimuat pada sesi Pretest siswa

- Lokasi: `apps/web/src/features/core-learning/pretest-screens.tsx:168`.
- Pemicu: siswa membuka soal dengan referensi media `[[asset:diagram]]`.
- Harapan: halaman meminta media terotorisasi dan menampilkan gambar.
- Aktual: `PretestForm` tidak memberikan `loadMedia` kepada `AssessmentSession`. Query media tidak aktif; gambar tidak tampil dan percobaan ulang tidak menyelesaikan penyebabnya.
- Dampak: soal yang membutuhkan gambar tidak bisa dikerjakan secara utuh.
- Bukti: `qa/scenarios/cross-role/XROLE-001/component/pretest-media.test.tsx` gagal mencari gambar `Diagram Pretest` meskipun mock API menyediakan media valid.
- Tindakan lokal berikut: hubungkan pemuat media Pretest ke API media seperti Drill/Tryout, lalu jalankan ulang regresi dan skenario.

## Hasil diagnostik lokal

| Kelompok | Lulus | Gagal | Dilewati |
| --- | ---: | ---: | ---: |
| Komponen admin/siswa dan regresi media | 43 | 1 | 0 |
| API, database dan rubrik | 37 | 0 | 0 |
| Engine scoring Pretest | 5 | 0 | 0 |
| Total | 85 | 1 | 0 |

Tes mencakup impor/rubrik, validasi paket setelah publikasi, lifecycle Pretest, scoring dan placement. Keberhasilan tes tidak membuktikan seluruh variasi data maupun alur browser nyata aman.

Diagnostik memakai Node 24.22.0 dan database disposable PostgreSQL 18 pada localhost, terpisah dari data aplikasi. Bukti JSON lokal tersimpan dalam `.tmp/pretest-audit-final-{web,api,scoring}.json`. Tidak ada perubahan kode produk selama audit ini.

## Batas QA resmi

- Node terpasang 24.22.0; guard membutuhkan >=24.22.1 <25.
- Konfigurasi layanan test terisolasi belum lengkap (`.env.test.local`, database/Redis test dan prefix antrean).
- PostgreSQL 16/Redis 7 sesuai profil belum siap; Chromium belum tersedia.
- Browser E2E, Google OAuth dan data paket pengguna belum diverifikasi menyeluruh. Tidak ada akses atau mutasi cloud.

Laporan otomatis dan hasil BLOCKED dipertahankan tanpa perubahan. Siapkan prasyarat melalui `pnpm qa doctor --profile standard` sebelum retest resmi.

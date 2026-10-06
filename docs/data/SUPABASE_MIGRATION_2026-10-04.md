# Migrasi sandbox Supabase — 4 Oktober 2026

**ENGINEERING DECISION — instruksi Aini:** jalankan migrasi setelah integrasi PR
#54/#56/#57/#60/#61. Target terverifikasi: sandbox development
`pkamenfnwmoeisccnrnk` (nama historis Numora-Staging), database `postgres`, TLS,
session pooler port 5432, dengan role operator `postgres`.

## Hasil operasi

- Baseline main: `6550710a713a93d2e85cd5dff077e47beac720a6`.
- Database sebelumnya mencapai `0017` dengan 28 entri jurnal termasuk histori
  bootstrap/bridge. `0001/0002` main tidak dijalankan ulang.
- Runner resmi menerapkan `0018_mysterious_maelstrom`, `0019_curriculum_slugs`,
  `0020_indicator_question_levels`, dan `0021_content_media_uploads`.
- Pemeriksaan Cloud menemukan default ACL Supabase memberi role Data API grant
  pada tabel/view baru. Migrasi maju `0023_data_api_runtime_lockdown` mencabut
  grant relation public dan helper domain untuk `anon`, `authenticated`,
  `service_role`, serta grant PUBLIC yang relevan. Hak main/compute eksplisit
  dipertahankan, termasuk view input compute. Default grant owner untuk objek
  public berikutnya dibatasi; schema Auth/Storage tidak diubah.
- Status akhir: sampai `0022`, **33 entri jurnal**, hash kelima migrasi cocok
  dengan SQL Git dan 28 entri lama identik. Ada 89 tabel public dan 11 tabel
  irt_compute; RLS aktif pada semuanya. Schema check lulus untuk 98 tabel aplikasi.
- Slug valid; 60 soal lama tetap memiliki level kurikulum null tanpa pemetaan
  tebakan. Tabel dispatch/media baru kosong. Jumlah baris dan digest isi **98
  tabel lama identik**, dengan timestamp dinormalisasi UTC.
- Tidak ada seed, perubahan hasil historis, atau perubahan `.env`. IRT v3/R2
  tidak diaktifkan.

## Backup dan validasi

Backup custom PostgreSQL 17 dipulihkan secara transaksional pada PostgreSQL 17
terisolasi, loopback port 55434. Migrator lulus pada salinan data asli; digest
98 tabel lama tetap identik. Arsip dan bukti operasional lengkap disimpan di
luar Git dalam `D:/numora-sandbox-backups/2026-10-04-main-6550710`, dengan ACL
lokal terbatas. SHA-256 arsip sebelum migrasi:
`d2e3fdd7ceec09e2eb5f8d7693d54bff0eeb2331e2f1943740e5ca17fa0b3be3`.

Backup mencakup schema/data public, drizzle, irt_compute; **bukan** backup
Supabase penuh. Auth, Storage, ownership/ACL Cloud dan konfigurasi proyek tidak
termasuk. Batas main/compute juga diuji pada fixture terpisah dengan LOGIN
non-owner; grant Cloud diperiksa langsung sesudah apply.

Validasi perbaikan: **18 tes PostgreSQL lulus tanpa skip** (lockdown, journal,
histori migrasi gabungan, measurement/role boundaries, upgrade kurikulum), lint
file terkait, typecheck dan build database. Fixture mereproduksi default grant
Supabase dan akses melalui definer view/RPC sebelum lockdown. Sesudahnya Data
API ditolak, main/compute tetap bekerja, izin fixture Auth/Storage tetap utuh.
Cloud menunjukkan nol hak relation public/helper domain bagi ketiga role Data API.

**ENGINEERING DECISION — migrasi berikutnya:** helper sensitif tetap wajib
mencabut EXECUTE dari PUBLIC secara eksplisit. Default EXECUTE PostgreSQL
bersifat global; pencabutan default per-schema tidak menggantikannya.
Kredensial owner hanya dipasok ke environment proses runner. Runtime bersama
tetap membutuhkan LOGIN main/compute terpisah sesuai ADR-011.

**Batas:** tidak ada rollout aplikasi/consumer, upload R2, aktivasi parameter,
publikasi TryOut, atau acceptance engine Data/Curriculum/Google/QA independen.

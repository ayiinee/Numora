# Migrasi Pretest ke Supabase — 6 Oktober 2026

**ENGINEERING DECISION — instruksi pemilik:** setelah implementasi dan validasi lokal Pretest/Tryout, pemilik meminta migrasi diterapkan ke Cloud. Operasi ini menerapkan schema saja; deployment aplikasi dan publikasi konten akademik tetap terpisah. Tidak dibuat PR baru.

## Target dan hasil

- Target terverifikasi: sandbox Supabase `pkamenfnwmoeisccnrnk`, database `postgres`, owner migrasi `postgres`, session/direct connection port 5432 dengan TLS.
- Artifact migrasi dicatat dalam commit `e7cf11db1a7039b81c32f24a158994630ecc8781`. Commit mencakup SQL `0028_friendly_wind_dancer`, snapshot Drizzle dan journal; pekerjaan aplikasi lain tetap di workspace bersama.
- Sebelum operasi, jurnal mempunyai 39 entri dan tepat satu migrasi tertunda: `0028`. Semua hash main sebelumnya yang relevan cocok; tidak ada schema `0028` tanpa jurnal atau Pretest aktif duplikat.
- Migrator resmi `migrateIntegratedDatabase` menerapkan `0028`. Sesudahnya jurnal mempunyai **40 entri**, 39 entri lama identik dan satu hash baru sesuai artifact Git. Replay migrator lulus tanpa menambah entri.
- Waktu verifikasi Cloud: **6 Oktober 2026 04:59 WIB** (`2026-10-05T21:59:48.951Z`).

SHA-256 SQL yang diterapkan:

```text
53b3fb6d7e8c408f1170814fb3bb2f9ba4bc0843a6f3c57dbab4d4ed36180050
```

## Preservasi dan akses

Digest baris, jumlah baris dan UTC-normalized timestamps pada **145 tabel lama** di public/irt_compute/auth/storage tetap identik. Sebelum/sesudah mencakup **327 assessment attempts, 4.727 jawaban dan 117 akun Auth**; XP ledger, pin kebijakan/konten, hasil dan deadline historis tidak berubah. Perbandingan mengecualikan hanya kolom baru `pretest_result` dan `revision`; nilai barunya juga diverifikasi null/0 pada seluruh baris lama. Tabel Skip baru masih kosong.

Verifikasi katalog memastikan:

- `pretest_chapter_states` mempunyai RLS, dua foreign key dan unique student/chapter.
- Index unique aktif student/chapter membatasi Pretest `IN_PROGRESS`; revision integer non-null default 0 mempunyai check nonnegative.
- Policy RLS `numora_main_access` berlaku hanya untuk `numora_main_runtime`.
- Main runtime mempunyai SELECT/INSERT/UPDATE, tanpa DELETE. Role compute serta `anon`, `authenticated` dan `service_role` tidak mempunyai akses tabel baru.
- `pnpm db:check` lulus: **109 expected tables/columns present; RLS enabled**.

Pemeriksaan akses Cloud memakai effective privilege/RLS catalog dan schema checker; ini bukan bukti connected browser atau login Student nyata.

## Backup dan rehearsal

Backup terbaru menggunakan satu exported PostgreSQL snapshot. Arsip disimpan di luar Git dengan ACL lokal terbatas pada operator:

`D:/numora-sandbox-backups/2026-10-06-pretest-0028/`

| Arsip                    | Cakupan                                  | SHA-256                                                            |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------ |
| `business.dump`          | Schema/data public, drizzle, irt_compute | `285eb372d88f5f6c4454bf1e8572732c2d4922e43520d8cc29e0b9398f919783` |
| `auth-storage-data.dump` | Data auth/storage                        | `6bbe1c5e3d3f5e076efc15c173bb54c282ea5174d38076a2448a837b897feeca` |

Kedua arsip dibaca dengan `pg_restore --list` dan checksum diverifikasi sebelum apply. Backup bisnis dipulihkan secara transaksional ke PostgreSQL **17.11** terisolasi, localhost port 55444; migrasi dan replay lulus, dengan digest **110 tabel bisnis lama** identik. Rehearsal awal pada runner PostgreSQL 16 berhenti karena parameter dump PostgreSQL 17 tidak didukung; runner diganti ke versi 17 sebelum apply Cloud. Tidak ada percobaan restore ke Cloud.

Backup ini bukan backup Supabase penuh: schema Auth/Storage, object file Storage/R2, ownership/ACL Cloud dan konfigurasi proyek tidak dicadangkan sebagai restore penuh. Arsip data Auth/Storage diverifikasi keterbacaannya, bukan direstore pada rehearsal bisnis. Digest data Auth/Storage diperiksa langsung sebelum/sesudah migrasi Cloud.

Bukti JSON/digest, archive lists dan log operator berada di folder backup tersebut. Cluster rehearsal berada dalam folder lokal `.tmp/pretest-cloud-20261006/` dengan ACL terbatas dan dihentikan sesudah QA.

## Batas operasi

Tidak ada seed DEMO di Cloud, reset data, perubahan akun/grant membership, publikasi konten, aktivasi IRT/fallback, commit kode aplikasi, push atau deployment hosting. Pengujian lifecycle aplikasi tetap mengikuti [catatan implementasi](../development/PRETEST_TRYOUT_LIFECYCLE.md). Blueprint/konten approved, rubrik PGK produksi dan rumus/validasi IRT/fallback tetap ditunda sesuai instruksi pemilik.

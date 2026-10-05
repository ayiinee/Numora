# Penyesuaian data PRD v0.6 — 5 Oktober 2026

**PRD RULE:** sumber utama adalah [PRD v0.6 Final](../product/sources/PRD_Numora_v0.6.docx.md). **USER CLARIFICATION — Reyhan, 5 Oktober 2026:** XP Tryout = skor benar ekuivalen ×10; angka ×100 pada AC-15 adalah salah tulis. Contoh 24,5 benar ekuivalen menghasilkan 245 XP. Dokumen sumber disimpan apa adanya, dengan koreksi ini dicatat terpisah.

**ENGINEERING IMPLEMENTATION:** branch `feat/data-prd-v06-alignment`, baseline main `f3f75b3` (termasuk portal Admin PR #70), memakai satu migrasi maju `0024_prd_v06_data_alignment`. Migrasi 0023 importer/preview dan role Admin sudah ada pada main dan Cloud, sehingga tidak dibuat ulang. File JSON bank soal, object key R2, lineage original/variant, serta importer DRAFT dari main tetap menjadi kontrak konten.

## Perubahan dan penyimpanan

| Aturan                            | Penyimpanan / perubahan                                                                                                          | Perilaku backend                                                                                                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Siswa 0–5 kelas aktif             | Unique aktif `(student_user_id,class_id)` menggantikan unique satu kelas. Trigger mengunci baris siswa dan membatasi total lima. | Join kelas yang sama idempotent; kelas keenam ditolak. Dashboard mengirim `classes[]`; field `class` tetap menunjuk kelas terakhir bergabung.                                                                                                  |
| Leave / ban / unban               | `class_memberships.end_reason` dan `class_student_bans` dengan histori aktor/waktu.                                              | Leave mengakhiri membership. Ban mengakhiri membership aktif; rejoin ditolak sampai unban. Unban tidak otomatis membuat membership baru. Guru aktif pemilik kelas yang melakukan ban/unban.                                                    |
| Kelas tanpa guru                  | `classes.teacher_user_id` nullable. Trigger pada berakhirnya verifikasi sekolah melepas guru dari kelas.                         | Kelas tetap dapat diikuti; guru terverifikasi di sekolah yang sama dapat takeover jika belum ada guru aktif. Verifikasi ulang tidak otomatis mengembalikan kepemilikan.                                                                        |
| Role Admin                        | Memakai `users.admin_role` dari 0023.                                                                                            | Operations untuk sekolah/credential/kelas/data operasional; Content/Data/Moderation untuk konten/report/IRT. Dashboard agregat untuk ketiga subrole; audit umum dan akun Admin hanya Super Admin. Role null ditolak, tanpa backfill privilege. |
| Foto profil opsional              | `users.profile_photo_object_key` nullable, nonblank bila terisi.                                                                 | Identity mengembalikan key. Penyediaan uploader profil dan URL tampil masih pekerjaan tim fitur. Simpan object key, jangan signed URL permanen.                                                                                                |
| Draft/Ready/Revision/Archive      | Menambah `REVISION` pada enum konten dan kurasi. READY wajib difficulty nonblank melalui constraint dan validasi API.            | DRAFT tetap boleh difficulty null. Importer preview tetap DRAFT, tanpa skor atau publikasi. Revisi konten yang sudah digunakan memerlukan versi baru; tidak mengubah isi lama.                                                                 |
| Lima level, satu varian Drill MVP | Nomor level 1–5; satu paket REGULAR non-demo PUBLISHED per level.                                                                | Retry memakai paket aktif yang sama. Publikasi kedua ditolak sampai paket aktif di-archive. Fixture demo lama tetap disimpan untuk histori.                                                                                                    |
| Bintang dari attempt terbaru      | `level_progress.latest_stars`, `latest_attempt_id`, FK ke siswa dan level yang sama. Bintang attempt dapat 0–3.                  | Skor 0 →0, ≤50 →1, <100 →2, 100 →3. Best score dan unlock tidak turun ketika attempt terbaru lebih rendah.                                                                                                                                     |
| XP Drill                          | `xp_ledger.xp_amount` menjadi numeric(14,6), unique attempt, append-only. Policy `DRILL_PRD_V06` v1.                             | `(benar/total)×100 + max(0,(900−detik)/900×50)`, maksimum 150. Ditulis pada transaksi submit dan tersedia langsung.                                                                                                                            |
| XP Tryout                         | Policy `TRYOUT_PRD_V06` v1, ledger yang sama.                                                                                    | Benar ekuivalen ×10 saat finalisasi, tanpa menunggu IRT. Nilai simulasi/pembahasan tetap menunggu release IRT. Paket resmi baru harus 30 butir.                                                                                                |
| Leaderboard aktivitas             | `class_leaderboard_entries` numeric(18,6), tabel baru `global_activity_leaderboard_entries`; periode bersama.                    | XP akun terlihat di semua kelas aktif. Global mencakup siswa aktif, termasuk Mandiri. Data yang sudah di-archive tidak dihitung ulang. PvP tetap memakai tabel Best Poin sendiri.                                                              |

**ENGINEERING DECISION:** numeric enam desimal mempertahankan XP pecahan; tidak memperkenalkan pembulatan ke integer yang belum disepakati. API membaca nilai yang benar-benar tersimpan. Peringkat seri memakai mekanisme kompetisi existing `1,1,3`; detail tie-break tetap perlu acceptance tim produk. Leaderboard menampilkan Top 10 dan posisi sendiri, tanpa email atau riwayat akademik.

## Histori dan keamanan

- Tidak ada DELETE akun, perubahan `auth.users`, reset database, penggantian key, atau aktivasi R2/IRT dalam migrasi ini.
- Policy lama dan paket/attempt/XP historis tidak ditulis ulang. Kolom bintang terbaru hanya diisi dari attempt GRADED REGULAR terakhir yang telah tersimpan, tanpa regrading.
- XP hanya diberikan otomatis untuk attempt yang dipin ke policy baru versi 1. Attempt lama tidak mendapat backfill XP; riwayat menampilkan null/pending jika ledger lama belum tersedia.
- Tabel baru memakai RLS, privilege runtime NestJS eksplisit, dan tanpa akses Data API `anon`/`authenticated`/`service_role`. Trigger memakai SECURITY INVOKER; EXECUTE PUBLIC dicabut.
- API kelas mengotorisasi ownership dan verifikasi sekolah. UI Teacher dan Admin masih perlu menampilkan aksi baru dan menangani 403/409. Keluar/ban menghilangkan akses monitoring sesuai membership aktif.
- Proyeksi kelas memakai membership aktif, bukan `class_id_at_event` sebagai sumber kepemilikan XP. Saat mengejar periode yang terlewat, membership diperiksa pada batas akhir periode. Ban/leave disaring langsung pada pembacaan kelas sebelum worker memperbarui proyeksi.

## Kontrak untuk tim backend/frontend

Semua path di bawah berawalan `/api/v1`; gunakan access token Supabase sesi pengguna. Tidak memakai owner connection string atau service-role key dari browser.

| Path                                               | Aktor / input                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POST /classes`                                    | Guru terverifikasi; `{name,schoolId?}`. schoolId harus sekolah tempat guru terverifikasi.                  |
| `POST /classes/join`                               | Siswa; `{joinCode}`. 409 `CLASS_LIMIT_REACHED`, 403 `CLASS_BANNED`.                                        |
| `POST /classes/:classId/leave`                     | Siswa; mengakhiri membership sendiri; replay menghasilkan `{left:true}`.                                   |
| `POST /schools/:schoolId/leave`                    | Guru; mengakhiri verifikasi sekolah dan melepas kepemilikan kelas di sekolah itu.                          |
| `POST /classes/takeover`                           | Guru terverifikasi sekolah yang sama; `{joinCode}`; 409 `CLASS_HAS_TEACHER` bila masih dimiliki guru lain. |
| `POST /classes/:classId/students/:studentId/ban`   | Guru aktif pemilik kelas; `{banned:true}` pada respons.                                                    |
| `POST /classes/:classId/students/:studentId/unban` | Guru aktif pemilik kelas; siswa harus join lagi setelah unban.                                             |
| `GET /leaderboards/class?classId=<uuid>`           | Siswa anggota aktif kelas target. Tanpa classId memilih kelas terakhir bergabung.                          |
| `GET /leaderboards/activity`                       | Siswa, termasuk Mandiri; aktivitas global berbasis XP Drill/Tryout.                                        |

Result Drill dan submit Tryout membawa `xp`; history membawa `xp`, `stars`, `xpState` dan `starsState`. Level membawa `latestStars`. OpenAPI dan tipe web dihasilkan ulang; frontend tidak menghitung ulang reward atau memakai best stars sebagai kondisi terkini.

## Seed demo

Seeder learning/redesign membuat **paket DEMO v0.6 baru** yang memakai sepuluh question version dari varian pertama demo lama. ID deterministik dan pengecekan replay mencegah duplikasi. Paket lama serta histori tetap utuh. Seeder bukan publikasi bank Curriculum dan tidak membuat paket Tryout resmi dari sepuluh sampel.

Setelah migrasi pada sandbox yang dituju dan review:

```powershell
corepack pnpm db:seed:learning
# Bila tim menggunakan demo UI lima level:
corepack pnpm db:seed:redesign
```

Command membaca `.env` yang diabaikan Git. Tetap memerlukan `NODE_ENV=development` dan `ALLOW_DEMO_SEED=true`. Seeder identitas placeholder tetap dibatasi localhost; jangan jalankan untuk mengganti akun Cloud. Assignment subrole Admin nyata dilakukan terpisah oleh pemilik akses sesuai workflow tim, bukan oleh migrasi atau seed konten.

## Uji dan rollout Cloud

**Status Cloud:** audit baca pada 5 Oktober 2026 menemukan jurnal terakhir 0023, hash `a9a88e12d4af137e88bfca3a13e6406e311ab593e4fcf4fd14ed095d6aa00419`, dan 128 akun Auth. Tabel ban/global aktivitas, kolom latest stars dan enum Revision belum ada. Tidak ditemukan level di atas lima atau versi READY tanpa difficulty. Ini snapshot baca, bukan bukti restore atau hasil migrasi 0024.

1. Review SQL, source schema, OpenAPI dan test pada branch ini. Pastikan main belum menerima migrasi nomor yang sama dari tim lain; rekonsiliasi nomor/journal bila berubah.
2. Siapkan backup terbaru yang dapat diakses operator. [Bukti migrasi historis](SUPABASE_MIGRATION_2026-10-04.md) dan [acceptance importer](../testing/CONTENT_IMPORT_PREVIEW_ACCEPTANCE_2026-10-04.md) menjelaskan backup/restore sebelumnya; backup itu belum membuktikan upgrade 0024. Arsip yang disebut di bukti tersebut tidak tersedia di host pekerjaan ini.
3. Restore ke PostgreSQL 17 terisolasi, jalankan migrator resmi, uji replay dan bandingkan histori attempt/XP serta seluruh identitas Auth. Dump public/drizzle/irt_compute bukan backup penuh Auth/Storage; pertahankan semua akun yang ada, bukan hanya dua akun fixture.
4. Preflight: tidak ada level >5, READY difficulty kosong, atau lebih dari satu paket REGULAR non-demo PUBLISHED per level. Periksa grants, RLS, runtime LOGIN yang mewarisi `numora_main_runtime` dan digest SQL jurnal. Tangani drift secara eksplisit sebelum apply.
5. Koordinasikan deploy API/worker/frontend agar asumsi satu kelas dan policy lama tidak berjalan bersamaan. Terapkan **satu kali** lewat runner Drizzle dengan env owner lokal rahasia. Jangan memakai SQL Editor/reset/push-schema sebagai pengganti migrasi. Sebelum membuka attempt baru, siapkan versi paket yang menunjuk `DRILL_PRD_V06` v1 atau `TRYOUT_PRD_V06` v1. Paket Drill resmi lama di-archive sebelum publikasi penggantinya; pin paket/attempt lama tetap utuh. Jika belum ada paket policy baru, API menolak start dengan status paket belum tersedia; migrasi tidak otomatis memublikasikan bank lama.
6. Verifikasi journal/hash/constraint/RLS, membership cap, leave/ban/takeover, XP idempotent, preservasi attempt/ledger, serta proyeksi kelas/global. Jalankan seed demo opt-in terpisah bila dibutuhkan. Catat bukti tanpa credential atau data pribadi.

**Verifikasi lokal:** setelah rebase, 382 tes paket lulus tanpa skip pada PostgreSQL 17/Redis 7 dan suite unit/web, ditambah 68 script checks, dua uji SQL PGlite dan satu integrasi QA Admin PostgreSQL. Migrator resmi diuji pada database kosong dan replay; upgrade fixture mempertahankan identitas dan histori. Dua join bersamaan ketika siswa memiliki empat kelas menghasilkan tepat satu join berhasil dan total lima kelas. Upgrade-check dan bridge-check Staging juga lulus pada fixture. [Laporan pengujian](../testing/PRD_V06_DATA_ALIGNMENT_2026-10-05.md) memuat rincian dan batas cakupan. Ini belum merupakan restore snapshot Cloud.

## Handoff penerapan setelah PR

**USER CLARIFICATION — Reyhan, 5 Oktober 2026:** Data menyiapkan perubahan schema/migrasi; penerapan setelah PR disetujui diserahkan ke Backend/DevOps. Target proses adalah PR reviewed dan merge ke main → CI lulus → bukti backup/restore dan rehearsal diverifikasi → satu job migrasi → deployment API/worker yang sesuai → smoke/read verification. Kegagalan migrasi menghentikan deployment kode yang memerlukan schema baru. Seeder demo dijalankan sebagai langkah opt-in terpisah.

**ENGINEERING HANDOFF:** simpan `DATABASE_MIGRATION_URL` di secret khusus operator/job deployment. API/worker tetap memakai `DATABASE_URL` LOGIN runtime non-owner. Workflow `.github/workflows/ci.yml` saat ini memigrasikan database test localhost saja; PR data ini belum mengaktifkan deployment Cloud otomatis. Backend/DevOps menyiapkan job tersebut sesuai target hosting, akses secret dan gate backup tim. Migrasi tidak dijalankan setiap kali proses aplikasi startup, dan seluruh anggota tim memakai hasil migrasi pada proyek Cloud yang sama.

**Dependencies:** rubrik detail PGK dari Curriculum, konten/master final, pemetaan difficulty PvP, implementasi/approval compute IRT, uji R2, Pretest runtime dan UI fitur baru masih milik tim terkait. Schema baru mendukungnya; perubahan ini tidak menyatakan seluruh aplikasi sudah memenuhi seluruh acceptance PRD v0.6.
